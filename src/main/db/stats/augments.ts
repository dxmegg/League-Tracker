import { db } from "../../db";
import { cachedQuery } from "../cache";
import type { AugmentDetail } from "../../../shared/api";
import {
  applyQueueFilter,
  pushTimeFilter,
  statsSource,
  EXCLUDED_ITEM_IDS,
  EXCLUDED_STATS_SQL,
} from "../filters";
import { TRINKET_ITEM_IDS } from "./items";

export function getAugmentStatsAll(
  championId?: number,
  patch?: string,
  queue?: number,
  account?: string,
  timePeriod?: "24h" | "7d" | "30d" | "full",
): any[] {
  const source = statsSource(account);
  const where = ["g.is_remake = 0"];
  where.push(source.accountFilter);
  const params: any[] = account && account !== "all" ? [account] : [];
  if (championId !== undefined) {
    where.push("ps.champion_id = ?");
    params.push(championId);
  }
  if (patch) {
    where.push("g.game_version = ?");
    params.push(patch);
  }
  applyQueueFilter(where, params, queue);
  where.push(`g.queue_id NOT IN (${EXCLUDED_STATS_SQL})`);
  pushTimeFilter(where, params, timePeriod);
  const augmentId = account ? "mpa.augment_id" : "ga.augment_id";
  const augmentSource = account
    ? `FROM match_participant_augments mpa
       JOIN match_participants mp
         ON mp.game_id = mpa.game_id
        AND mp.participant_id = mpa.participant_id
        AND mp.puuid = ps.puuid
       JOIN ${source.table} ${source.alias} ON mpa.game_id = ps.game_id
       JOIN games g ON mpa.game_id = g.game_id`
    : `FROM game_augments ga
       JOIN ${source.table} ${source.alias} ON ga.game_id = ps.game_id
       JOIN games g ON ga.game_id = g.game_id`;
  const rows = db
    .prepare(`
    SELECT ${augmentId} as augment_id,
           COUNT(*) as picks,
           SUM(ps.win) as wins,
           AVG(ps.kills) as kills,
           AVG(ps.deaths) as deaths,
           AVG(ps.assists) as assists,
           AVG(ps.score) as avgScore
    ${augmentSource}
    WHERE ${where.join(" AND ")}
    GROUP BY ${augmentId}
    ORDER BY picks DESC
  `)
    .all(...params) as Array<{ augment_id: number; picks: number } & Record<string, unknown>>;

  // The five champions that took each augment most often
  const byChampion = db
    .prepare(`
    SELECT ${augmentId} as augment_id, ps.champion_id, COUNT(*) as picks
    ${augmentSource}
    WHERE ${where.join(" AND ")}
    GROUP BY ${augmentId}, ps.champion_id
    ORDER BY picks DESC
  `)
    .all(...params) as Array<{ augment_id: number; champion_id: number; picks: number }>;
  const top = new Map<number, Array<{ champion_id: number; picks: number }>>();
  for (const r of byChampion) {
    const list = top.get(r.augment_id) ?? [];
    if (list.length < 5) list.push({ champion_id: r.champion_id, picks: r.picks });
    top.set(r.augment_id, list);
  }
  return rows.map((r) => ({ ...r, champions: top.get(r.augment_id) ?? [] }));
}

