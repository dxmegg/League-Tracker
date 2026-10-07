import Database from "better-sqlite3";
import fs from "fs";
import { AUGMENT_SLOTS } from "../../shared/queues";
import { getDbPath } from "./connection";
import { getSetting, setSetting } from "./settings";
import { resetParticipantStatements } from "./payloads";
import {
  createTables,
  createIndexes,
  purgeForeignOwnedGames,
  migrateHiddenQueues,
  backfillAugmentSlots,
  runMigrations,
} from "./schema";

export { getDbPath } from "./connection";
export {
  checkScoreBackfill,
  getMissingScoreCount,
  backfillParticipantScores,
  runScoreBackfillIfNeeded,
  parsePatch,
  detectRemake,
  rebuildDerivedStats,
  scoreFormulaKey,
} from "./scoring";
export {
  getMatchHistory,
  getMatchFilterOptions,
  getMatchDetail,
  getChampionMatchHistory,
  toggleFavorite,
  gameExists,
  getKnownGameIds,
  getKnownGameIdsForPuuid,
  getTrackedGameIdsForPuuid,
  getTrackedRowCountForPuuid,
  markIgnoredGame,
  getIgnoredGameIds,
  restoreOlderGames,
  getRecentGames,
  getRecentGamesByName,
  getRecentRiotMatchStubs,
  getQueueStatsForAccount,
  getMostPlayedQueue,
  getMostPlayedQueueByName,
  getTotalMatchesPlayed,
  getTotalMatchesPlayedByName,
  getRankedRecordForPuuid,
  matchOrderBy,
} from "./matches";
export { getSetting, setSetting } from "./settings";
export {
  insertGameFull,
  backfillMissingTrackedRows,
  findOwnerRow,
  insertTrackedStatsOnly,
} from "./ingest";
export {
  applyQueueFilter,
  applyTimeFilter,
  hideRemakes,
  localGamesFilter,
  participantFilter,
  statsSource,
  EXCLUDED_ITEM_IDS,
  EXCLUDED_STATS_SQL,
  EXCLUDED_CS_SQL,
  GAME_MAX_STATS_SQL,
  getHiddenQueues,
  getStoredQueues,
} from "./filters";
export {
  packRaw,
  unpackRaw,
  realPuuid,
  displayName,
  normalizeTeamPosition,
  participantRowsFromRaw,
  participantStatements,
  writeParticipants,
  extractRunes,
  resetParticipantStatements,
} from "./payloads";
export {
  getChampionStatsAll,
  getChampionQueueStats,
  getChampionKeystones,
  getChampionWeeklyWinRate,
  getChampionMatchups,
  getAugmentStatsAll,
  getDashboardData,
  getAugmentStatsWithChampions,
  getChampionItemStats,
  getGlobalStats,
  getOwnedItemStats,
  getOwnedItemDetail,
  getOwnedRuneStats,
  getGlobalChampionDetail,
  getChampionDetailStats,
  getTrendsData,
  getRecords,
  getTeammateStats,
  getTeammateDetail,
  teammateKey,
  teammateName,
  teammateRows,
} from "./stats";
export {
  upsertSummoner,
  saveAccountSnapshot,
  updateParticipantNames,
  reconcileAllParticipantNames,
  getAccountSnapshot,
  listAccountsWithData,
  updateSummonerProfileIcon,
  getSummoner,
  getProfile,
  getAllPuuids,
  listSavedSummoners,
  deleteSavedSummoner,
  deleteSearchedSummoners,
  setRiotSyncState,
} from "./summoner";

export {
  SCHEMA_VERSION,
  createTables,
  createIndexes,
  tableColumns,
  purgeForeignOwnedGames,
  migrateHiddenQueues,
  migrateToV1,
  migrateToV2,
  migrateToV3,
  migrateToV4,
  migrateToV5,
  migrateToV6,
  migrateToV7,
  migrateToV8,
  migrateToV9,
  migrateToV10,
  rebuildParticipantsFromPayloads,
  backfillPlayerStatsSpells,
  backfillRemakes,
  backfillGamePuuids,
  backfillGameVersions,
  backfillAugmentSlots,
  runMigrations,
} from "./schema";
export { writeExportTo, importData, repairPuuids, reconcileOwnerPuuids } from "./transfer";
export {
  resolveGamePlatform,
  getTimelineStatus,
  getTimeline,
  insertTimeline,
  markTimelineFetchError,
  reparsedTimelines,
  listGamesMissingTimeline,
} from "./timeline";

