import { db } from "../../db";
import { cachedQuery } from "../cache";
import zlib from "zlib";
import { NO_STATS_QUEUE_IDS } from "../../../shared/queues";
import type {
  ChampionAllyRow,
  ChampionSkillOrder,
  ChampionSkillOrdersResult,
  ChampionQueueStat,
} from "../../../shared/api";
import {
  applyQueueFilter,
  applyTimeFilter,
  participantFilter,
  pushTimeFilter,
  statsSource,
  EXCLUDED_ITEM_IDS,
  EXCLUDED_STATS_SQL,
  ownerFilter,
} from "../filters";
import { participantRowsFromRaw } from "../payloads";
import { TRINKET_ITEM_IDS } from "./items";

export interface ChampionRoleStat {
  role: string;
  games: number;
  wins: number;
}

export interface ChampionRecord {
  key: string;
  label: string;
  value: number;
  gameId: number | null;
  gameDuration?: number;
}

export interface ChampionRecordsResult {
  records: ChampionRecord[];
}

export function getChampionStatsAll(
  patch?: string,
  queue?: number | number[],
  account?: string,
  timePeriod?: "24h" | "7d" | "30d" | "full",
): any[] {
  return cachedQuery(
    "getChampionStatsAll",
    [patch, Array.isArray(queue) ? queue.join(",") : queue, account, timePeriod],
    60_000,
    () => {
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
    },
  );
}

export function getChampionQueueStats(
  championId: number | null,
  account?: string,
  queue?: number,
): ChampionQueueStat[] {
  const source = statsSource(account);
  const where = ["g.is_remake = 0"];
  where.push(source.accountFilter);
  if (championId !== null) where.push(`${source.alias}.champion_id = ?`);
  where.push(`g.queue_id NOT IN (${EXCLUDED_STATS_SQL})`);
  const params: any[] = account && account !== "all" ? [account] : [];
  if (championId !== null) params.push(championId);
  applyQueueFilter(where, params, queue);
  return db
    .prepare(`
        SELECT g.queue_id as queueId,
               COUNT(*) as games,
               SUM(${source.alias}.win) as wins,
               AVG(${source.alias}.kills) as kills,
               AVG(${source.alias}.deaths) as deaths,
               AVG(${source.alias}.assists) as assists,
               AVG(${source.alias}.gold_earned) as avgGold,
               AVG(CASE WHEN g.game_duration >= 60
                        THEN ${source.alias}.gold_earned * 60.0 / g.game_duration END) as goldPerMin,
               AVG(${source.alias}.cs) as avgCs,
               SUM(${source.alias}.cs) / NULLIF(SUM(g.game_duration / 60.0), 0) as csPerMin,
               AVG(${source.alias}.score) as avgScore,
               AVG(g.game_duration) as avgGameLength
        FROM ${source.table} ${source.alias}
        JOIN games g ON ${source.alias}.game_id = g.game_id
        WHERE ${where.join(" AND ")}
        GROUP BY g.queue_id
        ORDER BY games DESC
      `)
    .all(...params) as Array<{
    queueId: number;
    games: number;
    wins: number;
    kills: number;
    deaths: number;
    assists: number;
    avgGold: number | null;
    goldPerMin: number | null;
    avgCs: number | null;
    csPerMin: number | null;
    avgScore: number | null;
    avgGameLength: number | null;
  }>;
}

export function getChampionRoleStats(
  championId: number | null,
  patch?: string,
  queue?: number,
  account?: string,
  timePeriod?: "24h" | "7d" | "30d" | "full",
): ChampionRoleStat[] {
  const filter = participantFilter(patch, queue, "mp", timePeriod);
  const ownerFilter =
    account === "all"
      ? "mp.puuid IN (SELECT puuid FROM visible_summoner)"
      : account
        ? "mp.puuid = ?"
        : "mp.puuid IN (SELECT puuid FROM visible_summoner)";
  const ownerParams: string[] = account && account !== "all" ? [account] : [];
  return db
    .prepare(`
      SELECT
        COALESCE(NULLIF(mp.team_position, ''), 'UNKNOWN') as role,
        COUNT(*) as games,
        SUM(mp.win) as wins,
        AVG(mp.kills) as kills,
        AVG(mp.deaths) as deaths,
        AVG(mp.assists) as assists,
        AVG(mp.score) as avgScore,
        AVG(CASE WHEN g.game_duration >= 60 THEN mp.cs * 60.0 / g.game_duration END) as avgCsPerMin
      FROM match_participants mp
      JOIN games g ON g.game_id = mp.game_id
      WHERE ${filter.sql}${championId !== null ? " AND mp.champion_id = ?" : ""}
        AND ${ownerFilter}
      GROUP BY COALESCE(NULLIF(mp.team_position, ''), 'UNKNOWN')
      ORDER BY games DESC
    `)
    .all(
      ...filter.params,
      ...(championId !== null ? [championId] : []),
      ...ownerParams,
    ) as ChampionRoleStat[];
}

