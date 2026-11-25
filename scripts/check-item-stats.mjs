// Self-check for the item detail aggregations: node scripts/check-item-stats.mjs
import assert from "node:assert/strict";
import { byGameLength, byMonth, winRateBoost } from "../src/renderer/lib/itemStats.ts";

const game = (minutes, win, month = 0) => ({
  game_duration: minutes * 60,
  game_creation: new Date(2026, month, 10).getTime(),
  win,
});

assert.deepEqual(
  byGameLength([game(30, 1), game(8, 0), game(15, 1), game(19.9, 0), game(25, 1)]).map((b) => [
    b.label,
    b.games,
    b.wins,
  ]),
  [
    ["Under 15 min", 1, 0],
    ["15–20 min", 2, 1],
    ["25 min and more", 2, 2],
  ],
);
assert.deepEqual(
  byMonth([game(20, 1, 10), game(20, 0, 1)]).map((b) => b.label),
  ["2026-02", "2026-11"],
);
// 8/10 with the item, 2/10 without it
assert.equal(
  Math.round(winRateBoost({ games: 10, wins: 8, championGames: 20, championWins: 10 })),
  60,
);
// Always built: nothing to compare against
assert.equal(winRateBoost({ games: 10, wins: 8, championGames: 10, championWins: 8 }), null);
console.log("item stats ok");