export type GameSource = "lcu" | "riot-sync" | "search-import";

export let db: Database.Database;

export async function initDatabase() {
  const dbPath = getDbPath();
  db = new Database(dbPath);
  // Prepared statements belong to the connection that made them, so the cache
  // can't outlive it.
  resetParticipantStatements();
  db.pragma("journal_mode = WAL");
  // NORMAL is the standard companion to WAL: commits stop waiting on an fsync,
  // which is what makes a several-thousand-game backfill bearable. The only
  // exposure is losing the most recent commits to an OS crash, and everything
  // here is re-fetchable from the client.
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");

  createTables();
  await runMigrations();
  const missingScoreCount = db
    .prepare("SELECT COUNT(*) as n FROM match_participants WHERE score IS NULL")
    .get() as { n: number };
  if (missingScoreCount.n > 0) {
    console.log("[db] participant score backfill pending:", { count: missingScoreCount.n });
  }
  if (getSetting("puuid_to_lcu_v1") !== "1") {
    // Convert locally owned games to the same LCU key used by recent sync.
    const summoners = db
      .prepare(
        "SELECT puuid, game_name, tag_line FROM summoner WHERE game_name IS NOT NULL AND tag_line IS NOT NULL",
      )
      .all() as { puuid: string; game_name: string; tag_line: string }[];
    let fixed = 0;
    const update = db.prepare("UPDATE games SET puuid = ? WHERE game_id = ?");
    const tx = db.transaction(() => {
      for (const s of summoners) {
        const targetName = s.game_name.trim().toLowerCase();
        const targetTag = s.tag_line.trim().toLowerCase();
        const rows = db
          .prepare(`
            SELECT g.game_id FROM games g
            WHERE LENGTH(g.puuid) = 78
              AND EXISTS (
                SELECT 1 FROM match_participants mp
                WHERE mp.game_id = g.game_id
                  AND LOWER(TRIM(mp.game_name)) = ?
                  AND LOWER(TRIM(mp.tag_line)) = ?
              )
          `)
          .all(targetName, targetTag) as { game_id: number }[];
        for (const row of rows) {
          update.run(s.puuid, row.game_id);
          fixed++;
        }
      }
    });
    tx();
    console.log(`[migration] converted ${fixed} games from Riot PUUID to LCU UUID`);
    setSetting("puuid_to_lcu_v1", "1");
  }
  // After migrations: on a database from before a column existed, the index
  // covering it can only be built once that column has been added.
  createIndexes();

  // Backfill bonus augment slots (5+) for games stored when only 4 slots
  // were captured.
  if (getSetting("augment_slots") !== String(AUGMENT_SLOTS)) {
    backfillAugmentSlots();
    setSetting("augment_slots", String(AUGMENT_SLOTS));
  }

  migrateHiddenQueues();
  const purged = purgeForeignOwnedGames();
  if (purged > 0) {
    console.log(`[db] purged ${purged} foreign-owned game(s) imported from Search Account`);
  }
}

// Checkpoints the WAL and releases the file. Without this a quit leaves the
// -wal alongside the database to be replayed on next launch.
export function closeDatabase() {
  if (!db || !db.open) return;
  resetParticipantStatements();
  try {
    db.close();
  } catch (err) {
    console.error("Failed to close database:", err);
  }
}

export function getDatabase(): Database.Database {
  return db;
}

export function getDbStats(): { games: number; sizeBytes: number } {
  let sizeBytes = 0;
  try {
    sizeBytes = fs.statSync(getDbPath()).size;
  } catch {
    sizeBytes = 0;
  }

  let games = 0;
  try {
    const row = db.prepare("SELECT COUNT(*) as n FROM games").get() as { n: number } | undefined;
    games = row?.n ?? 0;
  } catch {
    games = 0;
  }

  return { games, sizeBytes };
}
