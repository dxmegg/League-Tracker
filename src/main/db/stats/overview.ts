import { db } from "../../db";
import { cachedQuery } from "../cache";
import { NO_STATS_QUEUE_IDS } from "../../../shared/queues";
import type { OtherPlayersStats, RecordsData, StatRecord } from "../../../shared/api";
import { ARENA_QUEUE_IDS, QUEUE_LABELS } from "../../../shared/queues";
import {
  applyQueueFilter,
  applyTimeFilter,
  participantFilter,
  statsSource,
  EXCLUDED_ITEM_IDS,
  EXCLUDED_STATS_SQL,
  EXCLUDED_CS_SQL,
} from "../filters";
import { TRINKET_ITEM_IDS } from "./items";

export interface ActivityHeatmapDay {
  day: string;
  games: number;
}

// The period picks how coarse a heatmap tile is, so it also picks how far back the
// rows must reach: 26 weeks of days or weeks, or 24 months of tiles. 24h shows 24
// hourly tiles, so it gets two days to cover a partly elapsed first hour.
const HEATMAP_WINDOW_DAYS = { "24h": 2, "7d": 182, "30d": 760, full: 182 } as const;

export function getActivityHeatmap(
  account?: string,
  timePeriod?: "24h" | "7d" | "30d" | "full",
  queue?: number,
): ActivityHeatmapDay[] {
  console.log("[db] getActivityHeatmap called:", { account, timePeriod, queue });
  const statsPlaceholders = NO_STATS_QUEUE_IDS.map(() => "?").join(",");
  const where = [
    "g.is_remake = 0",
    "g.source != 'search-import'",
    `g.queue_id NOT IN (${statsPlaceholders})`,
    "g.game_creation >= ?",
  ];
  const windowDays = HEATMAP_WINDOW_DAYS[timePeriod ?? "7d"];
  const params: any[] = [...NO_STATS_QUEUE_IDS, Date.now() - windowDays * 24 * 60 * 60 * 1000];

  if (account === "all") {
    where.push("mp.puuid IN (SELECT puuid FROM visible_summoner)");
  } else if (account) {
    where.push("mp.puuid = ?");
    params.push(account);
  } else {
    where.push("mp.puuid = g.puuid");
  }
  // Only when a queue is chosen: with none, applyQueueFilter would also drop hidden queues and change the unfiltered counts.
  if (queue != null) applyQueueFilter(where, params, queue);

  // Hourly tiles are bucketed in the renderer's local time, so 24h returns one
  // ISO timestamp per game instead of UTC-day counts.
  const hourly = timePeriod === "24h";
  const rows = db
    .prepare(`
      SELECT ${
        hourly
          ? "strftime('%Y-%m-%dT%H:%M:%SZ', g.game_creation / 1000, 'unixepoch') AS day, 1 AS games"
          : "strftime('%Y-%m-%d', g.game_creation / 1000, 'unixepoch') AS day, COUNT(*) AS games"
      }
      FROM match_participants mp
      JOIN games g ON g.game_id = mp.game_id
      WHERE ${where.join(" AND ")}
      ${hourly ? "ORDER BY g.game_creation ASC" : "GROUP BY day ORDER BY day ASC"}
    `)
    .all(...params) as ActivityHeatmapDay[];
  console.log("[db] getActivityHeatmap done:", { count: rows.length });
  return rows;
}

