// node --no-warnings scripts/check-changelog.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseChangelog } from "../src/shared/changelog.ts";

assert.deepEqual(parseChangelog("# T\n## 2.0 (2026-01-02)\n\n- a `b`\ntext\n## Unreleased\n- c"), [
  { version: "2.0", date: "2026-01-02", changes: ["a b"] },
]);

// Both shipped files parse in full: no release without a date or without bullets
for (const file of ["CHANGELOG.md", "CHANGELOG-EARLY.md"]) {
  const text = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const releases = parseChangelog(text);
  assert.equal(releases.length, text.match(/^## /gm).length, file);
  assert.ok(
    releases.every((r) => r.changes.length > 0 && new Set(r.changes).size === r.changes.length),
    file,
  );
  assert.equal(new Set(releases.map((r) => r.version)).size, releases.length, file);
}
console.log("changelog checks passed");
