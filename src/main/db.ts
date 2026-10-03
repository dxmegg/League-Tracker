import Database from "better-sqlite3";
import fs from "fs";
import { AUGMENT_SLOTS } from "../shared/queues";
import * as backup from "./backup";
import { getDbPath } from "./db/connection";
import { getSetting, setSetting } from "./db/settings";
import { rebuildDerivedStats } from "./db/scoring";
import { unpackRaw, resetParticipantStatements } from "./db/payloads";
import { insertGameFull, insertTrackedStatsOnly } from "./db/ingest";
import { upsertSummoner, restoreSummonerFull, getAllPuuids } from "./db/summoner";
import {
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
  backfillAugmentSlots,
} from "./db/schema";

export { getDbPath } from "./db/connection";
export {
  checkScoreBackfill,
  getMissingScoreCount,
  backfillParticipantScores,
  runScoreBackfillIfNeeded,
  parsePatch,
  detectRemake,
  rebuildDerivedStats,
  scoreFormulaKey,
} from "./db/scoring";
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
} from "./db/matches";
export { getSetting, setSetting } from "./db/settings";
export {
  insertGameFull,
  backfillMissingTrackedRows,
  findOwnerRow,
  insertTrackedStatsOnly,
} from "./db/ingest";
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
} from "./db/filters";
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
} from "./db/payloads";
export {
  getChampionStatsAll,
  getAugmentStatsAll,
  getDashboardData,
  getAugmentStatsWithChampions,
  getChampionItemStats,
  getGlobalStats,
  getOwnedItemStats,
  getOwnedItemDetail,
  getOwnedRuneStats,
  getGlobalChampionDetail,
  getTrendsData,
  getRecords,
  getTeammateStats,
  getTeammateDetail,
  teammateKey,
  teammateName,
  teammateRows,
} from "./db/stats";
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
} from "./db/summoner";

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
} from "./db/schema";

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

async function runMigrations() {
  const current = db.pragma("user_version", { simple: true }) as number;
  if (current >= SCHEMA_VERSION) return;

  // A freshly created database already has every column the migrations would
  // add, so the migrations that only ALTER TABLE and backfill are no-ops. The
  // ones that call rebuildParticipantsFromPayloads are not: they iterate the
  // whole library. Skip the entire chain on a database whose tables were just
  // created by createTables above.
  const gamesCount = db.prepare("SELECT COUNT(*) as n FROM games").get() as { n: number };
  const currentSchemaReady =
    ["is_remake", "puuid", "game_version", "favorite", "raw_gz"].every((column) =>
      tableColumns("games").has(column),
    ) &&
    ["score", "score_badge", "score_raw", "cs", "largest_critical_strike"].every((column) =>
      tableColumns("player_stats").has(column),
    ) &&
    ["team_position", "player_subteam_id", "player_subteam_placement", "score"].every((column) =>
      tableColumns("match_participants").has(column),
    ) &&
    [
      "profile_icon",
      "platform",
      "summoner_level",
      "ranked_solo_json",
      "ranked_flex_json",
      "mastery_json",
      "last_seen",
    ].every((column) => tableColumns("summoner").has(column));
  if (current === 0 && gamesCount.n === 0 && currentSchemaReady) {
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
    return;
  }

  if (current < 1) migrateToV1();
  if (current < 2) migrateToV2();
  if (current < 3) migrateToV3();
  if (current < 4) migrateToV4();
  if (current < 5) migrateToV5();
  if (current < 6) migrateToV6();
  if (current < 7) migrateToV7();
  if (current < 8) migrateToV8();
  if (current < 9) migrateToV9();
  if (current < 10) migrateToV10();
  if (current < 11) migrateToV11();
  if (current < 12) migrateToV12();
  if (current < 13) migrateToV13();
  if (current < 14) migrateToV14();
  if (current < 15) migrateToV15();
  if (current < 16) migrateToV16();
  if (current < 17) migrateToV17();
  if (current < 18) migrateToV18();
  if (current < 19) migrateToV19();
  if (current < 20) await migrateToV20();

  db.pragma(`user_version = ${SCHEMA_VERSION}`);
}

