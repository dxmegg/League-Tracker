// File work behind the choosable folders. No Electron imports: scripts/check-storage.mjs runs it.
import fs from "fs";
import path from "path";

// Folders the user picked. A missing entry means the default.
export type Locations = { dbDir?: string; backupDir?: string };

export const DB_FILE = "matches.db";
// Groups: local time taken, reason, game count. A plain .db is a snapshot from before compression.
export const BACKUP_FILE_RE =
  /^matches-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-([a-z0-9-]+?)(?:-(\d+)g\.db\.gz|\.db)$/;
// The database and what the program leaves next to it: -wal, -shm, .part, .incoming, .corrupt-*
const DB_FAMILY_RE = /^matches\.db($|[-.])/;

// Three slots, each replaced only by its own kind: "monthly", the weekly "auto", and "manual" for
// a backup the user takes and every one taken before a risky step (pre-delete, pre-import...).
export function backupSlot(reason: string): "monthly" | "auto" | "manual" {
  return reason === "monthly" || reason === "auto" ? reason : "manual";
}

// The newest snapshot of each slot is kept. Names carry the time, so they sort by age. `written`
// is the snapshot just taken: it keeps its slot even if the clock moved back. Plain .db files go
// once a compressed one is written.
export function staleBackups(names: string[], written: string): string[] {
  const backups = names.filter((name) => BACKUP_FILE_RE.test(name));
  const slot = (name: string) => backupSlot(BACKUP_FILE_RE.exec(name)![2]);
  const kept = new Set([written]);
  for (const other of ["monthly", "auto", "manual"].filter((s) => s !== slot(written))) {
    const newest = backups
      .filter((name) => name.endsWith(".gz") && slot(name) === other)
      .sort()
      .at(-1);
    if (newest) kept.add(newest);
  }
  return backups.filter((name) => !kept.has(name));
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

// Which scheduled snapshot is due, given the compressed ones on disk
export function dueBackup(
  backups: { reason: string; created: number }[],
  now: number,
): "monthly" | "auto" | null {
  const age = (slot: "monthly" | "auto") =>
    now - Math.max(0, ...backups.filter((b) => b.reason === slot).map((b) => b.created));
  if (age("monthly") > MONTH_MS) return "monthly";
  return age("auto") > WEEK_MS ? "auto" : null;
}

export function readLocations(file: string): Locations {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err: any) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
  // Damaged content throws: falling back to the default would silently open another database
  return JSON.parse(text) as Locations;
}

export function writeLocations(file: string, locations: Locations): void {
  fs.writeFileSync(`${file}.part`, JSON.stringify(locations, null, 2));
  fs.renameSync(`${file}.part`, file);
}

export function samePath(a: string, b: string): boolean {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

// The profile folder, renaming the pre-1.4 "league-tracker" one on the first start. While it
// cannot be renamed (a file in it is open) the old folder stays in use, so nothing looks lost.
export function resolveUserDataDir(appData: string): string {
  const dir = path.join(appData, "rift-records");
  const old = path.join(appData, "league-tracker");
  if (fs.existsSync(path.join(dir, "data")) || !fs.existsSync(old)) return dir;
  try {
    fs.renameSync(old, dir);
  } catch {
    return old;
  }
  try {
    // Folders the user picked inside the old one moved along with it
    const file = path.join(dir, "locations.json");
    const locations = readLocations(file);
    const prefix = `${old}${path.sep}`.toLowerCase();
    let changed = false;
    for (const key of ["dbDir", "backupDir"] as const) {
      const value = locations[key];
      if (!value?.toLowerCase().startsWith(prefix)) continue;
      locations[key] = path.join(dir, value.slice(prefix.length));
      changed = true;
    }
    if (changed) writeLocations(file, locations);
  } catch (err) {
    // A damaged file is reported by the normal start, which can show a dialog
    console.error("[storage] could not update locations.json:", err);
  }
  return dir;
}

function listMatching(dir: string, pattern: RegExp): string[] {
  try {
    return fs.readdirSync(dir).filter((name) => pattern.test(name));
  } catch (err: any) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

// A source file is only removed once its copy is complete. A name already taken at the
// destination is left where it was, never overwritten.
export async function moveBackupFiles(from: string, to: string): Promise<number> {
  if (samePath(from, to)) return 0;
  const names = listMatching(from, BACKUP_FILE_RE);
  if (names.length) fs.mkdirSync(to, { recursive: true });
  let moved = 0;
  for (const name of names) {
    const source = path.join(from, name);
    const target = path.join(to, name);
    if (fs.existsSync(target)) continue;
    try {
      fs.renameSync(source, target);
    } catch (err: any) {
      if (err.code !== "EXDEV") throw err;
      const partial = `${target}.part`;
      await fs.promises.copyFile(source, partial);
      if (fs.statSync(partial).size !== fs.statSync(source).size) {
        fs.rmSync(partial, { force: true });
        throw new Error(`Copy of ${name} is incomplete`);
      }
      fs.renameSync(partial, target);
      fs.rmSync(source);
    }
    moved++;
  }
  return moved;
}

// Used by the uninstaller. Removes the program's own files by name and never a folder with
// anything else in it, since the user may have picked a folder they share with other things.
export function deleteDataFiles(dbDir: string, backupDir: string): void {
  const remove = (dir: string, pattern: RegExp) => {
    for (const name of listMatching(dir, pattern)) {
      fs.rmSync(path.join(dir, name), { force: true });
    }
  };
  remove(backupDir, /^matches-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-[a-z0-9-]+\.db($|[-.])/);
  remove(dbDir, DB_FAMILY_RE);
  try {
    if (!samePath(backupDir, dbDir)) fs.rmdirSync(backupDir);
  } catch {
    // Not empty or already gone: leave it
  }
}
