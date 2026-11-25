// node --no-warnings scripts/check-versions.mjs
import assert from "node:assert/strict";
import { compareVersions } from "../src/shared/version.ts";

assert.ok(compareVersions("v1.1", "1.0.10") > 0);
assert.equal(compareVersions("v1.1", "1.1.0"), 0);
assert.ok(compareVersions("v.1.0.8", "1.0.7") > 0);
assert.ok(compareVersions("v1.0.10", "1.0.9") > 0);
assert.ok(compareVersions("release", "1.0.0") < 0);
console.log("version checks passed");
