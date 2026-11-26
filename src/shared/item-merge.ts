// One item has a separate id per game mode (3095 and 223095 are both Stormrazor)

type Counted = { item_id: number; picks: number; wins: number; avgBuyTimeMs?: number | null };

// Keeps the most picked id of each name and adds the others to it.
// shortcut: a player holding two ids of one item counts twice; they come from different modes
export function mergeItemsByName<T extends Counted>(
  rows: T[],
  nameOf: (id: number) => string,
): T[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const name = nameOf(row.item_id);
    groups.set(name, [...(groups.get(name) ?? []), row]);
  }
  return [...groups.values()]
    .map((group) => {
      const timed = group.filter((r) => r.avgBuyTimeMs != null);
      const timedPicks = timed.reduce((n, r) => n + r.picks, 0);
      return {
        ...group.reduce((a, b) => (b.picks > a.picks ? b : a)),
        picks: group.reduce((n, r) => n + r.picks, 0),
        wins: group.reduce((n, r) => n + r.wins, 0),
        avgBuyTimeMs: timedPicks
          ? timed.reduce((n, r) => n + r.avgBuyTimeMs! * r.picks, 0) / timedPicks
          : null,
      };
    })
    .sort((a, b) => b.picks - a.picks);
}
