import { db } from "../../db";
import { cachedQuery } from "../cache";
import type { TrendsData } from "../../../shared/api";
import { ARENA_QUEUE_IDS, QUEUE_LABELS } from "../../../shared/queues";
import { applyQueueFilter, statsSource, EXCLUDED_STATS_SQL } from "../filters";

// Everything the Trends page draws, in one round trip. Days are the finest
// grain the page uses, so the renderer re-buckets them into weeks or months
// itself instead of asking again; patches and clock buckets can't be derived
// from days and come as their own aggregates. All local time — "games per day"
// means the player's day, not UTC's.
export function getTrendsData(
  queue?: number,
  account?: string,
  timePeriod: "4w" | "12w" | "6m" | "all" = "all",
  patch?: string,
): TrendsData {
  return cachedQuery("getTrendsData", [queue, account, timePeriod, patch], 60_000, () => {
    const source = statsSource(account);
    const where = ["g.is_remake = 0"];
    where.push(source.accountFilter);
    const baseParams: any[] = account && account !== "all" ? [account] : [];
    applyQueueFilter(where, baseParams, queue);
    where.push(`g.queue_id NOT IN (${EXCLUDED_STATS_SQL})`);
    if (patch !== undefined) {
      where.push("g.game_version = ?");
      baseParams.push(patch);
    }
    const baseWhere = [...where];
    const params = [...baseParams];
    const timeDays =
      timePeriod === "4w" ? 28 : timePeriod === "12w" ? 84 : timePeriod === "6m" ? 180 : null;
    if (timeDays !== null) {
      where.push("g.game_creation >= ?");
      params.push(Date.now() - timeDays * 86400000);
    }
    const whereSql = `WHERE ${where.join(" AND ")}`;
    const fromSql = `FROM games g JOIN ${source.table} ps ON g.game_id = ps.game_id`;
    const ownerPuuidSql = source.table === "tracked_game_stats" ? "ps.puuid" : "g.puuid";
    const roleFromSql = `${fromSql} JOIN match_participants mp
      ON mp.game_id = g.game_id AND mp.puuid = ${ownerPuuidSql}`;

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
             SUM(g.game_duration) as duration_sum,
             SUM(ps.score) as score_sum,
             COUNT(ps.score) as scored_games
      ${fromSql}
      ${whereSql}
      GROUP BY day
      ORDER BY day
    `)
      .all(...params) as TrendsData["daily"];

    const combatEconomyRow = db
      .prepare(`
      SELECT SUM(ps.total_damage_dealt) * 60.0 / MAX(SUM(g.game_duration), 1) as dpm,
             SUM(ps.gold_earned) * 60.0 / MAX(SUM(g.game_duration), 1) as gpm,
             SUM(ps.cs) * 60.0 / MAX(SUM(g.game_duration), 1) as cspm,
             AVG(mp.vision_score) as vision,
             (SUM(ps.kills) + SUM(ps.assists)) * 100.0 /
               MAX(SUM(team_kills.kills), 1) as killParticipation,
             AVG(ps.total_damage_taken) as damageTaken
      ${fromSql}
      JOIN match_participants mp
        ON mp.game_id = g.game_id AND mp.puuid = ${ownerPuuidSql}
      JOIN (
        SELECT game_id, team_id, SUM(kills) as kills
        FROM match_participants
        GROUP BY game_id, team_id
      ) team_kills
        ON team_kills.game_id = mp.game_id AND team_kills.team_id = mp.team_id
      ${whereSql}
    `)
      .get(...params) as TrendsData["combatEconomy"];

    const roleBreakdown = db
      .prepare(`
    WITH roles(role) AS (
      VALUES ('TOP'), ('JUNGLE'), ('MIDDLE'), ('BOTTOM'), ('SUPPORT')
    ),
    role_totals AS (
      SELECT CASE
               WHEN mp.team_position = 'UTILITY' THEN 'SUPPORT'
               ELSE mp.team_position
             END as role,
             COUNT(*) as games,
             SUM(ps.win) as wins
      ${roleFromSql}
      ${whereSql} AND mp.team_position IS NOT NULL AND mp.team_position != ''
      GROUP BY role
    )
    SELECT roles.role,
           COALESCE(role_totals.games, 0) as games,
           COALESCE(role_totals.wins, 0) as wins
    FROM roles
    LEFT JOIN role_totals ON role_totals.role = roles.role
    ORDER BY CASE roles.role
      WHEN 'TOP' THEN 1
      WHEN 'JUNGLE' THEN 2
      WHEN 'MIDDLE' THEN 3
      WHEN 'BOTTOM' THEN 4
      WHEN 'SUPPORT' THEN 5
    END
    `)
      .all(...params) as TrendsData["roleBreakdown"];

    const queueBreakdown = db
      .prepare(`
    SELECT g.queue_id as queueId,
           COUNT(*) as games,
           SUM(ps.win) as wins,
           SUM(ps.kills) as kills,
           SUM(ps.deaths) as deaths,
           SUM(ps.assists) as assists,
           AVG(g.game_duration) as avgDuration
    ${fromSql}
    ${whereSql}
    GROUP BY g.queue_id
    ORDER BY games DESC
    `)
      .all(...params) as TrendsData["queueBreakdown"];

    const recentSessionGames = db
      .prepare(`
    SELECT g.game_creation as date,
           g.queue_id as queueId,
           ps.win as win,
           ps.kills as kills,
           ps.deaths as deaths,
           ps.assists as assists
    ${fromSql}
    ${whereSql}
    ORDER BY g.game_creation DESC, g.game_id DESC
    LIMIT 100
    `)
      .all(...params) as Array<{
      date: number;
      queueId: number;
      win: number;
      kills: number;
      deaths: number;
      assists: number;
    }>;
    type RecentSessionGame = (typeof recentSessionGames)[number];
    type RecentSession = { games: RecentSessionGame[] };
    const sessionGroups: RecentSession[] = [];
    for (const game of [...recentSessionGames].reverse()) {
      const current = sessionGroups[sessionGroups.length - 1];
      const previousGame = current?.games[current.games.length - 1];
      if (!current || !previousGame || game.date - previousGame.date > 2 * 60 * 60 * 1000) {
        sessionGroups.push({ games: [game] });
      } else {
        current.games.push(game);
      }
    }
    const recentSessions: TrendsData["recentSessions"] = sessionGroups
      .reverse()
      .slice(0, 5)
      .map((session) => {
        const queueCounts = new Map<number, number>();
        let wins = 0;
        let kills = 0;
        let deaths = 0;
        let assists = 0;
        for (const game of session.games) {
          queueCounts.set(game.queueId, (queueCounts.get(game.queueId) ?? 0) + 1);
          wins += game.win;
          kills += game.kills;
          deaths += game.deaths;
          assists += game.assists;
        }
        const queueId = [...queueCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        const queueName =
          queueId != null && ARENA_QUEUE_IDS.includes(queueId)
            ? "Arena"
            : queueId != null
              ? (QUEUE_LABELS[queueId] ?? `Queue ${queueId}`)
              : "Unknown";
        return {
          date: session.games[0].date,
          queueName,
          games: session.games.length,
          wins,
          avgKda: (kills + assists) / Math.max(deaths, 1),
        };
      });

    const damageSplitRow = db
      .prepare(`
    SELECT COALESCE(SUM(mp.physical_damage_dealt), 0) as physical,
           COALESCE(SUM(mp.magic_damage_dealt), 0) as magic,
           COALESCE(SUM(mp.true_damage_dealt), 0) as trueDamage
    ${roleFromSql}
    ${whereSql}
    `)
      .get(...params) as {
      physical: number;
      magic: number;
      trueDamage: number;
    };

    const objectiveRows = db
      .prepare(`
    SELECT ps.win as win,
           COALESCE(AVG(mt.dragon_kills), 0) as dragons,
           COALESCE(AVG(mt.baron_kills), 0) as barons,
           COALESCE(AVG(mt.tower_kills), 0) as towers
    ${roleFromSql}
    JOIN match_teams mt ON mt.game_id = g.game_id AND mt.team_id = mp.team_id
    ${whereSql}
    GROUP BY ps.win
    `)
      .all(...params) as Array<{
      win: number;
      dragons: number;
      barons: number;
      towers: number;
    }>;
    const objectiveRow = (win: number) => objectiveRows.find((row) => row.win === win);
    const objectiveControl: TrendsData["objectiveControl"] = {
      dragons: {
        win: objectiveRow(1)?.dragons ?? 0,
        loss: objectiveRow(0)?.dragons ?? 0,
      },
      barons: {
        win: objectiveRow(1)?.barons ?? 0,
        loss: objectiveRow(0)?.barons ?? 0,
      },
      towers: {
        win: objectiveRow(1)?.towers ?? 0,
        loss: objectiveRow(0)?.towers ?? 0,
      },
    };

    const topDuos = db
      .prepare(`
    SELECT teammate.puuid as puuid,
           COALESCE(MAX(account.game_name), MAX(teammate.game_name), 'Unknown') as gameName,
           COALESCE(MAX(account.tag_line), MAX(teammate.tag_line), '') as tagLine,
           COALESCE(MAX(account.profile_icon), MAX(teammate.profile_icon)) as profileIcon,
           COUNT(DISTINCT g.game_id) as games,
           COUNT(DISTINCT CASE WHEN ps.win = 1 THEN g.game_id END) as wins,
           COUNT(DISTINCT CASE WHEN ps.win = 1 THEN g.game_id END) * 100.0 /
             COUNT(DISTINCT g.game_id) as winRate
    ${roleFromSql}
    JOIN match_participants teammate
      ON teammate.game_id = g.game_id
     AND teammate.team_id = mp.team_id
     AND teammate.puuid IS NOT NULL
     AND teammate.puuid != mp.puuid
    LEFT JOIN summoner account ON account.puuid = teammate.puuid
    ${whereSql}
    -- One row per player: a changed icon or name must not split them in two
    GROUP BY teammate.puuid
    ORDER BY games DESC, winRate DESC
    LIMIT 6
    `)
      .all(...params) as TrendsData["topDuos"];

    const championTop = db
      .prepare(`
    SELECT ps.champion_id as championId,
           COUNT(*) as games,
           SUM(ps.win) as wins,
           SUM(ps.kills) as kills,
           SUM(ps.deaths) as deaths,
           SUM(ps.assists) as assists
    ${fromSql}
    ${whereSql}
    GROUP BY ps.champion_id
    HAVING COUNT(*) >= 10
    ORDER BY (SUM(ps.win) * 1.0 / COUNT(*)) DESC
    LIMIT 6
    `)
      .all(...params) as TrendsData["championTop"];

    const championMost = db
      .prepare(`
    SELECT ps.champion_id as championId,
           COUNT(*) as games,
           SUM(ps.win) as wins,
           SUM(ps.kills) as kills,
           SUM(ps.deaths) as deaths,
           SUM(ps.assists) as assists
    ${fromSql}
    ${whereSql}
    GROUP BY ps.champion_id
    ORDER BY games DESC
    LIMIT 6
    `)
      .all(...params) as TrendsData["championTop"];

    // One compact row per game; the renderer derives session, length and rolling figures
    const timeline = db
      .prepare(`
      SELECT ${ownerPuuidSql} as owner, g.game_creation as time, g.game_duration as duration,
             ps.win as win
      ${fromSql}
      ${whereSql}
      ORDER BY g.game_creation, g.game_id
    `)
      .all(...params) as TrendsData["timeline"];

    // The same length of time right before the selected one; "all" has nothing before it
    const previous =
      timeDays === null
        ? null
        : (db
            .prepare(`
      SELECT COUNT(*) as games, TOTAL(ps.win) as wins, TOTAL(ps.kills) as kills,
             TOTAL(ps.deaths) as deaths, TOTAL(ps.assists) as assists,
             AVG(ps.score) as score
      ${fromSql}
      WHERE ${baseWhere.join(" AND ")} AND g.game_creation >= ? AND g.game_creation < ?
    `)
            .get(
              ...baseParams,
              Date.now() - 2 * timeDays * 86400000,
              Date.now() - timeDays * 86400000,
            ) as TrendsData["previous"]);

    const dayHourMatrix = db
      .prepare(`
    SELECT CAST(strftime('%w', g.game_creation / 1000, 'unixepoch', 'localtime') AS INTEGER) as weekday,
           CAST(strftime('%H', g.game_creation / 1000, 'unixepoch', 'localtime') AS INTEGER) as hour,
           COUNT(*) as games,
           SUM(ps.win) as wins
    ${fromSql}
    ${whereSql}
    GROUP BY weekday, hour
    ORDER BY weekday, hour
    `)
      .all(...params) as TrendsData["dayHourMatrix"];

    const now = Date.now();
    const windowMs =
      (timePeriod === "4w" ? 28 : timePeriod === "12w" ? 84 : timePeriod === "6m" ? 180 : 180) *
      86400000;
    const recentCutoff = now - windowMs;
    const previousCutoff = now - 2 * windowMs;
    const comparisonRow = db
      .prepare(`
      SELECT
        SUM(CASE WHEN g.game_creation >= ? THEN ps.win ELSE 0 END) as recentWins,
        SUM(CASE WHEN g.game_creation >= ? THEN 1 ELSE 0 END) as recentGames,
        SUM(CASE WHEN g.game_creation >= ? AND g.game_creation < ? THEN ps.win ELSE 0 END) as previousWins,
        SUM(CASE WHEN g.game_creation >= ? AND g.game_creation < ? THEN 1 ELSE 0 END) as previousGames
      ${fromSql}
      WHERE ${baseWhere.join(" AND ")} AND g.game_creation >= ?
    `)
      .get(
        recentCutoff,
        recentCutoff,
        previousCutoff,
        recentCutoff,
        previousCutoff,
        recentCutoff,
        ...baseParams,
        previousCutoff,
      ) as {
      recentWins: number | null;
      recentGames: number | null;
      previousWins: number | null;
      previousGames: number | null;
    };

    const orderedGames = db
      .prepare(`
      SELECT ps.win as win
      ${fromSql}
      ${whereSql}
      ORDER BY g.game_creation ASC, g.game_id ASC
    `)
      .all(...params) as { win: number }[];
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let currentWinStreak = 0;
    let currentLossStreak = 0;
    for (const game of orderedGames) {
      if (game.win === 1) {
        currentWinStreak++;
        currentLossStreak = 0;
        maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
      } else {
        currentLossStreak++;
        currentWinStreak = 0;
        maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
      }
    }

    const last20Rows = db
      .prepare(`
      SELECT ps.win as win, ps.kills as kills, ps.deaths as deaths, ps.assists as assists
      ${fromSql}
      WHERE ${baseWhere.join(" AND ")}
      ORDER BY g.game_creation DESC, g.game_id DESC
      LIMIT 20
    `)
      .all(...baseParams) as {
      win: number;
      kills: number;
      deaths: number;
      assists: number;
    }[];
    const last20AvgKda =
      last20Rows.reduce((sum, game) => sum + game.kills + game.assists, 0) /
      Math.max(
        last20Rows.reduce((sum, game) => sum + game.deaths, 0),
        1,
      );
    const last20Games = last20Rows.reverse().map((game) => game.win === 1);

    const peakWindow = Array.from({ length: 24 }, (_, startHour) => {
      const nextHour = (startHour + 1) % 24;
      const first = dayHourMatrix.filter((cell) => cell.hour === startHour);
      const second = dayHourMatrix.filter((cell) => cell.hour === nextHour);
      const games = [...first, ...second].reduce((sum, cell) => sum + cell.games, 0);
      const wins = [...first, ...second].reduce((sum, cell) => sum + cell.wins, 0);
      return {
        startHour,
        endHour: (startHour + 2) % 24,
        games,
        wr: games > 0 ? (wins / games) * 100 : 0,
      };
    })
      .filter((window) => window.games >= 3)
      .sort((a, b) => b.wr - a.wr || b.games - a.games)[0];

    const winningConditionsRow = db
      .prepare(`
      SELECT
        SUM(CASE WHEN (
          mp.first_blood_kill = 1 OR mp.first_blood_assist = 1 OR EXISTS (
            SELECT 1 FROM match_participants team_mp
            WHERE team_mp.game_id = g.game_id
              AND team_mp.team_id = mp.team_id
              AND team_mp.first_blood_kill = 1
          )
        ) THEN ps.win ELSE 0 END) * 100.0 /
          NULLIF(SUM(CASE WHEN (
            mp.first_blood_kill = 1 OR mp.first_blood_assist = 1 OR EXISTS (
              SELECT 1 FROM match_participants team_mp
              WHERE team_mp.game_id = g.game_id
                AND team_mp.team_id = mp.team_id
                AND team_mp.first_blood_kill = 1
            )
          ) THEN 1 ELSE 0 END), 0) as firstBloodWr,
        SUM(CASE WHEN (ps.kills + ps.assists) * 1.0 / MAX(ps.deaths, 1) > 3 THEN ps.win ELSE 0 END) * 100.0 /
          NULLIF(SUM(CASE WHEN (ps.kills + ps.assists) * 1.0 / MAX(ps.deaths, 1) > 3 THEN 1 ELSE 0 END), 0) as kda3Wr,
        SUM(CASE WHEN ps.score >= 7 THEN ps.win ELSE 0 END) * 100.0 /
          NULLIF(SUM(CASE WHEN ps.score >= 7 THEN 1 ELSE 0 END), 0) as score7Wr
      ${roleFromSql}
      ${whereSql}
    `)
      .get(...params) as TrendsData["winningConditions"];

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
      .all(...params) as TrendsData["patches"];

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
      .all(...params) as TrendsData["hours"];

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
      .all(...params) as TrendsData["weekdays"];

    const weekdayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const bestWeekday = weekdays
      .filter((day) => day.games >= 3)
      .map((day) => ({
        day: weekdayNames[day.weekday] ?? "Unknown",
        wr: (day.wins / day.games) * 100,
        games: day.games,
      }))
      .sort((a, b) => b.wr - a.wr || b.games - a.games)[0];

    const peakKdaGame = db
      .prepare(`
      SELECT ps.kills as kills, ps.deaths as deaths, ps.assists as assists
      ${fromSql}
      ${whereSql}
      ORDER BY (ps.kills + ps.assists) * 1.0 / MAX(ps.deaths, 1) DESC, g.game_creation ASC
      LIMIT 1
    `)
      .get(...params) as TrendsData["summaryStats"]["peakKdaGame"];

    const summaryRow = db
      .prepare(`
      SELECT
        COUNT(*) as totalGames,
        MAX(g.game_creation) as lastPlayed,
        100.0 * COUNT(CASE WHEN (ps.kills + ps.assists) / MAX(ps.deaths, 1) > 3 THEN 1 END) / NULLIF(COUNT(*), 0) as kdaOver3Percent
      ${fromSql}
      ${whereSql}
    `)
      .get(...params) as {
      totalGames: number;
      lastPlayed: number | null;
      kdaOver3Percent: number | null;
    };

    const streakRows = db
      .prepare(`
      SELECT ps.win as win
      ${fromSql}
      ${whereSql}
      ORDER BY g.game_creation DESC, g.game_id DESC
    `)
      .all(...params) as { win: number }[];
    let currentWlStreak = "—";
    let currentStreak: TrendsData["streaks"]["currentStreak"] = { type: null, count: 0 };
    if (streakRows.length > 0) {
      const firstResult: "W" | "L" = streakRows[0].win === 1 ? "W" : "L";
      let streakLength = 0;
      for (const row of streakRows) {
        if ((row.win === 1 ? "W" : "L") !== firstResult) break;
        streakLength++;
      }
      currentStreak = { type: firstResult, count: streakLength };
      currentWlStreak = `${firstResult}${streakLength}`;
    }

    const totalGames = daily.reduce((sum, row) => sum + row.games, 0);
    const totalKills = daily.reduce((sum, row) => sum + row.kills, 0);
    const totalDeaths = daily.reduce((sum, row) => sum + row.deaths, 0);
    const totalAssists = daily.reduce((sum, row) => sum + row.assists, 0);
    const mostActive = daily.reduce<TrendsData["daily"][number] | null>(
      (best, row) => (!best || row.games > best.games ? row : best),
      null,
    );
    let longestActiveStreak = 0;
    let activeStreak = 0;
    let previousDay: Date | null = null;
    for (const row of daily) {
      const day = new Date(`${row.day}T00:00:00`);
      if (previousDay && day.getTime() - previousDay.getTime() === 86400000) activeStreak++;
      else activeStreak = 1;
      longestActiveStreak = Math.max(longestActiveStreak, activeStreak);
      previousDay = day;
    }
    const weeklyGames = new Map<string, { games: number; wins: number }>();
    for (const row of daily) {
      const weekStart = new Date(`${row.day}T00:00:00`);
      weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
      const weekKey = [
        weekStart.getFullYear(),
        String(weekStart.getMonth() + 1).padStart(2, "0"),
        String(weekStart.getDate()).padStart(2, "0"),
      ].join("-");
      const bucket = weeklyGames.get(weekKey) ?? { games: 0, wins: 0 };
      bucket.games += row.games;
      bucket.wins += row.wins;
      weeklyGames.set(weekKey, bucket);
    }
    const qualifiedWeekly = [...weeklyGames.values()].filter((row) => row.games >= 3);
    const weeklyWinRates = qualifiedWeekly.map((row) => (row.wins / row.games) * 100);
    const kdaForRows = (rows: TrendsData["daily"]): number => {
      const kills = rows.reduce((sum, row) => sum + row.kills, 0);
      const deaths = rows.reduce((sum, row) => sum + row.deaths, 0);
      const assists = rows.reduce((sum, row) => sum + row.assists, 0);
      return (kills + assists) / Math.max(deaths, 1);
    };
    const midpoint = Math.ceil(daily.length / 2);
    const firstHalf = daily.slice(0, midpoint);
    const secondHalf = daily.slice(midpoint);
    const mostActiveDay = mostActive
      ? new Date(`${mostActive.day}T00:00:00`).toLocaleDateString(undefined, { weekday: "long" })
      : "—";
    const avgKdaAll = (totalKills + totalAssists) / Math.max(totalDeaths, 1);
    const summaryStats: TrendsData["summaryStats"] = {
      avgKills: totalGames > 0 ? totalKills / totalGames : 0,
      avgDeaths: totalGames > 0 ? totalDeaths / totalGames : 0,
      avgAssists: totalGames > 0 ? totalAssists / totalGames : 0,
      peakKdaGame: peakKdaGame ?? null,
      totalGames,
      mostActiveDay,
      longestActiveStreak,
      lastPlayed: summaryRow.lastPlayed ?? 0,
      peakWr: weeklyWinRates.length > 0 ? Math.max(...weeklyWinRates) : 0,
      lowestWr: weeklyWinRates.length > 0 ? Math.min(...weeklyWinRates) : 0,
      currentWlStreak,
      avgKdaAll,
      kdaOver3Percent: summaryRow.kdaOver3Percent ?? 0,
      trend30dKda:
        firstHalf.length > 0 && secondHalf.length > 0
          ? kdaForRows(secondHalf) - kdaForRows(firstHalf)
          : 0,
      trendKdaAll:
        firstHalf.length > 0 && secondHalf.length > 0
          ? kdaForRows(secondHalf) - kdaForRows(firstHalf)
          : 0,
    };

    const insights: TrendsData["insights"] = {
      winRateDiff:
        comparisonRow.recentGames && comparisonRow.previousGames
          ? (comparisonRow.recentWins! / comparisonRow.recentGames) * 100 -
            (comparisonRow.previousWins! / comparisonRow.previousGames) * 100
          : 0,
      bestDay: bestWeekday ? { day: bestWeekday.day, wr: bestWeekday.wr } : null,
      peakWindow: peakWindow
        ? { startHour: peakWindow.startHour, endHour: peakWindow.endHour, wr: peakWindow.wr }
        : null,
    };
    const streaks: TrendsData["streaks"] = {
      maxWinStreak,
      maxLossStreak,
      avgSessionKda: avgKdaAll,
      last20Games,
      last20AvgKda,
      currentStreak,
    };

    return {
      daily,
      summaryStats,
      patches,
      hours,
      weekdays,
      roleBreakdown,
      queueBreakdown,
      championTop,
      championMost,
      timeline,
      previous,
      dayHourMatrix,
      insights,
      streaks,
      winningConditions: {
        firstBloodWr: winningConditionsRow?.firstBloodWr ?? null,
        kda3Wr: winningConditionsRow?.kda3Wr ?? null,
        score7Wr: winningConditionsRow?.score7Wr ?? null,
      },
      recentSessions,
      damageSplit: {
        physical: damageSplitRow?.physical ?? 0,
        magic: damageSplitRow?.magic ?? 0,
        true: damageSplitRow?.trueDamage ?? 0,
      },
      objectiveControl,
      topDuos,
      combatEconomy: {
        dpm: combatEconomyRow?.dpm ?? 0,
        gpm: combatEconomyRow?.gpm ?? 0,
        cspm: combatEconomyRow?.cspm ?? 0,
        vision: combatEconomyRow?.vision ?? 0,
        killParticipation: combatEconomyRow?.killParticipation ?? 0,
        damageTaken: combatEconomyRow?.damageTaken ?? 0,
      },
    };
  });
}
