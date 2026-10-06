import { db } from "../db";
import { getAllPuuids } from "./summoner";
import zlib from "zlib";
import { NO_STATS_QUEUE_IDS } from "../../shared/queues";
import { computeMatchScores } from "../../shared/opScore";
import type { ItemStats } from "../../shared/api";
import { getChampionClasses } from "../dragon";
import {
  applyQueueFilter,
  applyTimeFilter,
  localGamesFilter,
  participantFilter,
  statsSource,
  EXCLUDED_ITEM_IDS,
  EXCLUDED_STATS_SQL,
  EXCLUDED_CS_SQL,
  GAME_MAX_STATS_SQL,
} from "./filters";
import { displayName } from "./payloads";
import { groupByGame, scoreInputsFromRows, SCORE_ROW_COLUMNS, type ScoreRow } from "./scoring";

export function getChampionStatsAll(
  patch?: string,
  queue?: number | number[],
  account?: string,
  timePeriod?: "24h" | "7d" | "30d" | "full",
): any[] {
  const source = statsSource(account);
  const where = ["g.is_remake = 0"];
  where.push(source.accountFilter);
  const params: any[] = account && account !== "all" ? [account] : [];
  if (patch) {
    where.push("g.game_version = ?");
    params.push(patch);
  }
  applyQueueFilter(where, params, queue);
  const timeFilter = applyTimeFilter(timePeriod);
  const statsPlaceholders = NO_STATS_QUEUE_IDS.map(() => "?").join(",");
  return db
    .prepare(`
    SELECT
      ps.champion_id,
      COUNT(*) as games,
      SUM(ps.win) as wins,
      SUM(ps.kills) as kills,
      SUM(ps.deaths) as deaths,
      SUM(ps.assists) as assists,
      ROUND(AVG(ps.kills), 1) as avg_kills,
      ROUND(AVG(ps.deaths), 1) as avg_deaths,
      ROUND(AVG(ps.assists), 1) as avg_assists,
      ROUND(AVG(ps.total_damage_dealt)) as avg_damage,
      ROUND(AVG(ps.gold_earned)) as avg_gold,
      ROUND(AVG(CASE WHEN g.game_duration >= 60 THEN ps.cs * 60.0 / g.game_duration END), 1) as avg_cs_per_min,
      ROUND(AVG(ps.score), 1) as avg_score,
      SUM(CASE WHEN ps.score_badge = 'MVP' THEN 1 ELSE 0 END) as mvps,
      SUM(CASE WHEN ps.score_badge = 'ACE' THEN 1 ELSE 0 END) as aces,
      SUM(ps.double_kills) as double_kills,
      SUM(ps.triple_kills) as triple_kills,
      SUM(ps.quadra_kills) as quadra_kills,
      SUM(ps.penta_kills) as penta_kills
    FROM ${source.table} ${source.alias}
    JOIN games g ON ${source.alias}.game_id = g.game_id
    WHERE ${where.join(" AND ")} ${timeFilter.sql}
      AND g.queue_id NOT IN (${statsPlaceholders})
    GROUP BY ps.champion_id
    ORDER BY games DESC
  `)
    .all(...params, ...timeFilter.params, ...NO_STATS_QUEUE_IDS);
}

export function getChampionQueueStats(
  championId: number,
  account?: string,
): Array<{ queueId: number; games: number; wins: number }> {
  const source = statsSource(account);
  const where = ["g.is_remake = 0"];
  where.push(source.accountFilter);
  where.push(`${source.alias}.champion_id = ?`);
  where.push(`g.queue_id NOT IN (${EXCLUDED_STATS_SQL})`);
  const params: any[] = account && account !== "all" ? [account, championId] : [championId];
  return db
    .prepare(`
        SELECT g.queue_id as queueId,
               COUNT(*) as games,
               SUM(${source.alias}.win) as wins
        FROM ${source.table} ${source.alias}
        JOIN games g ON ${source.alias}.game_id = g.game_id
        WHERE ${where.join(" AND ")}
        GROUP BY g.queue_id
        ORDER BY games DESC
      `)
    .all(...params) as Array<{ queueId: number; games: number; wins: number }>;
}

export function getChampionKeystones(
  championId: number,
  account?: string,
): Array<{ runeId: number; picks: number; wins: number }> {
  // The keystone sits in match_participants.rune0 (first perk of the primary tree).
  // Reads the participant row for the OWNED player only, so the same champion
  // played by a teammate on the same game is not counted.
  const accountFilter =
    account === "all" || account === undefined
      ? "mp.puuid IN (SELECT puuid FROM summoner)"
      : "mp.puuid = ?";
  const params: any[] = account && account !== "all" ? [championId, account] : [championId];
  return db
    .prepare(`
        SELECT mp.rune0 as runeId,
               COUNT(*) as picks,
               SUM(mp.win) as wins
        FROM match_participants mp
        JOIN games g ON g.game_id = mp.game_id
        WHERE g.is_remake = 0
          AND mp.champion_id = ?
          AND mp.rune0 IS NOT NULL
          AND mp.rune0 > 0
          AND g.queue_id NOT IN (${EXCLUDED_STATS_SQL})
          AND ${accountFilter}
        GROUP BY mp.rune0
        ORDER BY picks DESC
        LIMIT 15
      `)
    .all(...params) as Array<{ runeId: number; picks: number; wins: number }>;
}

export function getAugmentStatsAll(
  championId?: number,
  patch?: string,
  queue?: number,
  account?: string,
): any[] {
  const source = statsSource(account);
  const where = ["g.is_remake = 0"];
  where.push(source.accountFilter);
  const params: any[] = account ? [account] : [];
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
  return db
    .prepare(`
    SELECT ${augmentId} as augment_id, COUNT(*) as picks, SUM(ps.win) as wins
    ${augmentSource}
    WHERE ${where.join(" AND ")}
    GROUP BY ${augmentId}
    ORDER BY picks DESC
  `)
    .all(...params);
}

