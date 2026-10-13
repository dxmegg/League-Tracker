import { pathToFileURL } from "url";
import { closeDatabase, getDatabase, initDatabase } from "./index";
import { parseTimeline } from "../timeline";
import { insertTimeline } from "./timeline";
import zlib from "zlib";

export interface BackfillTimelineLocalOptions {
  limit?: number;
}

export interface BackfillTimelineLocalResult {
  total: number;
  processed: number;
  updated: number;
  skipped: number;
  errors: number;
}

export function backfillTimelineLocal({
  limit = 0,
}: BackfillTimelineLocalOptions = {}): BackfillTimelineLocalResult {
  console.log("[db] backfillTimelineLocal called:", { limit });
  if (!Number.isInteger(limit) || limit < 0) {
    throw new TypeError("limit must be a non-negative integer");
  }

  const database = getDatabase();
  const rows = database
    .prepare(`
      SELECT game_id, raw_gz
      FROM match_timeline_status
      WHERE raw_gz IS NOT NULL
      ORDER BY game_id
      ${limit > 0 ? "LIMIT ?" : ""}
    `)
    .all(...(limit > 0 ? [limit] : [])) as Array<{
    game_id: number;
    raw_gz: Buffer;
  }>;
  const hasNewFields = database.prepare(`
    SELECT 1
    FROM match_timeline_events
    WHERE game_id = ?
      AND (
        bounty_gold IS NOT NULL
        OR shutdown_bounty IS NOT NULL
        OR kill_streak_length IS NOT NULL
        OR assisting_participant_ids IS NOT NULL
        OR position_x IS NOT NULL
        OR position_y IS NOT NULL
      )
    UNION ALL
    SELECT 1
    FROM match_timeline_frames
    WHERE game_id = ?
      AND (jungle_minions_killed IS NOT NULL OR time_enemy_spent_controlled IS NOT NULL)
    LIMIT 1
  `);

  const result: BackfillTimelineLocalResult = {
    total: rows.length,
    processed: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  for (const row of rows) {
    if (hasNewFields.get(row.game_id, row.game_id)) {
      result.skipped++;
      continue;
    }

    result.processed++;
    try {
      const raw = JSON.parse(zlib.gunzipSync(row.raw_gz).toString("utf8"));
      const parsed = parseTimeline(raw);
      insertTimeline(row.game_id, parsed, raw);
      result.updated++;
    } catch (error) {
      result.errors++;
      console.warn(`[db] backfillTimelineLocal skipped ${row.game_id}:`, error);
    }

    if ((result.processed + result.skipped + result.errors) % 200 === 0) {
      console.log("[db] backfillTimelineLocal progress:", {
        done: result.processed + result.skipped + result.errors,
        total: result.total,
      });
    }
  }

  console.log("[db] backfillTimelineLocal done:", result);
  return result;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  void (async () => {
    await initDatabase();
    try {
      console.log(backfillTimelineLocal());
    } finally {
      closeDatabase();
    }
  })();
}
