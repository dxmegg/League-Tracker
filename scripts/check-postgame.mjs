// node --no-warnings scripts/check-postgame.mjs
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import {
  createPostGameCapture,
  EOG_STATS_URL,
  HONOR_URL,
  MASTERY_UPDATES_URL,
} from "../src/main/post-game.ts";

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
console.log("post-game checks passed");