async function migrateToV20() {
  const columns = tableColumns("match_participants");
  const additions = [["match_participants", "score", "REAL"]] as const;

  for (const [table, name, definition] of additions) {
    if (!columns.has(name)) {
      await backup.backupQuietly("pre-migration-20");
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
  }

  console.log("[db] v20 added participant score column");
}

// Every queue with games stored, ignoring which ones are hidden — the Settings
// page needs the full list to offer a hidden queue's switch back on.
export function getStoredQueues(): number[] {
  const rows = db
    .prepare(`
      SELECT DISTINCT g.queue_id
      FROM games g
      JOIN player_stats ps ON g.game_id = ps.game_id
      ORDER BY g.queue_id
    `)
    .all() as { queue_id: number }[];
  return rows.map((r) => r.queue_id);
}

// ---- Helpers ----

// ---- Query functions ----

// Every game id we've already made a decision about — stored or deliberately
// skipped. One query beats a lookup per id when a backfill checks hundreds.

// Games already known *for this specific account*. A game only counts as
// known here if the account's puuid shows up among the stored participants
// (match_participants holds every real participant of an already-imported
// game, regardless of which tracked account originally synced it) — not
// merely because some *other* tracked account has already synced it. Using
// the global getKnownGameIds() for a second account's pagination cutoff would
// stop scanning as soon as it saw a game shared with the first account, even
// though older games unique to this account still need to be fetched.

export function getDatabase(): Database.Database {
  return db;
}

export function setRiotSyncState(
  puuid: string,
  platform: string,
  lastMatchId: number | null,
  complete: boolean,
): void {
  db.prepare(`
    INSERT OR REPLACE INTO riot_sync_state
      (puuid, platform, last_sync_at, last_match_id, complete)
    VALUES (?, ?, ?, ?, ?)
  `).run(puuid, platform, Date.now(), lastMatchId, complete ? 1 : 0);
}

// ---- Export / Import ----

// Games are read a page at a time and written straight to disk, rather than
// building the whole backup in memory and handing one huge string to
// writeFileSync. Two reasons: a library of a few thousand games is a hundred
// megabytes-plus of JSON to hold twice over, and every await here returns the
// main process to the event loop, so exporting no longer freezes the window.
const EXPORT_PAGE_SIZE = 200;

export async function writeExportTo(filePath: string): Promise<number> {
  const out = fs.createWriteStream(filePath, { encoding: "utf8" });
  const write = (chunk: string) =>
    new Promise<void>((resolve, reject) => {
      out.write(chunk, (err) => (err ? reject(err) : resolve()));
    });

  let count = 0;
  try {
    const summoners = db.prepare("SELECT * FROM summoner").all();
    const settings = db.prepare("SELECT key, value FROM settings").all();
    const ignoredGames = db.prepare("SELECT game_id FROM ignored_games").all();
    const riotSyncState = db
      .prepare("SELECT puuid, platform, last_sync_at, last_match_id, complete FROM riot_sync_state")
      .all();
    await write(
      `{"version":4,"summoners":${JSON.stringify(summoners)},"settings":${JSON.stringify(settings)},"ignoredGames":${JSON.stringify(ignoredGames)},"riotSyncState":${JSON.stringify(riotSyncState)},"games":[`,
    );

    // Keyset paging, not LIMIT/OFFSET: each query completes before the next
    // await, so no statement is left open across one — a statement still
    // running when a poll tries to insert a game would fail as busy. Paging by
    // last id also stays correct if rows arrive mid-export.
    const page = db.prepare(`
      SELECT game_id, raw_gz, puuid, favorite, source
      FROM games
      WHERE raw_gz IS NOT NULL AND game_id > ?
      ORDER BY game_id
      LIMIT ?
    `);

    let lastId = 0;
    for (;;) {
      const rows = page.all(lastId, EXPORT_PAGE_SIZE) as {
        game_id: number;
        raw_gz: Buffer;
        puuid: string;
        favorite: number;
        source: GameSource;
      }[];
      if (rows.length === 0) break;

      let chunk = "";
      for (const row of rows) {
        // A backup stays the untouched payloads, so an import into any version
        // rebuilds whatever that version derives from them.
        const game = unpackRaw(row.raw_gz);
        if (!game) continue;
        game._ownerPuuid = row.puuid;
        game._favorite = row.favorite;
        game._source = row.source;
        chunk += (count === 0 ? "" : ",") + JSON.stringify(game);
        count++;
      }
      lastId = rows[rows.length - 1].game_id;
      await write(chunk);
    }

    await write("]}");
  } finally {
    await new Promise<void>((resolve, reject) => {
      out.on("error", reject);
      out.end(() => resolve());
    });
  }
  return count;
}

export function importData(data: any): { imported: number; total: number; skipped: number } {
  if (data.version >= 4) {
    for (const summoner of data.summoners ?? []) {
      try {
        restoreSummonerFull(summoner);
      } catch (err: unknown) {
        console.warn("[db] v4 summoner restore failed:", {
          puuid: summoner?.puuid,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    const restoreSetting = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
    for (const setting of data.settings ?? []) {
      try {
        restoreSetting.run(setting.key, setting.value);
      } catch (err: unknown) {
        console.warn("[db] v4 setting restore failed:", {
          key: setting?.key,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    const restoreIgnoredGame = db.prepare(
      "INSERT OR IGNORE INTO ignored_games (game_id) VALUES (?)",
    );
    for (const ignoredGame of data.ignoredGames ?? []) {
      try {
        restoreIgnoredGame.run(ignoredGame.game_id);
      } catch (err: unknown) {
        console.warn("[db] v4 ignored game restore failed:", {
          gameId: ignoredGame?.game_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    const restoreSyncState = db.prepare(`
      INSERT OR REPLACE INTO riot_sync_state
        (puuid, platform, last_sync_at, last_match_id, complete)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const syncState of data.riotSyncState ?? []) {
      try {
        restoreSyncState.run(
          syncState.puuid,
          syncState.platform,
          syncState.last_sync_at,
          syncState.last_match_id,
          syncState.complete,
        );
      } catch (err: unknown) {
        console.warn("[db] v4 sync state restore failed:", {
          puuid: syncState?.puuid,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const restoreFavorite = db.prepare("UPDATE games SET favorite = ? WHERE game_id = ?");
    let imported = 0;
    let total = 0;
    for (const game of data.games ?? []) {
      total++;
      try {
        const puuid = game._ownerPuuid || data.summoners?.[0]?.puuid;
        if (!puuid) continue;
        const source: GameSource = game._source ?? "lcu";
        if (insertGameFull(game, puuid, source, source === "search-import")) imported++;
        restoreFavorite.run(game._favorite ?? 0, game.gameId);
      } catch (err: unknown) {
        console.warn("[db] v4 game restore failed:", {
          gameId: game?.gameId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { imported, total, skipped: total - imported };
  }
  if (data.version >= 3) {
    for (const s of data.summoners ?? []) {
      upsertSummoner(s);
    }
    let imported = 0;
    let total = 0;
    for (const game of data.games ?? []) {
      total++;
      const puuid = game._ownerPuuid || data.summoners?.[0]?.puuid;
      if (!puuid) continue;
      if (insertGameFull(game, puuid, "lcu")) imported++;
    }
    return { imported, total, skipped: total - imported };
  }
  // v2 fallback: single summoner
  const puuid = data.summoner?.puuid;
  const games = data.games ?? [];
  if (!puuid) return { imported: 0, total: games.length, skipped: games.length };
  upsertSummoner(data.summoner);
  let imported = 0;
  let total = 0;
  for (const game of games) {
    total++;
    if (insertGameFull(game, puuid, "lcu")) imported++;
  }
  return { imported, total, skipped: total - imported };
}

// ---- Repair ----

export function repairPuuids(): {
  repairedGames: number;
  discoveredAccounts: number;
  rebuiltGames: number;
} {
  // Step 0: Re-derive the participant rows from the stored payloads. Everything
  // below reads those rows, so if they were the thing that went wrong — a game
  // that missed normalization, rows lost to a half-finished write — no later
  // step could see it, let alone fix it. The payloads are kept precisely so
  // this is recoverable, and Repair is where that recovery belongs.
  const { unusable } = rebuildParticipantsFromPayloads();
  if (unusable > 0) {
    console.warn(`Repair: ${unusable} stored payloads could not be read`);
  }

  // Step 1: Collect participant puuids per game. Bots and unresolved players
  // were already filtered to NULL on the way into match_participants.
  // Search Account imports are identified by the authoritative games.source
  // marker; the summoner table is not used to infer game ownership here.
  const foreignImportedPuuids = new Set(
    (
      db
        .prepare(`
          SELECT DISTINCT t.puuid
          FROM tracked_game_stats t
          JOIN games g ON g.game_id = t.game_id
          WHERE g.source = 'search-import'
            AND t.puuid NOT IN (SELECT puuid FROM summoner)
        `)
        .all() as { puuid: string }[]
    ).map((row) => row.puuid),
  );

  const knownAccounts = getAllPuuids();
  if (knownAccounts.length === 0) {
    // Repair only makes sense with a locally-owned account to anchor the
    // greedy pass; otherwise it would nominate a stranger.
    return { repairedGames: 0, discoveredAccounts: 0, rebuiltGames: 0 };
  }

  // Search Account imports are not part of the local library, so Repair has no
  // business assigning them an owner. The foreignImportedPuuids filter below
  // catches their puuids only when those puuids lack a summoner row; a game
  // whose games.puuid was previously written by an older Repair would slip
  // past it without this condition.
  const rows = (
    db
      .prepare(`
        SELECT mp.game_id, mp.puuid, mp.game_name, mp.tag_line, g.game_creation
        FROM match_participants mp
        JOIN games g ON g.game_id = mp.game_id
        WHERE mp.puuid IS NOT NULL
          AND g.source != 'search-import'
      `)
      .all() as {
      game_id: number;
      puuid: string;
      game_name: string | null;
      tag_line: string | null;
      game_creation: number;
    }[]
  ).filter((row) => !foreignImportedPuuids.has(row.puuid));

  const puuidToGames = new Map<string, Set<number>>();
  const gameToPuuids = new Map<number, Set<string>>();

  for (const row of rows) {
    let games = puuidToGames.get(row.puuid);
    if (!games) {
      games = new Set();
      puuidToGames.set(row.puuid, games);
    }
    games.add(row.game_id);

    let inGame = gameToPuuids.get(row.game_id);
    if (!inGame) {
      inGame = new Set();
      gameToPuuids.set(row.game_id, inGame);
    }
    inGame.add(row.puuid);
  }

  // Step 2: Sort puuids by frequency (most games first)
  const sortedPuuids = Array.from(puuidToGames.entries()).sort((a, b) => b[1].size - a[1].size);

  // Step 3: Greedily identify user accounts — a puuid is a user account if it
  // never co-occurs in the same game as an already-identified user account.
  // This filters out friends (who always appear alongside a user account)
  // while correctly identifying alt accounts (which never share a game).
  // Seed with owned accounts so the first candidate must co-occur before admission.
  const userPuuids = new Set<string>(knownAccounts);

  for (const [puuid, gameIds] of sortedPuuids) {
    let coOccurs = false;
    for (const gameId of gameIds) {
      const puuidsInGame = gameToPuuids.get(gameId)!;
      for (const userPuuid of userPuuids) {
        if (puuidsInGame.has(userPuuid)) {
          coOccurs = true;
          break;
        }
      }
      if (coOccurs) break;
    }

    if (!coOccurs) {
      userPuuids.add(puuid);
    }
  }

  // Step 4: For each game, find which user account is present and update puuid
  const updateStmt = db.prepare("UPDATE games SET puuid = ? WHERE game_id = ?");
  let repairedGames = 0;

  const repairTx = db.transaction(() => {
    for (const [gameId, puuidsInGame] of gameToPuuids) {
      for (const puuid of puuidsInGame) {
        if (userPuuids.has(puuid)) {
          // Two independent repairs, deliberately not gated on each other. A game
          // can have the right games.puuid and still be missing its tracked row —
          // that is the exact shape left behind by an older Repair that reassigned
          // ownership without touching tracked_game_stats. The guard only affects
          // the counter: a pass that changes nothing must report zero.
          const before = db.prepare("SELECT puuid FROM games WHERE game_id = ?").get(gameId) as
            | { puuid: string }
            | undefined;
          const puuidChanged = before?.puuid !== puuid;
          if (puuidChanged) {
            updateStmt.run(puuid, gameId);
          }
          const tracked = insertTrackedStatsOnly(gameId, puuid);
          if (puuidChanged || tracked === "inserted") {
            repairedGames++;
          }
          break;
        }
      }
    }
  });
  repairTx();

  // Step 5: Upsert discovered summoners using each account's most recent name
  const upsertStmt = db.prepare(`
    INSERT OR IGNORE INTO summoner (puuid, game_name, tag_line, summoner_id, account_id, updated_at)
    VALUES (?, ?, ?, NULL, NULL, ?)
  `);

  const latestNames = new Map<string, { name: string; tagLine: string | null; at: number }>();
  for (const row of rows) {
    if (!userPuuids.has(row.puuid) || !row.game_name) continue;
    const current = latestNames.get(row.puuid);
    if (!current || row.game_creation > current.at) {
      latestNames.set(row.puuid, {
        name: row.game_name,
        tagLine: row.tag_line,
        at: row.game_creation,
      });
    }
  }

  const summonerTx = db.transaction(() => {
    for (const puuid of userPuuids) {
      const latest = latestNames.get(puuid);
      upsertStmt.run(puuid, latest?.name ?? null, latest?.tagLine ?? null, Date.now());
    }
  });
  summonerTx();

  // Step 6: Rebuild stats, augments, remake flags, and scores now that game
  // ownership is settled.
  const rebuiltGames = rebuildDerivedStats();

  return { repairedGames, discoveredAccounts: userPuuids.size, rebuiltGames };
}

// Riot has shipped more than one puuid format over the years, and a single
// account's rows can end up split between them: summoner and games hold the
// current UUID form, while some older match_participants rows still carry the
// long base64url form. Those rows cannot be matched to their owner by puuid,
// which makes insertTrackedStatsOnly return no-owner-row and leaves games
// without a tracked_game_stats entry. The fix is to align match_participants
// with summoner by name, not by puuid — the name is what stayed the same.
//
// Idempotent: after the first pass no rows match the WHERE clause, so a
// second call does nothing. Safe to run on every startup, but a settings
// flag guards it anyway so a regression is visible in the log.
export function reconcileOwnerPuuids(): number {
  if (getSetting("puuid_reconciled_v1") === "1") return 0;

  const summoners = db
    .prepare("SELECT puuid, game_name, tag_line FROM summoner WHERE game_name IS NOT NULL")
    .all() as { puuid: string; game_name: string; tag_line: string | null }[];

  let updated = 0;
  const tx = db.transaction(() => {
    for (const s of summoners) {
      const result = db
        .prepare(`
          UPDATE match_participants
             SET puuid = ?
           WHERE game_name = ?
             AND (tag_line IS ? OR tag_line = ?)
             AND puuid IS NOT NULL
             AND puuid != ?
        `)
        .run(s.puuid, s.game_name, s.tag_line, s.tag_line, s.puuid);
      updated += result.changes;
    }
  });
  tx();

  setSetting("puuid_reconciled_v1", "1");
  if (updated > 0) {
    console.log(
      `[reconcile-puuids] rewrote ${updated} match_participants row(s) to their summoner puuid`,
    );
  }
  return updated;
}

function migrateToV11() {
  if (!tableColumns("match_participants").has("player_subteam_placement")) {
    db.exec("ALTER TABLE match_participants ADD COLUMN player_subteam_placement INTEGER");
  }
  rebuildParticipantsFromPayloads();
}

function migrateToV12() {
  // v11 and earlier could miss Match-V5's summoner2Id spelling when
  // normalizing participant spells. Rebuild stored payloads so spell2 is
  // populated for existing Arena and ARAM games.
  rebuildParticipantsFromPayloads();
}

function migrateToV13() {
  // v12 and earlier called rebuildParticipantsFromPayloads, which skipped
  // the walk entirely when every game already had participant rows. That
  // made those migrations no-ops on populated databases. This one always
  // walks, so the spell1/spell2 and subteam columns are re-extracted from
  // the stored payloads.
  const result = rebuildParticipantsFromPayloads();
  console.log(
    `[db] v13 rebuild: ${result.normalized} rows rewritten, ${result.unusable} unreadable payloads`,
  );
}

function migrateToV14() {
  const result = rebuildParticipantsFromPayloads();
  console.log(`[db] v14 rebuild: ${result.normalized} rows rewritten`);
}

function migrateToV15() {
  const cleared = db
    .prepare(
      `UPDATE games
          SET puuid = ''
        WHERE puuid != ''
          AND puuid NOT IN (SELECT puuid FROM summoner)`,
    )
    .run().changes;

  const backfilled = db
    .prepare(
      `UPDATE games
          SET puuid = (
            SELECT mp.puuid FROM match_participants mp
            WHERE mp.game_id = games.game_id
              AND mp.puuid IN (SELECT puuid FROM summoner)
            LIMIT 1
          )
        WHERE puuid = ''
          AND EXISTS (
            SELECT 1 FROM match_participants mp
            WHERE mp.game_id = games.game_id
              AND mp.puuid IN (SELECT puuid FROM summoner)
          )`,
    )
    .run().changes;

  console.log(
    `[db] v15 cleanup: cleared ${cleared} foreign-owned game(s), backfilled ${backfilled} owned game(s)`,
  );
}

function migrateToV16() {
  const result = rebuildParticipantsFromPayloads();
  console.log(`[db] v16 rebuild: ${result.normalized} rows rewritten`);
}

function migrateToV17() {
  backfillPlayerStatsSpells();
  const result = db
    .prepare(
      `UPDATE tracked_game_stats
          SET spell1 = (
                SELECT mp.spell1
                FROM match_participants mp
                WHERE mp.game_id = tracked_game_stats.game_id
                  AND mp.puuid = tracked_game_stats.puuid
              ),
              spell2 = (
                SELECT mp.spell2
                FROM match_participants mp
                WHERE mp.game_id = tracked_game_stats.game_id
                  AND mp.puuid = tracked_game_stats.puuid
              )
        WHERE EXISTS (
          SELECT 1
          FROM match_participants mp
          WHERE mp.game_id = tracked_game_stats.game_id
            AND mp.puuid = tracked_game_stats.puuid
        )`,
    )
    .run();
  console.log(`[db] v17 spell sync: ${result.changes} tracked row(s) updated`);
}

function migrateToV18() {
  if (!tableColumns("games").has("source")) {
    db.exec("ALTER TABLE games ADD COLUMN source TEXT NOT NULL DEFAULT 'lcu'");
  }

  // Existing rows predate the source column. The only split we can prove
  // from stored data is whether the game had an owner puuid at all:
  // games with no puuid were Search Account imports, everything else was
  // recorded through the local client. LCU and Riot sync are not
  // distinguishable in historical data, so both backfill as 'lcu'.
  db.exec(`UPDATE games SET source = 'search-import' WHERE puuid = ''`);
  console.log(`[db] v18 backfilled source column`);
}

function migrateToV19() {
  const columns = tableColumns("summoner");
  const additions = [
    ["platform", "TEXT"],
    ["summoner_level", "INTEGER"],
    ["ranked_solo_json", "TEXT"],
    ["ranked_flex_json", "TEXT"],
    ["mastery_json", "TEXT"],
    ["last_seen", "INTEGER"],
  ] as const;

  for (const [name, definition] of additions) {
    if (!columns.has(name)) {
      db.exec(`ALTER TABLE summoner ADD COLUMN ${name} ${definition}`);
    }
  }

  db.exec("UPDATE summoner SET last_seen = updated_at WHERE last_seen IS NULL");
  console.log("[db] v19 added account snapshot columns");
}