export function getDashboardData(
  filters?: {
    championId?: number;
    patch?: string;
    queue?: number | number[];
    account?: string;
  },
  timePeriod?: "24h" | "7d" | "30d" | "full",
): any {
  const source = statsSource(filters?.account);
  const where: string[] = ["g.is_remake = 0", source.accountFilter];
  const params: any[] = filters?.account && filters.account !== "all" ? [filters.account] : [];
  if (filters?.championId != null) {
    where.push("ps.champion_id = ?");
    params.push(filters.championId);
  }

  if (filters?.patch) {
    where.push("g.game_version = ?");
    params.push(filters.patch);
  }
  applyQueueFilter(where, params, filters?.queue);
  const timeFilter = applyTimeFilter(timePeriod);
  const whereSql = `WHERE ${where.join(" AND ")} ${timeFilter.sql}`;
  const queryParams = [...params, ...timeFilter.params];

  const totals = db
    .prepare(`
    SELECT COUNT(*) as totalGames,
           SUM(g.game_duration) as totalDuration,
           SUM(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN g.game_duration ELSE 0 END) as statsEligibleDuration,
           SUM(ps.win) as wins,
           COUNT(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN 1 END) as statsEligibleGames,
           SUM(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN ps.kills ELSE 0 END) as totalKills,
           SUM(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN ps.deaths ELSE 0 END) as totalDeaths,
           SUM(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN ps.assists ELSE 0 END) as totalAssists,
           AVG(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN ps.total_damage_dealt END) as avgDamageDealt,
           SUM(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN ps.total_damage_dealt ELSE 0 END) as damageDealtTotal,
           AVG(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN ps.total_damage_taken END) as avgDamageTaken,
           SUM(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN ps.total_damage_taken ELSE 0 END) as damageTakenTotal,
           AVG(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN ps.total_heal END) as avgDamageHealed,
           SUM(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN ps.total_heal ELSE 0 END) as damageHealedTotal,
           AVG(CASE WHEN g.queue_id NOT IN (${EXCLUDED_CS_SQL}) THEN ps.cs END) as avgCs,
           SUM(CASE WHEN g.queue_id NOT IN (${EXCLUDED_CS_SQL}) THEN ps.cs END) as csTotal,
           AVG(CASE WHEN g.queue_id NOT IN (${EXCLUDED_CS_SQL}) AND g.game_duration >= 60 THEN ps.cs * 60.0 / g.game_duration END) as csPerMinAvg,
           AVG(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN ps.gold_earned END) as avgGold,
           SUM(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN ps.gold_earned END) as goldTotal,
           SUM(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN ps.double_kills ELSE 0 END) as doubles,
           SUM(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN ps.triple_kills ELSE 0 END) as triples,
           SUM(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN ps.quadra_kills ELSE 0 END) as quadras,
           SUM(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN ps.penta_kills ELSE 0 END) as pentas,
           COUNT(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) AND ps.double_kills > 0 THEN 1 END) as gamesWithDoubles,
           COUNT(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) AND ps.triple_kills > 0 THEN 1 END) as gamesWithTriples,
           COUNT(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) AND ps.quadra_kills > 0 THEN 1 END) as gamesWithQuadras,
           COUNT(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) AND ps.penta_kills > 0 THEN 1 END) as gamesWithPentas,
           AVG(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN ps.score END) as avgScore,
           SUM(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) AND ps.score_badge = 'MVP' THEN 1 ELSE 0 END) as mvps,
           SUM(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) AND ps.score_badge = 'ACE' THEN 1 ELSE 0 END) as aces,
           SUM(CASE WHEN ps.score IS NOT NULL AND ps.win = 1 THEN 1 ELSE 0 END) as scoredWins,
           SUM(CASE WHEN ps.score IS NOT NULL AND ps.win = 0 THEN 1 ELSE 0 END) as scoredLosses,
           -- Every total here pools all tracked accounts; games whose owner was
           -- never resolved carry an empty puuid and aren't an account
           COUNT(DISTINCT NULLIF(${filters?.account ? "ps.puuid" : "g.puuid"}, '')) as accounts
    FROM ${source.table} ${source.alias}
    JOIN games g ON ${source.alias}.game_id = g.game_id
    ${whereSql}
  `)
    .get(...queryParams) as any;

  const recentForm = db
    .prepare(`
    SELECT ps.win, ps.score, g.game_id, g.is_remake, ps.champion_id, ps.kills, ps.deaths, ps.assists
    FROM games g
    JOIN ${source.table} ${source.alias} ON g.game_id = ${source.alias}.game_id
    ${whereSql}
    ORDER BY g.game_creation DESC
    LIMIT 250
  `)
    .all(...queryParams);

  const topChampions = db
    .prepare(`
    SELECT
      ps.champion_id,
      COUNT(*) as games,
      SUM(ps.win) as wins,
      ROUND(AVG(ps.kills), 1) as avg_kills,
      ROUND(AVG(ps.deaths), 1) as avg_deaths,
      ROUND(AVG(ps.assists), 1) as avg_assists
    FROM ${source.table} ${source.alias}
    JOIN games g ON ${source.alias}.game_id = g.game_id
    ${whereSql} AND g.queue_id NOT IN (${EXCLUDED_STATS_SQL})
    GROUP BY ps.champion_id
    ORDER BY games DESC
    LIMIT 10
  `)
    .all(...queryParams);

  const augmentId = filters?.account ? "mpa.augment_id" : "ga.augment_id";
  const augmentSource = filters?.account
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
  const topAugments = db
    .prepare(`
  SELECT ${augmentId} as augment_id, COUNT(*) as picks, SUM(ps.win) as wins
  ${augmentSource}
  ${whereSql} AND g.queue_id NOT IN (${EXCLUDED_STATS_SQL})
  GROUP BY ${augmentId}
    ORDER BY picks DESC
    LIMIT 5
  `)
    .all(...queryParams);

  const teamAvgScoreRow = db
    .prepare(`
  SELECT AVG(mp.score) as teamAvgScore
  FROM games g
  JOIN ${source.table} ${source.alias} ON g.game_id = ${source.alias}.game_id
  JOIN match_participants owner
    ON owner.game_id = g.game_id
    AND owner.champion_id = ${source.alias}.champion_id
    AND owner.kills = ${source.alias}.kills
    AND owner.deaths = ${source.alias}.deaths
    AND owner.assists = ${source.alias}.assists
  JOIN match_participants mp
    ON mp.game_id = g.game_id
    AND mp.team_id = owner.team_id
    AND mp.participant_id != owner.participant_id
    AND mp.score IS NOT NULL
  ${whereSql} AND g.queue_id NOT IN (${EXCLUDED_STATS_SQL})
  `)
    .get(...queryParams) as { teamAvgScore: number | null } | undefined;

  return {
    totalGames: totals.totalGames ?? 0,
    totalDuration: totals.totalDuration ?? 0,
    wins: totals.wins ?? 0,
    totalKills: totals.totalKills ?? 0,
    totalDeaths: totals.totalDeaths ?? 0,
    totalAssists: totals.totalAssists ?? 0,
    avgKills:
      totals.statsEligibleGames > 0 ? (totals.totalKills ?? 0) / totals.statsEligibleGames : 0,
    avgDeaths:
      totals.statsEligibleGames > 0 ? (totals.totalDeaths ?? 0) / totals.statsEligibleGames : 0,
    avgAssists:
      totals.statsEligibleGames > 0 ? (totals.totalAssists ?? 0) / totals.statsEligibleGames : 0,
    avgDamageDealt: totals.avgDamageDealt ?? 0,
    damageDealtTotal: totals.damageDealtTotal ?? 0,
    avgDamageTaken: totals.avgDamageTaken ?? 0,
    damageTakenTotal: totals.damageTakenTotal ?? 0,
    avgDamageHealed: totals.avgDamageHealed ?? 0,
    damageHealedTotal: totals.damageHealedTotal ?? 0,
    avgCs: totals.avgCs ?? 0,
    csTotal: totals.csTotal ?? 0,
    csPerMin: totals.csPerMinAvg ?? 0,
    avgGameLength:
      totals.statsEligibleGames > 0
        ? (totals.statsEligibleDuration ?? 0) / totals.statsEligibleGames
        : 0,
    avgGold: totals.avgGold ?? 0,
    goldTotal: totals.goldTotal ?? 0,
    avgScore: totals.avgScore ?? null,
    teamAvgScore: teamAvgScoreRow?.teamAvgScore ?? 0,
    mvps: totals.mvps ?? 0,
    aces: totals.aces ?? 0,
    scoredWins: totals.scoredWins ?? 0,
    scoredLosses: totals.scoredLosses ?? 0,
    accounts: totals.accounts ?? 0,
    recentForm,
    topChampions,
    multikills: {
      doubles: totals.doubles ?? 0,
      triples: totals.triples ?? 0,
      quadras: totals.quadras ?? 0,
      pentas: totals.pentas ?? 0,
      gamesWithDoubles: totals.gamesWithDoubles ?? 0,
      gamesWithTriples: totals.gamesWithTriples ?? 0,
      gamesWithQuadras: totals.gamesWithQuadras ?? 0,
      gamesWithPentas: totals.gamesWithPentas ?? 0,
    },
    topAugments,
  };
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
}

