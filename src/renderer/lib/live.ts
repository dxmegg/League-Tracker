import type { LiveEvent, LiveFull, LivePlayer, SummonerSpellData } from "../../shared/api";

export const MODE_LABELS: Record<string, string> = {
  CLASSIC: "Summoner's Rift",
  ARAM: "ARAM",
  KIWI: "ARAM Mayhem",
  CHERRY: "Arena",
  URF: "URF",
  ARURF: "ARURF",
  ONEFORALL: "One for All",
  NEXUSBLITZ: "Nexus Blitz",
  ULTBOOK: "Ultimate Spellbook",
  TUTORIAL: "Tutorial",
  PRACTICETOOL: "Practice Tool",
  STRAWBERRY: "Swarm",
};

export const MAP_LABELS: Record<number, string> = {
  11: "Summoner's Rift",
  12: "Howling Abyss",
  21: "Nexus Blitz",
  22: "Convergence",
  30: "Rings of Wrath",
};

export const modeLabel = (mode: string): string => MODE_LABELS[mode] ?? (mode || "Unknown mode");
export const mapLabel = (num: number, name: string): string =>
  MAP_LABELS[num] ?? (name || (num ? `Map ${num}` : "Unknown map"));

export function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

export const compact = (v: number): string =>
  v >= 1000
    ? `${(v / 1000).toFixed(v >= 10000 ? 1 : 2).replace(/\.?0+$/, "")}k`
    : String(Math.round(v));

export const kdaRatio = (k: number, d: number, a: number): number => (k + a) / Math.max(1, d);

// ---- Stat formatting ----------------------------------------------------------------------------
// The Live Client API reports ratios (critChance, lifeSteal, tenacity...) as fractions and the
// penetration multipliers as "what is left", so each is turned into what the in-game panel shows.

const asPercent = (v: number): number => (v <= 1 ? v * 100 : v);
const penFromMultiplier = (v: number): number => (v > 0 && v <= 1 ? (1 - v) * 100 : 0);

// `icon` is a key of STAT_ICON_FILES; rows without one get a lettered badge instead
export type StatRow = {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
  icon?: string;
  // Highest value this game, only set when it is above the current one
  peak?: string;
};

// Stat icons from CommunityDragon's rune stat-mod art; the game has no icons for the rest of the stats
const STAT_ICON_FILES: Record<string, string> = {
  attackDamage: "statmodsattackdamageicon",
  abilityPower: "statmodsabilitypowericon",
  attackSpeed: "statmodsattackspeedicon",
  abilityHaste: "statmodscdrscalingicon",
  armor: "statmodsarmoricon",
  magicResist: "statmodsmagicresicon",
  maxHealth: "statmodshealthplusicon",
  moveSpeed: "statmodsmovementspeedicon",
  tenacity: "statmodstenacityicon",
};

export const statIconUrl = (key: string | undefined): string | null =>
  key && STAT_ICON_FILES[key]
    ? `https://raw.communitydragon.org/latest/game/assets/perks/statmods/${STAT_ICON_FILES[key]}.png`
    : null;

// Keys statGroups already shows (or the meters on the champion panel use); anything else goes to "Other"
const SHOWN_STATS = new Set([
  "attackDamage",
  "abilityPower",
  "attackSpeed",
  "critChance",
  "critDamage",
  "abilityHaste",
  "physicalLethality",
  "magicLethality",
  "armorPenetrationFlat",
  "armorPenetrationPercent",
  "bonusArmorPenetrationPercent",
  "magicPenetrationFlat",
  "magicPenetrationPercent",
  "bonusMagicPenetrationPercent",
  "lifeSteal",
  "physicalVamp",
  "spellVamp",
  "omnivamp",
  "armor",
  "magicResist",
  "maxHealth",
  "healthRegenRate",
  "tenacity",
  "healShieldPower",
  "moveSpeed",
  "attackRange",
  "resourceRegenRate",
  "currentHealth",
  "resourceValue",
  "resourceMax",
  "resourceType",
]);

