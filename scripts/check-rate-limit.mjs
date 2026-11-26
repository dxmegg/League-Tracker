// node --no-warnings scripts/check-rate-limit.mjs
import assert from "node:assert/strict";
import { nextSlot, RIOT_LIMITS } from "../src/shared/rate-limit.ts";

const starts = [];
for (let i = 0; i < 250; i++) starts.push(nextSlot(starts, 0));
for (const { max, windowMs } of RIOT_LIMITS) {
  starts.forEach((at, i) => {
    if (i >= max)
      assert.ok(at - starts[i - max] > windowMs, `${max} per ${windowMs} broken at ${i}`);
  });
}
assert.equal(starts[19], 0, "a burst of 20 goes out at once");
assert.ok(starts[99] < 10_000, "100 requests take seconds, not minutes");
assert.equal(nextSlot([], 5), 5);
console.log("rate limit checks passed");
