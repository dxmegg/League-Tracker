// node --no-warnings scripts/check-groups.mjs
import assert from "node:assert/strict";
import { groupTeammates } from "../src/shared/groups.ts";

const row = (game_id, key, win = 1) => ({
  game_id,
  game_creation: game_id,
  key,
  name: key.toUpperCase(),
  win,
  kills: 1,
  deaths: 1,
  assists: 1,
});
const groups = groupTeammates([
  row(1, "a"),
  row(1, "b"),
  row(1, "random"),
  row(2, "b", 0),
  row(2, "a", 0),
  row(3, "a"),
  row(3, "c"),
]);
assert.equal(groups.length, 1);
assert.deepEqual(
  [groups[0].names, groups[0].games, groups[0].wins, groups[0].kills, groups[0].lastGameId],
  [["A", "B"], 2, 1, 4, 2],
);
console.log("group checks passed");
