import zlib from "zlib";
import type { TimelineData, TimelineEvent, TimelineFrame, TimelineStatus } from "../../shared/api";
import { MAYHEM_QUEUE_IDS, QUEUE_ID_CUSTOM, TUTORIAL_QUEUE_IDS } from "../../shared/queues";
import { parseTimeline, type ParsedTimeline } from "../timeline";
import { acquireRequestSlot, fetchMatchTimeline, RiotApiError } from "../riot-api";
import { db } from "../db";

export interface BackfillProgress {
  current: number;
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  currentGameId: string | null;
}

export interface BackfillResult extends BackfillProgress {
  cancelled: boolean;
}

const TIMELINE_EXCLUDED_QUEUE_IDS = new Set([
  ...MAYHEM_QUEUE_IDS,
  QUEUE_ID_CUSTOM,
  ...TUTORIAL_QUEUE_IDS,
]);

export function isTimelineSkippedQueue(queueId: number): boolean {
  return TIMELINE_EXCLUDED_QUEUE_IDS.has(queueId);
}

export async function fetchAndStoreTimeline(gameId: number, platform?: string): Promise<void> {
  console.log("[db] fetchAndStoreTimeline called:", { gameId, platform });
  try {
    await acquireRequestSlot();
    const resolvedPlatform = platform?.trim() || resolveGamePlatform(gameId);
    if (!resolvedPlatform) throw new Error(`No platform found for game ${gameId}`);
    const raw = await fetchMatchTimeline(gameId, resolvedPlatform);
    const parsed = parseTimeline(raw);
    insertTimeline(gameId, parsed, raw);
    console.log("[db] fetchAndStoreTimeline done:", {
      gameId,
      frameCount: parsed.frames.length,
      eventCount: parsed.events.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    markTimelineFetchError(gameId, message);
    console.error("[db] fetchAndStoreTimeline failed:", { gameId, message });
    throw error;
  }
}

export async function backfillTimeline(options: {
  limit: number;
  onProgress?: (progress: BackfillProgress) => void;
  signal?: { cancelled: boolean };
}): Promise<BackfillResult> {
  const { limit, onProgress, signal } = options;
  const gameIds = listGamesMissingTimeline(limit);
  const progress: BackfillProgress = {
    current: 0,
    total: gameIds.length,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    currentGameId: null,
  };

  console.log("[db] backfillTimeline called:", { limit, total: gameIds.length });
  const report = () => onProgress?.({ ...progress });
  report();

  for (const gameId of gameIds) {
    if (signal?.cancelled) break;

    progress.currentGameId = String(gameId);
    const queue = db.prepare("SELECT queue_id FROM games WHERE game_id = ?").get(gameId) as
      | { queue_id: number }
      | undefined;
    if (queue && isTimelineSkippedQueue(queue.queue_id)) {
      progress.skipped++;
      progress.current++;
      report();
      continue;
    }

    if (signal?.cancelled) break;
    if (signal?.cancelled) break;

    try {
      await fetchAndStoreTimeline(gameId);
      progress.succeeded++;
    } catch (error) {
      if (error instanceof RiotApiError && error.status === 403) {
        progress.skipped++;
      } else {
        progress.failed++;
      }
    }
    progress.current++;
    report();
  }

  const result = {
    ...progress,
    currentGameId: signal?.cancelled ? null : progress.currentGameId,
    cancelled: signal?.cancelled === true,
  };
  console.log("[db] backfillTimeline done:", {
    current: result.current,
    succeeded: result.succeeded,
    failed: result.failed,
    skipped: result.skipped,
    cancelled: result.cancelled,
  });
  return result;
}

export function resolveGamePlatform(gameId: number): string | null {
  const row = db
    .prepare(
      `SELECT s.platform FROM match_participants mp
       JOIN summoner s ON s.puuid = mp.puuid
       WHERE mp.game_id = ? AND s.platform IS NOT NULL
       LIMIT 1`,
    )
    .get(gameId) as { platform: string } | undefined;
  return row?.platform ?? null;
}

export function getTimelineStatus(gameId: number): TimelineStatus | null {
  console.log("[db] getTimelineStatus called:", { gameId });
  const row = db
    .prepare(
      "SELECT game_id, fetched_at, frame_count, event_count, fetch_error FROM match_timeline_status WHERE game_id = ?",
    )
    .get(gameId) as TimelineStatus | undefined;
  const result = row ?? null;
  console.log("[db] getTimelineStatus done:", { found: result !== null });
  return result;
}

export function getTimeline(gameId: number): TimelineData | null {
  console.log("[db] getTimeline called:", { gameId });
  const status = getTimelineStatus(gameId);
  if (status === null) {
    console.log("[db] getTimeline done:", { found: false });
    return null;
  }

  const frames = db
    .prepare(`
      SELECT frame_index, timestamp_ms, participant_id, puuid, level, xp, gold, cs,
             position_x, position_y, attack_damage, ability_power, armor, magic_resist,
             attack_speed, ability_haste, move_speed, max_health, current_health
      FROM match_timeline_frames
      WHERE game_id = ?
      ORDER BY frame_index, participant_id
    `)
    .all(gameId) as TimelineFrame[];
  const events = db
    .prepare(`
      SELECT event_index, timestamp_ms, event_type, participant_id, killer_id, victim_id,
             team_id, item_id, skill_slot, level_up_type, ward_type, building_type,
             monster_type, monster_subtype
      FROM match_timeline_events
      WHERE game_id = ?
      ORDER BY event_index
    `)
    .all(gameId) as TimelineEvent[];
  const result = { status, frames, events };
  console.log("[db] getTimeline done:", { frameCount: frames.length, eventCount: events.length });
  return result;
}

export function insertTimeline(gameId: number, parsed: ParsedTimeline, rawPayload: any): void {
  console.log("[db] insertTimeline called:", {
    gameId,
    frameCount: parsed.frames.length,
    eventCount: parsed.events.length,
  });
  const rawGz = zlib.gzipSync(JSON.stringify(rawPayload));
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT OR REPLACE INTO match_timeline_status
        (game_id, fetched_at, frame_count, event_count, fetch_error, raw_gz)
      VALUES (?, ?, ?, ?, NULL, ?)
    `).run(gameId, Date.now(), parsed.frames.length, parsed.events.length, rawGz);

    db.prepare("DELETE FROM match_timeline_frames WHERE game_id = ?").run(gameId);
    db.prepare("DELETE FROM match_timeline_events WHERE game_id = ?").run(gameId);

    const insertFrame = db.prepare(`
      INSERT INTO match_timeline_frames (
        game_id, frame_index, timestamp_ms, participant_id, puuid, level, xp, gold, cs,
        position_x, position_y, attack_damage, ability_power, armor, magic_resist,
        attack_speed, ability_haste, move_speed, max_health, current_health
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const frame of parsed.frames) {
      insertFrame.run(
        gameId,
        frame.frame_index,
        frame.timestamp_ms,
        frame.participant_id,
        frame.puuid,
        frame.level,
        frame.xp,
        frame.gold,
        frame.cs,
        frame.position_x,
        frame.position_y,
        frame.attack_damage,
        frame.ability_power,
        frame.armor,
        frame.magic_resist,
        frame.attack_speed,
        frame.ability_haste,
        frame.move_speed,
        frame.max_health,
        frame.current_health,
      );
    }

    const insertEvent = db.prepare(`
      INSERT INTO match_timeline_events (
        game_id, event_index, timestamp_ms, event_type, participant_id, killer_id,
        victim_id, team_id, item_id, skill_slot, level_up_type, ward_type,
        building_type, monster_type, monster_subtype, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const event of parsed.events) {
      insertEvent.run(
        gameId,
        event.event_index,
        event.timestamp_ms,
        event.event_type,
        event.participant_id,
        event.killer_id,
        event.victim_id,
        event.team_id,
        event.item_id,
        event.skill_slot,
        event.level_up_type,
        event.ward_type,
        event.building_type,
        event.monster_type,
        event.monster_subtype,
        event.raw_json,
      );
    }
  });
  tx();
  console.log("[db] insertTimeline done:", {
    gameId,
    frameCount: parsed.frames.length,
    eventCount: parsed.events.length,
  });
}

export function markTimelineFetchError(gameId: number, error: string): void {
  console.log("[db] markTimelineFetchError called:", { gameId, error });
  db.prepare(`
    INSERT OR REPLACE INTO match_timeline_status
      (game_id, fetched_at, frame_count, event_count, fetch_error, raw_gz)
    VALUES (?, ?, 0, 0, ?, NULL)
  `).run(gameId, Date.now(), error);
  console.log("[db] markTimelineFetchError done:", { gameId });
}

export function reparsedTimelines(limit: number): number {
  // Reads stored raw_gz from match_timeline_status, re-parses with the current
  // parseTimeline, and rewrites frames + events. Used after a parser fix so we
  // don't have to re-fetch from Riot.
  const rows = db
    .prepare("SELECT game_id, raw_gz FROM match_timeline_status WHERE raw_gz IS NOT NULL LIMIT ?")
    .all(limit) as Array<{ game_id: number; raw_gz: Buffer }>;
  let updated = 0;
  for (const row of rows) {
    try {
      const raw = JSON.parse(zlib.gunzipSync(row.raw_gz).toString("utf8"));
      const parsed = parseTimeline(raw);
      insertTimeline(row.game_id, parsed, raw);
      updated++;
    } catch (err) {
      console.warn(`[db] reparsedTimelines failed for ${row.game_id}:`, err);
    }
  }
  console.log(`[db] reparsedTimelines: ${updated}/${rows.length} timelines rewritten`);
  return updated;
}

export function listGamesMissingTimeline(limit: number): number[] {
  console.log("[db] listGamesMissingTimeline called:", { limit });
  const rows = db
    .prepare(`
      SELECT game_id
      FROM games
      WHERE game_id NOT IN (
        SELECT game_id
        FROM match_timeline_status
        WHERE fetch_error IS NULL
      )
      ORDER BY game_creation DESC
      LIMIT ?
    `)
    .all(limit) as Array<{ game_id: number }>;
  const result = rows.map((row) => row.game_id);
  console.log("[db] listGamesMissingTimeline done:", { count: result.length });
  return result;
}