export function getChampionKeystones(
  championId: number | null,
  account?: string,
  timePeriod?: "24h" | "7d" | "30d" | "full",
  queue?: number,
): Array<{
  runeId: number;
  picks: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  avgScore: number | null;
}> {
  const source = statsSource(account);
  const ownerPuuidSql = account ? "ps.puuid" : "g.puuid";
  const where = ["g.is_remake = 0", "g.raw_gz IS NOT NULL"];
  where.push(source.accountFilter);
  if (championId !== null) where.push(`${source.alias}.champion_id = ?`);
  where.push(`g.queue_id NOT IN (${EXCLUDED_STATS_SQL})`);
  const params: any[] = account && account !== "all" ? [account] : [];
  if (championId !== null) params.push(championId);
  pushTimeFilter(where, params, timePeriod);
  applyQueueFilter(where, params, queue);

  const rows = db
    .prepare(`
        SELECT g.raw_gz,
               ${ownerPuuidSql} as puuid,
               ${source.alias}.win as win,
               ${source.alias}.champion_id as champion_id,
               ${source.alias}.kills as kills,
               ${source.alias}.deaths as deaths,
               ${source.alias}.assists as assists,
               ${source.alias}.score as score
        FROM games g
        JOIN ${source.table} ${source.alias} ON ${source.alias}.game_id = g.game_id
        WHERE ${where.join(" AND ")}
      `)
    .all(...params) as Array<{
    raw_gz: Buffer;
    puuid: string;
    win: number;
    champion_id: number;
    kills: number;
    deaths: number;
    assists: number;
    score: number | null;
  }>;

  const totals = new Map<
    number,
    {
      picks: number;
      wins: number;
      kills: number;
      deaths: number;
      assists: number;
      scoreTotal: number;
      scoreCount: number;
    }
  >();

  for (const row of rows) {
    let raw: any;
    try {
      raw = JSON.parse(zlib.gunzipSync(row.raw_gz).toString("utf8"));
    } catch {
      continue;
    }

    // participantRowsFromRaw handles every rune layout we have ever seen
    // (perks.styles[0].selections[0].perk, participant.perk0, and the
    // participant.stats.perk0 fallback). The keystone lands in `rune0`.
    let participantRows: any[];
    try {
      participantRows = participantRowsFromRaw(raw);
    } catch {
      continue;
    }

    // Match the owner the same way the write path does: exact PUUID first,
    // then champion + KDA fallback for payloads that lack a matching UUID.
    const owner =
      participantRows.find((p) => p.puuid === row.puuid) ??
      participantRows.find(
        (p) =>
          p.champion_id === row.champion_id &&
          p.kills === row.kills &&
          p.deaths === row.deaths &&
          p.assists === row.assists,
      );

    if (!owner || !owner.rune0) continue;

    const current = totals.get(owner.rune0) ?? {
      picks: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      scoreTotal: 0,
      scoreCount: 0,
    };
    current.picks++;
    current.wins += row.win;
    current.kills += row.kills;
    current.deaths += row.deaths;
    current.assists += row.assists;
    if (row.score != null) {
      current.scoreTotal += row.score;
      current.scoreCount++;
    }
    totals.set(owner.rune0, current);
  }

  return [...totals.entries()]
    .map(([runeId, v]) => ({
      runeId,
      picks: v.picks,
      wins: v.wins,
      kills: v.kills / v.picks,
      deaths: v.deaths / v.picks,
      assists: v.assists / v.picks,
      avgScore: v.scoreCount > 0 ? v.scoreTotal / v.scoreCount : null,
    }))
    .sort((a, b) => b.picks - a.picks)
    .slice(0, 15);
}

export interface ChampionRuneStatsResult {
  keystones: Array<{ runeId: number; picks: number; wins: number }>;
  primaryTrees: Array<{ styleId: number; picks: number; wins: number }>;
  secondaryTrees: Array<{ styleId: number; picks: number; wins: number }>;
  pages: Array<{ runes: string; picks: number; wins: number }>;
}

export function getChampionRuneStats(
  championId: number | null,
  patch?: string,
  queue?: number,
  account?: string,
): ChampionRuneStatsResult {
  const participant = participantFilter(patch, undefined, "mp");
  const owner = ownerFilter("mp", account);
  const where = [owner, participant.sql];
  if (championId !== null) where.push("mp.champion_id = ?");
  const params: any[] = [];
  if (account && account !== "all") params.push(account);
  params.push(...participant.params);
  if (championId !== null) params.push(championId);
  applyQueueFilter(where, params, queue, "g");

  const championRows = `
    champion_rows AS (
      SELECT mp.rune0, mp.rune1, mp.rune2, mp.rune3, mp.rune4, mp.rune5,
             mp.primary_style, mp.secondary_style, mp.win
      FROM match_participants mp
      JOIN games g ON g.game_id = mp.game_id
      WHERE ${where.join(" AND ")}
    )`;
  const query = (select: string) =>
    db.prepare(`WITH ${championRows} ${select}`).all(...params) as Array<{
      runeId?: number;
      styleId?: number;
      runes?: string;
      picks: number;
      wins: number;
    }>;

  const keystones = query(`
    SELECT rune0 AS runeId, COUNT(*) AS picks, COALESCE(SUM(win), 0) AS wins
    FROM champion_rows
    WHERE rune0 IS NOT NULL AND rune0 > 0
    GROUP BY rune0
    ORDER BY picks DESC
    LIMIT 15
  `).map(({ runeId, picks, wins }) => ({ runeId: runeId!, picks, wins }));
  const primaryTrees = query(`
    SELECT primary_style AS styleId, COUNT(*) AS picks, COALESCE(SUM(win), 0) AS wins
    FROM champion_rows
    WHERE primary_style IS NOT NULL AND primary_style > 0
    GROUP BY primary_style
    ORDER BY picks DESC
    LIMIT 15
  `).map(({ styleId, picks, wins }) => ({ styleId: styleId!, picks, wins }));
  const secondaryTrees = query(`
    SELECT secondary_style AS styleId, COUNT(*) AS picks, COALESCE(SUM(win), 0) AS wins
    FROM champion_rows
    WHERE secondary_style IS NOT NULL AND secondary_style > 0
    GROUP BY secondary_style
    ORDER BY picks DESC
    LIMIT 15
  `).map(({ styleId, picks, wins }) => ({ styleId: styleId!, picks, wins }));
  const pages = query(`
    SELECT rune0 || ',' || rune1 || ',' || rune2 || ',' || rune3 || ',' || rune4 || ',' || rune5 AS runes,
           COUNT(*) AS picks,
           COALESCE(SUM(win), 0) AS wins
    FROM champion_rows
    WHERE rune0 IS NOT NULL AND rune0 > 0
    GROUP BY runes
    ORDER BY picks DESC
    LIMIT 20
  `).map(({ runes, picks, wins }) => ({ runes: runes!, picks, wins }));

  return { keystones, primaryTrees, secondaryTrees, pages };
}