// What everyone else in the user's games picked and built. Every saved account counts as "the user",
// matched by Riot ID too because the client and the Riot API can give one account different ids.
export function getOtherPlayersStats(queue?: number): OtherPlayersStats {
  return cachedQuery("getOtherPlayersStats", [queue], 60_000, () => {
    const filter = participantFilter(undefined, queue, "mp");
    const others = `
      WITH others AS MATERIALIZED (
        SELECT mp.* FROM match_participants mp
        WHERE ${filter.sql}
          AND NOT EXISTS (
            SELECT 1 FROM summoner s
            WHERE s.puuid = mp.puuid
               OR (LOWER(s.game_name) = LOWER(mp.game_name) AND LOWER(s.tag_line) = LOWER(mp.tag_line))
          )
      )`;
    const rows = (select: string) =>
      db.prepare(`${others} ${select}`).all(...filter.params) as OtherPlayersStats["champions"];
    const skippedItems = [...EXCLUDED_ITEM_IDS, ...TRINKET_ITEM_IDS].join(", ");
    return {
      champions: rows(`
        SELECT champion_id AS id, COUNT(*) AS count, SUM(win) AS wins
        FROM others WHERE champion_id > 0 GROUP BY champion_id`),
      augments: rows(`
        SELECT a.augment_id AS id, COUNT(*) AS count, SUM(a.win) AS wins
        FROM others o
        JOIN match_participant_augments a
          ON a.game_id = o.game_id AND a.participant_id = o.participant_id
        WHERE a.augment_id > 0 GROUP BY a.augment_id`),
      items: rows(`
        SELECT id, COUNT(*) AS count, SUM(win) AS wins FROM (
          ${[0, 1, 2, 3, 4, 5, 6].map((i) => `SELECT game_id, participant_id, item${i} AS id, win FROM others`).join(" UNION ")}
        )
        WHERE id > 0 AND id NOT IN (${skippedItems})
        GROUP BY id`),
    };
  });
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
           SUM(g.game_duration) as totalTimeSeconds,
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
           AVG(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) AND ps.win = 1 THEN ps.score END) as avgScoreWins,
           AVG(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) AND ps.win = 0 THEN ps.score END) as avgScoreLosses,
           -- score_raw is the unrounded, unclamped value; ps.score is rounded to 0.1 and held to 1..10
           MAX(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN COALESCE(ps.score_raw, ps.score) END) as bestScore,
           MIN(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN COALESCE(ps.score_raw, ps.score) END) as worstScore,
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

  // Remakes stay out of every stat; they are only counted so the page can say how many there were
  const remakes = (
    db
      .prepare(`
    SELECT COUNT(*) as n
    FROM ${source.table} ${source.alias}
    JOIN games g ON ${source.alias}.game_id = g.game_id
    ${whereSql.replace("g.is_remake = 0", "g.is_remake = 1")}
  `)
      .get(...queryParams) as { n: number }
  ).n;

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

  const recentStreakRows = db
    .prepare(`
    SELECT ps.win
    FROM games g
    JOIN ${source.table} ${source.alias} ON g.game_id = ${source.alias}.game_id
    ${whereSql}
    ORDER BY g.game_creation DESC
    LIMIT 10
  `)
    .all(...queryParams) as Array<{ win: number }>;
  let recentStreak = 0;
  if (recentStreakRows.length > 0) {
    const direction = recentStreakRows[0].win === 1 ? 1 : -1;
    let count = 0;
    for (const row of recentStreakRows) {
      if ((row.win === 1 ? 1 : -1) !== direction) break;
      count++;
    }
    recentStreak = direction * count;
  }

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
    LIMIT 20
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
  // Five champions with the most of each multikill
  const mkRows = db
    .prepare(`
    SELECT ps.champion_id,
           SUM(ps.double_kills) as d, SUM(ps.triple_kills) as t,
           SUM(ps.quadra_kills) as q, SUM(ps.penta_kills) as p
    FROM ${source.table} ${source.alias}
    JOIN games g ON ${source.alias}.game_id = g.game_id
    ${whereSql} AND g.queue_id NOT IN (${EXCLUDED_STATS_SQL})
    GROUP BY ps.champion_id
  `)
    .all(...queryParams) as Array<{
    champion_id: number;
    d: number;
    t: number;
    q: number;
    p: number;
  }>;
  const topFor = (col: "d" | "t" | "q" | "p") =>
    mkRows
      .filter((r) => r[col] > 0)
      .sort((a, b) => b[col] - a[col])
      .slice(0, 8)
      .map((r) => ({ champion_id: r.champion_id, count: r[col] }));

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

  // Share of the team's kills and champion damage, averaged per game. The owner row is found by puuid,
  // and a game with no team kills or damage is skipped rather than counted as 0%.
  const share = db
    .prepare(`
  SELECT
    AVG((owner.kills + owner.assists) * 1.0 / NULLIF(t.kills, 0)) AS kp,
    AVG(owner.total_damage_dealt * 1.0 / NULLIF(t.dmg, 0)) AS dmgShare
  FROM games g
  JOIN ${source.table} ${source.alias} ON g.game_id = ${source.alias}.game_id
  JOIN match_participants owner
    ON owner.game_id = g.game_id AND owner.puuid = ${filters?.account ? "ps.puuid" : "g.puuid"}
  JOIN (
    SELECT game_id, team_id, SUM(kills) AS kills, SUM(total_damage_dealt) AS dmg
    FROM match_participants
    GROUP BY game_id, team_id
  ) t ON t.game_id = owner.game_id AND t.team_id = owner.team_id
  ${whereSql} AND g.queue_id NOT IN (${EXCLUDED_STATS_SQL})
  `)
    .get(...queryParams) as { kp: number | null; dmgShare: number | null } | undefined;

  const longestGame = db
    .prepare(`
  SELECT MAX(g.game_duration) AS longest
  FROM ${source.table} ${source.alias}
  JOIN games g ON ${source.alias}.game_id = g.game_id
  ${whereSql} AND g.queue_id NOT IN (${EXCLUDED_STATS_SQL})
  `)
    .get(...queryParams) as { longest: number | null } | undefined;

  // Deaths per game over the period against the period before it ("full" compares the last 30 days)
  const spanDays = timePeriod === "24h" ? 1 : timePeriod === "7d" ? 7 : 30;
  const spanMs = spanDays * 24 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const deathsIn = (from: number, to: number): number | null =>
    (
      db
        .prepare(`
    SELECT AVG(ps.deaths) AS d
    FROM ${source.table} ${source.alias}
    JOIN games g ON ${source.alias}.game_id = g.game_id
    WHERE ${where.join(" AND ")} AND g.queue_id NOT IN (${EXCLUDED_STATS_SQL})
      AND g.game_creation >= ? AND g.game_creation < ?
  `)
        .get(...params, from, to) as { d: number | null }
    ).d;
  const deathsTrend = {
    current: deathsIn(nowMs - spanMs, nowMs + 1),
    previous: deathsIn(nowMs - 2 * spanMs, nowMs - spanMs),
  };
  return {
    totalGames: totals.totalGames ?? 0,
    remakes,
    totalDuration: totals.totalDuration ?? 0,
    totalTimeSeconds: totals.totalTimeSeconds ?? 0,
    recentStreak,
    statsEligibleDuration: totals.statsEligibleDuration ?? 0,
    statsEligibleGames: totals.statsEligibleGames ?? 0,
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
    avgScoreWins: totals.avgScoreWins ?? null,
    avgScoreLosses: totals.avgScoreLosses ?? null,
    bestScore: totals.bestScore ?? null,
    worstScore: totals.worstScore ?? null,
    killParticipation: share?.kp ?? null,
    damageShare: share?.dmgShare ?? null,
    longestGameSeconds: longestGame?.longest ?? null,
    deathsTrend,
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
      topChampions: {
        double: topFor("d"),
        triple: topFor("t"),
        quadra: topFor("q"),
        penta: topFor("p"),
      },
    },
    topAugments,
  };
}