export function getChampionItemStats(
  championId: number,
  patch?: string,
  queue?: number,
): { item_id: number; picks: number; wins: number }[] {
  const extraWhere: string[] = [];
  extraWhere.push("g.is_remake = 0");
  extraWhere.push(localGamesFilter("g"));
  extraWhere.push(`g.queue_id NOT IN (${EXCLUDED_STATS_SQL})`);
  const extraParams: any[] = [];
  if (patch) {
    extraWhere.push("g.game_version = ?");
    extraParams.push(patch);
  }
  applyQueueFilter(extraWhere, extraParams, queue);
  const extraSql = extraWhere.length > 0 ? ` AND ${extraWhere.join(" AND ")}` : "";
  const itemCols = ["item0", "item1", "item2", "item3", "item4", "item5", "item6"];
  const excludedList = EXCLUDED_ITEM_IDS.join(", ");
  const subquery = (col: string) =>
    `SELECT ps.${col} as item_id, ps.win FROM player_stats ps JOIN games g ON ps.game_id = g.game_id WHERE ps.champion_id = ? AND ps.${col} IS NOT NULL AND ps.${col} > 0 AND ps.${col} NOT IN (${excludedList})${extraSql}`;
  const params = itemCols.flatMap(() => [championId, ...extraParams]);
  return db
    .prepare(`
    SELECT item_id, COUNT(*) as picks, SUM(win) as wins
    FROM (
      ${itemCols.map(subquery).join("\n      UNION ALL\n      ")}
    )
    GROUP BY item_id
    ORDER BY picks DESC
  `)
    .all(...params) as any[];
}

// The id the Friends list keys a teammate on — puuid when we know it, so name
// changes don't split a player in two.
export function teammateKey(puuid: string | null, name: string): string {
  return puuid || name;
}

export function teammateName(
  gameName: string | null,
  tagLine: string | null,
  participantId: number,
) {
  return displayName(gameName, tagLine) ?? `Player ${participantId}`;
}

interface TeammateRow {
  game_id: number;
  game_creation: number;
  participant_id: number;
  puuid: string | null;
  game_name: string | null;
  tag_line: string | null;
  profile_icon: number | null;
  champion_id: number;
  win: number;
  kills: number;
  deaths: number;
  assists: number;
}

