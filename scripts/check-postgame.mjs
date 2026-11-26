// node --no-warnings scripts/check-postgame.mjs
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import {
  createPostGameCapture,
  EOG_STATS_URL,
  HONOR_URL,
  MASTERY_UPDATES_URL,
} from "../src/main/post-game.ts";
import { challengeChanges } from "../src/main/post-game.ts";
import { eogExtras, findEogPlayer, stripEogSecrets } from "../src/shared/eog.ts";

const mastery = (points) => [
  { championId: 1, championPoints: points, lastPlayTime: points },
  { championId: 2, championPoints: 50, lastPlayTime: 1 },
];
let current = mastery(100);
const responses = {
  [`/${EOG_STATS_URL}`]: { gameId: 7, stats: true },
  [`/${HONOR_URL}`]: [
    { gameId: 7, puuid: "a" },
    { gameId: 6, puuid: "b" },
    { gameId: 7, puuid: "c" },
  ],
};
const saved = new Map();
const capture = createPostGameCapture({
  get: async (url) => {
    if (url.endsWith("local-player/champion-mastery")) return current;
    if (url in responses) return responses[url];
    throw new Error("404");
  },
  save: (gameId, kind, data) => saved.set(`${gameId}:${kind}`, data),
  delays: [1],
});

await capture.onGameStart();
current = mastery(900);
capture.onGameEnd(7);
await sleep(30);
assert.equal(saved.get("7:eog").stats, true);
assert.deepEqual(
  saved.get("7:mastery_changes").map((c) => [c.before.championPoints, c.after.championPoints]),
  [[100, 900]],
);
assert.equal(saved.get("7:honor").length, 2);
assert.equal(saved.get("6:honor").length, 1);
assert.ok(!saved.has("7:mastery_updates"), "a 404 stores nothing");

// Mastery pushed without a game id belongs to the game that just ended
await capture.onFrame(MASTERY_UPDATES_URL, { grade: "S" });
assert.equal(saved.get("7:mastery_updates").grade, "S");
capture.stop();
assert.deepEqual(stripEogSecrets({ gameId: 1, mucJwtDto: {}, multiUserChatPassword: "x" }), {
  gameId: 1,
});
const eog = {
  teams: [
    { players: [{ puuid: "a", championId: 5, teamId: 100, wins: 2, stats: { baronKills: 1 } }] },
  ],
};
const player = findEogPlayer(eog, { puuid: null, championId: 5, teamId: 100 });
assert.deepEqual(eogExtras(player), { baronKills: 1, wins: 2 });
assert.equal(findEogPlayer(eog, { puuid: "z", championId: 9, teamId: 100 }), null);
assert.deepEqual(
  challengeChanges(
    { 1: { id: 1, currentValue: 1 }, 2: { id: 2, currentValue: 3 } },
    { 1: { id: 1, currentValue: 4 }, 2: { id: 2, currentValue: 3 } },
  ).map((c) => [c.id, c.after - c.before]),
  [[1, 3]],
);
console.log("post-game checks passed");
