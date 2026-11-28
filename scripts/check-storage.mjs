// node --no-warnings scripts/check-storage.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  deleteDataFiles,
  dueBackup,
  staleBackups,
  swapAndOpen,
  moveBackupFiles,
  readLocations,
  resolveUserDataDir,
  writeLocations,
} from "../src/main/storage-files.ts";
import { backupFirst } from "../src/main/backup-choice.ts";

// "Back up first?": closing the box stops everything, a failed backup goes to onFailure
const decide = async (answer, fails = false) => {
  let taken = 0;
  const go = await backupFirst(
    async () => answer,
    async () => {
      taken++;
      if (fails) throw new Error("disk full");
    },
    async (message) => message !== "disk full",
  );
  return [go, taken];
};
assert.deepEqual(await decide("backup"), [true, 1]);
assert.deepEqual(await decide("skip"), [true, 0]);
assert.deepEqual(await decide("cancel"), [false, 0]);
assert.deepEqual(await decide("backup", true), [false, 1]);

// Three slots, each replaced only by its own kind: monthly, weekly ("auto") and manual, which also
// takes every "before ..." backup; plain .db files are never removed
const name = (day, reason, ext = "-5g.db.gz") => `matches-2026-01-0${day}T00-00-00-${reason}${ext}`;
const old = name(1, "manual", ".db");
const month = name(2, "monthly");
const week = name(3, "auto");
const manual = name(4, "pre-delete");
assert.deepEqual(staleBackups([old, month, week, manual, "notes.txt"], manual), []);
assert.deepEqual(staleBackups([month, week, manual, name(5, "auto")], name(5, "auto")), [week]);
assert.deepEqual(staleBackups([old, month], month), []);
assert.deepEqual(staleBackups([month, week, name(5, "monthly")], name(5, "monthly")), [month]);
assert.deepEqual(staleBackups([name(5, "manual"), manual], manual), [name(5, "manual")]); // clock moved back
const migration = name(1, "pre-migration-20");
assert.deepEqual(staleBackups([migration, manual], manual), [migration]);

const DAY = 24 * 60 * 60 * 1000;
const at = (reason, daysAgo) => ({ reason, created: 100 * DAY - daysAgo * DAY });
assert.equal(dueBackup([], 100 * DAY), "monthly");
assert.equal(dueBackup([at("monthly", 1)], 100 * DAY), "auto");
assert.equal(dueBackup([at("monthly", 1), at("auto", 6)], 100 * DAY), null);
assert.equal(dueBackup([at("monthly", 1), at("manual", 1)], 100 * DAY), "auto"); // manual is its own slot
assert.equal(dueBackup([at("monthly", 29), at("auto", 8)], 100 * DAY), "auto");
assert.equal(dueBackup([at("monthly", 31), at("auto", 1)], 100 * DAY), "monthly");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "rr-storage-"));
const put = (...parts) => {
  const file = path.join(root, ...parts);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, parts.at(-1));
  return file;
};
const names = (dir) => fs.readdirSync(path.join(root, dir)).sort();

const config = path.join(root, "locations.json");
assert.deepEqual(readLocations(config), {});
writeLocations(config, { dbDir: "D:\\x" });
assert.deepEqual(readLocations(config), { dbDir: "D:\\x" });
fs.writeFileSync(config, "{broken");
assert.throws(() => readLocations(config));

const backup = "matches-2026-01-01T00-00-00-auto.db";
const taken = "matches-2026-01-02T00-00-00-manual.db";
put("old", backup);
put("old", taken);
put("old", "holiday.jpg");
fs.mkdirSync(path.join(root, "new"));
fs.writeFileSync(path.join(root, "new", taken), "already here");
assert.equal(await moveBackupFiles(path.join(root, "old"), path.join(root, "new")), 1);
assert.deepEqual(names("old"), ["holiday.jpg", taken]);
assert.equal(fs.readFileSync(path.join(root, "new", taken), "utf8"), "already here");
assert.equal(await moveBackupFiles(path.join(root, "new"), path.join(root, "NEW")), 0);
assert.equal(await moveBackupFiles(path.join(root, "nothing"), path.join(root, "else")), 0);

put("shared", "matches.db");
put("shared", "matches.db-wal");
put("shared", "matches.db.corrupt-2026");
put("shared", "my-matches.db");
put("shared", "notes.txt");
put("shared", "backups", backup);
deleteDataFiles(path.join(root, "shared"), path.join(root, "shared", "backups"));
assert.deepEqual(names("shared"), ["my-matches.db", "notes.txt"]);

// Profile folder rename
const appData = path.join(root, "appdata");
const oldDir = path.join(appData, "league-tracker");
const newDir = path.join(appData, "rift-records");
assert.equal(resolveUserDataDir(appData), newDir); // new user: nothing to move
put("appdata", "league-tracker", "data", "matches.db");
writeLocations(path.join(oldDir, "locations.json"), {
  dbDir: path.join(oldDir, "mine"),
  backupDir: "D:\\backups",
});
put("appdata", "rift-records", "stray.txt"); // blocks the rename
assert.equal(resolveUserDataDir(appData), oldDir);
fs.rmSync(newDir, { recursive: true });
assert.equal(resolveUserDataDir(appData), newDir);
assert.equal(fs.existsSync(oldDir), false);
assert.deepEqual(names("appdata/rift-records/data"), ["matches.db"]);
assert.deepEqual(readLocations(path.join(newDir, "locations.json")), {
  dbDir: path.join(newDir, "mine"),
  backupDir: "D:\\backups",
});
assert.equal(resolveUserDataDir(appData), newDir);

// Restoring: a database that cannot be opened gives way to the one it replaced
for (const broken of [false, true]) {
  const live = put(`swap-${broken}`, "matches.db");
  fs.writeFileSync(live, "old");
  const incoming = put(`swap-${broken}`, "matches.db.incoming");
  fs.writeFileSync(incoming, "new");
  const opened = [];
  const open = async () => {
    opened.push(fs.readFileSync(live, "utf8"));
    if (broken && opened.length === 1) throw new Error("upgrade failed");
  };
  const done = swapAndOpen(live, incoming, open, () => {});
  if (broken) await assert.rejects(done, /upgrade failed/);
  else await done;
  assert.deepEqual(opened, broken ? ["new", "old"] : ["new"]);
  assert.equal(fs.readFileSync(live, "utf8"), broken ? "old" : "new");
  assert.deepEqual(names(`swap-${broken}`), ["matches.db"]);
}

fs.rmSync(root, { recursive: true, force: true });
console.log("storage checks passed");
