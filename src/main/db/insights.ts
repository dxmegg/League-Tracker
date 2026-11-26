import { db } from "../db";
import type { MatchInsights } from "../../shared/api";
import { cachedQuery } from "./cache";
import { applyQueueFilter, statsSource, EXCLUDED_STATS_SQL } from "./filters";

// Timeline frames come one a minute, so the frame index is the minute
const MINUTES = [5, 10, 15];

// Win rate by gold lead and CS pace out of the timelines, and the economy of every queue
export function getMatchInsights(queue?: number, account?: string): MatchInsights {
  return cachedQuery("getMatchInsights", [queue, account], 60_000, () => {
    const source = statsSource(account);
    const owner = account ? `${source.alias}.puuid` : "g.puuid";
    const where = ["g.is_remake = 0", source.accountFilter];
    const params: any[] = account && account !== "all" ? [account] : [];
    applyQueueFilter(where, params, queue);
    where.push(`g.queue_id NOT IN (${EXCLUDED_STATS_SQL})`);
    const from = `FROM games g JOIN ${source.table} ${source.alias} ON ${source.alias}.game_id = g.game_id`;

    // One row per game and minute: your team's gold minus the other team's, and your CS
    const frames = db
      .prepare(`
        SELECT me.win AS win, f.frame_index AS minute,
               SUM(CASE WHEN mp.team_id = me.team_id THEN f.gold ELSE -f.gold END) AS lead,
               SUM(CASE WHEN mp.participant_id = me.participant_id THEN f.cs END) AS cs
        ${from}
        JOIN match_participants me ON me.game_id = g.game_id AND me.puuid = ${owner}
        JOIN match_participants mp ON mp.game_id = g.game_id
        JOIN match_timeline_frames f
          ON f.game_id = g.game_id AND f.participant_id = mp.participant_id
        WHERE ${where.join(" AND ")} AND f.frame_index IN (${MINUTES.join(", ")})
          -- The last frame of a game that ended earlier carries the next minute's index
          AND f.timestamp_ms >= f.frame_index * 60000
        GROUP BY g.game_id, me.participant_id, f.frame_index
      `)
      .all(...params) as Array<{ win: number; minute: number; lead: number; cs: number | null }>;

    const leads = MINUTES.map((minute) => {
      const at = frames.filter((f) => f.minute === minute);
      const bucket = (label: string, min: number, max: number) => {
        const games = at.filter((f) => f.lead >= min && f.lead < max);
        return { label, games: games.length, wins: games.reduce((n, f) => n + f.win, 0) };
      };
      return {
        minute,
        games: at.length,
        avgCs: at.length ? at.reduce((n, f) => n + (f.cs ?? 0), 0) / at.length : null,
        buckets: [
          bucket("Behind by 2k or more", -Infinity, -2000),
          bucket("Behind by less than 2k", -2000, 0),
          bucket("Ahead by less than 2k", 0, 2000),
          bucket("Ahead by 2k or more", 2000, Infinity),
        ],
      };
    });

    const queues = db
      .prepare(`
        SELECT g.queue_id AS queueId, COUNT(*) AS games,
               SUM(me.gold_earned) * 60.0 / NULLIF(SUM(g.game_duration), 0) AS goldPerMin,
               SUM(me.cs) * 60.0 / NULLIF(SUM(g.game_duration), 0) AS csPerMin,
               AVG(me.damage_to_objectives) AS objectiveDamage,
               AVG(me.damage_to_turrets) AS turretDamage
        ${from}
        JOIN match_participants me ON me.game_id = g.game_id AND me.puuid = ${owner}
        WHERE ${where.join(" AND ")}
        GROUP BY g.queue_id
        ORDER BY games DESC
      `)
      .all(...params) as MatchInsights["queues"];

    return { leads, queues };
  });
}
