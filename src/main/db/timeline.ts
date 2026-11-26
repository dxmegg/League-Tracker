import zlib from "zlib";
import type {
  ChampionKillDeathPosition,
  TimelineData,
  TimelineEvent,
  TimelineFrame,
  TimelineStatus,
} from "../../shared/api";
import {
  MAYHEM_QUEUE_IDS,
  QUEUE_ID_ARAM,
  QUEUE_ID_CUSTOM,
  QUEUE_ID_MAYHEM_CUSTOM,
  TUTORIAL_QUEUE_IDS,
} from "../../shared/queues";
import { parseTimeline, type ParsedTimeline } from "../timeline";
import { fetchMatchTimeline, RiotApiError } from "../riot-api";
import { db } from "../db";
import { cachedQuery } from "./cache";
import { applyQueueFilter, participantFilter, ownerFilter } from "./filters";

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

export interface ChampionTimelineAverages {
  buckets: TimelineBucket[];
  ahead10: number | null;
  itemsBought: number | null;
  comebacks: number | null;
  avgLevel6Ms?: number | null;
  avgLevel11Ms?: number | null;
  avgLevel16Ms?: number | null;
  level6Games?: number;
  level11Games?: number;
  level16Games?: number;
  winrateByGoldLead15: {
    behind1000plus: number | null;
    behind0to1000: number | null;
    ahead0to1000: number | null;
    ahead1000plus: number | null;
  } | null;
  goldLeadDistribution15: {
    behind1000plus: number;
    behind0to1000: number;
    ahead0to1000: number;
    ahead1000plus: number;
  } | null;
  spendingTimeline: Array<{ minute: number; averageItems: number | null }> | null;
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

const TIMELINE_EXCLUDED_QUEUE_IDS = new Set([
  ...MAYHEM_QUEUE_IDS,
  QUEUE_ID_CUSTOM,
  QUEUE_ID_MAYHEM_CUSTOM,
  ...TUTORIAL_QUEUE_IDS,
]);

export const FULL_DATA_QUEUE_IDS = [...MAYHEM_QUEUE_IDS, QUEUE_ID_ARAM];

export function isTimelineSkippedQueue(queueId: number): boolean {
  return TIMELINE_EXCLUDED_QUEUE_IDS.has(queueId);
}

export async function fetchAndStoreTimeline(gameId: number, platform?: string): Promise<void> {
  try {
    const resolvedPlatform = platform?.trim() || resolveGamePlatform(gameId);
    if (!resolvedPlatform) throw new Error(`No platform found for game ${gameId}`);
    const raw = await fetchMatchTimeline(gameId, resolvedPlatform);
    const parsed = parseTimeline(raw);
    insertTimeline(gameId, parsed, raw);
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

// For a game with no known player to take the platform from: the platforms of the tracked
// accounts, and when the game started, to tell it from another server's game with the same id
export function platformGuesses(gameId: number): { platforms: string[]; created: number } {
  const platforms = db
    .prepare(
      "SELECT DISTINCT LOWER(platform) AS platform FROM visible_summoner WHERE platform != ''",
    )
    .all() as { platform: string }[];
  const game = db.prepare("SELECT game_creation FROM games WHERE game_id = ?").get(gameId) as
    | { game_creation: number }
    | undefined;
  return { platforms: platforms.map((row) => row.platform), created: game?.game_creation ?? 0 };
}

export function getTimelineStatus(gameId: number): TimelineStatus | null {
  const row = db
    .prepare(
      "SELECT game_id, fetched_at, frame_count, event_count, fetch_error FROM match_timeline_status WHERE game_id = ?",
    )
    .get(gameId) as TimelineStatus | undefined;
  return row ?? null;
}

// What has no column of its own is read from the stored payload: damage per minute, and which
// item an undo took back
function addPayloadDetails(gameId: number, frames: TimelineFrame[], events: TimelineEvent[]): void {
  const row = db
    .prepare("SELECT raw_gz FROM match_timeline_status WHERE game_id = ?")
    .get(gameId) as { raw_gz: Buffer | null } | undefined;
  if (!row?.raw_gz) return;
  const raw = JSON.parse(zlib.gunzipSync(row.raw_gz).toString("utf8"));
  const source: any[] = raw?.info?.frames ?? raw?.frames ?? [];
  for (const frame of frames) {
    const stats = source[frame.frame_index]?.participantFrames?.[frame.participant_id]?.damageStats;
    frame.damage = stats?.totalDamageDoneToChampions ?? null;
  }
  // event_index counts every event of every frame, in order
  const sourceEvents = source.flatMap((f) => f?.events ?? []);
  for (const event of events) {
    if (event.event_type !== "ITEM_UNDO") continue;
    const undo = sourceEvents[event.event_index];
    event.item_id = undo?.beforeId || undo?.afterId || null;
  }
}

export function getTimeline(gameId: number): TimelineData | null {
  const status = getTimelineStatus(gameId);
  if (status === null) {
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
             monster_type, monster_subtype, position_x, position_y, assisting_participant_ids
      FROM match_timeline_events
      WHERE game_id = ?
      ORDER BY event_index
    `)
    .all(gameId) as TimelineEvent[];
  addPayloadDetails(gameId, frames, events);
  return { status, frames, events };
}

export function getChampionTimelineAverages(
  championId: number | null,
  patch?: string,
  queue?: number,
  account?: string,
): ChampionTimelineAverages {
  return cachedQuery(
    "getChampionTimelineAverages",
    [championId, patch, queue, account],
    30_000,
    () => {
      const participant = participantFilter(patch, undefined, "mp");
      const where = [participant.sql, "s.frame_count > 0"];
      const params: any[] = [];
      if (championId !== null) {
        where.splice(1, 0, "mp.champion_id = ?");
      }
      params.push(...participant.params);
      if (championId !== null) params.push(championId);
      where.push(ownerFilter("mp", account));
      if (account && account !== "all") params.push(account);
      applyQueueFilter(where, params, queue, "g");

      const games = db
        .prepare(`
      SELECT g.game_id AS gameId,
             mp.participant_id AS ownerParticipantId,
             mp.team_id AS ownerTeamId,
             mp.team_position AS ownerPosition,
             mp.win AS win
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
        win: number;
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
      const itemPurchasesQuery = db.prepare(`
    SELECT CAST(timestamp_ms / 60000 AS INTEGER) AS minute, COUNT(*) AS count
    FROM match_timeline_events
    WHERE game_id = ? AND participant_id = ? AND event_type = 'ITEM_PURCHASED'
    GROUP BY minute
  `);
      const levelMilestonesQuery = db.prepare(`
    SELECT
      MIN(CASE WHEN level >= 6 THEN timestamp_ms END) AS level6Ms,
      MIN(CASE WHEN level >= 11 THEN timestamp_ms END) AS level11Ms,
      MIN(CASE WHEN level >= 16 THEN timestamp_ms END) AS level16Ms
    FROM match_timeline_frames
    WHERE game_id = ? AND participant_id = ?
  `);
      const goldLead15: Array<{ diff: number; win: number }> = [];
      const goldLead10: number[] = [];
      const itemCounts: number[] = [];
      const spendingCounts = [0, 0, 0, 0, 0, 0];
      const level6Times: number[] = [];
      const level11Times: number[] = [];
      const level16Times: number[] = [];

      for (const game of games) {
        const milestones = levelMilestonesQuery.get(game.gameId, game.ownerParticipantId) as {
          level6Ms: number | null;
          level11Ms: number | null;
          level16Ms: number | null;
        };
        if (milestones.level6Ms != null) level6Times.push(milestones.level6Ms);
        if (milestones.level11Ms != null) level11Times.push(milestones.level11Ms);
        if (milestones.level16Ms != null) level16Times.push(milestones.level16Ms);
        const purchases = itemPurchasesQuery.all(game.gameId, game.ownerParticipantId) as Array<{
          minute: number;
          count: number;
        }>;
        itemCounts.push(purchases.reduce((sum, purchase) => sum + purchase.count, 0));
        for (const purchase of purchases) {
          if (purchase.minute >= 0 && purchase.minute < 30) {
            spendingCounts[Math.min(Math.floor(purchase.minute / 5), 5)] += purchase.count;
          }
        }
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
            const goldDiff = ownerFrame.gold - opponentFrame.gold;
            bucket.goldDiff.push(goldDiff);
            if (bucket.minute === 10) goldLead10.push(goldDiff);
            if (bucket.minute === 15) goldLead15.push({ diff: goldDiff, win: game.win });
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
      const bucketName = (diff: number) =>
        diff <= -1000
          ? "behind1000plus"
          : diff < 0
            ? "behind0to1000"
            : diff < 1000
              ? "ahead0to1000"
              : "ahead1000plus";
      const goldLeadDistribution15 = goldLead15.reduce(
        (counts, entry) => {
          counts[bucketName(entry.diff)]++;
          return counts;
        },
        {
          behind1000plus: 0,
          behind0to1000: 0,
          ahead0to1000: 0,
          ahead1000plus: 0,
        },
      );
      const winrateByGoldLead15 = Object.fromEntries(
        Object.entries(goldLeadDistribution15).map(([name]) => {
          const entries = goldLead15.filter((entry) => bucketName(entry.diff) === name);
          return [
            name,
            entries.length === 0
              ? null
              : (entries.filter((entry) => entry.win === 1).length / entries.length) * 100,
          ];
        }),
      ) as ChampionTimelineAverages["winrateByGoldLead15"];
      return {
        buckets: result,
        ahead10:
          goldLead10.length === 0
            ? null
            : goldLead10.filter((diff) => diff > 0).length / goldLead10.length,
        itemsBought: itemCounts.length === 0 ? null : average(itemCounts),
        comebacks:
          goldLead15.length === 0
            ? null
            : goldLead15.filter((entry) => entry.diff < 0 && entry.win === 1).length,
        winrateByGoldLead15,
        goldLeadDistribution15: goldLead15.length === 0 ? null : goldLeadDistribution15,
        spendingTimeline:
          itemCounts.length === 0
            ? null
            : spendingCounts.map((count, index) => ({
                minute: index * 5,
                averageItems: count / itemCounts.length,
              })),
        avgLevel6Ms: level6Times.length >= 3 ? average(level6Times) : null,
        avgLevel11Ms: level11Times.length >= 3 ? average(level11Times) : null,
        avgLevel16Ms: level16Times.length >= 3 ? average(level16Times) : null,
        level6Games: level6Times.length,
        level11Games: level11Times.length,
        level16Games: level16Times.length,
      };
    },
  );
}

export function getChampionKillDeathPositions(
  championId: number,
  limit = 500,
  account?: string,
): ChampionKillDeathPosition[] {
  return cachedQuery("getChampionKillDeathPositions", [championId, limit, account], 30_000, () => {
    const cappedLimit = Math.min(Math.max(Math.trunc(limit), 1), 5000);
    const ownerScope =
      account === "all"
        ? "mp.puuid IN (SELECT puuid FROM visible_summoner)"
        : account
          ? "mp.puuid = ?"
          : "mp.puuid IN (SELECT puuid FROM visible_summoner)";
    const params: Array<number | string> = [championId];
    if (account && account !== "all") params.push(account);

    return db
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
          'kill' AS kind,
          ev.timestamp_ms AS timestampMs
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
          'death' AS kind,
          ev.timestamp_ms AS timestampMs
        FROM match_timeline_events ev
        JOIN tracked_participants tp
          ON tp.game_id = ev.game_id
         AND tp.participant_id = ev.victim_id
        WHERE ev.event_type = 'CHAMPION_KILL'
      )
      SELECT x, y, kind, timestampMs
      FROM positions
      WHERE x IS NOT NULL AND y IS NOT NULL
      LIMIT ?
    `)
      .all(...params, cappedLimit) as ChampionKillDeathPosition[];
  });
}

export function insertTimeline(gameId: number, parsed: ParsedTimeline, rawPayload: any): void {
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
        position_x, position_y, jungle_minions_killed, time_enemy_spent_controlled,
        attack_damage, ability_power, armor, magic_resist, attack_speed, ability_haste,
        move_speed, max_health, current_health
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        frame.jungle_minions_killed,
        frame.time_enemy_spent_controlled,
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
        building_type, monster_type, monster_subtype, bounty_gold, shutdown_bounty,
        kill_streak_length, assisting_participant_ids, position_x, position_y
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        event.bounty_gold,
        event.shutdown_bounty,
        event.kill_streak_length,
        event.assisting_participant_ids,
        event.position_x,
        event.position_y,
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
  db.prepare(`
    INSERT OR REPLACE INTO match_timeline_status
      (game_id, fetched_at, frame_count, event_count, fetch_error, raw_gz)
    VALUES (?, ?, 0, 0, ?, NULL)
  `).run(gameId, Date.now(), error);
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

// Own Mayhem and ARAM games still missing the full timeline or the extra match numbers, newest
// first. Both halves are checked: Riot API imports have ARAM timelines without the numbers, and
// the League client's Mayhem timelines have no skill order.
export function listGamesMissingFullData(): Array<{
  game_id: number;
  game_creation: number;
  queue_id: number;
}> {
  return db
    .prepare(`
      SELECT g.game_id, g.game_creation, g.queue_id
      FROM games g
      WHERE g.queue_id IN (${FULL_DATA_QUEUE_IDS.join(", ")})
        AND g.source != 'search-import'
        AND NOT (
          EXISTS (SELECT 1 FROM match_participant_challenges c
                  WHERE c.game_id = g.game_id AND c.challenge_key = 'totalTimeSpentDead')
          AND EXISTS (SELECT 1 FROM match_timeline_events e
                      WHERE e.game_id = g.game_id AND e.event_type = 'SKILL_LEVEL_UP')
        )
      ORDER BY g.game_creation DESC
    `)
    .all() as Array<{ game_id: number; game_creation: number; queue_id: number }>;
}
export function listGamesMissingTimeline(limit: number): number[] {
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
  return rows.map((row) => row.game_id);
}
