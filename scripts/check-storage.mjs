// node --no-warnings scripts/check-storage.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  deleteDataFiles,
  moveBackupFiles,
  readLocations,
  writeLocations,
} from "../src/main/storage-files.ts";

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

fs.rmSync(root, { recursive: true, force: true });
console.log("storage checks passed");