// Every participant who shared a team with one of our accounts, one row per
// player per game.
//
// Which (game, team) pairs are ours is resolved up front in a CTE rather than
// as an EXISTS against each candidate row: the CTE is a single indexed lookup
// per account, where the correlated form made SQLite build a throwaway index
// on every call — 2.8 ms against 46 ms on a 580-game library, and it doesn't
// swing on whether ANALYZE has ever run. DISTINCT is what keeps the row count
// honest when two of our own accounts played the same game on the same side.
export function teammateRows(
  puuids: string[],
  queue?: number,
  relation: "friends" | "enemies" = "friends",
): TeammateRow[] {
  const ours = puuids.map(() => "?").join(", ");
  const where = ["o.is_remake = 0", `(o.puuid IS NULL OR o.puuid NOT IN (${ours}))`];
  const params: any[] = [...puuids];
  applyQueueFilter(where, params, queue, "o");
  where.push(`g.queue_id NOT IN (${EXCLUDED_STATS_SQL})`);

  return db
    .prepare(`
      WITH our_teams AS (
        SELECT DISTINCT game_id, team_id FROM match_participants WHERE puuid IN (${ours})
      )
      SELECT o.game_id, g.game_creation, o.participant_id, o.puuid, o.game_name, o.tag_line,
             o.profile_icon, o.champion_id, o.win, o.kills, o.deaths, o.assists
      FROM our_teams t
      JOIN match_participants o ON o.game_id = t.game_id
      JOIN games g ON g.game_id = o.game_id
      WHERE ${where.join(" AND ")}
        AND ${relation === "enemies" ? "o.team_id != t.team_id" : "o.team_id = t.team_id"}
      ORDER BY g.game_creation DESC
    `)
    .all(...puuids, ...params) as TeammateRow[];
}

export function getTeammateStats(
  queue?: number,
  relation: "friends" | "enemies" = "friends",
): any[] {
  const puuids = getAllPuuids();
  if (puuids.length === 0) return [];

  const playerMap = new Map<
    string,
    {
      name: string;
      puuid: string | null;
      profileIcon: number | null;
      games: number;
      wins: number;
      kills: number;
      deaths: number;
      assists: number;
      champions: Map<number, number>;
      lastPlayed: number;
    }
  >();

  for (const row of teammateRows(puuids, queue, relation)) {
    const name = teammateName(row.game_name, row.tag_line, row.participant_id);
    const key = teammateKey(row.puuid, name);

    // If we now have a puuid but previously tracked this player by name, merge
    if (row.puuid && !playerMap.has(row.puuid) && playerMap.has(name)) {
      const old = playerMap.get(name)!;
      if (!old.puuid) {
        playerMap.set(row.puuid, old);
        old.puuid = row.puuid;
        playerMap.delete(name);
      }
    }

    if (!playerMap.has(key)) {
      playerMap.set(key, {
        name,
        puuid: row.puuid,
        profileIcon: null,
        games: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        champions: new Map(),
        lastPlayed: 0,
      });
    }

    const entry = playerMap.get(key)!;
    // Update name and icon to the most recent version
    if (row.game_creation > entry.lastPlayed) {
      entry.name = name;
      if (row.profile_icon != null) entry.profileIcon = row.profile_icon;
    }
    entry.games++;
    if (row.win) entry.wins++;
    entry.kills += row.kills;
    entry.deaths += row.deaths;
    entry.assists += row.assists;
    entry.lastPlayed = Math.max(entry.lastPlayed, row.game_creation);
    entry.champions.set(row.champion_id, (entry.champions.get(row.champion_id) || 0) + 1);
  }

  return Array.from(playerMap.entries())
    .filter(([, p]) => p.games >= 1)
    .map(([key, p]) => ({
      key,
      name: p.name,
      puuid: p.puuid,
      profileIcon: p.profileIcon,
      games: p.games,
      wins: p.wins,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      // Champion id breaks ties so the same five champions come back in the
      // same order every time, rather than in whatever order the rows arrived.
      champions: Array.from(p.champions.entries())
        .sort((a, b) => b[1] - a[1] || a[0] - b[0])
        .slice(0, 5)
        .map(([champion_id, games]) => ({ champion_id, games })),
      lastPlayed: p.lastPlayed,
    }))
    .sort((a, b) => b.games - a.games);
}

