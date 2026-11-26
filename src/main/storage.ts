// Changing where the database and its backups live, and what happens when that folder is gone
import { app, BrowserWindow, dialog } from "electron";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { waitForBackups } from "./backup";
import { getDatabase } from "./db";
import {
  getBackupDir,
  getDataDir,
  getDbDir,
  getLegacyBackupDir,
  getLocations,
  getRootDir,
  setLocations,
} from "./paths";
import { DB_FILE, deleteDataFiles, moveBackupFiles, samePath } from "./storage-files";
import type { StorageInfo, StorageResult } from "../shared/api";

let busy = false;

export function getStorageInfo(): StorageInfo {
  const { dbDir, backupDir } = getLocations();
  return {
    dbDir: getDbDir(),
    dbIsDefault: !dbDir,
    // Not getBackupDir(): showing the path must work while its drive is missing
    backupDir: backupDir ?? path.join(getDbDir(), "backups"),
    backupIsDefault: !backupDir,
  };
}

// Runs before the database is opened. Returns false when the user chose to quit.
export function ensureDbFolderAvailable(): boolean {
  for (;;) {
    const locations = getLocations();
    if (!locations.dbDir || fs.existsSync(path.join(locations.dbDir, DB_FILE))) return true;
    const choice = dialog.showMessageBoxSync({
      type: "warning",
      title: "Rift Records",
      message: "The database folder is not available",
      detail: `${locations.dbDir}\n\nConnect the drive and try again. The default folder holds only what was there before the database was moved.`,
      buttons: ["Try again", "Use the default folder", "Quit"],
      defaultId: 0,
      cancelId: 2,
    });
    if (choice === 2) return false;
    if (choice === 1) setLocations({ ...locations, dbDir: undefined });
  }
}

// Backups used to sit next to the data folder; they now default to a folder inside it
export async function migrateLegacyBackups(): Promise<void> {
  if (getLocations().backupDir) return;
  try {
    const moved = await moveBackupFiles(getLegacyBackupDir(), getBackupDir());
    if (moved) console.log(`[storage] moved ${moved} backups into the database folder`);
    fs.rmdirSync(getLegacyBackupDir());
  } catch (err: any) {
    // A failure leaves the files where they were; the next start tries again
    if (err.code !== "ENOENT") console.error("[storage] could not move old backups:", err);
  }
}

async function pickFolder(win: BrowserWindow, title: string, current: string) {
  const result = await dialog.showOpenDialog(win, {
    title,
    defaultPath: current,
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled ? null : result.filePaths[0];
}

// Sync clients and network shares can corrupt a database that is being written
async function confirmRiskyFolder(win: BrowserWindow, dir: string): Promise<boolean> {
  if (!/^\\\\|\\(OneDrive|Dropbox|Google Drive)/i.test(dir)) return true;
  const { response } = await dialog.showMessageBox(win, {
    type: "warning",
    message: "This folder is synchronised or on the network",
    detail: "A database kept there can be damaged while the program writes to it.",
    buttons: ["Cancel", "Use it anyway"],
    defaultId: 0,
    cancelId: 0,
  });
  return response === 1;
}

function countGames(file: string): number {
  const db = new Database(file, { fileMustExist: true });
  try {
    const check = db.pragma("quick_check") as { quick_check: string }[];
    if (check[0]?.quick_check !== "ok") throw new Error("The database there is damaged");
    return (db.prepare("SELECT COUNT(*) AS n FROM games").get() as { n: number }).n;
  } finally {
    db.close();
  }
}

async function exclusive(task: () => Promise<StorageResult>): Promise<StorageResult> {
  if (busy) return { status: "error", message: "Another folder change is still running" };
  busy = true;
  try {
    await waitForBackups();
    return await task();
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  } finally {
    busy = false;
  }
}

export function changeDbFolder(win: BrowserWindow): Promise<StorageResult> {
  return exclusive(async () => {
    const current = getDbDir();
    const target = await pickFolder(win, "Database folder", current);
    if (!target || samePath(target, current)) return { status: "cancelled" };
    if (!(await confirmRiskyFolder(win, target))) return { status: "cancelled" };

    const dest = path.join(target, DB_FILE);
    let copy = true;
    if (fs.existsSync(dest)) {
      const { response } = await dialog.showMessageBox(win, {
        type: "question",
        message: "There is already a database in that folder",
        detail: "Replacing it keeps the old file under a new name.",
        buttons: ["Cancel", "Use the one found there", "Replace it with the current one"],
        defaultId: 0,
        cancelId: 0,
      });
      if (response === 0) return { status: "cancelled" };
      copy = response === 2;
    }

    if (copy) {
      const partial = `${dest}.part`;
      try {
        const games = (getDatabase().prepare("SELECT COUNT(*) AS n FROM games").get() as any).n;
        await getDatabase().backup(partial);
        if (countGames(partial) < games) throw new Error("The copy is missing games");
        if (fs.existsSync(dest)) fs.renameSync(dest, `${dest}.old-${Date.now()}`);
        // A -wal left by a replaced database would be replayed onto the new file
        fs.rmSync(`${dest}-wal`, { force: true });
        fs.rmSync(`${dest}-shm`, { force: true });
        fs.renameSync(partial, dest);
      } finally {
        fs.rmSync(partial, { force: true });
      }
    } else {
      countGames(dest);
    }

    const locations = getLocations();
    if (!locations.backupDir) await moveBackupFiles(getBackupDir(), path.join(target, "backups"));
    setLocations({
      ...locations,
      dbDir: samePath(target, getDataDir()) ? undefined : target,
    });
    await dialog.showMessageBox(win, {
      type: "info",
      message: "The program will restart now",
      detail: `The previous database stays in ${current}. Delete it yourself once everything looks right.`,
      buttons: ["Restart"],
    });
    app.relaunch();
    app.quit();
    return { status: "ok" };
  });
}

export function changeBackupFolder(win: BrowserWindow, reset: boolean): Promise<StorageResult> {
  return exclusive(async () => {
    const from = getStorageInfo().backupDir;
    const standard = path.join(getDbDir(), "backups");
    const target = reset ? standard : await pickFolder(win, "Backup folder", from);
    if (!target || samePath(target, from)) return { status: "cancelled" };
    if (!(await confirmRiskyFolder(win, target))) return { status: "cancelled" };

    fs.mkdirSync(target, { recursive: true });
    const locations = getLocations();
    setLocations({
      ...locations,
      backupDir: samePath(target, standard) ? undefined : target,
    });
    const moved = fs.existsSync(from) ? await moveBackupFiles(from, target) : 0;
    return { status: "ok", message: `Backups are now saved in ${target}. Moved: ${moved}.` };
  });
}

// "--delete-user-data", run by the uninstaller when the user asks for it
export function deleteUserData(): void {
  try {
    const { dbDir, backupDir } = getLocations();
    const db = dbDir ?? path.join(getRootDir(), "data");
    deleteDataFiles(db, backupDir ?? path.join(db, "backups"));
  } catch (err) {
    console.error("[storage] could not delete the database:", err);
  }
  try {
    // The program's own profile folder: caches, settings, logs
    fs.rmSync(app.getPath("userData"), { recursive: true, force: true });
  } catch (err) {
    console.error("[storage] could not delete the profile folder:", err);
  }
}
