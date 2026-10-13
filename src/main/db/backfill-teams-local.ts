import { pathToFileURL } from "url";
import { closeDatabase, getDatabase, initDatabase } from "./index";
import { unpackRaw, writeTeamsAndBans } from "./payloads";

export interface BackfillTeamsLocalOptions {
  limit?: number;
}

export interface BackfillTeamsLocalResult {
  total: number;
  processed: number;
  inserted: number;
  skipped: number;
  errors: number;
}

export function backfillTeamsLocal(
  { limit = 0 }: BackfillTeamsLocalOptions = {},
): BackfillTeamsLocalResult {
  console.log("[db] backfillTeamsLocal called:", { limit });
  if (!Number.isInteger(limit) || limit < 0) {
    throw new TypeError("limit must be a non-negative integer");
  }

  const database = getDatabase();
  const rows = database
    .prepare(`
      SELECT game_id, raw_gz
      FROM games
      WHERE raw_gz IS NOT NULL
      ORDER BY game_id
      ${limit > 0 ? "LIMIT ?" : ""}
    `)
    .all(...(limit > 0 ? [limit] : [])) as Array<{
    game_id: number;
    raw_gz: Buffer;
  }>;
  const hasTeams = database.prepare("SELECT 1 FROM match_teams WHERE game_id = ? LIMIT 1");

  const result: BackfillTeamsLocalResult = {
    total: rows.length,
    processed: 0,
    inserted: 0,
    skipped: 0,
    errors: 0,
  };

  for (const row of rows) {
    if (hasTeams.get(row.game_id)) {
      result.skipped++;
      continue;
    }

    try {
      const raw = unpackRaw(row.raw_gz);
      const teams = Array.isArray(raw?.teams) ? raw.teams : [];
      const tx = database.transaction(() => writeTeamsAndBans(row.game_id, raw));
      tx();
      result.processed++;
      if (teams.length > 0) result.inserted++;
    } catch (error) {
      result.errors++;
      console.warn(`[db] backfillTeamsLocal skipped ${row.game_id}:`, error);
    }

    if ((result.processed + result.skipped + result.errors) % 200 === 0) {
      console.log("[db] backfillTeamsLocal progress:", {
        done: result.processed + result.skipped + result.errors,
        total: result.total,
      });
    }
  }

  console.log("[db] backfillTeamsLocal done:", result);
  return result;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  void (async () => {
    await initDatabase();
    try {
      console.log(backfillTeamsLocal());
    } finally {
      closeDatabase();
    }
  })();
}
