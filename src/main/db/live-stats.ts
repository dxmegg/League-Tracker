import { gunzipSync, gzipSync } from "node:zlib";
import { db } from "../db";
import type { LiveStatRecord, StoredLiveBody, StoredLiveGame } from "../../shared/api";

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

// One row per game, overwritten by every checkpoint so the last write is the final state
export function saveLiveGameData(
  gameId: number,
  puuid: string,
  data: StoredLiveBody,
): void {
  const payload = gzipSync(JSON.stringify(data));
  db.prepare(
    `INSERT INTO live_game_data (game_id, puuid, duration_s, payload, recorded_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(game_id, puuid) DO UPDATE SET
       duration_s = excluded.duration_s,
       payload = excluded.payload,
       recorded_at = excluded.recorded_at`,
  ).run(gameId, puuid, Math.round(data.snapshot.game?.timeSec ?? 0), payload, Date.now());
}

export function getLiveGameData(gameId: number): StoredLiveGame | null {
  const row = db
    .prepare(
      "SELECT duration_s, payload, recorded_at FROM live_game_data WHERE game_id = ? ORDER BY recorded_at DESC LIMIT 1",
    )
    .get(gameId) as { duration_s: number; payload: Buffer; recorded_at: number } | undefined;
  if (!row) return null;
  const data = JSON.parse(gunzipSync(row.payload).toString("utf8")) as StoredLiveBody;
  return { ...data, gameId, durationSec: row.duration_s, recordedAt: row.recorded_at };
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