export function getAugmentStatsWithChampions(
  patch?: string,
  queue?: number,
  account?: string,
): {
  totalGames: number;
  augments: {
    augment_id: number;
    picks: number;
    wins: number;
    champions: { champion_id: number; picks: number; wins: number }[];
  }[];
} {
  return cachedQuery("getAugmentStatsWithChampions", [patch, queue, account], 60_000, () => {
    const source = statsSource(account);
    const where = ["g.is_remake = 0", source.accountFilter];
    const params: any[] = account && account !== "all" ? [account] : [];
    if (patch) {
      where.push("g.game_version = ?");
      params.push(patch);
    }
    applyQueueFilter(where, params, queue);
    where.push(`g.queue_id NOT IN (${EXCLUDED_STATS_SQL})`);
    const augmentId = account ? "mpa.augment_id" : "ga.augment_id";
    const augmentSource = account
      ? `FROM match_participant_augments mpa
       JOIN match_participants mp
         ON mp.game_id = mpa.game_id
        AND mp.participant_id = mpa.participant_id
        AND mp.puuid = ps.puuid
       JOIN ${source.table} ${source.alias} ON mpa.game_id = ps.game_id
       JOIN games g ON mpa.game_id = g.game_id`
      : `FROM game_augments ga
       JOIN ${source.table} ${source.alias} ON ga.game_id = ps.game_id
       JOIN games g ON ga.game_id = g.game_id`;
    const augments = db
      .prepare(`
    SELECT ${augmentId} as augment_id, COUNT(*) as picks, SUM(ps.win) as wins
    ${augmentSource}
    WHERE ${where.join(" AND ")}
    GROUP BY ${augmentId}
    ORDER BY picks DESC
  `)
      .all(...params) as { augment_id: number; picks: number; wins: number }[];

    const champBreakdown = db
      .prepare(`
    SELECT ${augmentId} as augment_id, ps.champion_id, COUNT(*) as picks, SUM(ps.win) as wins
    ${augmentSource}
    WHERE ${where.join(" AND ")}
    GROUP BY ${augmentId}, ps.champion_id
    ORDER BY picks DESC
  `)
      .all(...params) as { augment_id: number; champion_id: number; picks: number; wins: number }[];

    const champMap = new Map<number, { champion_id: number; picks: number; wins: number }[]>();
    for (const row of champBreakdown) {
      if (!champMap.has(row.augment_id)) champMap.set(row.augment_id, []);
      champMap
        .get(row.augment_id)!
        .push({ champion_id: row.champion_id, picks: row.picks, wins: row.wins });
    }

    // Counted here rather than derived from the augment rows. Picks are slots,
    // not games: a game carries up to AUGMENT_SLOTS of them and often fewer, so
    // dividing picks by the slot count lands on neither number and disagrees
    // with what the Champions tab sums for the same filters.
    const { totalGames } = db
      .prepare(`
    SELECT COUNT(*) as totalGames
    FROM ${source.table} ps
    JOIN games g ON ps.game_id = g.game_id
    WHERE ${where.join(" AND ")}
  `)
      .get(...params) as { totalGames: number };

    return {
      totalGames,
      augments: augments.map((a) => ({
        ...a,
        champions: champMap.get(a.augment_id) ?? [],
      })),
    };
  });
}

