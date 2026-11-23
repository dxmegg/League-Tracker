// Shared between the main process (insert-time scoring + migration backfill)
// and the renderer (full-scoreboard scoring).
//
// Three scoring systems, picked by queue (see scoreSystemFor):
//   aram    — ARAM, ARAM Mayhem, Mayhem Classic: one long teamfight, graded by class
//   sr      — Summoner's Rift: graded by role first, class second
//   arena   — Arena in every lobby shape (8x2, 6x3, 4x2...), placement is the strongest signal
//   generic — every other queue (co-op, URF, rotating modes): the original formula, unchanged
//
// Stored scores are recomputed at startup whenever the code version or the hash of every number
// below changes (scoreConfigHash), so tuning a weight needs no manual version bump. Settings →
// Repair rescores unconditionally, which is the way out when stored values went stale.
export const SCORE_FORMULA_VERSION = 6;

// championId → Data Dragon class tag ("Assassin" | "Fighter" | "Mage" |
// "Marksman" | "Support" | "Tank"). Supplied by the caller from live champion
// data; champions missing from the map score with the system's default weights.
export type ChampionClassMap = Record<number, string | undefined>;

export type ScoreBadge = "MVP" | "ACE" | null;

export type ScoreSystem = "aram" | "sr" | "arena" | "generic";

const ARAM_QUEUES = new Set([65, 100, 450, 2400, 2450]);
// Swiftplay (480) is left out: its gold per minute is about double the Rift's, which every
// per-minute benchmark below would misread
const SR_QUEUES = new Set([400, 420, 430, 440, 490, 700]);
const ARENA_QUEUES = new Set([1700, 1740, 1750]);

export function scoreSystemFor(queueId?: number | null): ScoreSystem {
  if (queueId == null) return "generic";
  if (ARAM_QUEUES.has(queueId)) return "aram";
  if (SR_QUEUES.has(queueId)) return "sr";
  if (ARENA_QUEUES.has(queueId)) return "arena";
  return "generic";
}

export interface PlayerScore {
  score: number;
  // Unclamped, unrounded total. Stored alongside `score` purely as an ordering
  // key: `score` tops out at 10 and rounds to 0.1, so sorting on it leaves the
  // whole top of a score-sorted list to the secondary sort. Never display it;
  // it can exceed 10 and fall below 1.
  raw: number;
  badge: ScoreBadge;
}

