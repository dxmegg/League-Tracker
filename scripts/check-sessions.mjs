// node --no-warnings scripts/check-sessions.mjs
import assert from "node:assert/strict";
import { groupDaysAndSessions } from "../src/renderer/lib/matchSessions.ts";

const match = (game_id, iso, game_version) => ({
  game_id,
  game_creation: new Date(iso).getTime(),
  game_duration: 900,
  game_version,
  is_remake: 0,
  win: 1,
  kills: 1,
  deaths: 1,
  assists: 1,
  score: null,
});
// Newest first: Thursday and Monday of one week, then the Sunday before
const matches = [
  match(3, "2026-11-26T20:00:00", "16.23"),
  match(2, "2026-11-23T20:00:00", "16.22"),
  match(1, "2026-11-22T20:00:00", "16.22"),
];
const sizes = (grouping) => groupDaysAndSessions(matches, grouping).map((g) => g.games);
assert.deepEqual(sizes("day"), [1, 1, 1]);
assert.deepEqual(sizes("week"), [2, 1]);
assert.deepEqual(sizes("patch"), [1, 2]);
assert.match(groupDaysAndSessions(matches, "patch")[0].label, /16\.23/);
console.log("session grouping checks passed");