// Every game we played alongside one teammate, from both sides: our stored
// stats for the row plus the teammate's own line in that game.
export function getTeammateDetail(
  key: string,
  queue?: number,
  relation: "friends" | "enemies" = "friends",
): { player: any; matches: any[] } | null {
  const puuids = getAllPuuids();
  if (puuids.length === 0) return null;

  // Rows are newest-first, so the first hit carries the current name and icon.
  // Older games can be missing puuids; once we know who we're looking at, match
  // those on name too — the same merge the Friends list does.
  const theirs: TeammateRow[] = [];
  let name: string | null = null;
  for (const row of teammateRows(puuids, queue, relation)) {
    const rowName = teammateName(row.game_name, row.tag_line, row.participant_id);
    if (teammateKey(row.puuid, rowName) === key) {
      name ??= rowName;
      theirs.push(row);
    } else if (name != null && row.puuid == null && rowName === name) {
      theirs.push(row);
    }
  }
  if (theirs.length === 0) return null;

  const byGame = new Map(theirs.map((row) => [row.game_id, row]));
  const gameIds = Array.from(byGame.keys());
  const idList = gameIds.map(() => "?").join(", ");

  // Our own row for each shared game — the same columns the match list shows.
  const ourMatches = db
    .prepare(`
      SELECT g.game_id, g.queue_id, g.game_creation, g.game_duration, g.is_remake, g.favorite,
             g.puuid, g.game_version,
             ps.champion_id, ps.win, ps.kills, ps.deaths, ps.assists,
             ps.double_kills, ps.triple_kills, ps.quadra_kills, ps.penta_kills,
             ps.total_damage_dealt, ps.total_damage_taken, ps.total_heal, ps.gold_earned,
             ps.score, ps.score_badge, ps.spell1, ps.spell2,
             ps.item0, ps.item1, ps.item2, ps.item3, ps.item4, ps.item5,
             (SELECT GROUP_CONCAT(augment_id, ',')
              FROM (SELECT augment_id FROM game_augments
                    WHERE game_id = g.game_id
                    ORDER BY slot)) as augment_ids,
${GAME_MAX_STATS_SQL}
      FROM games g
      JOIN player_stats ps ON g.game_id = ps.game_id
      WHERE g.game_id IN (${idList})
      ORDER BY g.game_creation DESC
    `)
    .all(...gameIds) as any[];

  // The teammate's score has to be computed rather than looked up — player_stats
  // only ever scores our own row — so each shared game needs all ten players.
  const scoreRows = groupByGame(
    db
      .prepare(
        `SELECT game_id, ${SCORE_ROW_COLUMNS} FROM match_participants WHERE game_id IN (${idList})`,
      )
      .all(...gameIds) as (ScoreRow & { game_id: number })[],
  );

  interface ChampionTotals {
    games: number;
    wins: number;
    kills: number;
    deaths: number;
    assists: number;
  }

  const matches: any[] = [];
  const champions = new Map<number, ChampionTotals>();
  const first = theirs[0];
  const player = {
    key,
    name: name ?? key,
    puuid: first.puuid,
    profileIcon: first.profile_icon,
    games: 0,
    wins: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    champions: [] as ({ champion_id: number } & ChampionTotals)[],
    lastPlayed: first.game_creation,
  };

  for (const row of ourMatches) {
    const friend = byGame.get(row.game_id);
    if (!friend) continue;

    if (player.profileIcon == null) player.profileIcon = friend.profile_icon;

    player.games++;
    if (friend.win) player.wins++;
    player.kills += friend.kills;
    player.deaths += friend.deaths;
    player.assists += friend.assists;

    if (!champions.has(friend.champion_id)) {
      champions.set(friend.champion_id, { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 });
    }
    const champ = champions.get(friend.champion_id)!;
    champ.games++;
    if (friend.win) champ.wins++;
    champ.kills += friend.kills;
    champ.deaths += friend.deaths;
    champ.assists += friend.assists;

    const gameRows = scoreRows.get(row.game_id) ?? [];
    const friendScore = computeMatchScores(scoreInputsFromRows(gameRows), getChampionClasses()).get(
      friend.participant_id,
    );
    const friendStats = gameRows.find((p) => p.participant_id === friend.participant_id);

    const base = {
      ...row,
      friend: {
        champion_id: friend.champion_id,
        win: friend.win,
        kills: friend.kills,
        deaths: friend.deaths,
        assists: friend.assists,
        total_damage_dealt: friendStats?.total_damage_dealt ?? 0,
        total_damage_taken: friendStats?.total_damage_taken ?? 0,
        total_heal: friendStats?.total_heal ?? 0,
        score: friendScore?.score ?? null,
        score_badge: friendScore?.badge ?? null,
      },
    };
    if (relation === "enemies") {
      const enemy = base.friend;
      base.friend = {
        champion_id: row.champion_id,
        win: row.win,
        kills: row.kills,
        deaths: row.deaths,
        assists: row.assists,
        total_damage_dealt: row.total_damage_dealt,
        total_damage_taken: row.total_damage_taken,
        total_heal: row.total_heal,
        score: row.score,
        score_badge: row.score_badge,
      };
      base.champion_id = enemy.champion_id;
      base.win = enemy.win;
      base.kills = enemy.kills;
      base.deaths = enemy.deaths;
      base.assists = enemy.assists;
      base.total_damage_dealt = enemy.total_damage_dealt;
      base.total_damage_taken = enemy.total_damage_taken;
      base.total_heal = enemy.total_heal;
      base.score = enemy.score;
      base.score_badge = enemy.score_badge;
    }
    matches.push(base);
  }

  if (player.games === 0) return null;
  player.champions = Array.from(champions.entries())
    .map(([champion_id, totals]) => ({ champion_id, ...totals }))
    .sort((a, b) => b.games - a.games);

  return { player, matches };
}

export function getGlobalStats(
  patch?: string,
  queue?: number,
): {
  champions: { champion_id: number; games: number; wins: number }[];
  augments: { augment_id: number; picks: number; wins: number }[];
  items: { item_id: number; picks: number; wins: number }[];
  totalParticipantSlots: number;
  totalGames: number;
} {
  const mp = participantFilter(patch, queue);
  const mpa = participantFilter(patch, queue, "mpa");

  const champions = db
    .prepare(`
      SELECT mp.champion_id, COUNT(*) as games, SUM(mp.win) as wins
      FROM match_participants mp
      WHERE ${mp.sql} AND mp.champion_id > 0
      GROUP BY mp.champion_id
      ORDER BY games DESC
    `)
    .all(...mp.params) as { champion_id: number; games: number; wins: number }[];

  const augments = db
    .prepare(`
      SELECT mpa.augment_id, COUNT(*) as picks, SUM(mpa.win) as wins
      FROM match_participant_augments mpa
      WHERE ${mpa.sql}
      GROUP BY mpa.augment_id
      ORDER BY picks DESC
    `)
    .all(...mpa.params) as { augment_id: number; picks: number; wins: number }[];

  const itemCols = [0, 1, 2, 3, 4, 5, 6];
  const excludedList = EXCLUDED_ITEM_IDS.join(", ");
  const items = db
    .prepare(`
      SELECT item_id, COUNT(*) as picks, SUM(win) as wins
      FROM (
        ${itemCols
          .map(
            (i) => `SELECT mp.item${i} as item_id, mp.win as win
                FROM match_participants mp
                WHERE ${mp.sql}
                  AND mp.item${i} > 0 AND mp.item${i} NOT IN (${excludedList})`,
          )
          .join("\n        UNION ALL\n        ")}
      )
      GROUP BY item_id
      ORDER BY picks DESC
    `)
    .all(...itemCols.flatMap(() => mp.params)) as {
    item_id: number;
    picks: number;
    wins: number;
  }[];

  const slots = db
    .prepare(`
      SELECT COUNT(*) as count
      FROM match_participants mp
      WHERE ${mp.sql} AND mp.champion_id > 0
    `)
    .get(...mp.params) as { count: number };

  const games = db
    .prepare(`
      SELECT COUNT(DISTINCT mp.game_id) as count
      FROM match_participants mp
      WHERE ${mp.sql} AND mp.champion_id > 0
    `)
    .get(...mp.params) as { count: number };

  return {
    champions,
    augments,
    items,
    totalParticipantSlots: slots.count,
    totalGames: games.count,
  };
}

