import zlib from "zlib";
import type {
  ChampionKillDeathPosition,
  TimelineData,
  TimelineEvent,
  TimelineFrame,
  TimelineStatus,
} from "../../shared/api";
import { MAYHEM_QUEUE_IDS, QUEUE_ID_CUSTOM, TUTORIAL_QUEUE_IDS } from "../../shared/queues";
import { parseTimeline, type ParsedTimeline } from "../timeline";
import { acquireRequestSlot, fetchMatchTimeline, RiotApiError } from "../riot-api";
import { db } from "../db";
import { applyQueueFilter, participantFilter, statsSource } from "./filters";

export interface TimelineBucket {
  minute: number;
  avgGold: number | null;
  avgCs: number | null;
  avgXp: number | null;
  avgLevel: number | null;
  avgGoldDiffVsLaneOpponent: number | null;
  avgCsDiffVsLaneOpponent: number | null;
  avgXpDiffVsLaneOpponent: number | null;
  sampleGames: number;
}

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

export interface ChampionTimelineGame {
  gameId: number;
  gameCreation: number;
  queueId: number;
  championId: number;
  ownerPuuid: string | null;
  win: number;
  kills: number;
  deaths: number;
  assists: number;
  frameCount: number;
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
      markTimelineFetchError(gameId, "skipped: unsupported queue " + queue.queue_id);
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

export function getChampionTimelineGames(
  championId: number | null,
  limit: number,
  patch?: string,
  queue?: number,
  account?: string,
): ChampionTimelineGame[] {
  console.log("[db] getChampionTimelineGames called:", {
    championId,
    limit,
    patch,
    queue,
    account,
  });

  const source = statsSource(account);
  const participant = participantFilter(patch, undefined, "mp");
  const ownerPuuidSql = account ? "ps.puuid" : "g.puuid";
  const where = [
    source.accountFilter,
    participant.sql,
    `mp.puuid = ${ownerPuuidSql}`,
    "s.frame_count > 0",
  ];
  if (championId !== null) where.splice(2, 0, "mp.champion_id = ?");
  const params: any[] = [];
  if (account && account !== "all") params.push(account);
  params.push(...participant.params);
  if (championId !== null) params.push(championId);
  applyQueueFilter(where, params, queue, "g");

  const rows = db
    .prepare(`
      SELECT g.game_id AS gameId,
             g.game_creation AS gameCreation,
             g.queue_id AS queueId,
             mp.champion_id AS championId,
             g.puuid AS ownerPuuid,
             mp.win,
             mp.kills,
             mp.deaths,
             mp.assists,
             s.frame_count AS frameCount
      FROM match_participants mp
      JOIN games g ON g.game_id = mp.game_id
      JOIN ${source.table} ps ON ps.game_id = g.game_id
      JOIN match_timeline_status s ON s.game_id = g.game_id
      WHERE ${where.join(" AND ")}
      ORDER BY g.game_creation DESC
      LIMIT ?
    `)
    .all(...params, limit) as ChampionTimelineGame[];

  console.log("[db] getChampionTimelineGames done:", { count: rows.length });
  return rows;
}

export function getChampionTimelineAverages(
  championId: number | null,
  patch?: string,
  queue?: number,
  account?: string,
): TimelineBucket[] {
  console.log("[db] getChampionTimelineAverages called:", {
    championId,
    patch,
    queue,
    account,
  });

  const participant = participantFilter(patch, undefined, "mp");
  const where = [participant.sql, "s.frame_count > 0"];
  const params: any[] = [];
  if (championId !== null) {
    where.splice(1, 0, "mp.champion_id = ?");
  }
  params.push(...participant.params);
  if (championId !== null) params.push(championId);
  if (account === "all") {
    where.push("mp.puuid IN (SELECT puuid FROM summoner)");
  } else if (account) {
    where.push("mp.puuid = ?");
    params.push(account);
  } else {
    where.push("mp.puuid = g.puuid");
  }
  applyQueueFilter(where, params, queue, "g");

  const games = db
    .prepare(`
      SELECT g.game_id AS gameId,
             mp.participant_id AS ownerParticipantId,
             mp.team_id AS ownerTeamId,
             mp.team_position AS ownerPosition
      FROM match_participants mp
      JOIN games g ON g.game_id = mp.game_id
      JOIN match_timeline_status s ON s.game_id = g.game_id
      WHERE ${where.join(" AND ")}
    `)
    .all(...params) as Array<{
    gameId: number;
    ownerParticipantId: number;
    ownerTeamId: number;
    ownerPosition: string | null;
  }>;

  const targetMinutes = [5, 10, 15, 20, 25, 30];
  const buckets = targetMinutes.map((minute) => ({
    minute,
    gold: [] as number[],
    cs: [] as number[],
    xp: [] as number[],
    level: [] as number[],
    goldDiff: [] as number[],
    csDiff: [] as number[],
    xpDiff: [] as number[],
    sampleGames: 0,
  }));
  const findClosestFrame = (
    frames: TimelineFrame[],
    participantId: number,
    minute: number,
  ): TimelineFrame | null => {
    const targetMs = minute * 60_000;
    let closest: TimelineFrame | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const frame of frames) {
      if (frame.participant_id !== participantId) continue;
      const distance = Math.abs(frame.timestamp_ms - targetMs);
      if (distance <= 60_000 && distance < closestDistance) {
        closest = frame;
        closestDistance = distance;
      }
    }
    return closest;
  };
  const average = (values: number[]) =>
    values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