// The trophy case: best single-game marks and longest streaks, from one
// chronological pass over our own rows — streaks need the ordering anyway, and
// the maxima fall out of the same loop. On ties the earliest game keeps the
// record, so a mark has to be strictly beaten to change hands.
export function getRecords(
  queue?: number | number[],
  account?: string,
  timePeriod?: "24h" | "7d" | "30d" | "full",
): RecordsData {
  return cachedQuery(
    "getRecords",
    [Array.isArray(queue) ? queue.join(",") : queue, account, timePeriod],
    30_000,
    () => {
      if (account === undefined) account = "all";
      const source = statsSource(account);
      const where = ["g.is_remake = 0"];
      where.push(source.accountFilter);
      const params: any[] = account && account !== "all" ? [account] : [];
      applyQueueFilter(where, params, queue);
      const timeFilter = applyTimeFilter(timePeriod);

      const rows = db
        .prepare(`
      SELECT g.game_id, g.game_creation, g.game_duration, g.queue_id,
             ps.puuid,
             ps.champion_id, ps.win, ps.kills, ps.deaths, ps.assists,
             ps.total_damage_dealt, ps.total_damage_taken,
             ps.gold_earned, ps.total_heal, ps.largest_killing_spree, ps.score, ps.score_raw,
             ps.total_damage_dealt_all, ps.true_damage_dealt, ps.cs, ps.largest_critical_strike,
             ps.double_kills, ps.triple_kills, ps.quadra_kills, ps.penta_kills,
             mp.vision_score, mp.wards_placed, mp.damage_to_turrets, mp.damage_to_objectives,
             mp.pentakill_time, mp.turret_kills, mp.time_cc_others,
             mp.damage_self_mitigated, mp.longest_alive, mp.wards_killed
      FROM games g
      JOIN ${source.table} ps ON g.game_id = ps.game_id
      LEFT JOIN match_participants mp ON mp.game_id = ps.game_id AND mp.puuid = ps.puuid
      WHERE ${where.join(" AND ")} ${timeFilter.sql}
      ORDER BY ps.puuid ASC, g.game_creation ASC, g.game_id ASC
    `)
        .all(...params, ...timeFilter.params) as any[];

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

      const bests: RecordsData["bests"] = {
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
      const track = (
        key: keyof RecordsData["bests"],
        value: number | null,
        row: any,
        better = higher,
        perfect = false,
      ) => {
        if (value == null) return;
        const current = bests[key];
        if (!current || better(value, current.value)) {
          bests[key] = { value, match: matchOf(row), ...(perfect ? { perfect: true } : {}) };
        }
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
      let visionScore: StatRecord | undefined;
      let wardsPlaced: StatRecord | undefined;
      let turretDamage: StatRecord | undefined;
      let objectiveDamage: StatRecord | undefined;
      let fastestPentakill: StatRecord | undefined;
      let goldPerMinute: StatRecord | undefined;
      let damagePerGold: StatRecord | undefined;
      let turretKills: StatRecord | undefined;
      let ccTime: StatRecord | undefined;
      let flawlessAce: StatRecord | undefined;
      const extras: Record<string, StatRecord> = {};
      const trackNamed = (
        into: Record<string, StatRecord>,
        key: string,
        value: number | null,
        row: any,
      ) => {
        const next = trackExtra(into[key], value, row);
        if (next) into[key] = next;
      };
      // Peaks recorded by the live tab, matched to the filtered rows below so the account, queue and
      // remake filters apply to them too
      const peaksByRow = new Map<string, Array<{ stat: string; peak: number }>>();
      for (const p of db
        .prepare("SELECT game_id, puuid, stat, peak FROM live_stat_peaks")
        .all() as Array<{ game_id: number; puuid: string; stat: string; peak: number }>) {
        const key = `${p.game_id}:${p.puuid}`;
        const list = peaksByRow.get(key);
        if (list) list.push(p);
        else peaksByRow.set(key, [p]);
      }
      const rawStats: Record<string, StatRecord> = {};
      let bestScoreRaw = -Infinity;
      let bestDeathlessRaw = -Infinity;
      const multikillTotals = {
        doubles: 0,
        triples: 0,
        quadras: 0,
        pentakills: 0,
      };
      const topDamageGames: NonNullable<RecordsData["topDamageGames"]> = [];
      type QueueRecord = NonNullable<RecordsData["bestByQueue"]>[number];
      interface QueueState {
        queueLabel: string;
        queueIds: number[];
        mostKills: StatRecord | null;
        highestKda: StatRecord | null;
        mostDamage: StatRecord | null;
        currentWinStreak: { count: number; start: number; end: number; puuid: string } | null;
        bestWinStreak: { count: number; start: number; end: number };
      }
      const queueStates = new Map<string, QueueState>();
      const milestones: NonNullable<RecordsData["milestones"]> = [];
      let cumulativeKills = 0;
      let cumulativeWins = 0;
      let trackedGames = 0;
      let pentakillCount = 0;
      let hasMarathonGame = false;
      let untouchableWins = 0;
      const championWins = new Map<number, number>();
      const queueKey = (queueId: number) =>
        ARENA_QUEUE_IDS.includes(queueId) ? "arena" : String(queueId);
      const queueStateFor = (row: any): QueueState => {
        const key = queueKey(row.queue_id);
        const current = queueStates.get(key);
        if (current) return current;
        const state: QueueState = {
          queueLabel:
            key === "arena" ? "Arena" : (QUEUE_LABELS[row.queue_id] ?? `Queue ${row.queue_id}`),
          queueIds: key === "arena" ? [...ARENA_QUEUE_IDS] : [row.queue_id],
          mostKills: null,
          highestKda: null,
          mostDamage: null,
          currentWinStreak: null,
          bestWinStreak: { count: 0, start: 0, end: 0 },
        };
        queueStates.set(key, state);
        return state;
      };
      const trackExtra = (
        current: StatRecord | undefined,
        value: number | null,
        row: any,
        better = higher,
      ): StatRecord | undefined => {
        if (value == null || (current && !better(value, current.value))) return current;
        return { value, match: matchOf(row) };
      };

      for (const r of rows) {
        if (NO_STATS_QUEUE_IDS.includes(r.queue_id)) continue;
        track("kills", r.kills, r);
        track("deaths", r.deaths, r);
        track("assists", r.assists, r);
        // Deathless games rank by kills+assists rather than dividing by zero; the
        // renderer still labels them "Perfect"
        track("kda", (r.kills + r.assists) / Math.max(r.deaths, 1), r, higher, r.deaths === 0);
        if (r.score_raw != null && r.score_raw > bestScoreRaw) {
          bestScoreRaw = r.score_raw;
          bests.score = { value: r.score, match: matchOf(r) };
        }
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
        pentakillCount += r.penta_kills ?? 0;
        hasMarathonGame ||= r.game_duration >= 55 * 60;
        if (r.win && r.deaths === 0) untouchableWins++;
        if (r.win) championWins.set(r.champion_id, (championWins.get(r.champion_id) ?? 0) + 1);
        multikillTotals.doubles += r.double_kills ?? 0;
        multikillTotals.triples += r.triple_kills ?? 0;
        multikillTotals.quadras += r.quadra_kills ?? 0;
        multikillTotals.pentakills += r.penta_kills ?? 0;
        visionScore = trackExtra(visionScore, r.vision_score, r);
        trackNamed(extras, "takedowns", r.kills + r.assists, r);
        trackNamed(extras, "doubleKills", r.double_kills, r);
        trackNamed(extras, "tripleKills", r.triple_kills, r);
        trackNamed(extras, "quadraKills", r.quadra_kills, r);
        trackNamed(extras, "pentaKills", r.penta_kills, r);
        trackNamed(extras, "selfMitigated", r.damage_self_mitigated, r);
        trackNamed(extras, "longestAlive", r.longest_alive, r);
        trackNamed(extras, "wardsKilled", r.wards_killed, r);
        if (r.game_duration >= 300) {
          const minutes = r.game_duration / 60;
          trackNamed(extras, "damagePerMinute", r.total_damage_dealt / minutes, r);
          trackNamed(extras, "takenPerMinute", r.total_damage_taken / minutes, r);
        }
        for (const p of peaksByRow.get(`${r.game_id}:${r.puuid}`) ?? []) {
          trackNamed(rawStats, p.stat, p.peak, r);
        }
        // Rates need a real game: a few seconds would post absurd numbers
        if (r.game_duration >= 300) {
          goldPerMinute = trackExtra(goldPerMinute, r.gold_earned / (r.game_duration / 60), r);
          if (r.gold_earned > 0) {
            damagePerGold = trackExtra(damagePerGold, r.total_damage_dealt / r.gold_earned, r);
          }
        }
        turretKills = trackExtra(turretKills, r.turret_kills, r);
        ccTime = trackExtra(ccTime, r.time_cc_others, r);
        wardsPlaced = trackExtra(wardsPlaced, r.wards_placed, r);
        turretDamage = trackExtra(turretDamage, r.damage_to_turrets, r);
        objectiveDamage = trackExtra(objectiveDamage, r.damage_to_objectives, r);
        if (r.penta_kills >= 1 && r.pentakill_time != null) {
          fastestPentakill = trackExtra(fastestPentakill, r.pentakill_time, r, lower);
        }
        if (!r.win && r.deaths === 0 && r.score_raw != null && r.score_raw > bestDeathlessRaw) {
          bestDeathlessRaw = r.score_raw;
          flawlessAce = { value: r.score, match: matchOf(r) };
        }
        topDamageGames.push({
          gameId: String(r.game_id),
          championId: r.champion_id,
          damage: r.total_damage_dealt,
          win: Boolean(r.win),
          gameCreation: r.game_creation,
        });

        const queueState = queueStateFor(r);
        queueState.mostKills = trackExtra(queueState.mostKills ?? undefined, r.kills, r) ?? null;
        queueState.highestKda =
          trackExtra(
            queueState.highestKda ?? undefined,
            (r.kills + r.assists) / Math.max(r.deaths, 1),
            r,
          ) ?? null;
        queueState.mostDamage =
          trackExtra(queueState.mostDamage ?? undefined, r.total_damage_dealt, r) ?? null;
        if (
          !queueState.currentWinStreak ||
          queueState.currentWinStreak.puuid !== r.puuid ||
          !r.win
        ) {
          queueState.currentWinStreak = r.win
            ? { count: 1, start: r.game_creation, end: r.game_creation, puuid: r.puuid }
            : null;
        } else {
          queueState.currentWinStreak.count++;
          queueState.currentWinStreak.end = r.game_creation;
        }
        if (
          queueState.currentWinStreak &&
          queueState.currentWinStreak.count > queueState.bestWinStreak.count
        ) {
          queueState.bestWinStreak = {
            count: queueState.currentWinStreak.count,
            start: queueState.currentWinStreak.start,
            end: queueState.currentWinStreak.end,
          };
        }

        trackedGames++;
        cumulativeKills += r.kills;
        cumulativeWins += Number(r.win);
        const milestoneContext = {
          championId: r.champion_id,
          gameCreation: r.game_creation,
          gameId: String(r.game_id),
        };
        if (r.win && !milestones.some((milestone) => milestone.key === "firstWin")) {
          milestones.push({
            key: "firstWin",
            label: "Game #1 — first ever tracked win",
            ...milestoneContext,
          });
        }
        if (
          r.penta_kills >= 1 &&
          !milestones.some((milestone) => milestone.key === "firstPentakill")
        ) {
          milestones.push({
            key: "firstPentakill",
            label: "First pentakill",
            ...milestoneContext,
          });
        }
        if (
          cumulativeKills >= 1000 &&
          !milestones.some((milestone) => milestone.key === "kill1000")
        ) {
          milestones.push({
            key: "kill1000",
            label: "1 000th career kill",
            value: cumulativeKills,
            ...milestoneContext,
          });
        }
        if (
          cumulativeWins >= 1000 &&
          !milestones.some((milestone) => milestone.key === "win1000")
        ) {
          milestones.push({
            key: "win1000",
            label: "Win #1 000",
            value: cumulativeWins,
            ...milestoneContext,
          });
        }
        if (trackedGames === 2000) {
          milestones.push({
            key: "game2000",
            label: "Game #2 000",
            ...milestoneContext,
          });
        }

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

      topDamageGames.sort((a, b) => b.damage - a.damage);
      if (winStreak) {
        milestones.push({
          key: "longestWinStreak",
          label: `Longest win streak — ${winStreak.length} games`,
          championId: winStreak.match.champion_id,
          gameCreation: winStreak.end,
          gameId: String(winStreak.match.game_id),
          value: winStreak.length,
        });
      }
      const bestByQueue: NonNullable<RecordsData["bestByQueue"]> = [...queueStates.values()]
        .filter(
          (
            state,
          ): state is QueueState & {
            mostKills: StatRecord;
            highestKda: StatRecord;
            mostDamage: StatRecord;
          } => state.mostKills !== null && state.highestKda !== null && state.mostDamage !== null,
        )
        .map(
          (state): QueueRecord => ({
            queueLabel: state.queueLabel,
            queueIds: state.queueIds,
            mostKills: state.mostKills,
            highestKda: state.highestKda,
            mostDamage: state.mostDamage,
            bestWinStreak: state.bestWinStreak,
          }),
        );
      const recentlyBrokenCandidates: NonNullable<RecordsData["recentlyBroken"]> = [];
      const addRecent = (key: string, label: string, record: StatRecord | null | undefined) => {
        if (record) {
          recentlyBrokenCandidates.push({
            key,
            label,
            value: record.value,
            gameCreation: record.match.game_creation,
            gameId: String(record.match.game_id),
          });
        }
      };
      addRecent("kills", "Most kills", bests.kills);
      addRecent("deaths", "Most deaths", bests.deaths);
      addRecent("assists", "Most assists", bests.assists);
      addRecent("kda", "Best KDA", bests.kda);
      addRecent("score", "Highest score", bests.score);
      addRecent("killingSpree", "Longest killing spree", bests.killingSpree);
      addRecent("damage", "Most damage dealt", bests.damage);
      addRecent("damageTaken", "Most damage taken", bests.damageTaken);
      addRecent("totalDamage", "Most total damage", bests.totalDamage);
      addRecent("trueDamage", "Most true damage", bests.trueDamage);
      addRecent("cs", "Most CS", bests.cs);
      addRecent("csPerMinute", "Best CS/min", bests.csPerMinute);
      addRecent("healing", "Most healing", bests.healing);
      addRecent("gold", "Most gold earned", bests.gold);
      addRecent("fastestWin", "Fastest win", bests.fastestWin);
      addRecent("fastestLoss", "Fastest loss", bests.fastestLoss);
      addRecent("longestGame", "Longest game", bests.longestGame);
      addRecent("criticalStrike", "Biggest crit", bests.criticalStrike);
      addRecent("visionScore", "Highest vision score", visionScore);
      addRecent("goldPerMinute", "Best gold/min", goldPerMinute);
      addRecent("damagePerGold", "Best damage per gold", damagePerGold);
      addRecent("turretKills", "Most turrets destroyed", turretKills);
      addRecent("ccTime", "Most crowd control", ccTime);
      addRecent("wardsPlaced", "Most wards placed", wardsPlaced);
      addRecent("turretDamage", "Most turret damage", turretDamage);
      addRecent("objectiveDamage", "Most objective damage", objectiveDamage);
      addRecent("fastestPentakill", "Fastest pentakill", fastestPentakill);
      addRecent("flawlessAce", "Flawless ace", flawlessAce);
      addRecent("takedowns", "Most takedowns", extras.takedowns);
      addRecent("damagePerMinute", "Best damage/min", extras.damagePerMinute);
      addRecent("selfMitigated", "Most damage mitigated", extras.selfMitigated);
      if (winStreak) {
        recentlyBrokenCandidates.push({
          key: "winStreak",
          label: "Longest win streak",
          value: winStreak.length,
          gameCreation: winStreak.end,
          gameId: String(winStreak.match.game_id),
        });
      }
      if (lossStreak && lossStreak.length > 1) {
        recentlyBrokenCandidates.push({
          key: "lossStreak",
          label: "Longest loss streak",
          value: lossStreak.length,
          gameCreation: lossStreak.end,
          gameId: String(lossStreak.match.game_id),
        });
      }
      recentlyBrokenCandidates.sort((a, b) => b.gameCreation - a.gameCreation);
      const longestChampionWinCount = Math.max(0, ...championWins.values());
      const achievements: NonNullable<RecordsData["achievements"]> = [
        {
          key: "pentakillHunter",
          label: "Pentakill Hunter",
          description: "Score 10 pentakills",
          current: pentakillCount,
          target: 10,
          unlocked: pentakillCount >= 10,
        },
        {
          key: "marathonRunner",
          label: "Marathon Runner",
          description: "Play a game lasting 55+ minutes",
          current: hasMarathonGame ? 1 : 0,
          target: 1,
          unlocked: hasMarathonGame,
        },
        {
          key: "untouchable",
          label: "Untouchable",
          description: "Win 25 games without dying",
          current: untouchableWins,
          target: 25,
          unlocked: untouchableWins >= 25,
        },
        {
          key: "hotStreak",
          label: "Hot Streak",
          description: "Win 12 games in a row",
          current: winStreak?.length ?? 0,
          target: 12,
          unlocked: (winStreak?.length ?? 0) >= 12,
        },
        {
          key: "centurion",
          label: "Centurion",
          description: "Win 100 games with one champion",
          current: longestChampionWinCount,
          target: 100,
          unlocked: longestChampionWinCount >= 100,
        },
        {
          key: "thousandClub",
          label: "Thousand Club",
          description: "Record 1,000 games",
          current: rows.length,
          target: 1000,
          unlocked: rows.length >= 1000,
        },
      ];
      return {
        totalGames: rows.length,
        bests,
        multikillTotals,
        recentlyBroken: recentlyBrokenCandidates.slice(0, 5),
        achievements,
        winStreak,
        lossStreak,
        visionScore,
        goldPerMinute,
        damagePerGold,
        turretKills,
        ccTime,
        wardsPlaced,
        turretDamage,
        objectiveDamage,
        fastestPentakill,
        flawlessAce,
        extras,
        rawStats,
        topDamageGames: topDamageGames.slice(0, 5),
        bestByQueue,
        milestones,
      };
    },
  );
}
