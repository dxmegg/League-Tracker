export type PeakFormat = "int" | "pct" | "dec";

// Stats worth showing for a recorded game or a record, in this order, with how to print them. Values the
// API reports as fractions (crit chance, tenacity) are shown as percentages.
export const PEAK_ROWS: Array<{ key: string; label: string; fmt: PeakFormat }> = [
  { key: "attackDamage", label: "Attack damage", fmt: "int" },
  { key: "abilityPower", label: "Ability power", fmt: "int" },
  { key: "attackSpeed", label: "Attack speed", fmt: "dec" },
  { key: "abilityHaste", label: "Ability haste", fmt: "int" },
  { key: "critChance", label: "Crit chance", fmt: "pct" },
  { key: "armor", label: "Armor", fmt: "int" },
  { key: "magicResist", label: "Magic resist", fmt: "int" },
  { key: "maxHealth", label: "Max health", fmt: "int" },
  { key: "effectiveHpPhysical", label: "Effective HP (phys)", fmt: "int" },
  { key: "effectiveHpMagic", label: "Effective HP (magic)", fmt: "int" },
  { key: "moveSpeed", label: "Move speed", fmt: "int" },
  { key: "lifeSteal", label: "Life steal", fmt: "pct" },
  { key: "omnivamp", label: "Omnivamp", fmt: "pct" },
  { key: "tenacity", label: "Tenacity", fmt: "pct" },
  { key: "physicalLethality", label: "Lethality", fmt: "int" },
  { key: "magicPenetrationFlat", label: "Magic penetration", fmt: "int" },
  { key: "healthRegenRate", label: "Health regen", fmt: "dec" },
  { key: "attackRange", label: "Attack range", fmt: "int" },
  { key: "level", label: "Level", fmt: "int" },
  { key: "itemValue", label: "Item value", fmt: "int" },
  { key: "gold", label: "Gold held", fmt: "int" },
];

export function formatPeak(value: number, fmt: PeakFormat): string {
  if (fmt === "pct") return `${Math.round(value <= 1 ? value * 100 : value)}%`;
  if (fmt === "dec") return (Math.round(value * 100) / 100).toString();
  return Math.round(value).toLocaleString();
}