export interface ScoreInput {
  participantId: number;
  teamId: number;
  championId: number;
  kills: number;
  deaths: number;
  assists: number;
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  goldEarned: number;
  totalHeal: number;
  win: boolean;
  // Everything below is optional: a missing field makes its component score 0 rather than break
  // the lobby, and a system that can't work without one falls back to the generic formula.
  queueId?: number | null;
  // Seconds
  gameDuration?: number | null;
  teamPosition?: string | null;
  // Lane + jungle minions
  cs?: number | null;
  visionScore?: number | null;
  timeCcingOthers?: number | null;
  healOnTeammates?: number | null;
  shieldedOnTeammates?: number | null;
  damageToObjectives?: number | null;
  firstBlood?: boolean | null;
  objectivesStolen?: number | null;
  // Arena: the duo/trio this player belongs to, and where that team finished (1 = best)
  subteamId?: number | null;
  placement?: number | null;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export type ScoreComponentKey =
  | "kda"
  | "kp"
  | "dmg"
  | "taken"
  | "heal"
  | "gold"
  | "cc"
  | "cs"
  | "vision"
  | "obj"
  | "placement"
  | "contrib";

// One weighted term of the score. `points` and `weight` are post-scale, so
// across a breakdown they sum to `raw` (with the bonuses) and read as
// "earned X of a possible Y".
export interface ScoreComponent {
  key: ScoreComponentKey;
  // The player's stat: KDA ratio for "kda", a 0–1 fraction for "kp", "contrib" and
  // "placement", per-minute rates for "cs" and "vision", raw totals for the rest.
  value: number;
  // The value that earns full credit: a fixed cap, a role benchmark, or the lobby max.
  reference: number;
  ratio: number;
  weight: number;
  points: number;
}

export interface ScoreBreakdown {
  system: ScoreSystem;
  // Class (aram, arena) or role (sr) whose weights were used; null means the system default.
  cls: string | null;
  components: ScoreComponent[];
  multikill: { label: string; points: number } | null;
  // Damage-dominance bonus. Null for everyone but the top damage dealer (of the lobby, or of the
  // team in Arena), and for a leader whose margin doesn't reach the knee. `lead` is the multiple
  // of the second-best damage.
  carry: { lead: number; points: number } | null;
  // Smaller bonuses: first blood, objective steals, a first-place finish.
  extras: Array<{ label: string; points: number }>;
  // Win bonus points (0 on a loss).
  win: number;
  // Calibration offset: the points the rows above don't account for. 0 for the generic formula.
  adjust: number;
  // "afk" forces the score to 1.0; "low-sample" marks a game too short to judge fairly.
  flags: string[];
  // Scaled sum before the 1-10 clamp and 0.1 rounding.
  raw: number;
  score: number;
  badge: ScoreBadge;
}

// ---- Tuning -------------------------------------------------------------------------------------
//
// curve: every component is ratio^curve, which spreads the middle of the range.
// anchors: three [sum, score] points the weighted sum is mapped through with straight lines, so a
// sum at the 6th percentile of real games reads 2.0, the median reads 6.0 and the 95th percentile
// reads 9.0. A plain multiplier can't do that: the weighted sum bunches at the top (even a weak
// player earns partial credit on every component), so fixing the median alone leaves the bottom
// of the scale empty. scripts/calibrate-scores.mjs reproduces the numbers. Arena has one set per
// lobby shape, "<teams>x<teamSize>", because placement and damage spread differ between them.
type Anchors = [[number, number], [number, number], [number, number]];
// classShift: a per-class nudge to the weighted sum so every class has the same median (Fighters
// would otherwise land a point under Tanks). Fitted on 1839 ARAM, 83 Rift and 649 six-team Arena
// games with class weights. 8x2 and 4x2 lobbies had too few games (5 and 0) to fit, so they use the
// 6x3 set until enough are stored; rerun the script then.
export const SCORE_TUNING = {
  aram: {
    curve: 1.3,
    classShift: {
      Fighter: 0.446,
      Assassin: 0.028,
      Mage: -0.074,
      Tank: -0.225,
      Marksman: -0.067,
      Support: -0.311,
    } as Record<string, number>,
    anchors: [
      [3.464, 2],
      [5.633, 6],
      [8.508, 9],
    ] as Anchors,
  },
  sr: {
    curve: 1.3,
    anchors: [
      [2.87, 2],
      [4.895, 6],
      [7.977, 9],
    ] as Anchors,
  },
  arena: {
    curve: 1.3,
    classShift: {
      Tank: -0.6,
      Marksman: 0.001,
      Fighter: 0.396,
      Mage: -0.241,
      Support: -0.116,
      Assassin: 0.341,
    } as Record<string, number>,
    anchors: {
      default: [
        [2.069, 2],
        [4.921, 6],
        [9.304, 9],
      ] as Anchors,
    } as Record<string, Anchors>,
  },
};

// Straight-line map through the anchors: the lower pair below the median, the upper pair above it,
// each extended past its end.
function calibrate(sum: number, anchors: Anchors): { k: number; c: number } {
  const [a, b, d] = anchors;
  const [[x1, y1], [x2, y2]] = sum <= b[0] ? [a, b] : [b, d];
  const k = (y2 - y1) / (x2 - x1);
  return { k, c: y1 - k * x1 };
}

// Bonus sizes, added before scaling
const MULTIKILL_BONUS = { penta: 0.6, quadra: 0.45, triple: 0.3, double: 0.15 };
const WIN_BONUS = 0.6;
const ARENA_WIN_BONUS = 0.4; // "win" in Arena is the top half, so placement already says most of it
const FIRST_PLACE_BONUS = 0.5;
const FIRST_BLOOD_BONUS = 0.1;
const OBJECTIVE_STEAL_BONUS = 0.15;
// The damage leader is compared against the runner-up: a 20% lead is the floor and a 70% lead
// earns the whole bonus.
const CARRY_KNEE = 1.2;
const CARRY_SPAN = 0.5;
const CARRY_MAX = { lobby: 0.6, sr: 0.5, arena: 0.4 };
// Below this many seconds a game is flagged low-sample
const LOW_SAMPLE_SECONDS = { aram: 600, sr: 900 };
// A player with almost no damage and gold per minute was not playing
const AFK = { aram: { dmg: 40, gold: 120 }, sr: { dmg: 40, gold: 110 }, minSeconds: 360 };

const KDA_CAP = 8;
const KP_CAP = 0.9;

// ---- Weights ------------------------------------------------------------------------------------
// Every row of a table sums to the same constant, so different classes and roles stay comparable.

const ARAM_KEYS = ["kda", "kp", "dmg", "taken", "heal", "cc", "gold"] as const;
// Sum 9.8. ARAM is a constant teamfight: participation and damage weigh most, gold least, healing
// and crowd control more than on the Rift. Healing is 0 for classes that don't heal (assassins,
// marksmen, mages), and a 0 weight drops the row from the breakdown. Tanks are graded on soaking and CC, supports on
// healing/shielding and participation.
const ARAM_WEIGHTS: Record<string, number[]> = {
  Assassin: [2.5, 2.4, 2.7, 0.5, 0, 0.5, 1.2],
  Marksman: [2.1, 2.3, 3.0, 0.6, 0, 0.4, 1.4],
  Mage: [2.1, 2.6, 3.0, 0.6, 0, 0.6, 0.9],
  Fighter: [2.1, 2.3, 2.4, 1.3, 0.5, 0.7, 0.5],
  Tank: [1.8, 2.4, 1.8, 2.1, 0.3, 1.2, 0.2],
  Support: [2.0, 2.8, 1.4, 0.7, 1.6, 0.9, 0.4],
  default: [2.1, 2.4, 2.5, 1.0, 0.7, 0.6, 0.5],
};

const SR_KEYS = ["kda", "kp", "cs", "gold", "dmg", "taken", "vision", "heal", "obj"] as const;
// Sum 9.8. The role decides what is expected of a player; class only nudges it (SR_CLASS_MOD).
const SR_ROLE_WEIGHTS: Record<string, number[]> = {
  TOP: [1.7, 1.0, 1.5, 1.0, 1.6, 0.8, 0.4, 0, 1.8],
  JUNGLE: [1.5, 2.0, 0.9, 0.8, 1.1, 0.7, 0.8, 0, 2.0],
  MIDDLE: [1.7, 1.4, 1.5, 1.1, 2.0, 0.3, 0.5, 0, 1.3],
  BOTTOM: [1.7, 1.3, 1.7, 1.2, 2.1, 0.3, 0.4, 0, 1.1],
  UTILITY: [1.7, 2.3, 0.1, 0.4, 0.5, 0.8, 2.4, 1.2, 0.4],
};
// Per-minute values that earn full credit, by role: about the 90th percentile of real Rift games
const SR_BENCH: Record<string, { cs: number; gold: number; vision: number }> = {
  TOP: { cs: 8.0, gold: 520, vision: 1.2 },
  JUNGLE: { cs: 7.0, gold: 500, vision: 1.6 },
  MIDDLE: { cs: 8.2, gold: 540, vision: 1.2 },
  BOTTOM: { cs: 8.6, gold: 560, vision: 1.1 },
  UTILITY: { cs: 1.5, gold: 380, vision: 3.0 },
};
const SR_ROLE_LABEL: Record<string, string> = {
  TOP: "Top",
  JUNGLE: "Jungle",
  MIDDLE: "Mid",
  BOTTOM: "Bot",
  UTILITY: "Support",
};
// Multipliers of ±8–15% on a role's weights; the row is renormalised afterwards
const SR_CLASS_MOD: Record<string, Partial<Record<(typeof SR_KEYS)[number], number>>> = {
  Tank: { taken: 1.15, dmg: 0.9, kda: 0.95 },
  Support: { heal: 1.12, vision: 1.1, kp: 1.05 },
  Assassin: { kda: 1.1, dmg: 1.08, taken: 0.9 },
  Mage: { dmg: 1.08, taken: 0.9 },
  Marksman: { dmg: 1.08, taken: 0.9, cs: 1.05 },
  Fighter: { taken: 1.08, obj: 1.05 },
};
const SR_SUM = 9.8;

const ARENA_KEYS = ["kda", "dmg", "taken", "heal", "cc", "gold", "contrib"] as const;
// Sum 6.8, plus a fixed placement weight, for the same 9.8 total as the other systems.
const ARENA_PLACEMENT_WEIGHT = 3.0;
const ARENA_WEIGHTS: Record<string, number[]> = {
  Assassin: [1.5, 1.9, 0.4, 0, 0.3, 0.8, 1.9],
  Marksman: [1.1, 2.05, 0.5, 0, 0.3, 1.05, 1.8],
  Mage: [1.1, 2.05, 0.5, 0, 0.4, 0.95, 1.8],
  Fighter: [1.1, 1.6, 0.9, 0.4, 0.5, 0.5, 1.8],
  Tank: [0.9, 1.1, 1.5, 0.2, 0.9, 0.3, 1.9],
  Support: [1.0, 0.9, 0.7, 1.3, 0.6, 0.4, 1.9],
  default: [1.1, 1.6, 0.7, 0.4, 0.4, 0.6, 2.0],
};

// ---- Shared pieces --------------------------------------------------------------------------------

interface Comp {
  key: ScoreComponentKey;
  value: number;
  reference: number;
  weight: number;
}

function multikillOf(p: ScoreInput): { label: string; unscaled: number } | null {
  if (p.pentaKills > 0) return { label: "Penta kill", unscaled: MULTIKILL_BONUS.penta };
  if (p.quadraKills > 0) return { label: "Quadra kill", unscaled: MULTIKILL_BONUS.quadra };
  if (p.tripleKills > 0) return { label: "Triple kill", unscaled: MULTIKILL_BONUS.triple };
  if (p.doubleKills > 0) return { label: "Double kill", unscaled: MULTIKILL_BONUS.double };
  return null;
}

// Carry bonus from the leader's multiple of the runner-up; 0 below the knee
function carryOf(lead: number, max: number): number {
  return clamp01((lead - CARRY_KNEE) / CARRY_SPAN) * max;
}

function assemble(args: {
  system: ScoreSystem;
  p: ScoreInput;
  cls: string | null;
  comps: Comp[];
  curve: number;
  anchors: Anchors;
  carry: { lead: number; unscaled: number } | null;
  win: number;
  extras: Array<{ label: string; unscaled: number }>;
  flags: string[];
  // Added to the sum before calibration so every class has the same median (SCORE_TUNING.*.classShift)
  shift: number;
}): ScoreBreakdown {
  const { p, curve } = args;
  let sum = 0;
  // A weight of 0 means the stat is not part of this class's or role's job: it is left out of the
  // breakdown entirely instead of showing up as a row that can only score nothing
  const parts = args.comps
    .filter((c) => c.weight > 0)
    .map((c) => {
      const ratio = clamp01(c.value / c.reference);
      const unscaled = c.weight * ratio ** curve;
      sum += unscaled;
      return { c, ratio, unscaled };
    });
  const mk = multikillOf(p);
  if (mk) sum += mk.unscaled;
  if (args.carry) sum += args.carry.unscaled;
  for (const e of args.extras) sum += e.unscaled;
  sum += args.win + args.shift;

  // k scales every point so the breakdown reads in score units; c is what is left over from the
  // straight-line calibration (plus the class shift), shown as one adjustment row so the rows
  // still add up to `raw`
  const { k, c } = calibrate(sum, args.anchors);
  const components: ScoreComponent[] = parts.map(({ c: comp, ratio, unscaled }) => ({
    key: comp.key,
    value: comp.value,
    reference: comp.reference,
    ratio,
    weight: comp.weight * k,
    points: unscaled * k,
  }));
  const raw = sum * k + c;
  const afk = args.flags.includes("afk");
  return {
    system: args.system,
    cls: args.cls,
    components,
    multikill: mk ? { label: mk.label, points: mk.unscaled * k } : null,
    carry:
      args.carry && args.carry.unscaled > 0
        ? { lead: args.carry.lead, points: args.carry.unscaled * k }
        : null,
    extras: args.extras.map((e) => ({ label: e.label, points: e.unscaled * k })),
    win: args.win * k,
    adjust: c + args.shift * k,
    flags: args.flags,
    raw,
    score: afk ? 1 : Math.min(10, Math.max(1, Math.round(raw * 10) / 10)),
    badge: null,
  };
}

// Top two values of a list, for the runner-up comparison
function topTwo(values: number[]): { top: number; second: number } {
  let top = 0;
  let second = 0;
  for (const v of values) {
    if (v > top) {
      second = top;
      top = v;
    } else if (v > second) {
      second = v;
    }
  }
  return { top, second };
}

function minutesOf(p: ScoreInput): number {
  const sec = n(p.gameDuration);
  return sec > 0 ? sec / 60 : 20;
}

function isAfk(p: ScoreInput, limit: { dmg: number; gold: number }): boolean {
  const sec = n(p.gameDuration);
  if (sec < AFK.minSeconds) return false;
  const min = sec / 60;
  return n(p.totalDamageDealtToChampions) / min < limit.dmg && n(p.goldEarned) / min < limit.gold;
}

// Healing and shielding of allies. Games stored from the client have none of it (every value is a
// default 0), so a lobby with no ally data at all falls back to total healing, self-healing
// included, rather than grading everyone on a column of zeros.
function supportStat(participants: ScoreInput[]): (p: ScoreInput) => number {
  const ally = (p: ScoreInput) => n(p.healOnTeammates) + n(p.shieldedOnTeammates);
  const haveAlly = participants.some((p) => ally(p) > 0);
  return (p) => (haveAlly ? ally(p) : n(p.totalHeal));
}

function pickWeights(table: Record<string, number[]>, cls: string | undefined) {
  const known = cls && table[cls] ? cls : null;
  return { cls: known, weights: table[known ?? "default"] };
}

// ---- ARAM ---------------------------------------------------------------------------------------

function aramBreakdowns(
  participants: ScoreInput[],
  classes: ChampionClassMap | undefined,
): Map<number, ScoreBreakdown> {
  const { curve, anchors } = SCORE_TUNING.aram;
  // Healing and shielding of allies; falls back to total healing when the lobby has no ally data
  const support = supportStat(participants);
  const max = { dmg: 1, taken: 1, heal: 1, cc: 1, gold: 1 };
  const teamKills = new Map<number, number>();
  for (const p of participants) {
    max.dmg = Math.max(max.dmg, p.totalDamageDealtToChampions);
    max.taken = Math.max(max.taken, p.totalDamageTaken);
    max.heal = Math.max(max.heal, support(p));
    max.cc = Math.max(max.cc, n(p.timeCcingOthers));
    max.gold = Math.max(max.gold, p.goldEarned);
    teamKills.set(p.teamId, (teamKills.get(p.teamId) ?? 0) + p.kills);
  }
  const { second: runnerUp } = topTwo(participants.map((p) => p.totalDamageDealtToChampions));

  const out = new Map<number, ScoreBreakdown>();
  for (const p of participants) {
    const kda = (p.kills + p.assists) / Math.max(p.deaths, 1);
    const tk = teamKills.get(p.teamId) ?? 0;
    const kp = tk > 0 ? (p.kills + p.assists) / tk : 0;
    const { cls, weights } = pickWeights(ARAM_WEIGHTS, classes?.[p.championId]);
    const values: Record<(typeof ARAM_KEYS)[number], [number, number]> = {
      kda: [kda, KDA_CAP],
      kp: [kp, KP_CAP],
      dmg: [p.totalDamageDealtToChampions, max.dmg],
      taken: [p.totalDamageTaken, max.taken],
      heal: [support(p), max.heal],
      cc: [n(p.timeCcingOthers), max.cc],
      gold: [p.goldEarned, max.gold],
    };
    const comps = ARAM_KEYS.map((key, i) => ({
      key,
      value: values[key][0],
      reference: values[key][1],
      weight: weights[i],
    }));
    const leads = p.totalDamageDealtToChampions >= max.dmg && runnerUp > 0;
    const lead = leads ? p.totalDamageDealtToChampions / runnerUp : 0;
    const flags: string[] = [];
    if (isAfk(p, AFK.aram)) flags.push("afk");
    if (n(p.gameDuration) > 0 && n(p.gameDuration) < LOW_SAMPLE_SECONDS.aram)
      flags.push("low-sample");
    out.set(
      p.participantId,
      assemble({
        system: "aram",
        p,
        cls,
        comps,
        curve,
        anchors,
        carry: leads ? { lead, unscaled: carryOf(lead, CARRY_MAX.lobby) } : null,
        win: p.win ? WIN_BONUS : 0,
        extras: p.firstBlood ? [{ label: "First blood", unscaled: FIRST_BLOOD_BONUS }] : [],
        flags,
        shift: (cls && SCORE_TUNING.aram.classShift[cls]) || 0,
      }),
    );
  }
  return out;
}

// ---- Summoner's Rift ------------------------------------------------------------------------------

// Mean of the five roles, for games where the client reported no position
function flexRole() {
  const roles = Object.keys(SR_ROLE_WEIGHTS);
  const weights = SR_KEYS.map(
    (_, i) => roles.reduce((s, r) => s + SR_ROLE_WEIGHTS[r][i], 0) / roles.length,
  );
  const mean = (f: (b: (typeof SR_BENCH)[string]) => number) =>
    roles.reduce((s, r) => s + f(SR_BENCH[r]), 0) / roles.length;
  return {
    weights,
    bench: { cs: mean((b) => b.cs), gold: mean((b) => b.gold), vision: mean((b) => b.vision) },
  };
}

function srWeights(role: string | undefined, cls: string | undefined) {
  const base = role && SR_ROLE_WEIGHTS[role] ? SR_ROLE_WEIGHTS[role] : flexRole().weights;
  const mod = (cls && SR_CLASS_MOD[cls]) || {};
  const adjusted = base.map((w, i) => w * (mod[SR_KEYS[i]] ?? 1));
  const total = adjusted.reduce((s, w) => s + w, 0);
  return adjusted.map((w) => (w * SR_SUM) / total);
}

// Roles are trusted only when each team has exactly one of each of the five. Games stored from the
// client's lane/role guess often fail that (two junglers, no support), and grading someone against
// the wrong role's weights is worse than grading everyone on the neutral blend.
function hasCleanRoles(participants: ScoreInput[]): boolean {
  const byTeam = new Map<number, Set<string>>();
  for (const p of participants) {
    const role = p.teamPosition ?? "";
    if (!SR_BENCH[role]) return false;
    const seen = byTeam.get(p.teamId) ?? new Set<string>();
    if (seen.has(role)) return false;
    seen.add(role);
    byTeam.set(p.teamId, seen);
  }
  return [...byTeam.values()].every((s) => s.size === 5);
}

function srBreakdowns(
  participants: ScoreInput[],
  classes: ChampionClassMap | undefined,
): Map<number, ScoreBreakdown> {
  const { curve, anchors } = SCORE_TUNING.sr;
  const support = supportStat(participants);
  const max = { dmg: 1, taken: 1, heal: 1, obj: 1 };
  const teamKills = new Map<number, number>();
  for (const p of participants) {
    max.dmg = Math.max(max.dmg, p.totalDamageDealtToChampions);
    max.taken = Math.max(max.taken, p.totalDamageTaken);
    max.heal = Math.max(max.heal, support(p));
    max.obj = Math.max(max.obj, n(p.damageToObjectives));
    teamKills.set(p.teamId, (teamKills.get(p.teamId) ?? 0) + p.kills);
  }
  const { second: runnerUp } = topTwo(participants.map((p) => p.totalDamageDealtToChampions));
  const flex = flexRole();
  const rolesClean = hasCleanRoles(participants);

  const out = new Map<number, ScoreBreakdown>();
  for (const p of participants) {
    const role =
      rolesClean && p.teamPosition && SR_BENCH[p.teamPosition] ? p.teamPosition : undefined;
    const bench = role ? SR_BENCH[role] : flex.bench;
    const cls = classes?.[p.championId];
    const weights = srWeights(role, cls);
    const min = minutesOf(p);
    const kda = (p.kills + p.assists) / Math.max(p.deaths, 1);
    const tk = teamKills.get(p.teamId) ?? 0;
    const kp = tk > 0 ? (p.kills + p.assists) / tk : 0;
    const values: Record<(typeof SR_KEYS)[number], [number, number]> = {
      kda: [kda, KDA_CAP],
      kp: [kp, KP_CAP],
      cs: [n(p.cs) / min, bench.cs],
      gold: [p.goldEarned / min, bench.gold],
      dmg: [p.totalDamageDealtToChampions, max.dmg],
      taken: [p.totalDamageTaken, max.taken],
      vision: [n(p.visionScore) / min, bench.vision],
      heal: [support(p), max.heal],
      obj: [n(p.damageToObjectives), max.obj],
    };
    const comps = SR_KEYS.map((key, i) => ({
      key,
      value: values[key][0],
      reference: values[key][1],
      weight: weights[i],
    }));
    const leads = p.totalDamageDealtToChampions >= max.dmg && runnerUp > 0;
    const lead = leads ? p.totalDamageDealtToChampions / runnerUp : 0;
    const flags: string[] = [];
    if (isAfk(p, AFK.sr)) flags.push("afk");
    if (n(p.gameDuration) > 0 && n(p.gameDuration) < LOW_SAMPLE_SECONDS.sr)
      flags.push("low-sample");
    const extras: Array<{ label: string; unscaled: number }> = [];
    if (p.firstBlood) extras.push({ label: "First blood", unscaled: FIRST_BLOOD_BONUS });
    if (n(p.objectivesStolen) > 0) {
      extras.push({ label: "Objective steal", unscaled: OBJECTIVE_STEAL_BONUS });
    }
    out.set(
      p.participantId,
      assemble({
        system: "sr",
        p,
        cls: role ? SR_ROLE_LABEL[role] : null,
        comps,
        curve,
        anchors,
        carry: leads ? { lead, unscaled: carryOf(lead, CARRY_MAX.sr) } : null,
        win: p.win ? WIN_BONUS : 0,
        extras,
        flags,
        shift: 0,
      }),
    );
  }
  return out;
}

// ---- Arena ----------------------------------------------------------------------------------------

// Lobby shape from who is actually in it: teams = distinct subteam ids, size = players per team.
// Null when the lobby has no usable placement data, which sends it to the generic formula.
function arenaShape(participants: ScoreInput[]): { teams: number; size: number } | null {
  const ids = new Set<number>();
  for (const p of participants) {
    if (!p.subteamId || !p.placement) return null;
    ids.add(p.subteamId);
  }
  if (ids.size < 2) return null;
  return { teams: ids.size, size: Math.round(participants.length / ids.size) };
}

function arenaBreakdowns(
  participants: ScoreInput[],
  classes: ChampionClassMap | undefined,
  shape: { teams: number; size: number },
): Map<number, ScoreBreakdown> {
  const { curve } = SCORE_TUNING.arena;
  const table = SCORE_TUNING.arena.anchors;
  const anchors = table[`${shape.teams}x${shape.size}`] ?? table.default;
  const support = supportStat(participants);
  const max = { dmg: 1, taken: 1, heal: 1, cc: 1, gold: 1 };
  const teamKills = new Map<number, number>();
  const teamDamage = new Map<number, number[]>();
  for (const p of participants) {
    max.dmg = Math.max(max.dmg, p.totalDamageDealtToChampions);
    max.taken = Math.max(max.taken, p.totalDamageTaken);
    max.heal = Math.max(max.heal, support(p));
    max.cc = Math.max(max.cc, n(p.timeCcingOthers));
    max.gold = Math.max(max.gold, p.goldEarned);
    const id = p.subteamId as number;
    teamKills.set(id, (teamKills.get(id) ?? 0) + p.kills);
    const list = teamDamage.get(id) ?? [];
    list.push(p.totalDamageDealtToChampions);
    teamDamage.set(id, list);
  }

  const out = new Map<number, ScoreBreakdown>();
  for (const p of participants) {
    const id = p.subteamId as number;
    const placement = p.placement as number;
    // 1st = 1.0 and last = 0.0, whatever the number of teams
    const place01 = 1 - (Math.min(placement, shape.teams) - 1) / (shape.teams - 1);
    const kda = (p.kills + p.assists) / Math.max(p.deaths, 1);
    const tk = teamKills.get(id) ?? 0;
    // Share of the player's own team's kills, so it holds for teams of 2, 3 or 4
    const contrib = tk > 0 ? (p.kills + p.assists) / tk : 0;
    const { cls, weights } = pickWeights(ARENA_WEIGHTS, classes?.[p.championId]);
    const values: Record<(typeof ARENA_KEYS)[number], [number, number]> = {
      kda: [kda, KDA_CAP],
      dmg: [p.totalDamageDealtToChampions, max.dmg],
      taken: [p.totalDamageTaken, max.taken],
      heal: [support(p), max.heal],
      cc: [n(p.timeCcingOthers), max.cc],
      gold: [p.goldEarned, max.gold],
      contrib: [contrib, KP_CAP],
    };
    const comps: Comp[] = [
      { key: "placement", value: place01, reference: 1, weight: ARENA_PLACEMENT_WEIGHT },
      ...ARENA_KEYS.map((key, i) => ({
        key,
        value: values[key][0],
        reference: values[key][1],
        weight: weights[i],
      })),
    ];
    // Carry is measured inside the team: its best damage against its second best
    const mates = topTwo(teamDamage.get(id) ?? []);
    const leads = shape.size >= 2 && p.totalDamageDealtToChampions >= mates.top && mates.second > 0;
    const lead = leads ? p.totalDamageDealtToChampions / mates.second : 0;
    const extras: Array<{ label: string; unscaled: number }> = [];
    if (placement === 1) extras.push({ label: "First place", unscaled: FIRST_PLACE_BONUS });
    if (p.firstBlood) extras.push({ label: "First blood", unscaled: FIRST_BLOOD_BONUS });
    out.set(
      p.participantId,
      assemble({
        system: "arena",
        p,
        cls,
        comps,
        curve,
        anchors,
        carry: leads ? { lead, unscaled: carryOf(lead, CARRY_MAX.arena) } : null,
        win: p.win ? ARENA_WIN_BONUS : 0,
        extras,
        flags: [],
        shift: (cls && SCORE_TUNING.arena.classShift[cls]) || 0,
      }),
    );
  }
  return out;
}

// ---- Generic (the original formula) ------------------------------------------------------------------
// Used for every queue the three systems above don't cover. Left exactly as it was.

const CURVE = 1.3;
const SCALE = 1.04;
const G_CARRY_KNEE = 1.2;
const G_CARRY_SPAN = 0.5;
const G_CARRY_MAX = 0.6;

interface ClassWeights {
  kda: number;
  kp: number;
  dmg: number;
  taken: number;
  heal: number;
  gold: number;
}

const DEFAULT_WEIGHTS: ClassWeights = {
  kda: 2.2,
  kp: 2.2,
  dmg: 2.6,
  taken: 1.1,
  heal: 0.6,
  gold: 1.1,
};

const CLASS_WEIGHTS: Record<string, ClassWeights> = {
  Assassin: { kda: 2.6, kp: 2.4, dmg: 2.8, taken: 0.5, heal: 0.2, gold: 1.3 },
  Marksman: { kda: 2.2, kp: 2.2, dmg: 2.8, taken: 0.7, heal: 0.5, gold: 1.4 },
  Mage: { kda: 2.2, kp: 2.3, dmg: 2.8, taken: 0.7, heal: 0.4, gold: 1.4 },
  Fighter: { kda: 2.2, kp: 2.2, dmg: 2.4, taken: 1.4, heal: 0.5, gold: 1.1 },
  Tank: { kda: 2.0, kp: 2.5, dmg: 2.1, taken: 2.2, heal: 0.3, gold: 0.7 },
  Support: { kda: 2.2, kp: 2.7, dmg: 1.7, taken: 0.8, heal: 1.8, gold: 0.6 },
};

function genericBreakdown(
  p: ScoreInput,
  teamKills: number,
  max: { dmg: number; taken: number; heal: number; gold: number },
  runnerUpDmg: number,
  classes: ChampionClassMap | undefined,
): ScoreBreakdown {
  const kda = (p.kills + p.assists) / Math.max(p.deaths, 1);
  const kp = teamKills > 0 ? (p.kills + p.assists) / teamKills : 0;
  const cls = classes?.[p.championId];
  const w = (cls && CLASS_WEIGHTS[cls]) || DEFAULT_WEIGHTS;

  let sum = 0;
  const components: ScoreComponent[] = [];
  const component = (key: ScoreComponentKey, value: number, reference: number, weight: number) => {
    const ratio = clamp01(value / reference);
    const unscaled = weight * ratio ** CURVE;
    sum += unscaled;
    components.push({
      key,
      value,
      reference,
      ratio,
      weight: weight * SCALE,
      points: unscaled * SCALE,
    });
  };
  component("kda", kda, 8, w.kda);
  component("kp", kp, 0.9, w.kp);
  component("dmg", p.totalDamageDealtToChampions, max.dmg, w.dmg);
  component("taken", p.totalDamageTaken, max.taken, w.taken);
  component("heal", p.totalHeal, max.heal, w.heal);
  component("gold", p.goldEarned, max.gold, w.gold);

  const mk = multikillOf(p);
  let carry: ScoreBreakdown["carry"] = null;
  let carryPoints = 0;
  if (p.totalDamageDealtToChampions >= max.dmg && runnerUpDmg > 0) {
    const lead = p.totalDamageDealtToChampions / runnerUpDmg;
    carryPoints = clamp01((lead - G_CARRY_KNEE) / G_CARRY_SPAN) * G_CARRY_MAX;
    if (carryPoints > 0) carry = { lead, points: carryPoints * SCALE };
  }
  if (mk) sum += mk.unscaled;
  sum += carryPoints;
  if (p.win) sum += WIN_BONUS;

  const raw = sum * SCALE;
  return {
    system: "generic",
    cls: cls && CLASS_WEIGHTS[cls] ? cls : null,
    components,
    multikill: mk ? { label: mk.label, points: mk.unscaled * SCALE } : null,
    carry,
    extras: [],
    win: p.win ? WIN_BONUS * SCALE : 0,
    adjust: 0,
    flags: [],
    raw,
    score: Math.min(10, Math.max(1, Math.round(raw * 10) / 10)),
    badge: null,
  };
}

function genericBreakdowns(
  participants: ScoreInput[],
  classes: ChampionClassMap | undefined,
): Map<number, ScoreBreakdown> {
  const max = { dmg: 1, taken: 1, heal: 1, gold: 1 };
  const teamKills = new Map<number, number>();
  for (const p of participants) {
    max.dmg = Math.max(max.dmg, p.totalDamageDealtToChampions);
    max.taken = Math.max(max.taken, p.totalDamageTaken);
    max.heal = Math.max(max.heal, p.totalHeal);
    max.gold = Math.max(max.gold, p.goldEarned);
    teamKills.set(p.teamId, (teamKills.get(p.teamId) ?? 0) + p.kills);
  }
  const { second } = topTwo(participants.map((p) => p.totalDamageDealtToChampions));
  const out = new Map<number, ScoreBreakdown>();
  for (const p of participants) {
    out.set(
      p.participantId,
      genericBreakdown(p, teamKills.get(p.teamId) ?? 0, max, second, classes),
    );
  }
  return out;
}

// ---- Entry points -----------------------------------------------------------------------------------

// Best player on the winning side gets MVP, best on the losing side gets ACE. Ranked on `raw`, not
// `score`: score is rounded to 0.1 and clamped at 10, so comparing it leaves every near-tie to
// participant order. Two-sided games pick one of each per team; Arena has no two sides, so it
// picks one MVP among the winning teams and one ACE among the losing ones for the whole lobby.
function assignBadges(
  participants: ScoreInput[],
  breakdowns: Map<number, ScoreBreakdown>,
  perTeam: boolean,
) {
  const best = new Map<string, ScoreInput>();
  for (const p of participants) {
    const flags = breakdowns.get(p.participantId)!.flags;
    if (flags.includes("afk")) continue;
    const key = perTeam ? String(p.teamId) : p.win ? "win" : "loss";
    const current = best.get(key);
    if (
      !current ||
      breakdowns.get(p.participantId)!.raw > breakdowns.get(current.participantId)!.raw
    ) {
      best.set(key, p);
    }
  }
  for (const p of best.values()) {
    breakdowns.get(p.participantId)!.badge = p.win ? "MVP" : "ACE";
  }
}

export function computeMatchScoreBreakdowns(
  participants: ScoreInput[],
  classes?: ChampionClassMap,
): Map<number, ScoreBreakdown> {
  if (participants.length === 0) return new Map();

  const system = scoreSystemFor(participants[0].queueId);
  let breakdowns: Map<number, ScoreBreakdown>;
  let perTeam = true;
  if (system === "aram") {
    breakdowns = aramBreakdowns(participants, classes);
  } else if (system === "sr") {
    breakdowns = srBreakdowns(participants, classes);
  } else if (system === "arena") {
    const shape = arenaShape(participants);
    if (shape) {
      breakdowns = arenaBreakdowns(participants, classes, shape);
      perTeam = false;
    } else {
      breakdowns = genericBreakdowns(participants, classes);
    }
  } else {
    breakdowns = genericBreakdowns(participants, classes);
  }
  assignBadges(participants, breakdowns, perTeam);
  return breakdowns;
}

export function computeMatchScores(
  participants: ScoreInput[],
  classes?: ChampionClassMap,
): Map<number, PlayerScore> {
  const scores = new Map<number, PlayerScore>();
  for (const [id, b] of computeMatchScoreBreakdowns(participants, classes)) {
    scores.set(id, { score: b.score, raw: b.raw, badge: b.badge });
  }
  return scores;
}

// FNV-1a over every number that shapes a score. Part of the startup recompute key, so changing a
// weight, benchmark or scale rescoring stored games without anyone remembering to bump a version.
export function scoreConfigHash(): string {
  const text = JSON.stringify([
    SCORE_TUNING,
    MULTIKILL_BONUS,
    [WIN_BONUS, ARENA_WIN_BONUS, FIRST_PLACE_BONUS, FIRST_BLOOD_BONUS, OBJECTIVE_STEAL_BONUS],
    [CARRY_KNEE, CARRY_SPAN, CARRY_MAX],
    [LOW_SAMPLE_SECONDS, AFK, KDA_CAP, KP_CAP],
    [ARAM_WEIGHTS, SR_ROLE_WEIGHTS, SR_BENCH, SR_CLASS_MOD, ARENA_WEIGHTS, ARENA_PLACEMENT_WEIGHT],
    [ARAM_QUEUES, SR_QUEUES, ARENA_QUEUES].map((s) => [...s]),
    [CURVE, SCALE, CLASS_WEIGHTS, DEFAULT_WEIGHTS],
  ]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function scoreColor(score: number): string {
  if (score >= 9) return "text-amber-400";
  if (score >= 7) return "text-sky-400";
  if (score >= 5) return "text-emerald-400";
  return "text-slate-400";
}
