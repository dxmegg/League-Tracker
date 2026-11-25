import { db } from "../db";
import { applyQueueFilter, statsSource } from "./filters";
import { cachedQuery } from "./cache";
import type { AchievementTotals } from "../../shared/api";

// Lifetime numbers the Achievements tab grades against its tier thresholds
export function getAchievementTotals(queue?: number, account?: string): AchievementTotals {
  return cachedQuery("getAchievementTotals", [queue, account], 60_000, () => {
    const source = statsSource(account);
    const where = ["g.is_remake = 0", source.accountFilter];
    const params: unknown[] = account && account !== "all" ? [account] : [];
    applyQueueFilter(where, params, queue);
    const from = `FROM games g JOIN ${source.table} ps ON ps.game_id = g.game_id
      WHERE ${where.join(" AND ")}`;

    const totals = db
      .prepare(
        `SELECT
           COUNT(*) AS games,
           TOTAL(ps.win) AS wins,
           TOTAL(ps.kills) AS kills,
           TOTAL(ps.assists) AS assists,
           TOTAL(ps.deaths) AS deaths,
           TOTAL(ps.total_damage_dealt) AS damage,
           TOTAL(ps.total_damage_taken) AS damageTaken,
           TOTAL(ps.total_heal) AS healing,
           TOTAL(ps.gold_earned) AS gold,
           TOTAL(ps.cs) AS cs,
           TOTAL(g.game_duration) / 3600.0 AS hours,
           TOTAL(ps.double_kills) AS doubles,
           TOTAL(ps.triple_kills) AS triples,
           TOTAL(ps.quadra_kills) AS quadras,
           TOTAL(ps.penta_kills) AS pentas,
           COUNT(DISTINCT ps.champion_id) AS champions,
           COUNT(DISTINCT CASE WHEN ps.win = 1 THEN ps.champion_id END) AS championsWon,
           MAX(ps.kills) AS bestKills,
           MAX(ps.assists) AS bestAssists,
           MAX(ps.total_damage_dealt) AS bestDamage,
           MAX(ps.largest_killing_spree) AS bestSpree,
           MAX(ps.largest_critical_strike) AS bestCrit,
           TOTAL(ps.win = 1 AND ps.deaths = 0) AS deathlessWins,
           TOTAL(ps.score >= 9) AS greatScores,
           TOTAL(ps.score_badge = 'MVP') AS mvps,
           TOTAL(g.favorite) AS favorites
         ${from}`,
      )
      .get(...params) as Record<string, number | null>;

    let streak = 0;
    let bestStreak = 0;
    const results = db
      .prepare(`SELECT ps.win AS win ${from} ORDER BY g.game_creation`)
      .all(...params) as { win: number }[];
    for (const { win } of results) {
      streak = win ? streak + 1 : 0;
      bestStreak = Math.max(bestStreak, streak);
    }

    const mains = db
      .prepare(`SELECT COUNT(*) AS games ${from} GROUP BY ps.champion_id ORDER BY games DESC`)
      .all(...params) as { games: number }[];

    return {
      ...Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, value ?? 0])),
      bestStreak,
      mainGames: mains[0]?.games ?? 0,
      masteredChampions: mains.filter((row) => row.games >= 10).length,
    } as AchievementTotals;
  });
}