export function getChampionWeeklyWinRate(
  championId: number | null,
  account?: string,
  queue?: number,
): Array<{ weekStart: number; games: number; wins: number }> {
  // Groups by Monday 00:00 of each ISO week. Timestamps are epoch ms.
  const source = statsSource(account);
  const where = ["g.is_remake = 0"];
  where.push(source.accountFilter);
  if (championId !== null) where.push(`${source.alias}.champion_id = ?`);
  where.push(`g.queue_id NOT IN (${EXCLUDED_STATS_SQL})`);
  const params: any[] = account && account !== "all" ? [account] : [];
  if (championId !== null) params.push(championId);
  applyQueueFilter(where, params, queue);
  return db
    .prepare(`
        SELECT
          CAST(strftime('%s', date(g.game_creation / 1000, 'unixepoch', 'weekday 0', '-6 days')) AS INTEGER) * 1000 as weekStart,
          COUNT(*) as games,
          SUM(${source.alias}.win) as wins
        FROM ${source.table} ${source.alias}
        JOIN games g ON ${source.alias}.game_id = g.game_id
        WHERE ${where.join(" AND ")}
        GROUP BY weekStart
        ORDER BY weekStart DESC
        LIMIT 24
      `)
    .all(...params) as Array<{ weekStart: number; games: number; wins: number }>;
}

export function getChampionWeeklyMetrics(
  championId: number,
  patch?: string,
  queue?: string,
  account?: string,
): Array<{ weekStart: number; metrics: Record<string, number | null> }> {
  const source = statsSource(account);
  const where = ["g.is_remake = 0", source.accountFilter, `${source.alias}.champion_id = ?`];
  const params: any[] = account && account !== "all" ? [account, championId] : [championId];
  if (patch) {
    where.push("g.game_version = ?");
    params.push(patch);
  }
  where.push(`g.queue_id NOT IN (${EXCLUDED_STATS_SQL})`);
  if (queue) {
    const queueId = Number(queue);
    if (Number.isFinite(queueId)) applyQueueFilter(where, params, queueId);
  }

  try {
    const rows = db
      .prepare(`
        SELECT
          CAST(strftime('%s', date(g.game_creation / 1000, 'unixepoch', 'weekday 0', '-6 days')) AS INTEGER) * 1000 as weekStart,
          COUNT(*) as games,
          AVG(${source.alias}.win) * 100.0 as winRate,
          (AVG(${source.alias}.kills) + AVG(${source.alias}.assists)) / NULLIF(AVG(${source.alias}.deaths), 0) as kda,
          AVG(CASE WHEN g.game_duration >= 60 THEN ${source.alias}.cs * 60.0 / g.game_duration END) as csPerMin,
          AVG(${source.alias}.score) as score,
          AVG(${source.alias}.total_damage_dealt) as avgDamage,
          AVG(${source.alias}.gold_earned) as avgGold,
          AVG(${source.alias}.total_damage_taken) as avgDamageTaken,
          AVG(${source.alias}.total_heal) as avgHeal,
          AVG(CASE WHEN g.game_duration >= 60 THEN ${source.alias}.gold_earned * 60.0 / g.game_duration END) as goldPerMin,
          AVG(g.game_duration) as avgGameLength
        FROM ${source.table} ${source.alias}
        JOIN games g ON ${source.alias}.game_id = g.game_id
        WHERE ${where.join(" AND ")}
        GROUP BY weekStart
        ORDER BY weekStart ASC
        LIMIT 24
      `)
      .all(...params) as Array<Record<string, number | null>>;
    return rows.map(({ weekStart, games, ...metrics }) => ({
      weekStart: weekStart as number,
      metrics: { games, ...metrics },
    }));
  } catch (error) {
    console.error("[db] getChampionWeeklyMetrics failed:", error);
    throw error;
  }
}

export interface ChampionMatchupRow {
  championId: number;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  goldEarned: number;
}

