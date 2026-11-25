// Self-check for the score systems in src/shared/opScore.ts:  npm run check:scores
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const { computeMatchScoreBreakdowns, scoreSystemFor, scoreConfigHash, SCORE_TUNING } = await import(
  pathToFileURL(path.join(root, "src/shared/opScore.ts")).href
);

const player = (id, over = {}) => ({
  participantId: id,
  teamId: id <= 5 ? 100 : 200,
  championId: id,
  kills: 5,
  deaths: 4,
  assists: 8,
  doubleKills: 0,
  tripleKills: 0,
  quadraKills: 0,
  pentaKills: 0,
  totalDamageDealtToChampions: 20000 + id * 1500,
  totalDamageTaken: 18000 + id * 900,
  goldEarned: 11000 + id * 300,
  totalHeal: 2000,
  win: id <= 5,
  gameDuration: 1200,
  cs: 150,
  visionScore: 20,
  timeCcingOthers: 10,
  healOnTeammates: 500,
  shieldedOnTeammates: 200,
  damageToObjectives: 3000,
  ...over,
});
const lobby = (queueId, n = 10, over = () => ({})) =>
  Array.from({ length: n }, (_, i) => player(i + 1, { queueId, ...over(i + 1) }));

// Queue routing
assert.equal(scoreSystemFor(2400), "aram");
assert.equal(scoreSystemFor(450), "aram");
assert.equal(scoreSystemFor(420), "sr");
assert.equal(scoreSystemFor(480), "generic", "Swiftplay stays out of the Rift system");
assert.equal(scoreSystemFor(1750), "arena");
assert.equal(scoreSystemFor(900), "generic");
assert.equal(scoreSystemFor(null), "generic");

// Every weight row sums to the same constant. Identity anchors make the points equal the weights.
const keep = JSON.parse(JSON.stringify(SCORE_TUNING));
const identity = [
  [0, 0],
  [1, 1],
  [2, 2],
];
SCORE_TUNING.aram.anchors = SCORE_TUNING.sr.anchors = identity;
SCORE_TUNING.arena.anchors.default = identity;
const classes = ["Assassin", "Marksman", "Mage", "Fighter", "Tank", "Support", undefined];
const classMap = Object.fromEntries(classes.map((c, i) => [i + 1, c]));
const weightSum = (b) => b.components.reduce((s, c) => s + c.weight, 0);
for (const [queue, n] of [
  [2400, 10],
  [420, 10],
]) {
  for (const b of computeMatchScoreBreakdowns(lobby(queue, n), classMap).values()) {
    assert.ok(Math.abs(weightSum(b) - 9.8) < 1e-9, `${queue} weights sum to ${weightSum(b)}`);
  }
}
// Clean roles make the Rift system grade by role; each role's row (with class tweaks) must also sum
const roles = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
const rift = lobby(420, 10, (id) => ({ teamPosition: roles[(id - 1) % 5] }));
for (const b of computeMatchScoreBreakdowns(rift, classMap).values()) {
  assert.ok(b.cls, "role weights used when roles are clean");
  assert.ok(Math.abs(weightSum(b) - 9.8) < 1e-9, `role row sums to ${weightSum(b)}`);
}
// Stored games carry no ally heal/shield data (all zeros): healing falls back to total healing, and
// a class with a 0 healing weight has no healing row at all
const noAlly = lobby(2400, 10, (id) => ({
  healOnTeammates: 0,
  shieldedOnTeammates: 0,
  totalHeal: id === 6 ? 9000 : 1000,
}));
const noAllyScores = computeMatchScoreBreakdowns(noAlly, classMap);
const healRow = (b) => b.components.find((c) => c.key === "heal");
assert.ok(healRow(noAllyScores.get(6)).value === 9000, "support healing read from total healing");
assert.ok(healRow(noAllyScores.get(6)).points > 0, "support earns healing points");
assert.equal(healRow(noAllyScores.get(1)), undefined, "assassin has no healing row");
assert.equal(healRow(noAllyScores.get(3)), undefined, "mage has no healing row");

// Two junglers in a team: roles are distrusted and the blend is used
const messy = lobby(420, 10, (id) => ({
  teamPosition: id % 5 === 1 ? "JUNGLE" : roles[(id - 1) % 5],
}));
for (const b of computeMatchScoreBreakdowns(messy, classMap).values()) assert.equal(b.cls, null);

const arenaLobby = (teams, size) =>
  Array.from({ length: teams * size }, (_, i) => {
    const team = Math.floor(i / size) + 1;
    return player(i + 1, {
      queueId: 1750,
      teamId: 100,
      subteamId: team,
      placement: team,
      win: team <= teams / 2,
    });
  });
for (const [teams, size] of [
  [6, 3],
  [8, 2],
  [4, 2],
  [4, 4],
]) {
  const bs = computeMatchScoreBreakdowns(arenaLobby(teams, size), classMap);
  assert.equal(bs.size, teams * size);
  for (const b of bs.values()) {
    assert.equal(b.system, "arena");
    assert.ok(
      Math.abs(weightSum(b) - 9.8) < 1e-9,
      `arena ${teams}x${size} weights ${weightSum(b)}`,
    );
    assert.ok(b.score >= 1 && b.score <= 10);
  }
  // One MVP among the winning teams and one ACE among the losing ones, lobby-wide
  const badges = [...bs.values()].map((b) => b.badge);
  assert.equal(badges.filter((b) => b === "MVP").length, 1, `${teams}x${size} MVP`);
  assert.equal(badges.filter((b) => b === "ACE").length, 1, `${teams}x${size} ACE`);
}
// A lobby with no placement data falls back to the generic formula
const noPlacement = arenaLobby(6, 3).map((p) => ({ ...p, placement: null }));
for (const b of computeMatchScoreBreakdowns(noPlacement, classMap).values()) {
  assert.equal(b.system, "generic");
}

// Placement counts: identical stats, better finish scores higher
SCORE_TUNING.arena.anchors.default = keep.arena.anchors.default;
const sameStats = arenaLobby(6, 3).map((p) => ({
  ...p,
  totalDamageDealtToChampions: 30000,
  totalDamageTaken: 20000,
  goldEarned: 12000,
  win: false,
}));
const bs = computeMatchScoreBreakdowns(sameStats, {});
assert.ok(
  bs.get(1).raw > bs.get(7).raw && bs.get(7).raw > bs.get(16).raw,
  "placement orders scores",
);

// One MVP and one ACE per side in a two-team game
SCORE_TUNING.aram.anchors = keep.aram.anchors;
const aram = computeMatchScoreBreakdowns(lobby(2400), {});
const mvps = [...aram.values()].filter((b) => b.badge === "MVP").length;
const aces = [...aram.values()].filter((b) => b.badge === "ACE").length;
assert.equal(mvps, 1);
assert.equal(aces, 1);

// AFK is forced to 1.0 and never takes a badge
const afk = computeMatchScoreBreakdowns(
  lobby(2400, 10, (id) => (id === 3 ? { totalDamageDealtToChampions: 300, goldEarned: 600 } : {})),
  {},
);
assert.equal(afk.get(3).score, 1);
assert.ok(afk.get(3).flags.includes("afk"));
assert.equal(afk.get(3).badge, null);

assert.match(scoreConfigHash(), /^[0-9a-f]{8}$/);
console.log("score checks passed");