  const opponentQuery = db.prepare(`
    SELECT participant_id AS participantId
    FROM match_participants
    WHERE game_id = ?
      AND team_id != ?
      AND team_position = ?
      AND team_position IS NOT NULL
      AND team_position != ''
    ORDER BY participant_id
    LIMIT 1
  `);
  const framesQuery = db.prepare(`
    SELECT frame_index, timestamp_ms, participant_id, puuid, level, xp, gold, cs,
           position_x, position_y, attack_damage, ability_power, armor, magic_resist,
           attack_speed, ability_haste, move_speed, max_health, current_health
    FROM match_timeline_frames
    WHERE game_id = ?
      AND participant_id IN (?, ?)
    ORDER BY timestamp_ms
  `);

  for (const game of games) {
    const opponent =
      game.ownerPosition == null || game.ownerPosition === ""
        ? null
        : (opponentQuery.get(game.gameId, game.ownerTeamId, game.ownerPosition) as
            | { participantId: number }
            | undefined);
    const frames = framesQuery.all(
      game.gameId,
      game.ownerParticipantId,
      opponent?.participantId ?? -1,
    ) as TimelineFrame[];
    for (const bucket of buckets) {
      const ownerFrame = findClosestFrame(frames, game.ownerParticipantId, bucket.minute);
      if (!ownerFrame) continue;
      bucket.sampleGames += 1;
      if (ownerFrame.gold != null) bucket.gold.push(ownerFrame.gold);
      if (ownerFrame.cs != null) bucket.cs.push(ownerFrame.cs);
      if (ownerFrame.xp != null) bucket.xp.push(ownerFrame.xp);
      if (ownerFrame.level != null) bucket.level.push(ownerFrame.level);
      if (!opponent) continue;
      const opponentFrame = findClosestFrame(frames, opponent.participantId, bucket.minute);
      if (!opponentFrame) continue;
      if (ownerFrame.gold != null && opponentFrame.gold != null) {
        bucket.goldDiff.push(ownerFrame.gold - opponentFrame.gold);
      }
      if (ownerFrame.cs != null && opponentFrame.cs != null) {
        bucket.csDiff.push(ownerFrame.cs - opponentFrame.cs);
      }
      if (ownerFrame.xp != null && opponentFrame.xp != null) {
        bucket.xpDiff.push(ownerFrame.xp - opponentFrame.xp);
      }
    }
  }

