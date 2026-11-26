import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { Writable } from "stream";
import { pipeline } from "stream/promises";
import zlib from "zlib";
import { closeDatabase, getDatabase, getDbPath, getSetting, initDatabase, setSetting } from "./db";
import { getBackupDir } from "./paths";
import { BACKUP_FILE_RE as FILE_RE, dueBackup, staleBackups } from "./storage-files";

// Snapshots are taken through SQLite's online backup API rather than by copying
// matches.db off disk. The database runs in WAL mode, so the file on its own is
// missing every commit still sitting in the -wal: copying it produces a
// database that is stale at best and unopenable at worst.
//
// The copy runs a hundred pages at a time, returning to the event loop between
// steps, so a poll landing a game mid-backup doesn't block on it. That the
// backup is stepped rather than instantaneous is safe here because it reads
// through the same connection everything else writes on — SQLite applies those
// writes to the copy in flight instead of leaving it torn across versions.

// The scheduler only checks what is due, so this is a resolution, not a rate
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const QUICK_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Keeps the first snapshot check clear of the busy first seconds after launch
const FIRST_TICK_DELAY_MS = 90_000;

export type BackupReason =
  | "auto"
  | "monthly"
  | "manual"
  | "pre-delete"
  | "pre-import"
  | "pre-repair"
  | "pre-restore"
  | "pre-migration-20"
  | "pre-migration-23"
  | "pre-migration-24"
  | "pre-migration-34";

export interface BackupInfo {
  file: string;
  created: number;
  size: number;
  games: number | null;
  reason: string;
}

export interface RecoveryReport {
  problem: "missing" | "corrupt";
  restoredFrom: string | null;
  quarantined: string | null;
  detail?: string;
}

let recoveryReport: RecoveryReport | null = null;
let scheduleTimer: NodeJS.Timeout | null = null;
let firstTickTimer: NodeJS.Timeout | null = null;
// Backups are async, so the hourly check, a Settings-page click and a
// pre-import snapshot can all be in flight at once. They would race over the
// same directory and prune each other's files, so they share one run instead.
let inFlight: Promise<BackupInfo> | null = null;

