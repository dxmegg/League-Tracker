export type PeakFormat = "int" | "pct" | "dec";

export type PeakGroup = "offense" | "defense" | "sustain" | "utility";

export const PEAK_GROUPS: Array<{ id: PeakGroup; label: string }> = [
  { id: "offense", label: "Offensive" },
  { id: "defense", label: "Defensive" },
  { id: "sustain", label: "Sustain" },
  { id: "utility", label: "Mobility, resources and progress" },
];

export type PeakRow = {
  key: string;
  label: string;
  fmt: PeakFormat;
  group: PeakGroup;
  // The client reports these as "what is left" multipliers (1 = no penetration), so the highest value
  // is the weakest one: use the end-of-game value, shown as the percentage penetrated
  penetration?: boolean;
};

// Stats worth showing for a recorded game or a record, grouped and in this order, with how to print
// them. Values the API reports as fractions (crit chance, tenacity) are shown as percentages. Every
// group is a multiple of six so the tile grid fills its rows.
export const PEAK_ROWS: PeakRow[] = [
  { key: "attackDamage", label: "Attack damage", fmt: "int", group: "offense" },
  { key: "abilityPower", label: "Ability power", fmt: "int", group: "offense" },
  { key: "attackSpeed", label: "Attack speed", fmt: "dec", group: "offense" },
  { key: "abilityHaste", label: "Ability haste", fmt: "int", group: "offense" },
  { key: "critChance", label: "Crit chance", fmt: "pct", group: "offense" },
  { key: "critDamage", label: "Crit damage", fmt: "pct", group: "offense" },
  { key: "physicalLethality", label: "Lethality", fmt: "int", group: "offense" },
  { key: "magicLethality", label: "Magic lethality", fmt: "int", group: "offense" },
  { key: "magicPenetrationFlat", label: "Magic penetration", fmt: "int", group: "offense" },
  {
    key: "armorPenetrationPercent",
    label: "Armor penetration %",
    fmt: "pct",
    group: "offense",
    penetration: true,
  },
  {
    key: "bonusArmorPenetrationPercent",
    label: "Bonus armor pen %",
    fmt: "pct",
    group: "offense",
    penetration: true,
  },
  {
    key: "magicPenetrationPercent",
    label: "Magic penetration %",
    fmt: "pct",
    group: "offense",
    penetration: true,
  },
  { key: "armor", label: "Armor", fmt: "int", group: "defense" },
  { key: "magicResist", label: "Magic resist", fmt: "int", group: "defense" },
  { key: "maxHealth", label: "Max health", fmt: "int", group: "defense" },
  { key: "effectiveHpPhysical", label: "Effective HP (phys)", fmt: "int", group: "defense" },
  { key: "effectiveHpMagic", label: "Effective HP (magic)", fmt: "int", group: "defense" },
  { key: "tenacity", label: "Tenacity", fmt: "pct", group: "defense" },
  { key: "lifeSteal", label: "Life steal", fmt: "pct", group: "sustain" },
  { key: "omnivamp", label: "Omnivamp", fmt: "pct", group: "sustain" },
  { key: "physicalVamp", label: "Physical vamp", fmt: "pct", group: "sustain" },
  { key: "spellVamp", label: "Spell vamp", fmt: "pct", group: "sustain" },
  { key: "healShieldPower", label: "Heal and shield power", fmt: "pct", group: "sustain" },
  { key: "healthRegenRate", label: "Health regen", fmt: "dec", group: "sustain" },
  { key: "moveSpeed", label: "Move speed", fmt: "int", group: "utility" },
  { key: "attackRange", label: "Attack range", fmt: "int", group: "utility" },
  { key: "resourceMax", label: "Max mana", fmt: "int", group: "utility" },
  { key: "resourceRegenRate", label: "Mana regen", fmt: "dec", group: "utility" },
  { key: "level", label: "Level", fmt: "int", group: "utility" },
  { key: "kills", label: "Kills", fmt: "int", group: "utility" },
  { key: "deaths", label: "Deaths", fmt: "int", group: "utility" },
  { key: "assists", label: "Assists", fmt: "int", group: "utility" },
  { key: "creepScore", label: "Minions killed", fmt: "int", group: "utility" },
  { key: "wardScore", label: "Ward score", fmt: "dec", group: "utility" },
  { key: "itemValue", label: "Item value", fmt: "int", group: "utility" },
  { key: "gold", label: "Gold held", fmt: "int", group: "utility" },
];

export function formatPeak(value: number, fmt: PeakFormat): string {
  if (fmt === "pct") return `${Math.round(value <= 1 ? value * 100 : value)}%`;
  if (fmt === "dec") return (Math.round(value * 100) / 100).toString();
  return Math.round(value).toLocaleString();
}

// Penetration as the percentage of resistance ignored, from the client's "what is left" multiplier
export const penetrationPercent = (multiplier: number): number =>
  multiplier > 0 && multiplier <= 1 ? (1 - multiplier) * 100 : 0;
