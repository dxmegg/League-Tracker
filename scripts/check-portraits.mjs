// node --no-warnings scripts/check-portraits.mjs
import assert from "node:assert/strict";
import { usesAltPortrait } from "../src/renderer/lib/portraits.ts";

assert.equal(usesAltPortrait(106, true), true);
assert.equal(usesAltPortrait(106, false), false);
assert.equal(usesAltPortrait(1, true), false);
console.log("portrait checks passed");