function stamp(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}` +
    `T${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}`
  );
}

// The inverse of stamp: "2026-08-22T14-30-05" is the local time it was taken,
// so the colons go back before Date parses it as local rather than as UTC.
function parseStamp(text: string): number {
  const iso = text.replace(/T(\d{2})-(\d{2})-(\d{2})$/, "T$1:$2:$3");
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function countGames(db: Database.Database): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM games").get() as { n: number }).n;
}

// Opens a finished snapshot and decides whether it can be trusted. Anything
// that throws here means the file is not a backup we would ever restore.
function verifySnapshot(file: string, deep = true): number {
  const snap = new Database(file);
  try {
    // A snapshot just written by SQLite's own backup API is consistent by construction, so the
    // full scan (which blocks the main thread for seconds) is kept for restores and recovery.
    if (deep) {
      const result = snap.pragma("quick_check") as { quick_check: string }[];
      if (result[0]?.quick_check !== "ok") {
        throw new Error(`integrity check failed: ${result[0]?.quick_check ?? "unknown"}`);
      }
    }
    const games = countGames(snap);
    // The copy inherits WAL mode from the source, and a WAL database can't be
    // opened read-only without writing its -shm alongside it. Storing snapshots
    // in rollback-journal mode keeps each one a single self-contained file that
    // listing and verification can open without modifying anything.
    snap.pragma("journal_mode = DELETE");
    return games;
  } finally {
    snap.close();
  }
}

function describe(file: string): BackupInfo | null {
  const match = FILE_RE.exec(file);
  if (!match) return null;
  let size = 0;
  try {
    size = fs.statSync(path.join(getBackupDir(), file)).size;
  } catch {
    return null;
  }
  const games = match[3] === undefined ? null : Number(match[3]);
  return { file, created: parseStamp(match[1]), size, games, reason: match[2] };
}

// Newest first. Names carry the timestamp, so this never depends on mtimes,
// which a copy or a sync client is free to rewrite.
function readBackups(): BackupInfo[] {
  let names: string[];
  try {
    names = fs.readdirSync(getBackupDir());
  } catch (err) {
    console.error("Failed to read backup directory:", err);
    return [];
  }
  return names
    .map(describe)
    .filter((backup): backup is BackupInfo => backup !== null)
    .sort((a, b) => b.created - a.created);
}

export function listBackups(): BackupInfo[] {
  const dir = getBackupDir();
  return readBackups().map((backup) => {
    // A compressed snapshot carries its count in the name
    if (backup.games !== null) return backup;
    try {
      const snap = new Database(path.join(dir, backup.file), { readonly: true });
      try {
        return { ...backup, games: countGames(snap) };
      } finally {
        snap.close();
      }
    } catch {
      // A snapshot too damaged to read still belongs in the list — the user
      // should see that it exists and that its contents are unknown.
      return backup;
    }
  });
}

function prune(written: string): void {
  const dir = getBackupDir();
  const names = readBackups().map((backup) => backup.file);
  for (const file of staleBackups(names, written)) {
    try {
      fs.rmSync(path.join(dir, file), { force: true });
    } catch (err) {
      console.error("Failed to remove old backup:", file, err);
    }
  }
}

// Level 1: about a fifth of the size for a few seconds per gigabyte
async function compress(source: string, target: string): Promise<void> {
  await pipeline(
    fs.createReadStream(source),
    zlib.createGzip({ level: 1 }),
    fs.createWriteStream(target, { flush: true }),
  );
  // Read back before anything older is deleted: gunzip checks the CRC
  let bytes = 0;
  await pipeline(
    fs.createReadStream(target),
    zlib.createGunzip(),
    new Writable({
      write(chunk: Buffer, _encoding, done) {
        bytes += chunk.length;
        done();
      },
    }),
  );
  if (bytes !== fs.statSync(source).size) throw new Error("compressed snapshot is incomplete");
}

async function runBackup(reason: BackupReason): Promise<BackupInfo> {
  const db = getDatabase();
  const before = countGames(db);

  // A quit part way through a backup leaves gigabytes behind. Backups run one at a time, so
  // any .part found now is dead.
  for (const name of fs.readdirSync(getBackupDir())) {
    if (/^matches-.*\.db(\.gz)?\.part(-wal|-shm)?$/.test(name)) {
      fs.rmSync(path.join(getBackupDir(), name), { force: true });
    }
  }

  const created = new Date();
  const base = path.join(getBackupDir(), `matches-${stamp(created)}-${reason}`);
  // Written under names the listing ignores, so a crash or a full disk part
  // way through can't leave a truncated file that looks like a usable backup.
  const raw = `${base}.db.part`;
  const packed = `${base}.db.gz.part`;
  try {
    await db.backup(raw);
    // The monthly snapshot is the long way back, so it alone pays for the full scan
    const games = verifySnapshot(raw, reason === "monthly");
    if (games < before) {
      throw new Error(`snapshot holds ${games} games, database had ${before}`);
    }
    await compress(raw, packed);
    const dest = `${base}-${games}g.db.gz`;
    fs.renameSync(packed, dest);
    const file = path.basename(dest);
    const size = fs.statSync(dest).size;
    // Only once the new snapshot is on disk and verified: a database that has
    // already gone bad must never be able to rotate out the good copies. An
    // empty one never does.
    if (games > 0) prune(file);
    return { file, created: created.getTime(), size, games, reason };
  } finally {
    for (const leftover of [raw, `${raw}-wal`, `${raw}-shm`, packed]) {
      fs.rmSync(leftover, { force: true });
    }
  }
}

export function createBackup(reason: BackupReason): Promise<BackupInfo> {
  // Queued behind whatever is already running, successful or not
  const next = (inFlight ?? Promise.resolve()).then(
    () => runBackup(reason),
    () => runBackup(reason),
  );
  inFlight = next;
  // Whoever finishes last clears the slot; an earlier one doing it would let
  // the next caller start alongside a backup that is still running.
  const done = () => {
    if (inFlight === next) inFlight = null;
  };
  next.then(done, done);
  return next;
}

// Lets a folder change wait for the snapshot being written right now
export async function waitForBackups(): Promise<void> {
  await inFlight?.catch(() => undefined);
}

// On unless the user switched it off
function autoBackupOn(): boolean {
  return getSetting("auto_backup") !== "false";
}

// Snapshots protect the user's data, so a failure to take one is reported but
// never allowed to abort whatever it was protecting.
export async function backupQuietly(reason: BackupReason): Promise<void> {
  if (!autoBackupOn()) return;
  try {
    // A database just created (first launch, or ahead of recovery) has nothing worth a slot
    if (countGames(getDatabase()) === 0) return;
    const backup = await createBackup(reason);
    console.log(`Backed up ${backup.games} games to ${backup.file}`);
  } catch (err) {
    console.error(`Backup (${reason}) failed:`, err);
  }
}

export function startBackupSchedule(): void {
  if (scheduleTimer) return;
  const tick = () => {
    if (!autoBackupOn()) return;
    const packed = readBackups().filter((backup) => backup.file.endsWith(".gz"));
    const due = dueBackup(packed, Date.now());
    if (due) void backupQuietly(due);
  };
  firstTickTimer = setTimeout(tick, FIRST_TICK_DELAY_MS);
  scheduleTimer = setInterval(tick, CHECK_INTERVAL_MS);
}

export function stopBackupSchedule(): void {
  if (firstTickTimer) clearTimeout(firstTickTimer);
  firstTickTimer = null;
  if (!scheduleTimer) return;
  clearInterval(scheduleTimer);
  scheduleTimer = null;
}

// ---- Restore ----

// Only ever a bare filename this module itself would have written, resolved
// inside the backup directory: the name arrives from the renderer, and joining
// an arbitrary string onto a path is how a "restore" ends up reading somewhere
// else entirely.
function resolveBackup(file: string): string {
  if (!FILE_RE.test(file)) throw new Error("Not a backup file name");
  const full = path.join(getBackupDir(), file);
  if (!fs.existsSync(full)) throw new Error("That backup no longer exists");
  return full;
}

// Where a snapshot is prepared next to the live database before it takes its place
function incomingPath(): string {
  return `${getDbPath()}.incoming`;
}

function unpack(source: string, target: string): Promise<void> {
  if (!source.endsWith(".gz")) return fs.promises.copyFile(source, target);
  return pipeline(fs.createReadStream(source), zlib.createGunzip(), fs.createWriteStream(target));
}

// Puts the prepared file in place of the live one. The caller must have closed
// the connection first.
function swapIn(): void {
  const dbPath = getDbPath();
  // The -wal and -shm describe the database being replaced. Left behind, SQLite
  // would replay them onto the restored file and corrupt it immediately.
  fs.rmSync(`${dbPath}-wal`, { force: true });
  fs.rmSync(`${dbPath}-shm`, { force: true });
  // Prepared aside and renamed, never written over the live path: a copy that fails
  // half way would otherwise leave a truncated database and nothing to restore.
  fs.renameSync(incomingPath(), dbPath);
}

// Null means beforeSwap called the restore off
export async function restoreBackup(
  file: string,
  beforeSwap: () => Promise<boolean> = async () => true,
): Promise<{ games: number } | null> {
  const source = resolveBackup(file);
  const incoming = incomingPath();
  try {
    // Set aside first: the snapshot beforeSwap takes may replace the source file
    await unpack(source, incoming);
    // Verified again at restore time, not trusted from when it was written — the
    // file has been sitting on disk since, and this is the moment it matters.
    const games = verifySnapshot(incoming);
    if (!(await beforeSwap())) return null;
    await waitForBackups();
    // The switch is the user's choice today, not part of the data being rolled back
    const autoBackup = autoBackupOn();
    closeDatabase();
    swapIn();
    await initDatabase({ backupBeforeMigration: false });
    if (autoBackupOn() !== autoBackup) setSetting("auto_backup", String(autoBackup));
    return { games };
  } finally {
    fs.rmSync(incoming, { force: true });
  }
}

// ---- Startup recovery ----

function quarantine(dbPath: string): string | null {
  const dead = `${dbPath}.corrupt-${stamp()}`;
  try {
    fs.renameSync(dbPath, dead);
    fs.rmSync(`${dbPath}-wal`, { force: true });
    fs.rmSync(`${dbPath}-shm`, { force: true });
    return dead;
  } catch (err) {
    console.error("Failed to set aside the damaged database:", err);
    return null;
  }
}

// Newest first, verifying as it goes: the most recent snapshot is worth nothing
// if it can't be opened, and the one before it usually can.
// Leaves the winner prepared for swapIn and returns its name
async function newestUsableBackup(): Promise<string | null> {
  const dir = getBackupDir();
  for (const backup of readBackups()) {
    try {
      await unpack(path.join(dir, backup.file), incomingPath());
      verifySnapshot(incomingPath());
      return backup.file;
    } catch (err) {
      fs.rmSync(incomingPath(), { force: true });
      console.error("Skipping unusable backup:", backup.file, err);
    }
  }
  return null;
}

async function recover(problem: "missing" | "corrupt", detail?: string): Promise<RecoveryReport> {
  closeDatabase();
  const dbPath = getDbPath();
  // On the missing path this is the empty database initDatabase just created,
  // which is still worth setting aside rather than overwriting blind.
  const quarantined = fs.existsSync(dbPath) ? quarantine(dbPath) : null;

  let source = await newestUsableBackup();
  if (source) {
    try {
      swapIn();
    } catch (err) {
      // Out of disk, or the file vanished between the check and the copy. An
      // empty database the user can still use beats a window that never opens.
      console.error("Failed to restore from backup:", err);
      source = null;
    }
  }
  await initDatabase({ backupBeforeMigration: false });

  const report: RecoveryReport = {
    problem,
    restoredFrom: source,
    quarantined: quarantined ? path.basename(quarantined) : null,
    detail,
  };
  console.error("Database recovery:", report);
  return report;
}

// Wraps initDatabase so the two ways this database can be lost — the file gone,
// or the file unreadable — both come back from the newest good snapshot instead
// of leaving the app to start empty, or not at all.
export async function initDatabaseWithRecovery(
  onMigrationProgress?: (text: string) => void,
): Promise<void> {
  recoveryReport = null;
  const missing = !fs.existsSync(getDbPath());

  try {
    await initDatabase({ onMigrationProgress });
    // quick_check reads the whole file, which is seconds on a database of a gigabyte or more, so a
    // clean result is trusted for a day. A database that cannot even open still fails above.
    const lastCheck = Number(getSetting("last_quick_check") ?? 0);
    if (!missing && Date.now() - lastCheck > QUICK_CHECK_INTERVAL_MS) {
      const result = getDatabase().pragma("quick_check") as { quick_check: string }[];
      if (result[0]?.quick_check !== "ok") {
        throw new Error(result[0]?.quick_check ?? "integrity check failed");
      }
      setSetting("last_quick_check", String(Date.now()));
    }
  } catch (err: unknown) {
    // A locked file, a full disk or a migration that rolled back is not damage: replacing the
    // database with an older snapshot would throw away games, so these stop the start with
    // their own message
    const code = (err as { code?: string }).code ?? "";
    if (/^SQLITE_(BUSY|LOCKED|FULL|READONLY|CANTOPEN|PERM)|^MIGRATION_FAILED$/.test(code))
      throw err;
    // Damage can surface either on open or on the first statements migrations
    // run, so the check and the init it follows share one handler.
    console.error("Database failed to open:", err);
    const detail = err instanceof Error ? err.message : String(err);
    recoveryReport = await recover("corrupt", detail);
    return;
  }

  // The database opened cleanly, but it wasn't there a moment ago. On a fresh
  // install that is simply the first launch; with snapshots on disk it means
  // the file was deleted, and starting empty would look like data loss.
  if (missing && readBackups().length > 0) {
    recoveryReport = await recover("missing");
  }
}

export function getRecoveryReport(): RecoveryReport | null {
  return recoveryReport;
}
