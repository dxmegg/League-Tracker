// node --no-warnings scripts/check-versions.mjs
import assert from "node:assert/strict";
import { isSameRelease, lastPublished, releasesSince } from "../src/shared/version.ts";

assert.ok(isSameRelease("v1.1", "1.1.0"));
assert.ok(isSameRelease("v.1.0.8", "1.0.8"));
assert.ok(!isSameRelease("v1.0.0", "1.4.0"));
assert.ok(!isSameRelease("v1.0.0-hotfix", "1.0.0"));
assert.ok(!isSameRelease("v.blabla", "1.0.0"));

// The last one published wins, whatever its number or its place in GitHub's list
const releases = [
  { tag_name: "v4.0", published_at: "2026-01-01T00:00:00Z" },
  { tag_name: "v0.1", published_at: "2026-03-01T00:00:00Z" },
  { tag_name: "v1.6", published_at: "2026-02-01T00:00:00Z" },
];
assert.equal(lastPublished(releases).tag_name, "v0.1");
assert.equal(lastPublished([]), undefined);
// Skipped releases follow the publish order too
const tags = (current) => releasesSince(releases, current).map((r) => r.tag_name);
assert.deepEqual(tags("4.0"), ["v0.1", "v1.6"]);
assert.deepEqual(tags("0.1"), []);
assert.deepEqual(tags("9.9.9"), ["v0.1"]);
console.log("version checks passed");
