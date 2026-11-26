// File work behind the choosable folders. No Electron imports: scripts/check-storage.mjs runs it.
import fs from "fs";
import path from "path";

// Folders the user picked. A missing entry means the default.
export type Locations = { dbDir?: string; backupDir?: string };

export const DB_FILE = "matches.db";
export const BACKUP_FILE_RE = /^matches-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-([a-z-]+)\.db$/;
// The database and what the program leaves next to it: -wal, -shm, .part, .incoming, .corrupt-*
const DB_FAMILY_RE = /^matches\.db($|[-.])/;

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
  remove(backupDir, /^matches-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-[a-z-]+\.db($|[-.])/);
  remove(dbDir, DB_FAMILY_RE);
  try {
    if (!samePath(backupDir, dbDir)) fs.rmdirSync(backupDir);
  } catch {
    // Not empty or already gone: leave it
  }
}