export function getOwnedItemStats(patch?: string, queue?: number, account?: string): ItemStats[] {
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
  return db
    .prepare(`
      SELECT item_id, COUNT(*) AS picks, SUM(win) AS wins
      FROM (
        ${columns
          .map(
            (i) => `SELECT ps.item${i} AS item_id, ps.win
                    FROM ${source.table} ps JOIN games g ON g.game_id = ps.game_id
                    WHERE ${where.join(" AND ")}
                      AND ps.item${i} > 0 AND ps.item${i} NOT IN (${excluded})`,
          )
          .join(" UNION ALL ")}
      )
      GROUP BY item_id
      ORDER BY picks DESC
    `)
    .all(...columns.flatMap(() => params)) as ItemStats[];
}

export function getOwnedItemDetail(itemId: number, patch?: string, queue?: number) {
  const where = [
    "g.is_remake = 0",
    "(ps.item0 = ? OR ps.item1 = ? OR ps.item2 = ? OR ps.item3 = ? OR ps.item4 = ? OR ps.item5 = ? OR ps.item6 = ?)",
  ];
  where.push(localGamesFilter("g"));
  const params: any[] = Array(7).fill(itemId);
  if (patch) {
    where.push("g.game_version = ?");
    params.push(patch);
  }

  applyQueueFilter(where, params, queue);
  const rows = db
    .prepare(
      `SELECT ps.game_id, ps.champion_id, g.game_creation, g.game_duration, ps.win, ps.kills, ps.deaths, ps.assists FROM player_stats ps JOIN games g ON g.game_id = ps.game_id WHERE ${where.join(" AND ")} ORDER BY g.game_creation DESC`,
    )
    .all(...params) as {
    game_id: number;
    champion_id: number;
    game_creation: number;
    game_duration: number;
    win: number;
    kills: number;
    deaths: number;
    assists: number;
  }[];
  const totalWhere = ["g.is_remake = 0"];
  totalWhere.push(localGamesFilter("g"));
  const totalParams: any[] = [];
  if (patch) {
    totalWhere.push("g.game_version = ?");
    totalParams.push(patch);
  }
  applyQueueFilter(totalWhere, totalParams, queue);
  const totalGames = (
    db
      .prepare(`SELECT COUNT(*) count FROM games g WHERE ${totalWhere.join(" AND ")}`)
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
      `SELECT ps.champion_id, COUNT(*) games
       FROM player_stats ps JOIN games g ON g.game_id = ps.game_id
       WHERE ${totalWhere.join(" AND ")}
       GROUP BY ps.champion_id`,
    )
    .all(...totalParams) as { champion_id: number; games: number }[];
  const totalByChampion = new Map(championTotals.map((row) => [row.champion_id, row.games]));
  return {
    item_id: itemId,
    picks: rows.length,
    wins: rows.reduce((sum, row) => sum + row.win, 0),
    totalGames,
    champions: [...champions.entries()]
      .map(([champion_id, value]) => ({
        champion_id,
        ...value,
        championGames: totalByChampion.get(champion_id) ?? value.games,
      }))
      .sort((a, b) => b.games - a.games),
  };
}

export function getOwnedRuneStats(queue?: number, patch?: string, account?: string) {
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
        p.puuid === row.puuid || identity?.puuid === row.puuid || identity?.summonerId === row.puuid
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
      if (championId > 0) champions.set(championId, champion);
    }
    for (const rune of legacyRunes) {
      const id = Number(rune.runeId ?? rune.perk ?? rune.id);
      if (!id) continue;
      const current = totals.get(id) ?? { picks: 0, wins: 0 };
      current.picks++;
      current.wins += row.win;
      totals.set(id, current);
    }
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
}

