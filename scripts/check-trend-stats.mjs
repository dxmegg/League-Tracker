// Self-check for the Trends aggregations: node scripts/check-trend-stats.mjs
import assert from "node:assert/strict";
import {
  byLength,
  rollingWinRate,
  sessionEffects,
  standouts,
} from "../src/renderer/lib/trendStats.ts";

const HOUR = 3_600_000;
const game = (hours, win, owner = "a", minutes = 18) => ({
  owner,
  time: hours * HOUR,
  duration: minutes * 60,
  win,
});

// Two sittings for "a" (given out of order) and one for "b" in between
const { slots, after } = sessionEffects([
  game(1, 0),
  game(0, 1),
  game(10, 1),
  game(0.5, 0, "b"),
  game(1.5, 1, "b"),
]);
assert.deepEqual(
  slots.slice(0, 2).map((s) => [s.games, s.wins]),
  [
    [3, 2],
    [2, 1],
  ],
);
// a: loss after a win; b: win after a loss; the next sitting counts for neither
assert.deepEqual(
  after.map((s) => [s.games, s.wins]),
  [
    [1, 0],
    [1, 1],
  ],
);
assert.deepEqual(
  byLength([game(0, 1, "a", 8), game(1, 0, "a", 20), game(2, 1, "a", 40)]).map((s) => s.games),
  [1, 0, 1, 1],
);
assert.deepEqual(
  rollingWinRate([game(0, 1), game(1, 1), game(2, 0), game(3, 0)], 2).map((p) => p.rate),
  [100, 50, 0],
);
assert.deepEqual(rollingWinRate([game(0, 1)], 2), []);
const split = (label, games, wins) => ({ label, games, wins });
const found = standouts([split("a", 10, 9), split("b", 10, 2), split("thin", 1, 1)], 50, 5);
assert.deepEqual([found.best.label, found.worst.label], ["a", "b"]);
assert.equal(standouts([split("thin", 1, 1)], 50, 5).best, null);
console.log("trend stats ok");
