// node --no-warnings scripts/check-diagnostics.mjs
import assert from "node:assert/strict";
import { isRiotNotFound, lastCheck } from "../src/shared/diagnostics-rules.ts";

const riot = JSON.stringify({ status: { message: "Data not found", status_code: 404 } });
assert.equal(isRiotNotFound(404, riot), true);
assert.equal(isRiotNotFound(404, "Not found"), false);
assert.equal(isRiotNotFound(404, "null"), false);
assert.equal(isRiotNotFound(403, riot), false);

assert.equal(lastCheck(1, undefined), 1);
assert.equal(lastCheck(1, { at: 2, reason: "x" }), 2);
assert.equal(lastCheck(undefined, { at: 2, reason: "x" }), 2);
assert.equal(lastCheck(undefined, undefined), undefined);
console.log("diagnostics checks passed");