// Everything we know about one champion across every stored game, counting all
// ten players in each game (not just our own). Items and augments come from the
// participant tables for the same reason — the player_stats/game_augments
// tables only hold our own picks.
export function getGlobalChampionDetail(
  championId: number,
  patch?: string,
  queue?: number,
): {
  champion_id: number;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  avgDamage: number;
  avgDamageTaken: number;
  avgGold: number;
  avgHeal: number;
  damageShare: number;
  killParticipation: number;
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  totalParticipantSlots: number;
  items: { item_id: number; picks: number; wins: number }[];
  augments: { augment_id: number; picks: number; wins: number }[];
} {
  const mp = participantFilter(patch, queue);
  const mpa = participantFilter(patch, queue, "mpa");

  // Shares are per-game ratios averaged over the games they're defined in, so
  // a game with no team damage/kills recorded can't drag the average to zero —
  // which is what AVG over a NULLable expression does.
  const totals = db
    .prepare(`
      WITH teams AS (
        SELECT mp.game_id, mp.team_id,
               SUM(mp.total_damage_dealt) as team_damage,
               SUM(mp.kills) as team_kills
        FROM match_participants mp
        WHERE ${mp.sql}
        GROUP BY mp.game_id, mp.team_id
      )
      SELECT COUNT(*) as games,
             SUM(mp.win) as wins,
             SUM(mp.kills) as kills,
             SUM(mp.deaths) as deaths,
             SUM(mp.assists) as assists,
             SUM(mp.total_damage_dealt) as damage,
             SUM(mp.total_damage_taken) as damageTaken,
             SUM(mp.gold_earned) as gold,
             SUM(mp.total_heal) as heal,
             SUM(mp.double_kills) as doubleKills,
             SUM(mp.triple_kills) as tripleKills,
             SUM(mp.quadra_kills) as quadraKills,
             SUM(mp.penta_kills) as pentaKills,
             AVG(CASE WHEN t.team_damage > 0
                      THEN mp.total_damage_dealt * 1.0 / t.team_damage END) as damageShare,
             AVG(CASE WHEN t.team_kills > 0
                      THEN (mp.kills + mp.assists) * 1.0 / t.team_kills END) as killParticipation
      FROM match_participants mp
      JOIN teams t ON t.game_id = mp.game_id AND t.team_id = mp.team_id
      WHERE ${mp.sql} AND mp.champion_id = ?
    `)
    .get(...mp.params, ...mp.params, championId) as any;

  const slots = db
    .prepare(`
      SELECT COUNT(*) as count
      FROM match_participants mp
      WHERE ${mp.sql} AND mp.champion_id > 0
    `)
    .get(...mp.params) as { count: number };

  const itemCols = [0, 1, 2, 3, 4, 5, 6];
  const excludedList = EXCLUDED_ITEM_IDS.join(", ");
  const items = db
    .prepare(`
      SELECT item_id, COUNT(*) as picks, SUM(win) as wins
      FROM (
        ${itemCols
          .map(
            (i) => `SELECT mp.item${i} as item_id, mp.win as win
                FROM match_participants mp
                WHERE ${mp.sql} AND mp.champion_id = ?
                  AND mp.item${i} > 0 AND mp.item${i} NOT IN (${excludedList})`,
          )
          .join("\n        UNION ALL\n        ")}
      )
      GROUP BY item_id
      ORDER BY picks DESC
    `)
    .all(...itemCols.flatMap(() => [...mp.params, championId])) as {
    item_id: number;
    picks: number;
    wins: number;
  }[];

  const augments = db
    .prepare(`
      SELECT mpa.augment_id, COUNT(*) as picks, SUM(mpa.win) as wins
      FROM match_participant_augments mpa
      WHERE ${mpa.sql} AND mpa.champion_id = ?
      GROUP BY mpa.augment_id
      ORDER BY picks DESC
    `)
    .all(...mpa.params, championId) as {
    augment_id: number;
    picks: number;
    wins: number;
  }[];

  const games = totals?.games ?? 0;
  const avg = (total: number | null) => (games > 0 ? Math.round((total ?? 0) / games) : 0);

  return {
    champion_id: championId,
    games,
    wins: totals?.wins ?? 0,
    kills: totals?.kills ?? 0,
    deaths: totals?.deaths ?? 0,
    assists: totals?.assists ?? 0,
    avgDamage: avg(totals?.damage),
    avgDamageTaken: avg(totals?.damageTaken),
    avgGold: avg(totals?.gold),
    avgHeal: avg(totals?.heal),
    damageShare: totals?.damageShare ?? 0,
    killParticipation: totals?.killParticipation ?? 0,
    doubleKills: totals?.doubleKills ?? 0,
    tripleKills: totals?.tripleKills ?? 0,
    quadraKills: totals?.quadraKills ?? 0,
    pentaKills: totals?.pentaKills ?? 0,
    totalParticipantSlots: slots.count,
    items,
    augments,
  };
}

// Everything the Trends page draws, in one round trip. Days are the finest
// grain the page uses, so the renderer re-buckets them into weeks or months
// itself instead of asking again; patches and clock buckets can't be derived
// from days and come as their own aggregates. All local time — "games per day"
// means the player's day, not UTC's.
export function getTrendsData(queue?: number, account?: string): any {
  const source = statsSource(account);
  const where = ["g.is_remake = 0"];
  where.push(source.accountFilter);
  const params: any[] = account && account !== "all" ? [account] : [];
  applyQueueFilter(where, params, queue);
  where.push(`g.queue_id NOT IN (${EXCLUDED_STATS_SQL})`);
  const whereSql = `WHERE ${where.join(" AND ")}`;
  const fromSql = `FROM games g JOIN ${source.table} ps ON g.game_id = ps.game_id`;

  // SUM/COUNT over ps.score skip NULLs, so score averages stay honest for
  // days where only some games have a stored score.
  const daily = db
    .prepare(`
      SELECT date(g.game_creation / 1000, 'unixepoch', 'localtime') as day,
             COUNT(*) as games,
             SUM(ps.win) as wins,
             SUM(ps.kills) as kills,
             SUM(ps.deaths) as deaths,
             SUM(ps.assists) as assists,
             SUM(ps.score) as score_sum,
             COUNT(ps.score) as scored_games
      ${fromSql}
      ${whereSql}
      GROUP BY day
      ORDER BY day
    `)
    .all(...params);

  // Ordered by when the patch was first played rather than by parsing version
  // strings — chronological is what a trend axis wants anyway.
  const patches = db
    .prepare(`
      SELECT g.game_version as patch,
             COUNT(*) as games,
             SUM(ps.win) as wins,
             AVG(ps.score) as avg_score,
             MIN(g.game_creation) as first_played
      ${fromSql}
      ${whereSql} AND g.game_version IS NOT NULL AND g.game_version != ''
      GROUP BY g.game_version
      ORDER BY first_played
    `)
    .all(...params);

  const hours = db
    .prepare(`
      SELECT CAST(strftime('%H', g.game_creation / 1000, 'unixepoch', 'localtime') AS INTEGER) as hour,
             COUNT(*) as games,
             SUM(ps.win) as wins
      ${fromSql}
      ${whereSql}
      GROUP BY hour
      ORDER BY hour
    `)
    .all(...params);

  // strftime('%w'): 0 = Sunday
  const weekdays = db
    .prepare(`
      SELECT CAST(strftime('%w', g.game_creation / 1000, 'unixepoch', 'localtime') AS INTEGER) as weekday,
             COUNT(*) as games,
             SUM(ps.win) as wins
      ${fromSql}
      ${whereSql}
      GROUP BY weekday
      ORDER BY weekday
    `)
    .all(...params);

  return { daily, patches, hours, weekdays };
}