const prettyKey = (key: string): string => {
  const spaced = key.replace(/([A-Z])/g, " $1").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

const n = (stats: Record<string, number | string>, key: string): number => {
  const v = stats[key];
  return typeof v === "number" ? v : 0;
};

const f0 = (v: number) => Math.round(v).toLocaleString();
const f1 = (v: number) =>
  (Math.round(v * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });
const f2 = (v: number) =>
  (Math.round(v * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
const pct = (v: number) => `${f1(v)}%`;

export function statGroups(
  stats: Record<string, number | string>,
  peaks: Record<string, number> = {},
): Array<{ title: string; rows: StatRow[] }> {
  // The highest value this game, shown only once it is above what the champion has now
  const pk = (key: string, fmt: (v: number) => string): string | undefined => {
    const p = peaks[key];
    return p !== undefined && p > n(stats, key) * 1.001 + 0.001 ? fmt(p) : undefined;
  };
  const crit = asPercent(n(stats, "critChance"));
  const critDmg = n(stats, "critDamage");
  const as = n(stats, "attackSpeed");
  const ad = n(stats, "attackDamage");
  const armor = n(stats, "armor");
  const mr = n(stats, "magicResist");
  const hp = n(stats, "maxHealth");
  // Damage reduction 100/(100+x): effective health is health divided by what gets through
  const ehpPhys = hp * (1 + armor / 100);
  const ehpMagic = hp * (1 + mr / 100);
  const critMult = critDmg > 5 ? critDmg / 100 : critDmg || 1.75;
  const autoDps = ad * as * (1 + (crit / 100) * (critMult - 1));

  const offense: StatRow[] = [
    {
      label: "Attack damage",
      value: f0(ad),
      accent: "text-[#ff8c66]",
      icon: "attackDamage",
      peak: pk("attackDamage", f0),
    },
    {
      label: "Ability power",
      value: f0(n(stats, "abilityPower")),
      accent: "text-[#4ab3f5]",
      icon: "abilityPower",
      peak: pk("abilityPower", f0),
    },
    { label: "Attack speed", value: f2(as), icon: "attackSpeed", peak: pk("attackSpeed", f2) },
    {
      label: "Crit chance",
      value: pct(crit),
      icon: "critChance",
      peak: pk("critChance", (v) => pct(asPercent(v))),
    },
    { label: "Crit damage", value: pct(critMult * 100), icon: "critDamage" },
    {
      label: "Ability haste",
      value: f0(n(stats, "abilityHaste")),
      accent: "text-[#7fd4c1]",
      icon: "abilityHaste",
      peak: pk("abilityHaste", f0),
    },
  ];
  const lethality = n(stats, "physicalLethality") || n(stats, "magicLethality");
  const penRows: Array<[string, number, (v: number) => string]> = [
    ["Lethality", n(stats, "physicalLethality") || lethality, f0],
    ["Armor pen (flat)", n(stats, "armorPenetrationFlat"), f0],
    ["Armor pen", penFromMultiplier(n(stats, "armorPenetrationPercent")), pct],
    ["Bonus armor pen", penFromMultiplier(n(stats, "bonusArmorPenetrationPercent")), pct],
    ["Magic pen (flat)", n(stats, "magicPenetrationFlat"), f0],
    ["Magic pen", penFromMultiplier(n(stats, "magicPenetrationPercent")), pct],
    ["Bonus magic pen", penFromMultiplier(n(stats, "bonusMagicPenetrationPercent")), pct],
  ];
  for (const [label, v, fmt] of penRows)
    if (v > 0) offense.push({ label, value: fmt(v), icon: label });
  const sustain: Array<[string, number]> = [
    ["Life steal", asPercent(n(stats, "lifeSteal"))],
    ["Physical vamp", asPercent(n(stats, "physicalVamp"))],
    ["Spell vamp", asPercent(n(stats, "spellVamp"))],
    ["Omnivamp", asPercent(n(stats, "omnivamp"))],
  ];
  for (const [label, v] of sustain)
    if (v > 0) offense.push({ label, value: pct(v), accent: "text-lol-win", icon: label });

  const defense: StatRow[] = [
    {
      label: "Max health",
      value: f0(hp),
      accent: "text-lol-win",
      icon: "maxHealth",
      peak: pk("maxHealth", f0),
    },
    {
      label: "Armor",
      value: f0(armor),
      accent: "text-[#f5d76e]",
      icon: "armor",
      peak: pk("armor", f0),
    },
    {
      label: "Magic resist",
      value: f0(mr),
      accent: "text-[#b0a0f0]",
      icon: "magicResist",
      peak: pk("magicResist", f0),
    },
    { label: "Health regen / 5s", value: f1(n(stats, "healthRegenRate") * 5), icon: "regen" },
    {
      label: "Effective HP (physical)",
      value: f0(ehpPhys),
      hint: "Max health against physical damage",
    },
    { label: "Effective HP (magic)", value: f0(ehpMagic), hint: "Max health against magic damage" },
  ];
  const tenacity = asPercent(n(stats, "tenacity"));
  if (tenacity > 0) defense.push({ label: "Tenacity", value: pct(tenacity), icon: "tenacity" });
  const hsp = asPercent(n(stats, "healShieldPower"));
  if (hsp > 0)
    defense.push({
      label: "Heal & shield power",
      value: pct(hsp),
      accent: "text-lol-win",
      icon: "healShield",
    });

  const utility: StatRow[] = [
    {
      label: "Move speed",
      value: f0(n(stats, "moveSpeed")),
      accent: "text-[#78d6b0]",
      icon: "moveSpeed",
      peak: pk("moveSpeed", f0),
    },
    { label: "Attack range", value: f0(n(stats, "attackRange")), icon: "range" },
    {
      label: "Resource regen / 5s",
      value: f1(n(stats, "resourceRegenRate") * 5),
      icon: "resourceRegen",
    },
  ];
  // Whatever else the game reports for your champion, so nothing it sends is left out
  const other: StatRow[] = Object.entries(stats)
    .filter(([key, v]) => typeof v === "number" && !SHOWN_STATS.has(key))
    .map(([key, v]) => ({ label: prettyKey(key), value: f2(v as number), icon: key }));

  const derived: StatRow[] = [
    {
      label: "Auto-attack DPS",
      value: f0(autoDps),
      hint: "Attack damage x attack speed, crit included, before resistances",
    },
    {
      label: "Damage taken for 100 HP lost (phys)",
      value: f0(100 * (1 + armor / 100)),
      hint: "How much raw damage it takes to lose 100 health",
    },
  ];

  return [
    { title: "Offense", rows: offense },
    { title: "Defense", rows: defense },
    { title: "Utility", rows: utility },
    { title: "Derived", rows: derived },
    ...(other.length ? [{ title: "Other", rows: other }] : []),
  ];
}

// ---- Teams and objectives -----------------------------------------------------------------------

export type TeamSummary = {
  team: string;
  players: LivePlayer[];
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  wards: number;
  itemValue: number;
  avgLevel: number;
  turrets: number;
  inhibitors: number;
  dragons: number;
  barons: number;
  heralds: number;
  grubs: number;
};

const teamOfBuilding = (name: string | null): string | null => {
  // "Turret_T1_..." belongs to ORDER, "Turret_T2_..." to CHAOS
  const m = name?.match(/_T([12])_/);
  return m ? (m[1] === "1" ? "ORDER" : "CHAOS") : null;
};

export function findPlayer(players: LivePlayer[], name: string | null): LivePlayer | undefined {
  if (!name) return undefined;
  const key = name.split("#")[0].trim().toLowerCase();
  return players.find(
    (p) =>
      p.riotId.toLowerCase() === name.toLowerCase() ||
      p.summonerName.toLowerCase() === key ||
      p.gameName.toLowerCase() === key,
  );
}

export function summarizeTeams(snap: LiveFull): TeamSummary[] {
  const make = (team: string): TeamSummary => {
    const players = snap.players.filter((p) => p.team === team);
    const sum = (f: (p: LivePlayer) => number) => players.reduce((s, p) => s + f(p), 0);
    return {
      team,
      players,
      kills: sum((p) => p.kills),
      deaths: sum((p) => p.deaths),
      assists: sum((p) => p.assists),
      cs: sum((p) => p.creepScore),
      wards: sum((p) => p.wardScore),
      itemValue: sum((p) => p.itemValue),
      avgLevel: players.length ? sum((p) => p.level) / players.length : 0,
      turrets: 0,
      inhibitors: 0,
      dragons: 0,
      barons: 0,
      heralds: 0,
      grubs: 0,
    };
  };
  const teams = [make("ORDER"), make("CHAOS")];
  const byTeam = (t: string | null) => teams.find((x) => x.team === t);
  for (const e of snap.events) {
    // Buildings count for the team that destroyed them: the owner of the building lost it
    if (e.name === "TurretKilled") {
      const owner = teamOfBuilding(e.turret);
      const killerTeam = owner === "ORDER" ? "CHAOS" : owner === "CHAOS" ? "ORDER" : null;
      const t = byTeam(killerTeam);
      if (t) t.turrets++;
    } else if (e.name === "InhibKilled") {
      const owner = teamOfBuilding(e.inhib);
      const t = byTeam(owner === "ORDER" ? "CHAOS" : owner === "CHAOS" ? "ORDER" : null);
      if (t) t.inhibitors++;
    } else {
      const t = byTeam(findPlayer(snap.players, e.killer)?.team ?? null);
      if (!t) continue;
      if (e.name === "DragonKill") t.dragons++;
      else if (e.name === "BaronKill") t.barons++;
      else if (e.name === "HeraldKill") t.heralds++;
      else if (e.name === "HordeKill") t.grubs++;
    }
  }
  return teams;
}

// ---- Event feed ---------------------------------------------------------------------------------

export type EventCategory = "kills" | "objectives" | "structures" | "other";

export const EVENT_CATEGORY: Record<string, EventCategory> = {
  ChampionKill: "kills",
  FirstBlood: "kills",
  Multikill: "kills",
  Ace: "kills",
  DragonKill: "objectives",
  HeraldKill: "objectives",
  BaronKill: "objectives",
  HordeKill: "objectives",
  AtakhanKill: "objectives",
  TurretKilled: "structures",
  InhibKilled: "structures",
  InhibRespawningSoon: "structures",
  InhibRespawned: "structures",
  FirstBrick: "structures",
};

export const categoryOf = (e: LiveEvent): EventCategory => EVENT_CATEGORY[e.name] ?? "other";

const STREAK = ["", "", "Double Kill", "Triple Kill", "Quadra Kill", "Penta Kill"];
export const streakLabel = (k: number | null): string =>
  k ? (STREAK[k] ?? `${k}x Kill`) : "Multikill";

export function turretLabel(raw: string | null): string {
  if (!raw) return "Turret";
  const lane = raw.match(/_([LCR])_/)?.[1];
  const tier = raw.match(/_(\d{2})_/)?.[1];
  const laneName = lane === "L" ? "Top" : lane === "C" ? "Mid" : lane === "R" ? "Bot" : "";
  const tierName =
    tier === "03" ? "Outer" : tier === "02" ? "Inner" : tier === "01" ? "Inhibitor" : "";
  if (raw.includes("_A")) return [laneName, tierName, "Turret"].filter(Boolean).join(" ");
  return [laneName, "Nexus Turret"].filter(Boolean).join(" ");
}

export function inhibLabel(raw: string | null): string {
  const lane = raw?.match(/_([LCR])\d?$/)?.[1] ?? raw?.match(/_(L|C|R)/)?.[1];
  const laneName = lane === "L" ? "Top" : lane === "C" ? "Mid" : lane === "R" ? "Bot" : "";
  return [laneName, "Inhibitor"].filter(Boolean).join(" ");
}

export const DRAGON_LABELS: Record<string, string> = {
  Fire: "Infernal Drake",
  Water: "Ocean Drake",
  Earth: "Mountain Drake",
  Air: "Cloud Drake",
  Hextech: "Hextech Drake",
  Chemtech: "Chemtech Drake",
  Elder: "Elder Dragon",
};

export function spellIdByName(spells: SummonerSpellData, name: string): number | null {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  for (const [id, spell] of Object.entries(spells)) {
    if (spell.name.toLowerCase() === key) return Number(id);
  }
  return null;
}