export function getChampionMatchupList(
  championId: number | null,
  patch?: string,
  queue?: number,
  account?: string,
  timePeriod?: "24h" | "7d" | "30d" | "full",
): ChampionMatchupRow[] {
  return cachedQuery(
    "getChampionMatchupList",
    [championId, patch, queue, account, timePeriod],
    30_000,
    () => {
      const participant = participantFilter(patch, undefined, "owner", timePeriod);
      const owner = ownerFilter("owner", account);
      const where = [owner, participant.sql];
      if (championId !== null) where.push("owner.champion_id = ?");
      const params: any[] = [];
      if (account && account !== "all") params.push(account);
      params.push(...participant.params);
      if (championId !== null) params.push(championId);
      applyQueueFilter(where, params, queue, "g");

      return db
        .prepare(`
      WITH owner_rows AS (
        SELECT owner.game_id,
               owner.participant_id AS ownerParticipantId,
               owner.team_id AS ownerTeamId,
               owner.team_position AS ownerPosition,
               owner.win,
               owner.kills,
               owner.deaths,
               owner.assists,
               owner.cs,
               owner.gold_earned
        FROM match_participants owner
        JOIN games g ON g.game_id = owner.game_id
        WHERE ${where.join(" AND ")}
      ),
      lane_opponents AS (
        SELECT owner.game_id,
               owner.ownerParticipantId,
               (
                 SELECT lane_enemy.participant_id
                 FROM match_participants lane_enemy
                 WHERE lane_enemy.game_id = owner.game_id
                   AND lane_enemy.team_id != owner.ownerTeamId
                   AND lane_enemy.team_position = owner.ownerPosition
                   AND owner.ownerPosition IS NOT NULL
                   AND owner.ownerPosition != ''
                 ORDER BY lane_enemy.participant_id
                 LIMIT 1
               ) AS enemyParticipantId
        FROM owner_rows owner
      ),
      timeline_diffs AS (
        SELECT lane.game_id,
               (
                 SELECT lane_enemy.champion_id
                 FROM match_participants lane_enemy
                 WHERE lane_enemy.game_id = lane.game_id
                   AND lane_enemy.participant_id = lane.enemyParticipantId
               ) AS enemyChampionId,
               (
                 SELECT owner_frame.cs
                 FROM match_timeline_frames owner_frame
                 WHERE owner_frame.game_id = lane.game_id
                   AND owner_frame.participant_id = lane.ownerParticipantId
                   AND ABS(owner_frame.timestamp_ms - 900000) <= 60000
                 ORDER BY ABS(owner_frame.timestamp_ms - 900000)
                 LIMIT 1
               ) - (
                 SELECT enemy_frame.cs
                 FROM match_timeline_frames enemy_frame
                 WHERE enemy_frame.game_id = lane.game_id
                   AND enemy_frame.participant_id = lane.enemyParticipantId
                   AND ABS(enemy_frame.timestamp_ms - 900000) <= 60000
                 ORDER BY ABS(enemy_frame.timestamp_ms - 900000)
                 LIMIT 1
               ) AS csDiff15,
               (
                 SELECT owner_frame.gold
                 FROM match_timeline_frames owner_frame
                 WHERE owner_frame.game_id = lane.game_id
                   AND owner_frame.participant_id = lane.ownerParticipantId
                   AND ABS(owner_frame.timestamp_ms - 900000) <= 60000
                 ORDER BY ABS(owner_frame.timestamp_ms - 900000)
                 LIMIT 1
               ) - (
                 SELECT enemy_frame.gold
                 FROM match_timeline_frames enemy_frame
                 WHERE enemy_frame.game_id = lane.game_id
                   AND enemy_frame.participant_id = lane.enemyParticipantId
                   AND ABS(enemy_frame.timestamp_ms - 900000) <= 60000
                 ORDER BY ABS(enemy_frame.timestamp_ms - 900000)
                 LIMIT 1
               ) AS goldDiff15
        FROM lane_opponents lane
      ),
      matchup_rows AS (
        SELECT owner.game_id,
               enemy.champion_id AS championId,
               MAX(owner.win) AS wins,
               MAX(owner.kills) AS kills,
               MAX(owner.deaths) AS deaths,
               MAX(owner.assists) AS assists,
               MAX(owner.cs) AS cs,
               MAX(owner.gold_earned) AS goldEarned,
               MAX(timeline.csDiff15) AS csDiff15,
               MAX(timeline.goldDiff15) AS goldDiff15
        FROM owner_rows owner
        JOIN match_participants enemy
          ON enemy.game_id = owner.game_id
         AND enemy.team_id != owner.ownerTeamId
        LEFT JOIN timeline_diffs timeline
          ON timeline.game_id = owner.game_id
         AND timeline.enemyChampionId = enemy.champion_id
        WHERE enemy.champion_id > 0
        GROUP BY owner.game_id, enemy.champion_id
      )
      SELECT championId,
             COUNT(*) AS games,
             COALESCE(SUM(wins), 0) AS wins,
             COALESCE(SUM(kills), 0) AS kills,
             COALESCE(SUM(deaths), 0) AS deaths,
             COALESCE(SUM(assists), 0) AS assists,
             COALESCE(SUM(cs), 0) AS cs,
             COALESCE(SUM(goldEarned), 0) AS goldEarned,
             AVG(csDiff15) AS avgCsDiffAt15,
             AVG(goldDiff15) AS avgGoldDiffAt15
      FROM matchup_rows
      GROUP BY championId
      HAVING games >= 1
      ORDER BY games DESC, championId ASC
    `)
        .all(...params) as ChampionMatchupRow[];
    },
  );
}

export function getChampionAllyStats(
  championId: number | null,
  patch?: string,
  queue?: number,
  account?: string,
  timePeriod?: "24h" | "7d" | "30d" | "full",
): ChampionAllyRow[] {
  const participant = participantFilter(patch, undefined, "me", timePeriod);
  const owner = ownerFilter("me", account);
  const where = [owner, participant.sql];
  if (championId !== null) where.push("me.champion_id = ?");
  const params: any[] = [];
  if (account && account !== "all") params.push(account);
  params.push(...participant.params);
  if (championId !== null) params.push(championId);
  applyQueueFilter(where, params, queue, "g");

  return db
    .prepare(`
      WITH ally_rows AS (
        SELECT me.game_id,
               ally.champion_id AS championId,
               MAX(me.win) AS wins,
               MAX(ally.kills) AS kills,
               MAX(ally.deaths) AS deaths,
               MAX(ally.assists) AS assists
        FROM match_participants me
        JOIN games g ON g.game_id = me.game_id
        JOIN match_participants ally
          ON ally.game_id = me.game_id
         AND ally.team_id = me.team_id
         AND ally.participant_id != me.participant_id
        WHERE ${where.join(" AND ")}
          AND ally.champion_id > 0
        GROUP BY me.game_id, ally.champion_id
      )
      SELECT championId,
             COUNT(*) AS games,
             COALESCE(SUM(wins), 0) AS wins,
             COALESCE(SUM(kills), 0) AS kills,
             COALESCE(SUM(deaths), 0) AS deaths,
             COALESCE(SUM(assists), 0) AS assists
      FROM ally_rows
      GROUP BY championId
      HAVING games >= 1
      ORDER BY games DESC, championId ASC
    `)
    .all(...params) as ChampionAllyRow[];
}

