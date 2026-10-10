import { db } from "../db";
import { getAllPuuids } from "./summoner";
import zlib from "zlib";
import { NO_STATS_QUEUE_IDS } from "../../shared/queues";
import { computeMatchScores } from "../../shared/opScore";
import type {
  ChampionAllyRow,
  ChampionSkillOrder,
  ChampionSkillOrdersResult,
  ChampionTeammateRow,
  ItemStats,
} from "../../shared/api";
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
import { displayName, participantRowsFromRaw } from "./payloads";
import { groupByGame, scoreInputsFromRows, SCORE_ROW_COLUMNS, type ScoreRow } from "./scoring";

export interface ChampionRoleStat {
  role: string;
  games: number;
  wins: number;
}

export interface ChampionTrendsDay {
  day: string;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  score_sum: number | null;
  scored_games: number;
  cs_sum: number | null;
  gold_sum: number | null;
}

export interface ChampionTrendsPatch {
  patch: string;
  games: number;
  wins: number;
  avg_score: number | null;
  first_played: number;
}

export interface ChampionTrendsHour {
  hour: number;
  games: number;
  wins: number;
}

export interface ChampionTrendsWeekday {
  weekday: number;
  games: number;
  wins: number;
}

export interface ChampionTrendsData {
  daily: ChampionTrendsDay[];
  patches: ChampionTrendsPatch[];
  hours: ChampionTrendsHour[];
  weekdays: ChampionTrendsWeekday[];
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

export function getChampionRoleStats(
  championId: number,
  patch?: string,
  queue?: number,
): ChampionRoleStat[] {
  console.log("[db] getChampionRoleStats called:", { championId, patch, queue });
  const filter = participantFilter(patch, queue);
  const rows = db
    .prepare(`
      SELECT
        COALESCE(NULLIF(mp.team_position, ''), 'UNKNOWN') as role,
        COUNT(*) as games,
        SUM(mp.win) as wins
      FROM match_participants mp
      WHERE ${filter.sql} AND mp.champion_id = ?
      GROUP BY COALESCE(NULLIF(mp.team_position, ''), 'UNKNOWN')
      ORDER BY games DESC
    `)
    .all(...filter.params, championId) as ChampionRoleStat[];
  console.log("[db] getChampionRoleStats done:", { count: rows.length });
  return rows;
}

export function getChampionKeystones(
  championId: number,
  account?: string,
): Array<{ runeId: number; picks: number; wins: number }> {
  const source = statsSource(account);
  const ownerPuuidSql = account ? "ps.puuid" : "g.puuid";
  const where = ["g.is_remake = 0", "g.raw_gz IS NOT NULL"];
  where.push(source.accountFilter);
  where.push(`${source.alias}.champion_id = ?`);
  where.push(`g.queue_id NOT IN (${EXCLUDED_STATS_SQL})`);
  const params: any[] = account && account !== "all" ? [account, championId] : [championId];

  const rows = db
    .prepare(`
        SELECT g.raw_gz,
               ${ownerPuuidSql} as puuid,
               ${source.alias}.win as win,
               ${source.alias}.champion_id as champion_id,
               ${source.alias}.kills as kills,
               ${source.alias}.deaths as deaths,
               ${source.alias}.assists as assists
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
  }>;

  const totals = new Map<number, { picks: number; wins: number }>();

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

    const current = totals.get(owner.rune0) ?? { picks: 0, wins: 0 };
    current.picks++;
    current.wins += row.win;
    totals.set(owner.rune0, current);
  }

  return [...totals.entries()]
    .map(([runeId, v]) => ({ runeId, picks: v.picks, wins: v.wins }))
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
  championId: number,
  patch?: string,
  queue?: number,
  account?: string,
): ChampionRuneStatsResult {
  console.log("[db] getChampionRuneStats called:", { championId, patch, queue, account });

  const participant = participantFilter(patch, undefined, "mp");
  const ownerFilter =
    account === "all"
      ? "mp.puuid IN (SELECT puuid FROM summoner)"
      : account
        ? "mp.puuid = ?"
        : "mp.puuid = g.puuid";
  const where = [ownerFilter, participant.sql, "mp.champion_id = ?"];
  const params: any[] = [];
  if (account && account !== "all") params.push(account);
  params.push(...participant.params, championId);
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

  const result = { keystones, primaryTrees, secondaryTrees, pages };
  console.log("[db] getChampionRuneStats done:", {
    keystones: keystones.length,
    primaryTrees: primaryTrees.length,
    secondaryTrees: secondaryTrees.length,
    pages: pages.length,
  });
  return result;
}

export function getChampionWeeklyWinRate(
  championId: number,
  account?: string,
): Array<{ weekStart: number; games: number; wins: number }> {
  // Groups by Monday 00:00 of each ISO week. Timestamps are epoch ms.
  const source = statsSource(account);
  const where = ["g.is_remake = 0"];
  where.push(source.accountFilter);
  where.push(`${source.alias}.champion_id = ?`);
  where.push(`g.queue_id NOT IN (${EXCLUDED_STATS_SQL})`);
  const params: any[] = account && account !== "all" ? [account, championId] : [championId];
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
        ORDER BY weekStart ASC
        LIMIT 24
      `)
    .all(...params) as Array<{ weekStart: number; games: number; wins: number }>;
}

export function getChampionMatchups(
  championId: number,
  account?: string,
): {
  best: Array<{ championId: number; games: number; wins: number }>;
  worst: Array<{ championId: number; games: number; wins: number }>;
} {
  // Finds the player's games with this champion, then finds the enemy team's
  // most-frequent opposing champion per game. Only counts games where the
  // OWNED player was on the winning or losing team, and only teammates' opposing
  // champions are counted (the enemy team, opposite team_id from the owner).
  const accountFilter =
    account === "all" || account === undefined
      ? "owner.puuid IN (SELECT puuid FROM summoner)"
      : "owner.puuid = ?";
  const params: any[] = account && account !== "all" ? [championId, account] : [championId];
  const rows = db
    .prepare(`
        SELECT enemy.champion_id as championId,
               COUNT(DISTINCT owner.game_id) as games,
               SUM(CASE WHEN owner.win = 1 THEN 1 ELSE 0 END) as wins
        FROM match_participants owner
        JOIN match_participants enemy
          ON enemy.game_id = owner.game_id
         AND enemy.team_id != owner.team_id
        JOIN games g ON g.game_id = owner.game_id
        WHERE g.is_remake = 0
          AND owner.champion_id = ?
          AND enemy.champion_id > 0
          AND g.queue_id NOT IN (${EXCLUDED_STATS_SQL})
          AND ${accountFilter}
        GROUP BY enemy.champion_id
        HAVING games >= 3
        ORDER BY games DESC
      `)
    .all(...params) as Array<{ championId: number; games: number; wins: number }>;

  // Sort by win rate, then games. Min 3 games already enforced by HAVING.
  const withWr = rows.map((r) => ({ ...r, wr: r.games > 0 ? r.wins / r.games : 0 }));
  const best = [...withWr].sort((a, b) => b.wr - a.wr || b.games - a.games).slice(0, 5);
  const worst = [...withWr].sort((a, b) => a.wr - b.wr || b.games - a.games).slice(0, 5);
  return {
    best: best.map(({ championId, games, wins }) => ({ championId, games, wins })),
    worst: worst.map(({ championId, games, wins }) => ({ championId, games, wins })),
  };
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
  championId: number,
  patch?: string,
  queue?: number,
  account?: string,
): ChampionMatchupRow[] {
  console.log("[db] getChampionMatchupList called:", { championId, patch, queue, account });

  const participant = participantFilter(patch, undefined, "owner");
  const ownerFilter =
    account === "all"
      ? "owner.puuid IN (SELECT puuid FROM summoner)"
      : account
        ? "owner.puuid = ?"
        : "owner.puuid = g.puuid";
  const where = [ownerFilter, participant.sql, "owner.champion_id = ?"];
  const params: any[] = [];
  if (account && account !== "all") params.push(account);
  params.push(...participant.params, championId);
  applyQueueFilter(where, params, queue, "g");

  const rows = db
    .prepare(`
      WITH matchup_rows AS (
        SELECT owner.game_id,
               enemy.champion_id AS championId,
               MAX(owner.win) AS wins,
               MAX(owner.kills) AS kills,
               MAX(owner.deaths) AS deaths,
               MAX(owner.assists) AS assists,
               MAX(owner.cs) AS cs,
               MAX(owner.gold_earned) AS goldEarned
        FROM match_participants owner
        JOIN games g ON g.game_id = owner.game_id
        JOIN match_participants enemy
          ON enemy.game_id = owner.game_id
         AND enemy.team_id != owner.team_id
        WHERE ${where.join(" AND ")}
          AND enemy.champion_id > 0
        GROUP BY owner.game_id, enemy.champion_id
      )
      SELECT championId,
             COUNT(*) AS games,
             COALESCE(SUM(wins), 0) AS wins,
             COALESCE(SUM(kills), 0) AS kills,
             COALESCE(SUM(deaths), 0) AS deaths,
             COALESCE(SUM(assists), 0) AS assists,
             COALESCE(SUM(cs), 0) AS cs,
             COALESCE(SUM(goldEarned), 0) AS goldEarned
      FROM matchup_rows
      GROUP BY championId
      HAVING games >= 1
      ORDER BY games DESC, championId ASC
    `)
    .all(...params) as ChampionMatchupRow[];

  console.log("[db] getChampionMatchupList done:", { count: rows.length });
  return rows;
}

export function getChampionAllyStats(
  championId: number,
  patch?: string,
  queue?: number,
  account?: string,
): ChampionAllyRow[] {
  console.log("[db] getChampionAllyStats called:", { championId, patch, queue, account });

  const participant = participantFilter(patch, undefined, "me");
  const ownerFilter =
    account === "all"
      ? "me.puuid IN (SELECT puuid FROM summoner)"
      : account
        ? "me.puuid = ?"
        : "me.puuid = g.puuid";
  const where = [ownerFilter, participant.sql, "me.champion_id = ?"];
  const params: any[] = [];
  if (account && account !== "all") params.push(account);
  params.push(...participant.params, championId);
  applyQueueFilter(where, params, queue, "g");

  const rows = db
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

  console.log("[db] getChampionAllyStats done:", { count: rows.length });
  return rows;
}

export function getChampionTeammateStats(
  championId: number,
  patch?: string,
  queue?: number,
  account?: string,
): ChampionTeammateRow[] {
  console.log("[db] getChampionTeammateStats called:", { championId, patch, queue, account });

  const participant = participantFilter(patch, undefined, "me");
  const ownerFilter =
    account === "all"
      ? "me.puuid IN (SELECT puuid FROM summoner)"
      : account
        ? "me.puuid = ?"
        : "me.puuid = g.puuid";
  const where = [
    ownerFilter,
    participant.sql,
    "me.champion_id = ?",
    "ally.puuid IS NOT NULL",
    "ally.puuid != ''",
    "(ally.puuid NOT IN (SELECT puuid FROM summoner))",
  ];
  const params: any[] = [];
  if (account && account !== "all") params.push(account);
  params.push(...participant.params, championId);
  applyQueueFilter(where, params, queue, "g");

  interface TeammateAggregate {
    name: string;
    profileIcon: number | null;
    games: number;
    wins: number;
    kills: number;
    deaths: number;
    assists: number;
    lastPlayed: number;
    gameIds: Set<number>;
    championGames: Map<number, Set<number>>;
  }

  const sourceRows = db
    .prepare(`
      WITH teammate_rows AS (
        SELECT me.game_id,
               g.game_creation,
               ally.puuid AS puuid,
               ally.game_name AS game_name,
               ally.tag_line AS tag_line,
               ally.profile_icon AS profile_icon,
               ally.champion_id AS champion_id,
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
        GROUP BY me.game_id, ally.puuid, ally.champion_id
      )
      SELECT game_id, game_creation, puuid, game_name, tag_line, profile_icon,
             champion_id, wins, kills, deaths, assists
      FROM teammate_rows
      ORDER BY game_creation DESC
    `)
    .all(...params) as Array<{
    game_id: number;
    game_creation: number;
    puuid: string;
    game_name: string | null;
    tag_line: string | null;
    profile_icon: number | null;
    champion_id: number;
    wins: number;
    kills: number;
    deaths: number;
    assists: number;
  }>;

  const aggregates = new Map<string, TeammateAggregate>();
  for (const row of sourceRows) {
    let aggregate = aggregates.get(row.puuid);
    if (!aggregate) {
      aggregate = {
        name: displayName(row.game_name, row.tag_line) ?? "Unknown teammate",
        profileIcon: row.profile_icon,
        games: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        lastPlayed: row.game_creation,
        gameIds: new Set(),
        championGames: new Map(),
      };
      aggregates.set(row.puuid, aggregate);
    }

    if (row.game_creation >= aggregate.lastPlayed) {
      aggregate.name = displayName(row.game_name, row.tag_line) ?? "Unknown teammate";
      if (row.profile_icon != null) aggregate.profileIcon = row.profile_icon;
      aggregate.lastPlayed = row.game_creation;
    }

    if (!aggregate.gameIds.has(row.game_id)) {
      aggregate.gameIds.add(row.game_id);
      aggregate.games++;
      if (row.wins) aggregate.wins++;
    }

    aggregate.kills += row.kills;
    aggregate.deaths += row.deaths;
    aggregate.assists += row.assists;

    let gamesForChampion = aggregate.championGames.get(row.champion_id);
    if (!gamesForChampion) {
      gamesForChampion = new Set();
      aggregate.championGames.set(row.champion_id, gamesForChampion);
    }
    gamesForChampion.add(row.game_id);
  }

  const rows = Array.from(aggregates.entries())
    .map(([puuid, aggregate]) => {
      const topChampionId =
        Array.from(aggregate.championGames.entries()).sort(
          (a, b) => b[1].size - a[1].size || a[0] - b[0],
        )[0]?.[0] ?? null;
      return {
        puuid,
        name: aggregate.name,
        profileIcon: aggregate.profileIcon,
        games: aggregate.games,
        wins: aggregate.wins,
        kills: aggregate.kills,
        deaths: aggregate.deaths,
        assists: aggregate.assists,
        topChampionId,
      };
    })
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));

  console.log("[db] getChampionTeammateStats done:", { count: rows.length });
  return rows;
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
  account?: string,
): { item_id: number; picks: number; wins: number }[] {
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
  const extraSql = extraWhere.length > 0 ? ` AND ${extraWhere.join(" AND ")}` : "";
  const itemCols = ["item0", "item1", "item2", "item3", "item4", "item5", "item6"];
  const excludedList = EXCLUDED_ITEM_IDS.join(", ");
  const subquery = (col: string) =>
    `SELECT ${source.alias}.${col} as item_id, ${source.alias}.win FROM ${source.table} ${source.alias} JOIN games g ON ${source.alias}.game_id = g.game_id WHERE ${source.alias}.champion_id = ? AND ${source.alias}.${col} IS NOT NULL AND ${source.alias}.${col} > 0 AND ${source.alias}.${col} NOT IN (${excludedList})${extraSql}`;
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
  account?: string,
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
  const accountSql = (alias: string) =>
    account && account !== "all"
      ? ` AND EXISTS (SELECT 1 FROM match_participants owner WHERE owner.game_id = ${alias}.game_id AND owner.puuid = ?)`
      : "";
  const mpSql = `${mp.sql}${accountSql("mp")}`;
  const mpaSql = `${mpa.sql}${accountSql("mpa")}`;
  const mpParams = account && account !== "all" ? [...mp.params, account] : mp.params;
  const mpaParams = account && account !== "all" ? [...mpa.params, account] : mpa.params;

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
      WHERE ${mpSql} AND mp.champion_id = ?
    `)
    .get(...mpParams, ...mpParams, championId) as any;

  const slots = db
    .prepare(`
      SELECT COUNT(*) as count
      FROM match_participants mp
      WHERE ${mpSql} AND mp.champion_id > 0
    `)
    .get(...mpParams) as { count: number };

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
                WHERE ${mpSql} AND mp.champion_id = ?
                  AND mp.item${i} > 0 AND mp.item${i} NOT IN (${excludedList})`,
          )
          .join("\n        UNION ALL\n        ")}
      )
      GROUP BY item_id
      ORDER BY picks DESC
    `)
    .all(...itemCols.flatMap(() => [...mpParams, championId])) as {
    item_id: number;
    picks: number;
    wins: number;
  }[];

  const augments = db
    .prepare(`
      SELECT mpa.augment_id, COUNT(*) as picks, SUM(mpa.win) as wins
      FROM match_participant_augments mpa
      WHERE ${mpaSql} AND mpa.champion_id = ?
      GROUP BY mpa.augment_id
      ORDER BY picks DESC
    `)
    .all(...mpaParams, championId) as {
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

export function getChampionDetailStats(
  championId: number,
  patch?: string,
  queue?: number | number[],
  account?: string,
): {
  games: number;
  killParticipation: number;
  damageShare: number;
  avgDamageTaken: number;
  avgHeal: number;
  avgPhysicalDamageDealt: number;
  maxPhysicalDamageDealt: number;
  totalPhysicalDamageDealt: number;
  avgMagicDamageDealt: number;
  maxMagicDamageDealt: number;
  totalMagicDamageDealt: number;
  avgPhysicalDamageTaken: number;
  maxPhysicalDamageTaken: number;
  totalPhysicalDamageTaken: number;
  avgMagicDamageTaken: number;
  maxMagicDamageTaken: number;
  totalMagicDamageTaken: number;
  avgTrueDamageTaken: number;
  maxTrueDamageTaken: number;
  totalTrueDamageTaken: number;
  avgDamageSelfMitigated: number;
  maxDamageSelfMitigated: number;
  totalDamageSelfMitigated: number;
  avgDamageToObjectives: number;
  maxDamageToObjectives: number;
  totalDamageToObjectives: number;
  avgDamageToTurrets: number;
  maxDamageToTurrets: number;
  totalDamageToTurrets: number;
  avgTimeCcOthers: number;
  maxTimeCcOthers: number;
  totalTimeCcOthers: number;
  avgTotalCcDealt: number;
  maxTotalCcDealt: number;
  totalTotalCcDealt: number;
  avgLongestAlive: number;
  maxLongestAlive: number;
  totalLongestAlive: number;
  avgKillingSprees: number;
  maxKillingSprees: number;
  totalKillingSprees: number;
  avgFirstBloodKill: number;
  maxFirstBloodKill: number;
  totalFirstBloodKill: number;
  avgFirstBloodAssist: number;
  maxFirstBloodAssist: number;
  totalFirstBloodAssist: number;
  avgCcPerMin: number;
  avgGoldSpent: number;
  maxGoldSpent: number;
  totalGoldSpent: number;
  maxChampLevel: number;
  avgTotalMinionsKilled: number;
  maxTotalMinionsKilled: number;
  totalTotalMinionsKilled: number;
  avgNeutralMinionsKilled: number;
  maxNeutralMinionsKilled: number;
  totalNeutralMinionsKilled: number;
  avgNeutralMinionsEnemyJungle: number;
  maxNeutralMinionsEnemyJungle: number;
  totalNeutralMinionsEnemyJungle: number;
  avgNeutralMinionsTeamJungle: number;
  maxNeutralMinionsTeamJungle: number;
  totalNeutralMinionsTeamJungle: number;
  avgTurretKills: number;
  maxTurretKills: number;
  totalTurretKills: number;
  avgInhibitorKills: number;
  maxInhibitorKills: number;
  totalInhibitorKills: number;
  avgTurretPlatesTaken: number;
  maxTurretPlatesTaken: number;
  totalTurretPlatesTaken: number;
  avgBaronKills: number;
  maxBaronKills: number;
  totalBaronKills: number;
  avgObjectivesStolen: number;
  maxObjectivesStolen: number;
  totalObjectivesStolen: number;
  avgObjectivesStolenAssists: number;
  maxObjectivesStolenAssists: number;
  totalObjectivesStolenAssists: number;
  totalFirstTowerKill: number;
  totalFirstTowerAssist: number;
  totalFirstInhibitorKill: number;
  totalFirstInhibitorAssist: number;
  goldPerMin: number;
  avgGameLength: number;
  totalTimePlayed: number;
  longestWinStreak: number;
  avgVisionScore: number;
  maxVisionScore: number;
  totalVisionScore: number;
  avgWardsPlaced: number;
  maxWardsPlaced: number;
  totalWardsPlaced: number;
  avgWardsKilled: number;
  maxWardsKilled: number;
  totalWardsKilled: number;
  avgVisionWardsBought: number;
  maxVisionWardsBought: number;
  totalVisionWardsBought: number;
  avgSightWardsBought: number;
  maxSightWardsBought: number;
  totalSightWardsBought: number;
} {
  const where: string[] = ["g.is_remake = 0", "g.source != 'search-import'"];
  const statsPlaceholders = NO_STATS_QUEUE_IDS.map(() => "?").join(",");
  const params: any[] = [];
  where.push(`g.queue_id NOT IN (${statsPlaceholders})`);
  params.push(...NO_STATS_QUEUE_IDS);

  if (patch) {
    where.push("g.game_version = ?");
    params.push(patch);
  }
  applyQueueFilter(where, params, queue, "g");

  if (account === "all") {
    where.push("mp.puuid IN (SELECT puuid FROM summoner)");
  } else if (account) {
    where.push("mp.puuid = ?");
    params.push(account);
  } else {
    where.push("mp.puuid = g.puuid");
  }

  const result = db
    .prepare(`
      WITH champion_rows AS (
        SELECT mp.game_id, mp.team_id, mp.win, mp.kills, mp.assists,
               mp.total_damage_dealt, mp.total_damage_taken, mp.total_heal,
               mp.physical_damage_dealt, mp.magic_damage_dealt,
               mp.physical_damage_taken, mp.magic_damage_taken,
               mp.true_damage_taken, mp.damage_self_mitigated,
               mp.damage_to_objectives, mp.damage_to_turrets,
               mp.time_cc_others, mp.total_cc_dealt, mp.longest_alive,
               mp.killing_sprees, mp.first_blood_kill, mp.first_blood_assist,
               mp.gold_spent, mp.champ_level, mp.total_minions_killed,
               mp.neutral_minions_killed, mp.neutral_minions_enemy_jungle,
               mp.neutral_minions_team_jungle, mp.turret_kills, mp.inhibitor_kills,
               mp.turret_plates_taken, mp.baron_kills, mp.objectives_stolen,
               mp.objectives_stolen_assists, mp.first_tower_kill, mp.first_tower_assist,
               mp.first_inhibitor_kill, mp.first_inhibitor_assist,
               mp.vision_score, mp.wards_placed, mp.wards_killed,
               mp.vision_wards_bought, mp.sight_wards_bought,
               mp.gold_earned, g.game_duration, g.game_creation
        FROM match_participants mp
        JOIN games g ON mp.game_id = g.game_id
        WHERE ${where.join(" AND ")} AND mp.champion_id = ?
      ),
      teams AS (
        SELECT mp.game_id, mp.team_id,
               SUM(mp.total_damage_dealt) AS team_damage,
               SUM(mp.kills) AS team_kills
        FROM match_participants mp
        WHERE mp.game_id IN (SELECT game_id FROM champion_rows)
        GROUP BY mp.game_id, mp.team_id
      ),
      ordered AS (
        SELECT win,
               ROW_NUMBER() OVER (ORDER BY game_creation ASC) AS rn_all,
               ROW_NUMBER() OVER (PARTITION BY win ORDER BY game_creation ASC) AS rn_win
        FROM champion_rows
      ),
      streaks AS (
        SELECT COUNT(*) AS len
        FROM ordered
        WHERE win = 1
        GROUP BY (rn_all - rn_win)
      )
      SELECT
        COUNT(*) AS games,
        AVG(CASE WHEN t.team_kills > 0
                 THEN (cr.kills + cr.assists) * 1.0 / t.team_kills END) AS killParticipation,
        AVG(CASE WHEN t.team_damage > 0
                 THEN cr.total_damage_dealt * 1.0 / t.team_damage END) AS damageShare,
        AVG(cr.total_damage_taken) AS avgDamageTaken,
        AVG(cr.total_heal) AS avgHeal,
        AVG(cr.physical_damage_dealt) AS avgPhysicalDamageDealt,
        MAX(cr.physical_damage_dealt) AS maxPhysicalDamageDealt,
        SUM(cr.physical_damage_dealt) AS totalPhysicalDamageDealt,
        AVG(cr.magic_damage_dealt) AS avgMagicDamageDealt,
        MAX(cr.magic_damage_dealt) AS maxMagicDamageDealt,
        SUM(cr.magic_damage_dealt) AS totalMagicDamageDealt,
        AVG(cr.physical_damage_taken) AS avgPhysicalDamageTaken,
        MAX(cr.physical_damage_taken) AS maxPhysicalDamageTaken,
        SUM(cr.physical_damage_taken) AS totalPhysicalDamageTaken,
        AVG(cr.magic_damage_taken) AS avgMagicDamageTaken,
        MAX(cr.magic_damage_taken) AS maxMagicDamageTaken,
        SUM(cr.magic_damage_taken) AS totalMagicDamageTaken,
        AVG(cr.true_damage_taken) AS avgTrueDamageTaken,
        MAX(cr.true_damage_taken) AS maxTrueDamageTaken,
        SUM(cr.true_damage_taken) AS totalTrueDamageTaken,
        AVG(cr.damage_self_mitigated) AS avgDamageSelfMitigated,
        MAX(cr.damage_self_mitigated) AS maxDamageSelfMitigated,
        SUM(cr.damage_self_mitigated) AS totalDamageSelfMitigated,
        AVG(cr.damage_to_objectives) AS avgDamageToObjectives,
        MAX(cr.damage_to_objectives) AS maxDamageToObjectives,
        SUM(cr.damage_to_objectives) AS totalDamageToObjectives,
        AVG(cr.damage_to_turrets) AS avgDamageToTurrets,
        MAX(cr.damage_to_turrets) AS maxDamageToTurrets,
        SUM(cr.damage_to_turrets) AS totalDamageToTurrets,
        AVG(cr.time_cc_others) AS avgTimeCcOthers,
        MAX(cr.time_cc_others) AS maxTimeCcOthers,
        SUM(cr.time_cc_others) AS totalTimeCcOthers,
        AVG(cr.total_cc_dealt) AS avgTotalCcDealt,
        MAX(cr.total_cc_dealt) AS maxTotalCcDealt,
        SUM(cr.total_cc_dealt) AS totalTotalCcDealt,
        AVG(cr.longest_alive) AS avgLongestAlive,
        MAX(cr.longest_alive) AS maxLongestAlive,
        SUM(cr.longest_alive) AS totalLongestAlive,
        AVG(cr.killing_sprees) AS avgKillingSprees,
        MAX(cr.killing_sprees) AS maxKillingSprees,
        SUM(cr.killing_sprees) AS totalKillingSprees,
        AVG(cr.first_blood_kill) AS avgFirstBloodKill,
        MAX(cr.first_blood_kill) AS maxFirstBloodKill,
        SUM(cr.first_blood_kill) AS totalFirstBloodKill,
        AVG(cr.first_blood_assist) AS avgFirstBloodAssist,
        MAX(cr.first_blood_assist) AS maxFirstBloodAssist,
        SUM(cr.first_blood_assist) AS totalFirstBloodAssist,
        AVG(cr.gold_spent) AS avgGoldSpent,
        MAX(cr.gold_spent) AS maxGoldSpent,
        SUM(cr.gold_spent) AS totalGoldSpent,
        MAX(cr.champ_level) AS maxChampLevel,
        AVG(cr.total_minions_killed) AS avgTotalMinionsKilled,
        MAX(cr.total_minions_killed) AS maxTotalMinionsKilled,
        SUM(cr.total_minions_killed) AS totalTotalMinionsKilled,
        AVG(cr.neutral_minions_killed) AS avgNeutralMinionsKilled,
        MAX(cr.neutral_minions_killed) AS maxNeutralMinionsKilled,
        SUM(cr.neutral_minions_killed) AS totalNeutralMinionsKilled,
        AVG(cr.neutral_minions_enemy_jungle) AS avgNeutralMinionsEnemyJungle,
        MAX(cr.neutral_minions_enemy_jungle) AS maxNeutralMinionsEnemyJungle,
        SUM(cr.neutral_minions_enemy_jungle) AS totalNeutralMinionsEnemyJungle,
        AVG(cr.neutral_minions_team_jungle) AS avgNeutralMinionsTeamJungle,
        MAX(cr.neutral_minions_team_jungle) AS maxNeutralMinionsTeamJungle,
        SUM(cr.neutral_minions_team_jungle) AS totalNeutralMinionsTeamJungle,
        AVG(cr.turret_kills) AS avgTurretKills,
        MAX(cr.turret_kills) AS maxTurretKills,
        SUM(cr.turret_kills) AS totalTurretKills,
        AVG(cr.inhibitor_kills) AS avgInhibitorKills,
        MAX(cr.inhibitor_kills) AS maxInhibitorKills,
        SUM(cr.inhibitor_kills) AS totalInhibitorKills,
        AVG(cr.turret_plates_taken) AS avgTurretPlatesTaken,
        MAX(cr.turret_plates_taken) AS maxTurretPlatesTaken,
        SUM(cr.turret_plates_taken) AS totalTurretPlatesTaken,
        AVG(cr.baron_kills) AS avgBaronKills,
        MAX(cr.baron_kills) AS maxBaronKills,
        SUM(cr.baron_kills) AS totalBaronKills,
        AVG(cr.objectives_stolen) AS avgObjectivesStolen,
        MAX(cr.objectives_stolen) AS maxObjectivesStolen,
        SUM(cr.objectives_stolen) AS totalObjectivesStolen,
        AVG(cr.objectives_stolen_assists) AS avgObjectivesStolenAssists,
        MAX(cr.objectives_stolen_assists) AS maxObjectivesStolenAssists,
        SUM(cr.objectives_stolen_assists) AS totalObjectivesStolenAssists,
        AVG(cr.vision_score) AS avgVisionScore,
        MAX(cr.vision_score) AS maxVisionScore,
        SUM(cr.vision_score) AS totalVisionScore,
        AVG(cr.wards_placed) AS avgWardsPlaced,
        MAX(cr.wards_placed) AS maxWardsPlaced,
        SUM(cr.wards_placed) AS totalWardsPlaced,
        AVG(cr.wards_killed) AS avgWardsKilled,
        MAX(cr.wards_killed) AS maxWardsKilled,
        SUM(cr.wards_killed) AS totalWardsKilled,
        AVG(cr.vision_wards_bought) AS avgVisionWardsBought,
        MAX(cr.vision_wards_bought) AS maxVisionWardsBought,
        SUM(cr.vision_wards_bought) AS totalVisionWardsBought,
        AVG(cr.sight_wards_bought) AS avgSightWardsBought,
        MAX(cr.sight_wards_bought) AS maxSightWardsBought,
        SUM(cr.sight_wards_bought) AS totalSightWardsBought,
        SUM(cr.first_tower_kill) AS totalFirstTowerKill,
        SUM(cr.first_tower_assist) AS totalFirstTowerAssist,
        SUM(cr.first_inhibitor_kill) AS totalFirstInhibitorKill,
        SUM(cr.first_inhibitor_assist) AS totalFirstInhibitorAssist,
        AVG(CASE WHEN cr.game_duration > 0
                 THEN cr.time_cc_others * 60.0 / cr.game_duration END) AS avgCcPerMin,
        AVG(CASE WHEN cr.game_duration >= 60
                 THEN cr.gold_earned * 60.0 / cr.game_duration END) AS goldPerMin,
        AVG(cr.game_duration) AS avgGameLength,
        SUM(cr.game_duration) AS totalTimePlayed,
        COALESCE((SELECT MAX(len) FROM streaks), 0) AS longestWinStreak
      FROM champion_rows cr
      JOIN teams t ON t.game_id = cr.game_id AND t.team_id = cr.team_id
    `)
    .get(...params, championId) as {
    games: number | null;
    killParticipation: number | null;
    damageShare: number | null;
    avgDamageTaken: number | null;
    avgHeal: number | null;
    avgPhysicalDamageDealt: number | null;
    maxPhysicalDamageDealt: number | null;
    totalPhysicalDamageDealt: number | null;
    avgMagicDamageDealt: number | null;
    maxMagicDamageDealt: number | null;
    totalMagicDamageDealt: number | null;
    avgPhysicalDamageTaken: number | null;
    maxPhysicalDamageTaken: number | null;
    totalPhysicalDamageTaken: number | null;
    avgMagicDamageTaken: number | null;
    maxMagicDamageTaken: number | null;
    totalMagicDamageTaken: number | null;
    avgTrueDamageTaken: number | null;
    maxTrueDamageTaken: number | null;
    totalTrueDamageTaken: number | null;
    avgDamageSelfMitigated: number | null;
    maxDamageSelfMitigated: number | null;
    totalDamageSelfMitigated: number | null;
    avgDamageToObjectives: number | null;
    maxDamageToObjectives: number | null;
    totalDamageToObjectives: number | null;
    avgDamageToTurrets: number | null;
    maxDamageToTurrets: number | null;
    totalDamageToTurrets: number | null;
    avgTimeCcOthers: number | null;
    maxTimeCcOthers: number | null;
    totalTimeCcOthers: number | null;
    avgTotalCcDealt: number | null;
    maxTotalCcDealt: number | null;
    totalTotalCcDealt: number | null;
    avgLongestAlive: number | null;
    maxLongestAlive: number | null;
    totalLongestAlive: number | null;
    avgKillingSprees: number | null;
    maxKillingSprees: number | null;
    totalKillingSprees: number | null;
    avgFirstBloodKill: number | null;
    maxFirstBloodKill: number | null;
    totalFirstBloodKill: number | null;
    avgFirstBloodAssist: number | null;
    maxFirstBloodAssist: number | null;
    totalFirstBloodAssist: number | null;
    avgGoldSpent: number | null;
    maxGoldSpent: number | null;
    totalGoldSpent: number | null;
    maxChampLevel: number | null;
    avgTotalMinionsKilled: number | null;
    maxTotalMinionsKilled: number | null;
    totalTotalMinionsKilled: number | null;
    avgNeutralMinionsKilled: number | null;
    maxNeutralMinionsKilled: number | null;
    totalNeutralMinionsKilled: number | null;
    avgNeutralMinionsEnemyJungle: number | null;
    maxNeutralMinionsEnemyJungle: number | null;
    totalNeutralMinionsEnemyJungle: number | null;
    avgNeutralMinionsTeamJungle: number | null;
    maxNeutralMinionsTeamJungle: number | null;
    totalNeutralMinionsTeamJungle: number | null;
    avgTurretKills: number | null;
    maxTurretKills: number | null;
    totalTurretKills: number | null;
    avgInhibitorKills: number | null;
    maxInhibitorKills: number | null;
    totalInhibitorKills: number | null;
    avgTurretPlatesTaken: number | null;
    maxTurretPlatesTaken: number | null;
    totalTurretPlatesTaken: number | null;
    avgBaronKills: number | null;
    maxBaronKills: number | null;
    totalBaronKills: number | null;
    avgObjectivesStolen: number | null;
    maxObjectivesStolen: number | null;
    totalObjectivesStolen: number | null;
    avgObjectivesStolenAssists: number | null;
    maxObjectivesStolenAssists: number | null;
    totalObjectivesStolenAssists: number | null;
    totalFirstTowerKill: number | null;
    totalFirstTowerAssist: number | null;
    totalFirstInhibitorKill: number | null;
    totalFirstInhibitorAssist: number | null;
    avgVisionScore: number | null;
    maxVisionScore: number | null;
    totalVisionScore: number | null;
    avgWardsPlaced: number | null;
    maxWardsPlaced: number | null;
    totalWardsPlaced: number | null;
    avgWardsKilled: number | null;
    maxWardsKilled: number | null;
    totalWardsKilled: number | null;
    avgVisionWardsBought: number | null;
    maxVisionWardsBought: number | null;
    totalVisionWardsBought: number | null;
    avgSightWardsBought: number | null;
    maxSightWardsBought: number | null;
    totalSightWardsBought: number | null;
    avgCcPerMin: number | null;
    goldPerMin: number | null;
    avgGameLength: number | null;
    totalTimePlayed: number | null;
    longestWinStreak: number | null;
  };

  return {
    games: result?.games ?? 0,
    killParticipation: result?.killParticipation ?? 0,
    damageShare: result?.damageShare ?? 0,
    avgDamageTaken: result?.avgDamageTaken ?? 0,
    avgHeal: result?.avgHeal ?? 0,
    avgPhysicalDamageDealt: result?.avgPhysicalDamageDealt ?? 0,
    maxPhysicalDamageDealt: result?.maxPhysicalDamageDealt ?? 0,
    totalPhysicalDamageDealt: result?.totalPhysicalDamageDealt ?? 0,
    avgMagicDamageDealt: result?.avgMagicDamageDealt ?? 0,
    maxMagicDamageDealt: result?.maxMagicDamageDealt ?? 0,
    totalMagicDamageDealt: result?.totalMagicDamageDealt ?? 0,
    avgPhysicalDamageTaken: result?.avgPhysicalDamageTaken ?? 0,
    maxPhysicalDamageTaken: result?.maxPhysicalDamageTaken ?? 0,
    totalPhysicalDamageTaken: result?.totalPhysicalDamageTaken ?? 0,
    avgMagicDamageTaken: result?.avgMagicDamageTaken ?? 0,
    maxMagicDamageTaken: result?.maxMagicDamageTaken ?? 0,
    totalMagicDamageTaken: result?.totalMagicDamageTaken ?? 0,
    avgTrueDamageTaken: result?.avgTrueDamageTaken ?? 0,
    maxTrueDamageTaken: result?.maxTrueDamageTaken ?? 0,
    totalTrueDamageTaken: result?.totalTrueDamageTaken ?? 0,
    avgDamageSelfMitigated: result?.avgDamageSelfMitigated ?? 0,
    maxDamageSelfMitigated: result?.maxDamageSelfMitigated ?? 0,
    totalDamageSelfMitigated: result?.totalDamageSelfMitigated ?? 0,
    avgDamageToObjectives: result?.avgDamageToObjectives ?? 0,
    maxDamageToObjectives: result?.maxDamageToObjectives ?? 0,
    totalDamageToObjectives: result?.totalDamageToObjectives ?? 0,
    avgDamageToTurrets: result?.avgDamageToTurrets ?? 0,
    maxDamageToTurrets: result?.maxDamageToTurrets ?? 0,
    totalDamageToTurrets: result?.totalDamageToTurrets ?? 0,
    avgTimeCcOthers: result?.avgTimeCcOthers ?? 0,
    maxTimeCcOthers: result?.maxTimeCcOthers ?? 0,
    totalTimeCcOthers: result?.totalTimeCcOthers ?? 0,
    avgTotalCcDealt: result?.avgTotalCcDealt ?? 0,
    maxTotalCcDealt: result?.maxTotalCcDealt ?? 0,
    totalTotalCcDealt: result?.totalTotalCcDealt ?? 0,
    avgLongestAlive: result?.avgLongestAlive ?? 0,
    maxLongestAlive: result?.maxLongestAlive ?? 0,
    totalLongestAlive: result?.totalLongestAlive ?? 0,
    avgKillingSprees: result?.avgKillingSprees ?? 0,
    maxKillingSprees: result?.maxKillingSprees ?? 0,
    totalKillingSprees: result?.totalKillingSprees ?? 0,
    avgFirstBloodKill: result?.avgFirstBloodKill ?? 0,
    maxFirstBloodKill: result?.maxFirstBloodKill ?? 0,
    totalFirstBloodKill: result?.totalFirstBloodKill ?? 0,
    avgFirstBloodAssist: result?.avgFirstBloodAssist ?? 0,
    maxFirstBloodAssist: result?.maxFirstBloodAssist ?? 0,
    totalFirstBloodAssist: result?.totalFirstBloodAssist ?? 0,
    avgGoldSpent: result?.avgGoldSpent ?? 0,
    maxGoldSpent: result?.maxGoldSpent ?? 0,
    totalGoldSpent: result?.totalGoldSpent ?? 0,
    maxChampLevel: result?.maxChampLevel ?? 0,
    avgTotalMinionsKilled: result?.avgTotalMinionsKilled ?? 0,
    maxTotalMinionsKilled: result?.maxTotalMinionsKilled ?? 0,
    totalTotalMinionsKilled: result?.totalTotalMinionsKilled ?? 0,
    avgNeutralMinionsKilled: result?.avgNeutralMinionsKilled ?? 0,
    maxNeutralMinionsKilled: result?.maxNeutralMinionsKilled ?? 0,
    totalNeutralMinionsKilled: result?.totalNeutralMinionsKilled ?? 0,
    avgNeutralMinionsEnemyJungle: result?.avgNeutralMinionsEnemyJungle ?? 0,
    maxNeutralMinionsEnemyJungle: result?.maxNeutralMinionsEnemyJungle ?? 0,
    totalNeutralMinionsEnemyJungle: result?.totalNeutralMinionsEnemyJungle ?? 0,
    avgNeutralMinionsTeamJungle: result?.avgNeutralMinionsTeamJungle ?? 0,
    maxNeutralMinionsTeamJungle: result?.maxNeutralMinionsTeamJungle ?? 0,
    totalNeutralMinionsTeamJungle: result?.totalNeutralMinionsTeamJungle ?? 0,
    avgTurretKills: result?.avgTurretKills ?? 0,
    maxTurretKills: result?.maxTurretKills ?? 0,
    totalTurretKills: result?.totalTurretKills ?? 0,
    avgInhibitorKills: result?.avgInhibitorKills ?? 0,
    maxInhibitorKills: result?.maxInhibitorKills ?? 0,
    totalInhibitorKills: result?.totalInhibitorKills ?? 0,
    avgTurretPlatesTaken: result?.avgTurretPlatesTaken ?? 0,
    maxTurretPlatesTaken: result?.maxTurretPlatesTaken ?? 0,
    totalTurretPlatesTaken: result?.totalTurretPlatesTaken ?? 0,
    avgBaronKills: result?.avgBaronKills ?? 0,
    maxBaronKills: result?.maxBaronKills ?? 0,
    totalBaronKills: result?.totalBaronKills ?? 0,
    avgObjectivesStolen: result?.avgObjectivesStolen ?? 0,
    maxObjectivesStolen: result?.maxObjectivesStolen ?? 0,
    totalObjectivesStolen: result?.totalObjectivesStolen ?? 0,
    avgObjectivesStolenAssists: result?.avgObjectivesStolenAssists ?? 0,
    maxObjectivesStolenAssists: result?.maxObjectivesStolenAssists ?? 0,
    totalObjectivesStolenAssists: result?.totalObjectivesStolenAssists ?? 0,
    totalFirstTowerKill: result?.totalFirstTowerKill ?? 0,
    totalFirstTowerAssist: result?.totalFirstTowerAssist ?? 0,
    totalFirstInhibitorKill: result?.totalFirstInhibitorKill ?? 0,
    totalFirstInhibitorAssist: result?.totalFirstInhibitorAssist ?? 0,
    avgVisionScore: result?.avgVisionScore ?? 0,
    maxVisionScore: result?.maxVisionScore ?? 0,
    totalVisionScore: result?.totalVisionScore ?? 0,
    avgWardsPlaced: result?.avgWardsPlaced ?? 0,
    maxWardsPlaced: result?.maxWardsPlaced ?? 0,
    totalWardsPlaced: result?.totalWardsPlaced ?? 0,
    avgWardsKilled: result?.avgWardsKilled ?? 0,
    maxWardsKilled: result?.maxWardsKilled ?? 0,
    totalWardsKilled: result?.totalWardsKilled ?? 0,
    avgVisionWardsBought: result?.avgVisionWardsBought ?? 0,
    maxVisionWardsBought: result?.maxVisionWardsBought ?? 0,
    totalVisionWardsBought: result?.totalVisionWardsBought ?? 0,
    avgSightWardsBought: result?.avgSightWardsBought ?? 0,
    maxSightWardsBought: result?.maxSightWardsBought ?? 0,
    totalSightWardsBought: result?.totalSightWardsBought ?? 0,
    avgCcPerMin: result?.avgCcPerMin ?? 0,
    goldPerMin: result?.goldPerMin ?? 0,
    avgGameLength: result?.avgGameLength ?? 0,
    totalTimePlayed: result?.totalTimePlayed ?? 0,
    longestWinStreak: result?.longestWinStreak ?? 0,
  };
}

export type { ChampionSkillOrder, ChampionSkillOrdersResult } from "../../shared/api";

export function getChampionSkillOrders(
  championId: number,
  patch?: string,
  queue?: number,
  account?: string,
): ChampionSkillOrdersResult {
  console.log("[db] getChampionSkillOrders called:", { championId, patch, queue, account });

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
  console.log("[db] getChampionSkillOrders done:", {
    topOrders: result.topOrders.length,
    summonerSpells: result.summonerSpells.length,
    gamesWithTimeline: result.timelineCoverage.gamesWithTimeline,
    totalGames: result.timelineCoverage.totalGames,
  });
  return result;
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

export function getChampionRecords(
  championId: number,
  patch?: string,
  queue?: number,
  account?: string,
): ChampionRecordsResult {
  console.log("[db] getChampionRecords called:", { championId, patch, queue, account });

  const source = statsSource(account);
  const participant = participantFilter(patch, undefined, "mp");
  const ownerPuuidSql = account ? "ps.puuid" : "g.puuid";
  const where = [
    source.accountFilter,
    participant.sql,
    "mp.champion_id = ?",
    `mp.puuid = ${ownerPuuidSql}`,
    "g.is_remake = 0",
  ];
  const params: any[] = [];
  if (account && account !== "all") params.push(account);
  params.push(...participant.params, championId);
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

  console.log("[db] getChampionRecords done:", { count: records.length });
  return { records };
}

export function getChampionTrendsData(
  championId: number,
  patch?: string,
  queue?: number,
  account?: string,
): ChampionTrendsData {
  console.log("[db] getChampionTrendsData called:", { championId, patch, queue, account });

  const source = statsSource(account);
  const participant = participantFilter(patch, undefined, "mp");
  const ownerPuuidSql = account ? "ps.puuid" : "g.puuid";
  const where = [
    source.accountFilter,
    participant.sql,
    "mp.champion_id = ?",
    `mp.puuid = ${ownerPuuidSql}`,
  ];
  const params: any[] = [];
  if (account && account !== "all") params.push(account);
  params.push(...participant.params, championId);
  applyQueueFilter(where, params, queue, "g");
  const whereSql = `WHERE ${where.join(" AND ")}`;
  const fromSql = `
    FROM games g
    JOIN match_participants mp ON mp.game_id = g.game_id
    JOIN ${source.table} ps ON ps.game_id = g.game_id
  `;

  const daily = db
    .prepare(`
      SELECT date(g.game_creation / 1000, 'unixepoch', 'localtime') as day,
             COUNT(*) as games,
             SUM(mp.win) as wins,
             SUM(mp.kills) as kills,
             SUM(mp.deaths) as deaths,
             SUM(mp.assists) as assists,
             SUM(ps.score) as score_sum,
             COUNT(ps.score) as scored_games,
             SUM(mp.cs) as cs_sum,
             SUM(mp.gold_earned) as gold_sum
      ${fromSql}
      ${whereSql}
      GROUP BY day
      ORDER BY day
    `)
    .all(...params) as ChampionTrendsDay[];

  const patches = db
    .prepare(`
      SELECT g.game_version as patch,
             COUNT(*) as games,
             SUM(mp.win) as wins,
             AVG(ps.score) as avg_score,
             MIN(g.game_creation) as first_played
      ${fromSql}
      ${whereSql} AND g.game_version IS NOT NULL AND g.game_version != ''
      GROUP BY g.game_version
      ORDER BY first_played
    `)
    .all(...params) as ChampionTrendsPatch[];

  const hours = db
    .prepare(`
      SELECT CAST(strftime('%H', g.game_creation / 1000, 'unixepoch', 'localtime') AS INTEGER) as hour,
             COUNT(*) as games,
             SUM(mp.win) as wins
      ${fromSql}
      ${whereSql}
      GROUP BY hour
      ORDER BY hour
    `)
    .all(...params) as ChampionTrendsHour[];

  const weekdays = db
    .prepare(`
      SELECT CAST(strftime('%w', g.game_creation / 1000, 'unixepoch', 'localtime') AS INTEGER) as weekday,
             COUNT(*) as games,
             SUM(mp.win) as wins
      ${fromSql}
      ${whereSql}
      GROUP BY weekday
      ORDER BY weekday
    `)
    .all(...params) as ChampionTrendsWeekday[];

  const result = { daily, patches, hours, weekdays };
  console.log("[db] getChampionTrendsData done:", {
    daily: daily.length,
    patches: patches.length,
    hours: hours.length,
    weekdays: weekdays.length,
  });
  return result;
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
