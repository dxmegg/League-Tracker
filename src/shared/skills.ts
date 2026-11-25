// The live client reports ability ranks unreliably (a key can briefly show another ability's rank, which
// is common for champions with several forms), so a raw log of "rank went up" events holds far more
// entries than skill points exist. These helpers keep only real level-ups.

export interface SkillLevelUp {
  t: number;
  key: string;
  level: number;
}

// Highest rank each key can have: three for the ultimate, five for the rest
export const skillCap = (key: string): number => (key === "R" ? 3 : 5);

// Turns any raw log into one entry per rank per ability: a rank counts only the first time it is
// reached, never above the cap, and a jump of several ranks becomes one entry per rank. Running it on
// an already clean log changes nothing.
export function cleanSkillLog<T extends SkillLevelUp>(log: T[]): T[] {
  const reached: Record<string, number> = {};
  const out: T[] = [];
  for (const entry of [...log].sort((a, b) => a.t - b.t)) {
    const have = reached[entry.key] ?? 0;
    const target = Math.min(entry.level, skillCap(entry.key));
    for (let rank = have + 1; rank <= target; rank++) out.push({ ...entry, level: rank });
    reached[entry.key] = Math.max(have, target);
  }
  return out;
}