export function getChampionItemStats(
  championId: number | null,
  patch?: string,
  queue?: number,
  account?: string,
): Array<{
  item_id: number;
  picks: number;
  wins: number;
  isTrinket: boolean;
  avgBuyTime: number | null;
  commonPurchaseSlot: number | null;
}> {
  const source = statsSource(account);
  const extraWhere: string[] = [];
  extraWhere.push("g.is_remake = 0");
  extraWhere.push(source.accountFilter);
  extraWhere.push(`g.queue_id NOT IN (${EXCLUDED_STATS_SQL})`);
  const extraParams: any[] = account && account !== "all" ? [account] : [];
  if (patch) {
    extraWhere.push("g.game_version = ?");
    extraParams.push(patch);
  }
  applyQueueFilter(extraWhere, extraParams, queue);
  const extraSql = extraWhere.join(" AND ");
  const itemCols = ["item0", "item1", "item2", "item3", "item4", "item5", "item6"];
  const excludedList = EXCLUDED_ITEM_IDS.join(", ");
  const ownerPuuid = account ? "ps.puuid" : "g.puuid";
  const subquery = (col: string) =>
    `SELECT ${source.alias}.${col} as item_id, ${source.alias}.game_id, mp.participant_id, ${source.alias}.win
     FROM ${source.table} ${source.alias}
     JOIN games g ON ${source.alias}.game_id = g.game_id
     JOIN match_participants mp ON mp.game_id = g.game_id AND mp.puuid = ${ownerPuuid}
     WHERE ${championId !== null ? `${source.alias}.champion_id = ? AND ` : ""}${source.alias}.${col} IS NOT NULL AND ${source.alias}.${col} > 0 AND ${source.alias}.${col} NOT IN (${excludedList}) AND ${extraSql}`;
  const params = itemCols.flatMap(() => [
    ...(championId !== null ? [championId] : []),
    ...extraParams,
  ]);
  return (
    db
      .prepare(`
    WITH item_occurrences AS (
      ${itemCols.map(subquery).join("\n      UNION ALL\n      ")}
    ),
    final_items AS (
      SELECT DISTINCT game_id, participant_id, item_id
      FROM item_occurrences
    ),
    purchase_orders AS (
      SELECT fi.item_id, e.game_id, e.participant_id,
             ROW_NUMBER() OVER (
               PARTITION BY e.game_id, e.participant_id
               ORDER BY e.timestamp_ms, e.event_index
             ) AS purchase_order
      FROM final_items fi
      JOIN match_timeline_events e
        ON e.game_id = fi.game_id
       AND e.participant_id = fi.participant_id
       AND e.item_id = fi.item_id
       AND e.event_type = 'ITEM_PURCHASED'
    )
    SELECT io.item_id,
           COUNT(*) as picks,
           SUM(io.win) as wins,
           AVG((
             SELECT MIN(e.timestamp_ms) / 1000.0
             FROM match_timeline_events e
             WHERE e.game_id = io.game_id
               AND e.participant_id = io.participant_id
               AND e.item_id = io.item_id
               AND e.event_type = 'ITEM_PURCHASED'
           )) as avgBuyTime,
           (
             SELECT po.purchase_order
             FROM purchase_orders po
             WHERE po.item_id = io.item_id
             GROUP BY po.purchase_order
             ORDER BY COUNT(*) DESC, po.purchase_order ASC
             LIMIT 1
           ) as commonPurchaseSlot
    FROM item_occurrences io
    GROUP BY io.item_id
    ORDER BY picks DESC
  `)
      .all(...params) as Array<{
      item_id: number;
      picks: number;
      wins: number;
      avgBuyTime: number | null;
      commonPurchaseSlot: number | null;
    }>
  ).map((row) => ({
    ...row,
    isTrinket: TRINKET_ITEM_IDS.includes(row.item_id as (typeof TRINKET_ITEM_IDS)[number]),
  }));
}

