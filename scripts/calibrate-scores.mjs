// Calibrates the score anchors of src/shared/opScore.ts against real games.
//
//   python scripts/export-score-sample.py <matches.db> <games.json>
//   node scripts/calibrate-scores.mjs <games.json> [data/champion-cache.json]
//
// For each system (and each Arena lobby shape) it measures the weighted sum of every player, then
// prints the three anchors that put the 6th percentile at 2.0, the median at 6.0 and the 95th
// percentile at 9.0 — paste them into SCORE_TUNING — and the distribution that results.
// Pass data/champion-cache.json as the second argument to grade with class weights.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const { computeMatchScoreBreakdowns, SCORE_TUNING } = await import(
  pathToFileURL(path.join(root, "src/shared/opScore.ts")).href
);

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/calibrate-scores.mjs <games.json>");
  process.exit(1);
}
const sample = JSON.parse(fs.readFileSync(file, "utf8"));
// Optional: data/champion-cache.json, so each player is graded with their champion's class weights
const classes = process.argv[3]
  ? Object.fromEntries(
      Object.entries(JSON.parse(fs.readFileSync(process.argv[3], "utf8")).champions).map(
        ([id, c]) => [id, c.class],
      ),
    )
  : {};
const TARGETS = [
  [0.06, 2.0],
  [0.5, 6.0],
  [0.95, 9.0],
];

const quantile = (arr, p) =>
  [...arr].sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(arr.length * p))];
const pct = (arr, f) => (arr.length ? (arr.filter(f).length / arr.length) * 100 : 0);
// The identity anchors make `raw` equal the weighted sum
const IDENTITY = [
  [0, 0],
  [1, 1],
  [2, 2],
];

function collect(games) {
  const out = [];
  for (const game of games) {
    for (const b of computeMatchScoreBreakdowns(game, classes).values()) {
      if (!b.flags.includes("afk")) out.push(b);
    }
  }
  return out;
}

const median = (arr) => quantile(arr, 0.5);

// First pass: the shift that moves each class's median sum onto the overall median
function classShifts(games, setShift) {
  setShift({});
  const bySum = new Map();
  const all = [];
  for (const b of collect(games)) {
    all.push(b.raw);
    if (b.cls) bySum.set(b.cls, [...(bySum.get(b.cls) ?? []), b.raw]);
  }
  const target = median(all);
  return Object.fromEntries(
    [...bySum].map(([cls, v]) => [cls, Number((target - median(v)).toFixed(3))]),
  );
}

function fit(label, games, setAnchors, setShift) {
  if (games.length === 0) return console.log(`${label}: no games`);
  setAnchors(IDENTITY);
  if (setShift) {
    const shifts = classShifts(games, setShift);
    setShift(shifts);
    console.log(`${label.padEnd(12)} classShift ${JSON.stringify(shifts)}`);
  }
  const sums = collect(games).map((b) => b.raw);
  const anchors = TARGETS.map(([p, score]) => [Number(quantile(sums, p).toFixed(3)), score]);
  setAnchors(anchors);
  const scores = collect(games).map((b) => b.score);
  console.log(
    `${label.padEnd(12)} games ${String(games.length).padStart(5)} | anchors ${JSON.stringify(anchors)}\n` +
      `${" ".repeat(12)} median ${quantile(scores, 0.5).toFixed(1)} | 9+ ${pct(scores, (v) => v >= 9).toFixed(1)}%` +
      ` | 8+ ${pct(scores, (v) => v >= 8).toFixed(1)}% | <=3 ${pct(scores, (v) => v <= 3).toFixed(1)}%` +
      ` | <=2 ${pct(scores, (v) => v <= 2).toFixed(1)}% | at 1.0 ${pct(scores, (v) => v <= 1).toFixed(1)}%`,
  );
}

fit(
  "aram",
  sample.aram,
  (a) => (SCORE_TUNING.aram.anchors = a),
  (s) => (SCORE_TUNING.aram.classShift = s),
);
fit("sr", sample.sr, (a) => (SCORE_TUNING.sr.anchors = a));

const byShape = new Map();
for (const game of sample.arena) {
  const teams = new Set(game.map((p) => p.subteamId)).size;
  const key = `${teams}x${Math.round(game.length / Math.max(teams, 1))}`;
  byShape.set(key, [...(byShape.get(key) ?? []), game]);
}
// The class shift is fitted on the largest shape (6x3) and shared by the rest
for (const [shape, games] of [...byShape].sort((a, b) => a[1].length - b[1].length)) {
  const isMain = shape === "6x3";
  fit(
    `arena ${shape}`,
    games,
    (a) => (SCORE_TUNING.arena.anchors[shape] = a),
    isMain ? (s) => (SCORE_TUNING.arena.classShift = s) : undefined,
  );
}

// A game is graded by role only when every team has one of each role; the rest use the blend
console.log("\nSR games graded by role (cls is set only then):");
const roles = new Map();
let trusted = 0;
for (const game of sample.sr) {
  const bs = [...computeMatchScoreBreakdowns(game, classes).values()];
  if (bs.some((b) => b.cls)) trusted++;
  for (const b of bs) {
    const role = b.cls ?? "blend";
    roles.set(role, [...(roles.get(role) ?? []), b.score]);
  }
}
console.log(`  ${trusted} of ${sample.sr.length} games`);
for (const [role, v] of roles) {
  console.log(
    `  ${role.padEnd(8)} n=${String(v.length).padStart(4)} median ${quantile(v, 0.5).toFixed(1)}`,
  );
}