// The trophy case: best single-game marks and longest streaks, from one
// chronological pass over our own rows — streaks need the ordering anyway, and
// the maxima fall out of the same loop. On ties the earliest game keeps the
// record, so a mark has to be strictly beaten to change hands.
export function getRecords(
  queue?: number | number[],
  account?: string,
  timePeriod?: "24h" | "7d" | "30d" | "full",
): any {
  if (account === undefined) account = "all";
  const source = statsSource(account);
  const where = ["g.is_remake = 0"];
  where.push(source.accountFilter);
  const params: any[] = account && account !== "all" ? [account] : [];
  applyQueueFilter(where, params, queue);
  const timeFilter = applyTimeFilter(timePeriod);
  const statsPlaceholders = NO_STATS_QUEUE_IDS.map(() => "?").join(",");

  const rows = db
    .prepare(`
      SELECT g.game_id, g.game_creation, g.game_duration, g.queue_id,
             ps.puuid,
             ps.champion_id, ps.win, ps.kills, ps.deaths, ps.assists,
             ps.total_damage_dealt, ps.total_damage_taken,
             ps.gold_earned, ps.total_heal, ps.largest_killing_spree, ps.score, ps.score_raw,
             ps.total_damage_dealt_all, ps.true_damage_dealt, ps.cs, ps.largest_critical_strike
      FROM games g
      JOIN ${source.table} ps ON g.game_id = ps.game_id
      WHERE ${where.join(" AND ")} ${timeFilter.sql}
        AND g.queue_id NOT IN (${statsPlaceholders})
      ORDER BY ps.puuid ASC, g.game_creation ASC, g.game_id ASC
    `)
    .all(...params, ...timeFilter.params, ...NO_STATS_QUEUE_IDS) as any[];

  // Just enough of the game to render a record's context and open its match
  const matchOf = (r: any) => ({
    game_id: r.game_id,
    game_creation: r.game_creation,
    game_duration: r.game_duration,
    queue_id: r.queue_id,
    champion_id: r.champion_id,
    win: r.win,
    kills: r.kills,
    deaths: r.deaths,
    assists: r.assists,
  });

  const bests: Record<string, { value: number; match: any } | null> = {
    kills: null,
    deaths: null,
    assists: null,
    kda: null,
    score: null,
    killingSpree: null,
    damage: null,
    damageTaken: null,
    totalDamage: null,
    trueDamage: null,
    cs: null,
    csPerMinute: null,
    healing: null,
    gold: null,
    fastestWin: null,
    fastestLoss: null,
    longestGame: null,
    criticalStrike: null,
  };
  const higher = (a: number, b: number) => a > b;
  const lower = (a: number, b: number) => a < b;
  const track = (key: string, value: number | null, row: any, better = higher) => {
    if (value == null) return;
    const current = bests[key];
    if (!current || better(value, current.value)) bests[key] = { value, match: matchOf(row) };
  };

  interface Streak {
    length: number;
    start: number;
    end: number;
    match: any;
  }
  let winStreak: Streak | null = null;
  let lossStreak: Streak | null = null;
  let run: { win: number; length: number; start: number } | null = null;
  let lastPuuid: string | null = null;

  for (const r of rows) {
    track("kills", r.kills, r);
    track("deaths", r.deaths, r);
    track("assists", r.assists, r);
    // Deathless games rank by kills+assists rather than dividing by zero; the
    // renderer still labels them "Perfect"
    track("kda", (r.kills + r.assists) / Math.max(r.deaths, 1), r);
    track("score", r.score_raw, r);
    track("killingSpree", r.largest_killing_spree, r);
    track("damage", r.total_damage_dealt, r);
    track("damageTaken", r.total_damage_taken, r);
    track("totalDamage", r.total_damage_dealt_all, r);
    track("trueDamage", r.true_damage_dealt, r);
    track("cs", r.cs, r);
    // CS/min needs at least a minute of game to mean anything; a 0-second
    // remake would otherwise divide by ~0 and post an absurd rate.
    if (r.game_duration >= 60) track("csPerMinute", r.cs / (r.game_duration / 60), r);
    track("criticalStrike", r.largest_critical_strike, r);
    track("healing", r.total_heal, r);
    track("gold", r.gold_earned, r);
    if (r.win) track("fastestWin", r.game_duration, r, lower);
    else track("fastestLoss", r.game_duration, r, lower);
    track("longestGame", r.game_duration, r);

    // Remakes never make it into rows, so they can't break a streak
    if (!run || run.win !== r.win || lastPuuid !== r.puuid) {
      run = { win: r.win, length: 0, start: r.game_creation };
    }
    lastPuuid = r.puuid;
    run.length++;
    const record: Streak = {
      length: run.length,
      start: run.start,
      end: r.game_creation,
      match: matchOf(r),
    };
    if (r.win) {
      if (!winStreak || run.length > winStreak.length) winStreak = record;
    } else {
      if (!lossStreak || run.length > lossStreak.length) lossStreak = record;
    }
  }

  return { totalGames: rows.length, bests, winStreak, lossStreak };
}