// Everything the augment detail page shows. The scope is every stat line with at least one augment, so
// "without it" compares against games where an augment could have been this one.
export function getAugmentDetail(
  augmentId: number,
  patch?: string,
  queue?: number,
  account?: string,
): AugmentDetail {
  return cachedQuery("getAugmentDetail", [augmentId, patch, queue, account], 30_000, () => {
    const source = statsSource(account);
    const where = ["g.is_remake = 0", source.accountFilter];
    const params: any[] = account && account !== "all" ? [account] : [];
    if (patch) {
      where.push("g.game_version = ?");
      params.push(patch);
    }
    applyQueueFilter(where, params, queue);
    where.push(`g.queue_id NOT IN (${EXCLUDED_STATS_SQL})`);
    const augmentColumn = account ? "mpa.augment_id" : "ga.augment_id";
    const augmentSource = account
      ? `FROM match_participant_augments mpa
         JOIN match_participants mp
           ON mp.game_id = mpa.game_id
          AND mp.participant_id = mpa.participant_id
          AND mp.puuid = ps.puuid
         JOIN ${source.table} ${source.alias} ON mpa.game_id = ps.game_id
         JOIN games g ON mpa.game_id = g.game_id`
      : `FROM game_augments ga
         JOIN ${source.table} ${source.alias} ON ga.game_id = ps.game_id
         JOIN games g ON ga.game_id = g.game_id`;
    type Line = AugmentDetail["champions"][number]["matches"][number] & {
      augment_id: number;
      patch: string | null;
    } & Record<`item${0 | 1 | 2 | 3 | 4 | 5 | 6}`, number | null>;
    const rows = db
      .prepare(
        `SELECT ${augmentColumn} AS augment_id, ps.game_id, ps.champion_id, g.game_creation,
                g.game_duration, g.queue_id, g.game_version AS patch, ps.win, ps.kills, ps.deaths,
                ps.assists, ps.total_damage_dealt AS damage, ps.total_damage_taken AS taken,
                ps.gold_earned AS gold, ps.total_heal AS heal, ps.score,
                ps.item0, ps.item1, ps.item2, ps.item3, ps.item4, ps.item5, ps.item6
         ${augmentSource}
         WHERE ${where.join(" AND ")}
         ORDER BY g.game_creation DESC`,
      )
      .all(...params) as Line[];

    // One entry per player in a game, with every augment that player took
    const lines = new Map<string, { line: Line; augments: Set<number> }>();
    for (const row of rows) {
      const key = `${row.game_id}:${row.champion_id}`;
      const entry = lines.get(key) ?? { line: row, augments: new Set<number>() };
      entry.augments.add(row.augment_id);
      lines.set(key, entry);
    }
    const all = [...lines.values()];
    const withIt = all.filter((entry) => entry.augments.has(augmentId));
    const without = all.filter((entry) => !entry.augments.has(augmentId)).map((e) => e.line);

    const sum = (list: Line[], pick: (line: Line) => number) =>
      list.reduce((total, line) => total + pick(line), 0);
    const average = (list: Line[], pick: (line: Line) => number) =>
      list.length ? sum(list, pick) / list.length : null;
    const scored = without.filter((line) => line.score != null);

    const championTotals = new Map<number, { games: number; wins: number }>();
    for (const { line } of all) {
      const total = championTotals.get(line.champion_id) ?? { games: 0, wins: 0 };
      total.games++;
      total.wins += line.win;
      championTotals.set(line.champion_id, total);
    }

    const champions = new Map<number, AugmentDetail["champions"][number]>();
    const patches = new Map<string, { patch: string; games: number; wins: number }>();
    const pairs = new Map<number, { games: number; wins: number }>();
    const items = new Map<number, { games: number; wins: number }>();
    const skipItems = new Set<number>([...TRINKET_ITEM_IDS, ...EXCLUDED_ITEM_IDS]);
    const count = (map: Map<number, { games: number; wins: number }>, id: number, win: number) => {
      const entry = map.get(id) ?? { games: 0, wins: 0 };
      entry.games++;
      entry.wins += win;
      map.set(id, entry);
    };

    for (const { line, augments } of withIt) {
      const total = championTotals.get(line.champion_id)!;
      const champion = champions.get(line.champion_id) ?? {
        champion_id: line.champion_id,
        games: 0,
        wins: 0,
        championGames: total.games,
        championWins: total.wins,
        matches: [],
      };
      champion.games++;
      champion.wins += line.win;
      champion.matches.push(line);
      champions.set(line.champion_id, champion);

      if (line.patch) {
        const row = patches.get(line.patch) ?? { patch: line.patch, games: 0, wins: 0 };
        row.games++;
        row.wins += line.win;
        patches.set(line.patch, row);
      }
      for (const other of augments) if (other !== augmentId) count(pairs, other, line.win);
      const built = new Set(
        [0, 1, 2, 3, 4, 5, 6].map((i) => line[`item${i as 0}`] ?? 0).filter((id) => id > 0),
      );
      for (const id of built) if (!skipItems.has(id)) count(items, id, line.win);
    }

    const top = (map: Map<number, { games: number; wins: number }>) =>
      [...map.entries()]
        .map(([id, value]) => ({ id, ...value }))
        .sort((a, b) => b.games - a.games || a.id - b.id)
        .slice(0, 8);

    return {
      augment_id: augmentId,
      picks: withIt.length,
      wins: sum(
        withIt.map((e) => e.line),
        (line) => line.win,
      ),
      totalGames: all.length,
      baseline: {
        games: without.length,
        wins: sum(without, (l) => l.win),
        kills: sum(without, (l) => l.kills),
        deaths: sum(without, (l) => l.deaths),
        assists: sum(without, (l) => l.assists),
        damage: average(without, (l) => l.damage),
        taken: average(without, (l) => l.taken),
        gold: average(without, (l) => l.gold),
        heal: average(without, (l) => l.heal),
        score: average(scored, (l) => l.score!),
        duration: average(without, (l) => l.game_duration),
      },
      champions: [...champions.values()].sort((a, b) => b.games - a.games),
      patchBreakdown: [...patches.values()]
        .sort((a, b) => b.patch.localeCompare(a.patch, undefined, { numeric: true }))
        .slice(0, 8),
      pairings: top(pairs),
      topItems: top(items),
    };
  });
}