// Everything we know about one champion across the stored games owned by the
// tracked accounts. Each matching game still includes every participant.
export function getGlobalChampionDetail(
  championId: number | null,
  patch?: string,
  queue?: number,
  account?: string,
  timePeriod?: "24h" | "7d" | "30d" | "full",
): {
  champion_id: number;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  totalKills: number;
  totalDeaths: number;
  totalAssists: number;
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
  return cachedQuery(
    "getGlobalChampionDetail",
    [championId, patch, queue, account, timePeriod],
    60_000,
    () => {
      const mp = participantFilter(patch, queue, "mp", timePeriod);
      const mpa = participantFilter(patch, queue, "mpa", timePeriod);
      const accountSql = (alias: string) =>
        account && account !== "all"
          ? alias === "mp"
            ? ` AND ${alias}.puuid = ?`
            : ` AND EXISTS (SELECT 1 FROM match_participants owner WHERE owner.game_id = ${alias}.game_id AND owner.puuid = ?)`
          : alias === "mp"
            ? ` AND ${alias}.puuid IN (SELECT puuid FROM visible_summoner)`
            : ` AND EXISTS (SELECT 1 FROM match_participants owner WHERE owner.game_id = ${alias}.game_id AND owner.puuid IN (SELECT puuid FROM visible_summoner))`;
      const mpSql = `${mp.sql}${accountSql("mp")}`;
      const mpaSql = `${mpa.sql}${accountSql("mpa")}`;
      const mpParams = account && account !== "all" ? [...mp.params, account] : mp.params;
      const mpaParams = account && account !== "all" ? [...mpa.params, account] : mpa.params;

      // Shares are per-game ratios averaged over the games they're defined in, so
      // a game with no team damage/kills recorded can't drag the average to zero —
      // which is what AVG over a NULLable expression does.
      const championFilter = championId !== null ? " AND mp.champion_id = ?" : "";
      const totals = db
        .prepare(`
      WITH teams AS (
        SELECT mp.game_id, mp.team_id,
               SUM(mp.total_damage_dealt) as team_damage,
               SUM(mp.kills) as team_kills
        FROM match_participants mp
        WHERE ${mpSql}
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
      WHERE ${mpSql}${championFilter}
    `)
        .get(...mpParams, ...mpParams, ...(championId !== null ? [championId] : [])) as any;

      const slots = db
        .prepare(`
      SELECT COUNT(*) as count
      FROM match_participants mp
      WHERE ${mpSql} AND mp.champion_id > 0
    `)
        .get(...mpParams) as { count: number };

      const itemCols = [0, 1, 2, 3, 4, 5, 6];
      const excludedList = EXCLUDED_ITEM_IDS.join(", ");
      // UNION, not UNION ALL: two copies of an item in one inventory are one game
      const items = db
        .prepare(`
      SELECT item_id, COUNT(*) as picks, SUM(win) as wins
      FROM (
        ${itemCols
          .map(
            (i) => `SELECT mp.game_id, mp.participant_id, mp.item${i} as item_id, mp.win as win
                FROM match_participants mp
                WHERE ${mpSql}${championFilter}
                  AND mp.item${i} > 0 AND mp.item${i} NOT IN (${excludedList})`,
          )
          .join("\n        UNION\n        ")}
      )
      GROUP BY item_id
      ORDER BY picks DESC
    `)
        .all(
          ...itemCols.flatMap(() => [...mpParams, ...(championId !== null ? [championId] : [])]),
        ) as {
        item_id: number;
        picks: number;
        wins: number;
      }[];

      const augments = db
        .prepare(`
      SELECT mpa.augment_id, COUNT(*) as picks, SUM(mpa.win) as wins
      FROM match_participant_augments mpa
      WHERE ${mpaSql}${championId !== null ? " AND mpa.champion_id = ?" : ""}
      GROUP BY mpa.augment_id
      ORDER BY picks DESC
    `)
        .all(...mpaParams, ...(championId !== null ? [championId] : [])) as {
        augment_id: number;
        picks: number;
        wins: number;
      }[];

      const games = totals?.games ?? 0;
      const avg = (total: number | null) => (games > 0 ? Math.round((total ?? 0) / games) : 0);

      return {
        champion_id: championId ?? 0,
        games,
        wins: totals?.wins ?? 0,
        kills: totals?.kills ?? 0,
        deaths: totals?.deaths ?? 0,
        assists: totals?.assists ?? 0,
        totalKills: totals?.kills ?? 0,
        totalDeaths: totals?.deaths ?? 0,
        totalAssists: totals?.assists ?? 0,
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
    },
  );
}

export interface ChampionTeamObjectives {
  ally: {
    games: number;
    first_blood_pct: number;
    first_tower_pct: number;
    first_dragon_pct: number;
    first_baron_pct: number;
    first_herald_pct: number;
    avg_dragon_kills: number;
    avg_baron_kills: number;
    avg_herald_kills: number;
    avg_horde_kills: number;
    avg_tower_kills: number;
    avg_inhibitor_kills: number;
  };
  enemy: {
    games: number;
    first_blood_pct: number;
    first_tower_pct: number;
    first_dragon_pct: number;
    first_baron_pct: number;
    first_herald_pct: number;
    avg_dragon_kills: number;
    avg_baron_kills: number;
    avg_herald_kills: number;
    avg_horde_kills: number;
    avg_tower_kills: number;
    avg_inhibitor_kills: number;
  };
}

export function getChampionChallengeAggregates(
  puuid: string,
  championId: number,
): {
  gamesWithChallenges: number;
  metrics: Array<{
    key: string;
    avg: number | null;
    best: number | null;
    games: number;
  }>;
} {
  const participantFilter =
    puuid === "all" ? "p.puuid IN (SELECT puuid FROM visible_summoner)" : "p.puuid = ?";
  const params = puuid === "all" ? [championId] : [puuid, championId];
  const gamesWithChallenges = db
    .prepare(
      `SELECT COUNT(DISTINCT c.game_id) AS games
       FROM match_participant_challenges c
       JOIN match_participants p
         ON p.game_id = c.game_id AND p.participant_id = c.participant_id
       WHERE ${participantFilter} AND p.champion_id = ?`,
    )
    .get(...params) as { games: number };
  const metrics = db
    .prepare(
      `SELECT
         c.challenge_key AS key,
         AVG(c.value) AS avg,
         MAX(c.value) AS best,
         COUNT(*) AS games
       FROM match_participant_challenges c
       JOIN match_participants p
         ON p.game_id = c.game_id AND p.participant_id = c.participant_id
       WHERE ${participantFilter} AND p.champion_id = ?
       GROUP BY c.challenge_key
       ORDER BY games DESC`,
    )
    .all(...params) as Array<{
    key: string;
    avg: number | null;
    best: number | null;
    games: number;
  }>;
  return { gamesWithChallenges: gamesWithChallenges.games, metrics };
}

export function getChampionTeamObjectives(
  puuid: string,
  championId: number,
): ChampionTeamObjectives {
  const empty = (): ChampionTeamObjectives["ally"] => ({
    games: 0,
    first_blood_pct: 0,
    first_tower_pct: 0,
    first_dragon_pct: 0,
    first_baron_pct: 0,
    first_herald_pct: 0,
    avg_dragon_kills: 0,
    avg_baron_kills: 0,
    avg_herald_kills: 0,
    avg_horde_kills: 0,
    avg_tower_kills: 0,
    avg_inhibitor_kills: 0,
  });
  if (!puuid || !Number.isInteger(championId) || championId <= 0) {
    const result = { ally: empty(), enemy: empty() };
    console.warn("[db] getChampionTeamObjectives empty:", { reason: "invalid arguments" });
    return result;
  }

  const rows = db
    .prepare(`
      WITH player_games AS (
        SELECT DISTINCT game_id, team_id
        FROM match_participants
        WHERE puuid = ? AND champion_id = ? AND is_remake = 0
      ),
      sides AS (
        SELECT
          CASE WHEN mt.team_id = pg.team_id THEN 'ally' ELSE 'enemy' END AS side,
          mt.*
        FROM player_games pg
        JOIN match_teams mt ON mt.game_id = pg.game_id
      )
      SELECT
        side,
        COUNT(*) AS games,
        COALESCE(AVG(first_blood) * 100, 0) AS first_blood_pct,
        COALESCE(AVG(first_tower) * 100, 0) AS first_tower_pct,
        COALESCE(AVG(first_dragon) * 100, 0) AS first_dragon_pct,
        COALESCE(AVG(first_baron) * 100, 0) AS first_baron_pct,
        COALESCE(AVG(first_herald) * 100, 0) AS first_herald_pct,
        COALESCE(AVG(dragon_kills), 0) AS avg_dragon_kills,
        COALESCE(AVG(baron_kills), 0) AS avg_baron_kills,
        COALESCE(AVG(rift_herald_kills), 0) AS avg_herald_kills,
        COALESCE(AVG(horde_kills), 0) AS avg_horde_kills,
        COALESCE(AVG(tower_kills), 0) AS avg_tower_kills,
        COALESCE(AVG(inhibitor_kills), 0) AS avg_inhibitor_kills
      FROM sides
      GROUP BY side
    `)
    .all(puuid, championId) as Array<ChampionTeamObjectives["ally"] & { side: "ally" | "enemy" }>;

  const result = { ally: empty(), enemy: empty() };
  for (const row of rows) {
    const { side, ...values } = row;
    result[side] = values;
  }
  return result;
}

export function getChampionStatBaseline(
  championId: number,
  patch?: string,
  queue?: string,
  account?: string,
): Record<string, number | null> {
  const statsPlaceholders = NO_STATS_QUEUE_IDS.map(() => "?").join(",");
  const where = [
    "g.is_remake = 0",
    "g.source != 'search-import'",
    `g.queue_id NOT IN (${statsPlaceholders})`,
    "mp.champion_id <> ?",
  ];
  const params: any[] = [...NO_STATS_QUEUE_IDS, championId];

  if (patch) {
    where.push("g.game_version = ?");
    params.push(patch);
  }
  const queueId = queue == null ? undefined : Number(queue);
  if (queueId == null || Number.isFinite(queueId)) {
    applyQueueFilter(where, params, queueId, "g");
  }

  where.push(ownerFilter("mp", account));
  if (account && account !== "all") params.push(account);
  return db
    .prepare(`
      SELECT
        AVG(mp.physical_damage_dealt) AS avgPhysicalDamageDealtOther,
        AVG(mp.magic_damage_dealt) AS avgMagicDamageDealtOther,
        AVG(mp.true_damage_dealt) AS avgTrueDamageDealtOther,
        AVG(mp.physical_damage_taken) AS avgPhysicalDamageTakenOther,
        AVG(mp.magic_damage_taken) AS avgMagicDamageTakenOther,
        AVG(mp.true_damage_taken) AS avgTrueDamageTakenOther,
        AVG(mp.time_cc_others) AS avgTimeCcOthersOther,
        AVG(mp.total_cc_dealt) AS avgTotalCcDealtOther,
        AVG(mp.damage_to_objectives) AS avgDamageToObjectivesOther,
        AVG(mp.damage_to_turrets) AS avgDamageToTurretsOther,
        AVG(mp.longest_alive) AS avgLongestAliveOther,
        AVG(mp.killing_sprees) AS avgKillingSpreesOther,
        AVG(mp.damage_self_mitigated) AS avgDamageSelfMitigatedOther,
        AVG(mp.vision_score) AS avgVisionScoreOther,
        AVG(mp.wards_placed) AS avgWardsPlacedOther,
        AVG(mp.wards_killed) AS avgWardsKilledOther,
        AVG(mp.vision_wards_bought) AS avgVisionWardsBoughtOther,
        AVG(mp.sight_wards_bought) AS avgSightWardsBoughtOther,
        AVG(mp.total_minions_killed) AS avgTotalMinionsKilledOther,
        AVG(mp.neutral_minions_killed) AS avgNeutralMinionsKilledOther,
        AVG(mp.neutral_minions_enemy_jungle) AS avgNeutralMinionsEnemyJungleOther,
        AVG(mp.neutral_minions_team_jungle) AS avgNeutralMinionsTeamJungleOther,
        AVG(mp.turret_kills) AS avgTurretKillsOther,
        AVG(mp.inhibitor_kills) AS avgInhibitorKillsOther,
        AVG(mp.turret_plates_taken) AS avgTurretPlatesTakenOther,
        AVG(mp.baron_kills) AS avgBaronKillsOther,
        AVG(mp.objectives_stolen) AS avgObjectivesStolenOther,
        AVG(mp.objectives_stolen_assists) AS avgObjectivesStolenAssistsOther
      FROM match_participants mp
      JOIN games g ON mp.game_id = g.game_id
      WHERE ${where.join(" AND ")}
    `)
    .get(...params) as Record<string, number | null>;
}

export function getChampionSkillOrders(
  championId: number,
  patch?: string,
  queue?: number,
  account?: string,
): ChampionSkillOrdersResult {
  const source = statsSource(account);
  const playerPuuidSql = account ? "ps.puuid" : "g.puuid";
  const participant = participantFilter(patch, undefined, "mp");
  const where = ["ps.champion_id = ?", source.accountFilter, participant.sql];
  const params: any[] = [championId];
  if (account && account !== "all") params.push(account);
  params.push(...participant.params);
  applyQueueFilter(where, params, queue, "g");

  const championGamesCte = `
    champion_games AS (
      SELECT g.game_id, mp.participant_id, ps.spell1, ps.spell2, ps.win
      FROM games g
      JOIN ${source.table} ps ON g.game_id = ps.game_id
      JOIN match_participants mp
        ON mp.game_id = g.game_id AND mp.puuid = ${playerPuuidSql}
      WHERE ${where.join(" AND ")}
    )`;

  const skillEventsCte = `
    skill_events AS (
      SELECT cg.game_id, e.event_index, e.timestamp_ms, e.skill_slot
      FROM champion_games cg
      JOIN match_timeline_events e
        ON e.game_id = cg.game_id
       AND e.participant_id = cg.participant_id
       AND e.event_type = 'SKILL_LEVEL_UP'
       AND e.skill_slot IS NOT NULL
    )`;

  const topOrders = db
    .prepare(`
      WITH ${championGamesCte},
      ${skillEventsCte},
      game_orders AS (
        SELECT game_id, GROUP_CONCAT(skill_slot, ',') AS skill_order, COUNT(*) AS skill_count
        FROM (
          SELECT game_id, event_index, timestamp_ms, skill_slot
          FROM skill_events
          ORDER BY game_id, timestamp_ms, event_index
        )
        GROUP BY game_id
      )
      SELECT skill_order AS "order", COUNT(*) AS picks
      FROM game_orders
      WHERE skill_count >= 15
      GROUP BY skill_order
      ORDER BY picks DESC, "order" ASC
      LIMIT 20
    `)
    .all(...params) as ChampionSkillOrder[];

  const timing = db
    .prepare(`
      WITH ${championGamesCte},
      ${skillEventsCte},
      r_events AS (
        SELECT game_id, timestamp_ms,
               ROW_NUMBER() OVER (PARTITION BY game_id ORDER BY timestamp_ms, event_index) AS rn
        FROM skill_events
        WHERE skill_slot = 4
      )
      SELECT
        (SELECT AVG(timestamp_ms / 60000.0) FROM r_events WHERE rn = 1) AS avgR1Min,
        (SELECT AVG(timestamp_ms / 60000.0) FROM r_events WHERE rn = 2) AS avgR2Min,
        (SELECT AVG(timestamp_ms / 60000.0) FROM r_events WHERE rn = 3) AS avgR3Min,
        COUNT(DISTINCT game_id) AS sampleSize
      FROM skill_events
    `)
    .get(...params) as {
    avgR1Min: number | null;
    avgR2Min: number | null;
    avgR3Min: number | null;
    sampleSize: number;
  };

  const summonerSpells = db
    .prepare(`
      WITH ${championGamesCte}
      SELECT
        CAST(spell1 AS TEXT) || ',' || CAST(spell2 AS TEXT) AS pair,
        COUNT(*) AS picks,
        COALESCE(SUM(win), 0) AS wins
      FROM champion_games
      GROUP BY spell1, spell2
      ORDER BY picks DESC, pair ASC
      LIMIT 10
    `)
    .all(...params) as Array<{ pair: string; picks: number; wins: number }>;

  const coverage = db
    .prepare(`
      WITH ${championGamesCte},
      ${skillEventsCte}
      SELECT
        COUNT(DISTINCT skill_events.game_id) AS gamesWithTimeline,
        (SELECT COUNT(*) FROM champion_games) AS totalGames
      FROM skill_events
    `)
    .get(...params) as { gamesWithTimeline: number; totalGames: number };

  const result: ChampionSkillOrdersResult = {
    topOrders,
    rTiming: {
      avgR1Min: timing?.avgR1Min ?? null,
      avgR2Min: timing?.avgR2Min ?? null,
      avgR3Min: timing?.avgR3Min ?? null,
      sampleSize: timing?.sampleSize ?? 0,
    },
    summonerSpells,
    timelineCoverage: {
      gamesWithTimeline: coverage?.gamesWithTimeline ?? 0,
      totalGames: coverage?.totalGames ?? 0,
    },
  };
  return result;
}

export function getChampionRecords(
  championId: number | null,
  patch?: string,
  queue?: number,
  account?: string,
  timePeriod?: "24h" | "7d" | "30d" | "full",
): ChampionRecordsResult {
  const source = statsSource(account);
  const participant = participantFilter(patch, undefined, "mp", timePeriod);
  const ownerPuuidSql = account ? "ps.puuid" : "g.puuid";
  const where = [
    source.accountFilter,
    participant.sql,
    `mp.puuid = ${ownerPuuidSql}`,
    "g.is_remake = 0",
  ];
  if (championId !== null) where.splice(2, 0, "mp.champion_id = ?");
  const params: any[] = [];
  if (account && account !== "all") params.push(account);
  params.push(...participant.params);
  if (championId !== null) params.push(championId);
  applyQueueFilter(where, params, queue, "g");
  const fromSql = `
    FROM match_participants mp
    JOIN games g ON g.game_id = mp.game_id
    JOIN ${source.table} ps ON ps.game_id = g.game_id
  `;
  const whereSql = `WHERE ${where.join(" AND ")}`;
  const query = (expression: string, order: "DESC" | "ASC" = "DESC", extra = "") =>
    db
      .prepare(`
        SELECT ${expression} AS value, g.game_id, g.game_duration
        ${fromSql}
        ${whereSql}${extra}
        ORDER BY ${expression} ${order}, g.game_id ASC
        LIMIT 2
      `)
      .all(...params) as { value: number; game_id: number; game_duration: number }[];

  const definitions: Array<{
    key: string;
    label: string;
    expression: string;
    order?: "DESC" | "ASC";
    extra?: string;
  }> = [
    { key: "kills", label: "Most kills", expression: "mp.kills" },
    { key: "deaths", label: "Most deaths", expression: "mp.deaths" },
    { key: "assists", label: "Most assists", expression: "mp.assists" },
    {
      key: "kda",
      label: "Best KDA",
      expression: "(mp.kills + mp.assists) * 1.0 / MAX(1, mp.deaths)",
    },
    { key: "cs", label: "Most CS", expression: "mp.cs" },
    { key: "damage", label: "Most damage", expression: "mp.total_damage_dealt" },
    {
      key: "damageTaken",
      label: "Most damage taken",
      expression: "mp.total_damage_taken",
    },
    { key: "healing", label: "Most healing", expression: "mp.total_heal" },
    { key: "gold", label: "Most gold", expression: "mp.gold_earned" },
    { key: "longestGame", label: "Longest game", expression: "g.game_duration" },
    {
      key: "shortestWin",
      label: "Shortest win",
      expression: "g.game_duration",
      order: "ASC",
      extra: " AND mp.win = 1",
    },
    { key: "turretKills", label: "Most turret kills", expression: "mp.turret_kills" },
    {
      key: "objectivesStolen",
      label: "Most objectives stolen",
      expression: "mp.objectives_stolen",
    },
    {
      key: "firstBloodKills",
      label: "Most first blood kills",
      expression: "mp.first_blood_kill",
    },
    { key: "doubleKills", label: "Most double kills", expression: "mp.double_kills" },
    { key: "tripleKills", label: "Most triple kills", expression: "mp.triple_kills" },
    { key: "quadraKills", label: "Most quadra kills", expression: "mp.quadra_kills" },
    { key: "pentaKills", label: "Most penta kills", expression: "mp.penta_kills" },
    { key: "longestAlive", label: "Longest alive", expression: "mp.longest_alive" },
  ];

  const records = db.transaction(() =>
    definitions.flatMap(({ key, label, expression, order, extra }) => {
      const rows = query(expression, order, extra);
      const row = rows[0];
      if (!row || row.value == null) return [];
      const second = rows[1];
      return [
        {
          key,
          label,
          value: row.value,
          gameId: row.game_id,
          gameDuration: row.game_duration,
          secondValue: second?.value ?? null,
          secondGameId: second?.game_id ?? null,
        },
      ];
    }),
  )();
  return { records };
}
