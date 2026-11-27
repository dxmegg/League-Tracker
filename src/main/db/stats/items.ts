import { db } from "../../db";
import { cachedQuery, getCachedOwnedItemStats, setCachedOwnedItemStats } from "../cache";
import zlib from "zlib";
import type { ItemDetail, OwnedItemStats, OwnedItemStatsResult } from "../../../shared/api";
import { applyQueueFilter, statsSource, EXCLUDED_ITEM_IDS, EXCLUDED_STATS_SQL } from "../filters";

export const TRINKET_ITEM_IDS = [3340, 3363, 3364, 3348] as const;

export function getOwnedItemStats(
  patch?: string,
  queue?: number,
  account?: string,
): OwnedItemStatsResult & OwnedItemStats[] {
  const cacheKey = `owned-item-stats:${patch ?? "all"}:${queue ?? "all"}:${account ?? "own"}`;
  const cached = getCachedOwnedItemStats(cacheKey);
  if (cached) return cached as OwnedItemStatsResult & OwnedItemStats[];

  const source = statsSource(account);
  const where = ["g.is_remake = 0"];
  where.push(source.accountFilter);
  const params: any[] = account && account !== "all" ? [account] : [];
  if (patch) {
    where.push("g.game_version = ?");
    params.push(patch);
  }

  applyQueueFilter(where, params, queue);
  where.push(`g.queue_id NOT IN (${EXCLUDED_STATS_SQL})`);
  const columns = [0, 1, 2, 3, 4, 5, 6];
  const excluded = EXCLUDED_ITEM_IDS.join(", ");
  // player_stats has no puuid of its own: there the row's player is the game's owner
  const player = source.table === "player_stats" ? "g.puuid" : "ps.puuid";
  const rows = db
    .prepare(`
      WITH item_occurrences AS (
        ${columns
          .map(
            (
              i,
            ) => `SELECT ps.game_id, ps.rowid AS row_id, ${player} AS puuid, ps.item${i} AS item_id, ps.win,
                           ${i} AS purchase_slot
                    FROM ${source.table} ps JOIN games g ON g.game_id = ps.game_id
                    WHERE ${where.join(" AND ")}
                      AND ps.item${i} > 0 AND ps.item${i} NOT IN (${excluded})`,
          )
          .join(" UNION ALL ")}
      ),
      item_summary AS (
        -- Games, not slots: two copies of an item in one inventory count once
        SELECT item_id, COUNT(*) AS picks, SUM(win) AS wins
        FROM (SELECT DISTINCT row_id, item_id, win FROM item_occurrences)
        GROUP BY item_id
      ),
      top_items AS (
        SELECT item_id
        FROM item_summary
        ORDER BY picks DESC
        LIMIT 100
      ),
      item_games AS MATERIALIZED (
        SELECT DISTINCT io.row_id, io.item_id
        FROM item_occurrences io
        JOIN top_items ti ON ti.item_id = io.item_id
      ),
      owners AS MATERIALIZED (
        SELECT DISTINCT row_id, game_id, puuid FROM item_occurrences
      ),
      -- CROSS JOIN fixes the order: one pass over a game's timeline per player row. Starting from
      -- the items instead reads the same timeline once per item, four times slower.
      purchase_times AS (
        SELECT ig.item_id, MIN(e.timestamp_ms) AS first_purchase_ms
        FROM owners o
        CROSS JOIN match_participants mp ON mp.game_id = o.game_id AND mp.puuid = o.puuid
        CROSS JOIN match_timeline_events e
          ON e.game_id = o.game_id
         AND e.participant_id = mp.participant_id
         AND e.event_type = 'ITEM_PURCHASED'
        CROSS JOIN item_games ig ON ig.row_id = o.row_id AND ig.item_id = e.item_id
        GROUP BY ig.row_id, ig.item_id
      ),
      slot_counts AS (
        SELECT io.item_id, io.purchase_slot, COUNT(*) AS slot_count
        FROM item_occurrences io
        JOIN top_items ti ON ti.item_id = io.item_id
        GROUP BY io.item_id, io.purchase_slot
      ),
      common_slots AS (
        SELECT item_id, purchase_slot
        FROM (
          SELECT item_id, purchase_slot,
                 ROW_NUMBER() OVER (
                   PARTITION BY item_id
                   ORDER BY slot_count DESC, purchase_slot ASC
                 ) AS slot_rank
          FROM slot_counts
        )
        WHERE slot_rank = 1
      ),
      purchase_averages AS (
        SELECT item_id, AVG(first_purchase_ms) AS avg_buy_time_ms
        FROM purchase_times
        GROUP BY item_id
      )
      SELECT summary.item_id,
             summary.picks,
             summary.wins,
             summary.item_id IN (${TRINKET_ITEM_IDS.join(", ")}) AS isTrinket,
             averages.avg_buy_time_ms AS avgBuyTimeMs,
             cs.purchase_slot AS commonPurchaseSlot
      FROM item_summary summary
      LEFT JOIN purchase_averages averages ON averages.item_id = summary.item_id
      LEFT JOIN common_slots cs ON cs.item_id = summary.item_id
      ORDER BY picks DESC
    `)
    .all(...columns.flatMap(() => params)) as Array<
    Omit<OwnedItemStats, "isTrinket"> & { isTrinket: number }
  >;
  const normalizedRows: OwnedItemStats[] = rows.map((row) => ({
    ...row,
    isTrinket: Boolean(row.isTrinket),
  }));
  const scope = db
    .prepare(
      `SELECT COUNT(DISTINCT ps.game_id) AS totalGames
       FROM ${source.table} ps JOIN games g ON g.game_id = ps.game_id
       WHERE ${where.join(" AND ")}`,
    )
    .get(...params) as { totalGames: number };
  const totalBuilds = normalizedRows.reduce((sum, row) => sum + row.picks, 0);
  const totalWins = normalizedRows.reduce((sum, row) => sum + row.wins, 0);
  const result = normalizedRows as OwnedItemStatsResult & OwnedItemStats[];
  for (const row of normalizedRows) {
    row.scopeTotalGames = scope.totalGames;
    row.scopeTotalBuilds = totalBuilds;
    row.scopeAvgWinRate = totalBuilds > 0 ? (totalWins / totalBuilds) * 100 : 0;
  }
  Object.defineProperties(result, {
    rows: { value: rows, enumerable: true },
    totalGames: { value: scope.totalGames, enumerable: true },
    totalBuilds: { value: totalBuilds, enumerable: true },
    avgWinRate: {
      value: totalBuilds > 0 ? (totalWins / totalBuilds) * 100 : 0,
      enumerable: true,
    },
  });
  setCachedOwnedItemStats(cacheKey, result);
  return result;
}

