// node --no-warnings scripts/check-match-build.mjs
import assert from "node:assert/strict";
import {
  lastTakedownMs,
  premadeGroups,
  purchaseOrder,
  skillOrder,
} from "../src/shared/match-build.ts";

const e = (event_type, ms, more) => ({
  event_type,
  timestamp_ms: ms,
  participant_id: 1,
  ...more,
});
const events = [
  e("ITEM_PURCHASED", 1, { item_id: 10 }),
  e("ITEM_PURCHASED", 2, { item_id: 11 }),
  e("ITEM_UNDO", 3, { item_id: 11 }),
  e("ITEM_SOLD", 4, { item_id: 10 }),
  e("ITEM_PURCHASED", 5, { item_id: 12, participant_id: 2 }),
  e("SKILL_LEVEL_UP", 6, { skill_slot: 1, level_up_type: "NORMAL" }),
  e("SKILL_LEVEL_UP", 7, { skill_slot: 1, level_up_type: "EVOLVE" }),
  e("SKILL_LEVEL_UP", 8, { skill_slot: 4, level_up_type: "NORMAL" }),
  e("CHAMPION_KILL", 9, { killer_id: 1, assisting_participant_ids: null }),
  e("CHAMPION_KILL", 20, { killer_id: 3, assisting_participant_ids: "[1,4]" }),
  e("CHAMPION_KILL", 30, { killer_id: 3, assisting_participant_ids: "[4]" }),
];
assert.deepEqual(
  purchaseOrder(events, 1).map((p) => [p.itemId, p.sold]),
  [
    [10, false],
    [10, true],
  ],
);
assert.deepEqual(skillOrder(events, 1), ["Q", "R"]);
assert.equal(lastTakedownMs(events, 1), 20);
assert.equal(lastTakedownMs(events, 9), null);

const p = (championId, teamParticipantId) => ({ championId, teamParticipantId });
const groups = premadeGroups({ teamOne: [p(1, 5), p(2, 5), p(3, 6)], teamTwo: [p(1, 7), p(4, 7)] });
assert.deepEqual(
  [...groups],
  [
    ["100:1", 1],
    ["100:2", 1],
    ["200:1", 2],
    ["200:4", 2],
  ],
);
assert.equal(premadeGroups(undefined).size, 0);
console.log("match build checks passed");
