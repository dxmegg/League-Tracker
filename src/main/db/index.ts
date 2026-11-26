import path from "path";
export { getAchievementTotals } from "./achievements";
import Database from "better-sqlite3";
import fs from "fs";
import { AUGMENT_SLOTS } from "../../shared/queues";
import { getDbPath } from "./connection";
import { getBackupDir, getDataDir } from "../paths";
import type { DbStats } from "../../shared/api";
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
  saveLiveStatPeaks,
  getStatRecords,
  getGameStatPeaks,
  saveLiveGameData,
  getLiveGameData,
  savePostGameData,
  getRecentPostGameData,
} from "./live-stats";
export type { LiveStatRecording } from "./live-stats";
export {
  checkScoreBackfill,
  getMissingScoreCount,
  backfillParticipantScores,
  repairDerivedScores,
  recalculateAllScores,
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
  getAllKnownGameIds,
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
  refreshParticipantTelemetry,
  setParticipantPentakillTime,
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
  backfillParticipantCombatStats,
  writeParticipants,
  extractRunes,
  resetParticipantStatements,
} from "./payloads";
export {
  getChampionStatsAll,
  getActivityHeatmap,
  getChampionQueueStats,
  getChampionRoleStats,
  getChampionKeystones,
  getChampionRuneStats,
  getChampionAllyStats,
  getChampionTeammateStats,
  getChampionWeeklyWinRate,
  getChampionWeeklyMetrics,
  getChampionMatchups,
  getChampionMatchupList,
  getAugmentStatsAll,
  getDashboardData,
  getRoleBreakdown,
  getAugmentStatsWithChampions,
  getAugmentDetail,
  getChampionItemStats,
  getGlobalStats,
  getOwnedItemStats,
  getOwnedItemDetail,
  getOwnedRuneStats,
  getGlobalChampionDetail,
  getChampionDetailStats,
  getChampionChallengeAggregates,
  getChampionTeamObjectives,
  getChampionStatBaseline,
  getChampionSkillOrders,
  getChampionTrendsData,
  getChampionRecords,
  getTrendsData,
  getRecords,
  getTeammateStats,
  getTeammateChampions,
  getTeammateDetail,
  teammateKey,
  teammateName,
  teammateRows,
} from "./stats";
export type { ChampionRecord, ChampionRecordsResult } from "./stats";
export type { ActivityHeatmapDay } from "./stats";
export type { ChampionTeamObjectives } from "./stats";
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
  getVisiblePuuids,
  getResolvedPlatform,
  listSavedSummoners,
  deleteSavedSummoner,
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
  migrateToV29,
  migrateToV30,
  migrateToV31,
  migrateToV32,
  mergeDuplicateAccounts,
  runMigrations,
} from "./schema";
export {
  writeExportTo,
  importData,
  repairPuuids,
  reconcileOwnerPuuids,
  adoptOrphanedRiotRows,
} from "./transfer";
export {
  resolveGamePlatform,
  fetchAndStoreTimeline,
  isTimelineSkippedQueue,
  getTimelineStatus,
  getTimeline,
  getChampionTimelineGames,
  getChampionTimelineAverages,
  getChampionKillDeathPositions,
  insertTimeline,
  markTimelineFetchError,
  reparsedTimelines,
  listGamesMissingTimeline,
  backfillTimeline,
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
  // The default 2 MB page cache is far too small for a database of this size; the stats pages
  // re-read the same pages constantly. Memory-mapped reads and in-memory temp tables help GROUP BY.
  db.pragma("cache_size = -131072");
  db.pragma("temp_store = MEMORY");
  db.pragma("mmap_size = 536870912");

  createTables();
  await runMigrations();
  // Startup counts rows with no score on every launch; without these the count scans every
  // participant row. Partial, so they stay tiny while nothing is missing.
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_mp_score_null ON match_participants(game_id) WHERE score IS NULL;
      CREATE INDEX IF NOT EXISTS idx_ps_score_null ON player_stats(game_id) WHERE score IS NULL;
      CREATE INDEX IF NOT EXISTS idx_tgs_score_null ON tracked_game_stats(game_id) WHERE score IS NULL;
    `);
  } catch (err) {
    console.warn("[db] could not create the missing-score indexes:", err);
  }
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
  // The accounts whose games are shown: all saved ones except those switched off in Settings.
  // A view, so every query follows the setting without passing a list around.
  db.exec(`
    CREATE TEMP VIEW IF NOT EXISTS visible_summoner AS
    SELECT * FROM summoner WHERE puuid NOT IN (
      SELECT j.value FROM settings, json_each(
        CASE WHEN json_valid(settings.value) THEN settings.value ELSE '[]' END
      ) j
      WHERE settings.key = 'hidden_accounts'
    )
  `);

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

function folderBytes(dir: string): number {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, entry) => {
      const full = path.join(dir, entry.name);
      return sum + (entry.isDirectory() ? folderBytes(full) : fs.statSync(full).size);
    }, 0);
  } catch {
    return 0;
  }
}

// What the Storage page shows. Row counts rather than per-table bytes: measuring bytes means
// reading every page of the database on the main thread.
export function getDbStats(): DbStats {
  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  const pragma = (name: string) => db.pragma(name, { simple: true }) as number;
  const range = db
    .prepare("SELECT MIN(game_creation) AS oldest, MAX(game_creation) AS newest FROM games")
    .get() as { oldest: number | null; newest: number | null };
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];

  return {
    games: count("games"),
    sizeBytes: fileBytes(getDbPath()) + fileBytes(`${getDbPath()}-wal`),
    freeBytes: pragma("freelist_count") * pragma("page_size"),
    backupBytes: folderBytes(getBackupDir()),
    imageBytes: folderBytes(path.join(getDataDir(), "dragon-images")),
    oldestGame: range.oldest,
    newestGame: range.newest,
    tables: tables.map(({ name }) => ({ name, rows: count(name) })).sort((a, b) => b.rows - a.rows),
  };
}

function fileBytes(file: string): number {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}