// `itemIds` are one item's ids across game modes; the first one names the result
export function getOwnedItemDetail(
  itemIds: number[],
  patch?: string,
  queue?: number,
  account?: string,
) {
  const key = [itemIds.join(), patch, queue, account];
  return cachedQuery("getOwnedItemDetail", key, 30_000, () => {
    const itemId = Number(itemIds[0]) || 0;
    // Integers only, so the list is safe to put into the SQL
    const ids = [itemId, ...itemIds.map(Number).filter(Number.isInteger)].join(", ");
    const holds = (alias: string) =>
      `(${[0, 1, 2, 3, 4, 5, 6].map((i) => `IFNULL(${alias}.item${i}, 0) IN (${ids})`).join(" OR ")})`;
    // The same scope as the Items list (getOwnedItemStats), so the two agree
    const source = statsSource(account);
    const from = `${source.table} ps JOIN games g ON g.game_id = ps.game_id`;
    const totalWhere = ["g.is_remake = 0", source.accountFilter];
    const totalParams: any[] = account && account !== "all" ? [account] : [];
    if (patch) {
      totalWhere.push("g.game_version = ?");
      totalParams.push(patch);
    }
    applyQueueFilter(totalWhere, totalParams, queue);
    totalWhere.push(`g.queue_id NOT IN (${EXCLUDED_STATS_SQL})`);
    const where = [...totalWhere, holds("ps")];
    const rows = db
      .prepare(
        `SELECT ps.game_id, ps.champion_id, g.game_creation, g.game_duration, g.queue_id, ps.win, ps.kills, ps.deaths, ps.assists,
                ps.total_damage_dealt AS damage, ps.total_damage_taken AS taken, ps.gold_earned AS gold, ps.total_heal AS heal, ps.score
         FROM ${from}
         WHERE ${where.join(" AND ")} ORDER BY g.game_creation DESC`,
      )
      .all(...totalParams) as {
      game_id: number;
      champion_id: number;
      game_creation: number;
      game_duration: number;
      queue_id: number;
      win: number;
      kills: number;
      deaths: number;
      assists: number;
      damage: number;
      taken: number;
      gold: number;
      heal: number;
      score: number | null;
    }[];
    // Rows, not distinct games: picks counts one row per tracked player, so this must too
    const totalGames = (
      db
        .prepare(`SELECT COUNT(*) count FROM ${from} WHERE ${totalWhere.join(" AND ")}`)
        .get(...totalParams) as {
        count: number;
      }
    ).count;
    const champions = new Map<number, { games: number; wins: number; matches: typeof rows }>();
    for (const row of rows) {
      const current = champions.get(row.champion_id) ?? { games: 0, wins: 0, matches: [] };
      current.games++;
      current.wins += row.win;
      current.matches.push(row);
      champions.set(row.champion_id, current);
    }
    const championTotals = db
      .prepare(
        `SELECT ps.champion_id, COUNT(*) games, SUM(ps.win) wins
       FROM ${from}
       WHERE ${totalWhere.join(" AND ")}
       GROUP BY ps.champion_id`,
      )
      .all(...totalParams) as { champion_id: number; games: number; wins: number }[];
    const totalByChampion = new Map(championTotals.map((row) => [row.champion_id, row]));
    // Same scope, games without this item: what the item is compared against
    const baseline = db
      .prepare(
        `SELECT COUNT(*) AS games, TOTAL(ps.win) AS wins, TOTAL(ps.kills) AS kills,
                TOTAL(ps.deaths) AS deaths, TOTAL(ps.assists) AS assists,
                AVG(ps.total_damage_dealt) AS damage, AVG(ps.total_damage_taken) AS taken,
                AVG(ps.gold_earned) AS gold, AVG(ps.total_heal) AS heal, AVG(ps.score) AS score,
                AVG(g.game_duration) AS duration
         FROM ${from}
         WHERE ${totalWhere.join(" AND ")}
           AND NOT ${holds("ps")}`,
      )
      .get(...totalParams) as ItemDetail["baseline"];
    // player_stats has no puuid of its own: there the row's player is the game's owner
    const player = source.table === "player_stats" ? "g.puuid" : "ps.puuid";
    let avgBuyTimeMs: number | null = null;
    let patchBreakdown: { patch: string; games: number; wins: number }[] = [];
    let topPairings: { item_id: number; games: number; wins: number }[] = [];

    if (rows.length > 0) {
      // When this player first bought it, averaged over their games
      avgBuyTimeMs = (
        db
          .prepare(
            `SELECT AVG(first_ms) AS avgBuyTimeMs FROM (
               SELECT MIN(e.timestamp_ms) AS first_ms
               FROM ${from}
               JOIN match_participants mp ON mp.game_id = ps.game_id AND mp.puuid = ${player}
               JOIN match_timeline_events e
                 ON e.game_id = ps.game_id
                AND e.participant_id = mp.participant_id
                AND e.event_type = 'ITEM_PURCHASED'
                AND e.item_id IN (${ids})
               WHERE ${where.join(" AND ")}
               GROUP BY ps.rowid
             )`,
          )
          .get(...totalParams) as { avgBuyTimeMs: number | null }
      ).avgBuyTimeMs;

      patchBreakdown = db
        .prepare(
          `SELECT g.game_version AS patch, COUNT(*) AS games, SUM(ps.win) AS wins
           FROM ${from}
           WHERE ${where.join(" AND ")}
             AND g.game_version IS NOT NULL
             AND g.game_version != ''
           GROUP BY g.game_version
           ORDER BY
             CAST(SUBSTR(g.game_version, 1, INSTR(g.game_version || '.', '.') - 1) AS INTEGER) DESC,
             CAST(SUBSTR(SUBSTR(g.game_version, INSTR(g.game_version, '.') + 1), 1, INSTR(SUBSTR(g.game_version, INSTR(g.game_version, '.') + 1) || '.', '.') - 1) AS INTEGER) DESC
           LIMIT 8`,
        )
        .all(...totalParams) as { patch: string; games: number; wins: number }[];

      topPairings = db
        .prepare(
          `WITH target_participants AS MATERIALIZED (
             SELECT mp.game_id, mp.participant_id, ps.win
             FROM ${from}
             JOIN match_participants mp ON mp.game_id = ps.game_id AND mp.puuid = ${player}
             WHERE ${where.join(" AND ")}
           ),
           paired_items AS (
             ${[0, 1, 2, 3, 4, 5, 6]
               .map(
                 (i) => `SELECT tp.game_id, tp.participant_id, tp.win, mp.item${i} AS item_id
                   FROM target_participants tp
                   JOIN match_participants mp
                     ON mp.game_id = tp.game_id AND mp.participant_id = tp.participant_id`,
               )
               .join(" UNION ")}
           )
           SELECT item_id, COUNT(*) AS games, SUM(win) AS wins
           FROM paired_items
           WHERE item_id > 0
             AND item_id NOT IN (${ids})
             AND item_id NOT IN (${[...TRINKET_ITEM_IDS, ...EXCLUDED_ITEM_IDS].join(", ")})
           GROUP BY item_id
           ORDER BY games DESC, item_id ASC
           LIMIT 8`,
        )
        .all(...totalParams) as { item_id: number; games: number; wins: number }[];
    }

    return {
      item_id: itemId,
      picks: rows.length,
      wins: rows.reduce((sum, row) => sum + row.win, 0),
      totalGames,
      avgBuyTimeMs,
      patchBreakdown,
      topPairings,
      baseline,
      champions: [...champions.entries()]
        .map(([champion_id, value]) => ({
          champion_id,
          ...value,
          championGames: totalByChampion.get(champion_id)?.games ?? value.games,
          championWins: totalByChampion.get(champion_id)?.wins ?? value.wins,
        }))
        .sort((a, b) => b.games - a.games),
    };
  });
}

