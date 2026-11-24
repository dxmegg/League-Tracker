import { db } from "../db";
import type { LiveStatRecord } from "../../shared/api";

export interface LiveStatRecording {
  gameId: number;
  puuid: string;
  championId: number | null;
  championName: string;
  queueId: number | null;
  peaks: Record<string, number>;
  finals: Record<string, number>;
}

// Upserts, so the checkpoints taken during a game and the final write all land on the same rows
export function saveLiveStatPeaks(rec: LiveStatRecording): void {
  const stmt = db.prepare(`
    INSERT INTO live_stat_peaks
      (game_id, puuid, champion_id, champion_name, queue_id, stat, peak, final, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(game_id, puuid, stat) DO UPDATE SET
      champion_id = excluded.champion_id,
      champion_name = excluded.champion_name,
      queue_id = excluded.queue_id,
      peak = excluded.peak,
      final = excluded.final,
      recorded_at = excluded.recorded_at
  `);
  const now = Date.now();
  db.transaction(() => {
    for (const [stat, peak] of Object.entries(rec.peaks)) {
      stmt.run(
        rec.gameId,
        rec.puuid,
        rec.championId,
        rec.championName,
        rec.queueId,
        stat,
        peak,
        rec.finals[stat] ?? peak,
        now,
      );
    }
  })();
}

// The best value of every stat, with the game and champion it happened on. Filter to one champion to
// answer "most AP I ever had on Karthus", or to one stat for a single record.
export function getStatRecords(filters?: {
  championId?: number;
  stat?: string;
  queueId?: number;
}): LiveStatRecord[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filters?.championId != null) {
    where.push("champion_id = ?");
    params.push(filters.championId);
  }
  if (filters?.stat) {
    where.push("stat = ?");
    params.push(filters.stat);
  }
  if (filters?.queueId != null) {
    where.push("queue_id = ?");
    params.push(filters.queueId);
  }
  // With MAX() in the select list SQLite returns the other columns from the row that holds the maximum
  return db
    .prepare(
      `SELECT stat, MAX(peak) AS peak, game_id AS gameId, champion_id AS championId,
              champion_name AS championName, recorded_at AS recordedAt
       FROM live_stat_peaks
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       GROUP BY stat
       ORDER BY stat`,
    )
    .all(...params) as LiveStatRecord[];
}

// Every stat recorded for one game, for the post-game summary
export function getGameStatPeaks(gameId: number): Array<{
  stat: string;
  peak: number;
  final: number;
}> {
  return db
    .prepare("SELECT stat, peak, final FROM live_stat_peaks WHERE game_id = ? ORDER BY stat")
    .all(gameId) as Array<{ stat: string; peak: number; final: number }>;
}