  const result = buckets.map((bucket) => ({
    minute: bucket.minute,
    avgGold: average(bucket.gold),
    avgCs: average(bucket.cs),
    avgXp: average(bucket.xp),
    avgLevel: average(bucket.level),
    avgGoldDiffVsLaneOpponent: average(bucket.goldDiff),
    avgCsDiffVsLaneOpponent: average(bucket.csDiff),
    avgXpDiffVsLaneOpponent: average(bucket.xpDiff),
    sampleGames: bucket.sampleGames,
  }));
  console.log("[db] getChampionTimelineAverages done:", {
    bucketCount: result.length,
    games: games.length,
  });
  return result;
}

export function getChampionKillDeathPositions(
  championId: number,
  limit = 500,
  account?: string,
): ChampionKillDeathPosition[] {
  console.log("[db] getChampionKillDeathPositions called:", { championId, limit, account });
  const cappedLimit = Math.min(Math.max(Math.trunc(limit), 1), 5000);
  const ownerScope =
    account === "all"
      ? "mp.puuid IN (SELECT puuid FROM summoner)"
      : account
        ? "mp.puuid = ?"
        : "mp.puuid IN (SELECT puuid FROM summoner)";
  const params: Array<number | string> = [championId];
  if (account && account !== "all") params.push(account);

  const rows = db
    .prepare(`
      WITH tracked_participants AS (
        SELECT mp.game_id, mp.participant_id
        FROM match_participants mp
        WHERE mp.champion_id = ?
          AND ${ownerScope}
      ),
      positions AS (
        SELECT
          (
            SELECT f.position_x
            FROM match_timeline_frames f
            WHERE f.game_id = ev.game_id
              AND f.participant_id = ev.killer_id
              AND f.timestamp_ms <= ev.timestamp_ms
            ORDER BY f.timestamp_ms DESC
            LIMIT 1
          ) AS x,
          (
            SELECT f.position_y
            FROM match_timeline_frames f
            WHERE f.game_id = ev.game_id
              AND f.participant_id = ev.killer_id
              AND f.timestamp_ms <= ev.timestamp_ms
            ORDER BY f.timestamp_ms DESC
            LIMIT 1
          ) AS y,
          'kill' AS kind
        FROM match_timeline_events ev
        JOIN tracked_participants tp
          ON tp.game_id = ev.game_id
         AND tp.participant_id = ev.killer_id
        WHERE ev.event_type = 'CHAMPION_KILL'

        UNION ALL

        SELECT
          (
            SELECT f.position_x
            FROM match_timeline_frames f
            WHERE f.game_id = ev.game_id
              AND f.participant_id = ev.victim_id
              AND f.timestamp_ms <= ev.timestamp_ms
            ORDER BY f.timestamp_ms DESC
            LIMIT 1
          ) AS x,
          (
            SELECT f.position_y
            FROM match_timeline_frames f
            WHERE f.game_id = ev.game_id
              AND f.participant_id = ev.victim_id
              AND f.timestamp_ms <= ev.timestamp_ms
            ORDER BY f.timestamp_ms DESC
            LIMIT 1
          ) AS y,
          'death' AS kind
        FROM match_timeline_events ev
        JOIN tracked_participants tp
          ON tp.game_id = ev.game_id
         AND tp.participant_id = ev.victim_id
        WHERE ev.event_type = 'CHAMPION_KILL'
      )
      SELECT x, y, kind
      FROM positions
      WHERE x IS NOT NULL AND y IS NOT NULL
      LIMIT ?
    `)
    .all(...params, cappedLimit) as ChampionKillDeathPosition[];

  console.log("[db] getChampionKillDeathPositions done:", { count: rows.length });
  return rows;
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
      SELECT g.game_id
      FROM games g
      LEFT JOIN match_timeline_status s ON s.game_id = g.game_id
      WHERE s.game_id IS NULL
        AND g.game_creation > (
          CAST(strftime('%s', 'now') AS INTEGER) - 365 * 24 * 60 * 60
        ) * 1000
      ORDER BY game_creation DESC
      LIMIT ?
    `)
    .all(limit) as Array<{ game_id: number }>;
  const result = rows.map((row) => row.game_id);
  console.log("[db] listGamesMissingTimeline done:", { count: result.length });
  return result;
}