export function getOwnedRuneStats(queue?: number, patch?: string, account?: string) {
  return cachedQuery("getOwnedRuneStats", [queue, patch, account], 5 * 60_000, () => {
    const source = statsSource(account);
    const where = ["g.is_remake = 0", "g.raw_gz IS NOT NULL"];
    where.push(source.accountFilter);
    const params: any[] = account && account !== "all" ? [account] : [];
    if (patch) {
      where.push("g.game_version = ?");
      params.push(patch);
    }
    applyQueueFilter(where, params, queue);
    where.push(`g.queue_id NOT IN (${EXCLUDED_STATS_SQL})`);
    const rows = db
      .prepare(
        `SELECT g.raw_gz, g.puuid, ${source.alias}.win, ${source.alias}.champion_id, ${source.alias}.kills, ${source.alias}.deaths, ${source.alias}.assists
       FROM games g JOIN ${source.table} ${source.alias} ON g.game_id = ${source.alias}.game_id
       WHERE ${where.join(" AND ")}`,
      )
      .all(...params) as {
      raw_gz: Buffer;
      puuid: string;
      win: number;
      champion_id: number;
      kills: number;
      deaths: number;
      assists: number;
    }[];
    const totals = new Map<number, { picks: number; wins: number }>();
    const champions = new Map<number, { games: number; keystones: Map<number, number> }>();
    for (const row of rows) {
      let raw: any;
      try {
        raw = JSON.parse(zlib.gunzipSync(row.raw_gz).toString("utf8"));
      } catch {
        continue;
      }
      const participants = raw.info?.participants ?? raw.participants ?? [];
      const identities = raw.participantIdentities ?? raw.info?.participantIdentities ?? [];
      const participantIndex = participants.findIndex((p: any, index: number) => {
        const participantId = Number(p.participantId ?? index + 1);
        const identity = identities[participantId - 1]?.player;
        return (
          p.puuid === row.puuid ||
          identity?.puuid === row.puuid ||
          identity?.summonerId === row.puuid
        );
      });
      const participant =
        participantIndex >= 0
          ? participants[participantIndex]
          : participants.find((p: any) => {
              const stats = p.stats ?? p;
              return (
                Number(p.championId ?? stats.championId) === row.champion_id &&
                Number(stats.kills ?? p.kills) === row.kills &&
                Number(stats.deaths ?? p.deaths) === row.deaths &&
                Number(stats.assists ?? p.assists) === row.assists
              );
            });
      const championId = Number(participant?.championId ?? participant?.stats?.championId ?? 0);
      const champion = champions.get(championId) ?? { games: 0, keystones: new Map() };
      if (championId > 0) champion.games++;
      const perks =
        participant?.perks ??
        participant?.stats?.perks ??
        participant?.stats?.runes ??
        participant?.runes;
      const styles = perks?.styles ?? perks?.perkStyles ?? [];
      const legacyRunes = Array.isArray(perks) ? perks : [];
      const legacyIds = [
        participant?.perk0,
        participant?.perk1,
        participant?.perk2,
        participant?.perk3,
        participant?.perk4,
        participant?.perk5,
        participant?.stats?.perk0,
        participant?.stats?.perk1,
        participant?.stats?.perk2,
        participant?.stats?.perk3,
        participant?.stats?.perk4,
        participant?.stats?.perk5,
      ]
        .map(Number)
        .filter(Boolean);
      for (const id of legacyIds) {
        const current = totals.get(id) ?? { picks: 0, wins: 0 };
        current.picks++;
        current.wins += row.win;
        totals.set(id, current);
      }
      for (const style of styles) {
        const keystone = Number(style.selections?.[0]?.perk);
        if (championId > 0 && keystone) {
          champion.keystones.set(keystone, (champion.keystones.get(keystone) ?? 0) + 1);
        }
        // Only the selected perks are runes a player actually picked;
        // style.style is the tree ID (e.g. 8000/8100) and must not be
        // counted as a rune itself.
        for (const selection of style.selections ?? []) {
          const id = Number(selection?.perk);
          if (!id) continue;
          const current = totals.get(id) ?? { picks: 0, wins: 0 };
          current.picks++;
          current.wins += row.win;
          totals.set(id, current);
        }
      }
      for (const rune of legacyRunes) {
        const id = Number(rune.runeId ?? rune.perk ?? rune.id);
        if (!id) continue;
        const current = totals.get(id) ?? { picks: 0, wins: 0 };
        current.picks++;
        current.wins += row.win;
        totals.set(id, current);
      }
      if (championId > 0) champions.set(championId, champion);
    }
    return {
      runes: [...totals.entries()]
        .map(([rune_id, value]) => ({ rune_id, ...value }))
        .sort((a, b) => b.picks - a.picks),
      champions: [...champions.entries()]
        .filter(([id]) => id > 0)
        .map(([champion_id, value]) => ({
          champion_id,
          games: value.games,
          keystones: [...value.keystones.entries()]
            .map(([rune_id, picks]) => ({ rune_id, picks }))
            .sort((a, b) => b.picks - a.picks)
            .slice(0, 3),
        }))
        .sort((a, b) => b.games - a.games),
    };
  });
}
