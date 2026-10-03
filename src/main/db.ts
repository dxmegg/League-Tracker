import Database from "better-sqlite3";
import fs from "fs";
import zlib from "zlib";
import { AUGMENT_SLOTS, QUEUE_ID_MAYHEM_CLASSIC } from "../shared/queues";
import type { MasteryChampion, RankEntry } from "../shared/api";
import * as backup from "./backup";
import { getDbPath } from "./db/connection";
import { getSetting, setSetting } from "./db/settings";
import { parsePatch, detectRemake, rebuildDerivedStats, groupByGame } from "./db/scoring";
import { identityFromGame } from "./db/matches";
import {
  unpackRaw,
  participantRowsFromRaw,
  writeParticipants,
  resetParticipantStatements,
} from "./db/payloads";
import { insertGameFull, insertTrackedStatsOnly } from "./db/ingest";

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

// The old hide-Mayhem-Classic switch became a per-queue list. Carry the boolean
// over once; writing the key even when nothing was hidden is what keeps this
// from firing again after the user switches every queue back on.
function migrateHiddenQueues() {
  if (getSetting("hidden_queues") !== null) return;
  const hidClassic = getSetting("hide_classic_games") === "true";
  setSetting("hidden_queues", hidClassic ? String(QUEUE_ID_MAYHEM_CLASSIC) : "");
}

export function purgeForeignOwnedGames(): number {
  const foreignPuuids = db
    .prepare(
      `SELECT DISTINCT g.puuid
       FROM games g
       WHERE g.source = 'search-import'`,
    )
    .all() as { puuid: string }[];

  if (foreignPuuids.length === 0) return 0;

  const idsToPurge = db
    .prepare(
      `SELECT DISTINCT g.game_id
       FROM games g
       WHERE g.source = 'search-import'`,
    )
    .all() as { game_id: number }[];

  if (idsToPurge.length === 0) return 0;

  const gameIds = idsToPurge.map((r) => r.game_id);
  const placeholders = gameIds.map(() => "?").join(", ");

  const purgeTx = db.transaction(() => {
    db.prepare(`DELETE FROM tracked_game_stats WHERE game_id IN (${placeholders})`).run(...gameIds);
    db.prepare(`DELETE FROM player_stats WHERE game_id IN (${placeholders})`).run(...gameIds);
    db.prepare(`DELETE FROM game_augments WHERE game_id IN (${placeholders})`).run(...gameIds);
    db.prepare(`DELETE FROM match_participant_augments WHERE game_id IN (${placeholders})`).run(
      ...gameIds,
    );
    db.prepare(`DELETE FROM match_participants WHERE game_id IN (${placeholders})`).run(...gameIds);
    db.prepare(`DELETE FROM games WHERE game_id IN (${placeholders})`).run(...gameIds);
  });
  purgeTx();
  return gameIds.length;
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

// Every table below is declared in its *current* shape, so a new database is
// correct without running a single migration. Migrations exist only to carry
// databases created by older versions up to the same shape — see runMigrations.
function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      game_id       INTEGER PRIMARY KEY,
      queue_id      INTEGER NOT NULL,
      game_mode     TEXT NOT NULL,
      game_creation INTEGER NOT NULL,
      game_duration INTEGER NOT NULL,
      is_remake     INTEGER NOT NULL DEFAULT 0,
      puuid         TEXT NOT NULL DEFAULT '',
      game_version  TEXT,
      source        TEXT NOT NULL DEFAULT 'lcu',
      favorite      INTEGER NOT NULL DEFAULT 0,
      -- The match exactly as the client handed it to us, gzipped. Nothing on a
      -- query path reads it: match_participants below answers every question
      -- the UI asks. It stays because it's the only copy of the fields we
      -- haven't normalized, and the client's history is too short to refetch
      -- from — see unpackRaw.
      raw_gz        BLOB
    );

    -- Every player in every game, which is what separates this from
    -- player_stats (only ever our own row). Stats over all ten players used to
    -- mean parsing raw_json for every game in the main process; now they're
    -- ordinary aggregates.
    CREATE TABLE IF NOT EXISTS match_participants (
      game_id        INTEGER NOT NULL REFERENCES games(game_id),
      participant_id INTEGER NOT NULL,
      puuid          TEXT,
      game_name      TEXT,
      tag_line       TEXT,
      profile_icon   INTEGER,
      team_id        INTEGER NOT NULL DEFAULT 100,
      player_subteam_id INTEGER,
      player_subteam_placement INTEGER,
      champion_id    INTEGER NOT NULL DEFAULT 0,
      win            INTEGER NOT NULL DEFAULT 0,
      kills          INTEGER NOT NULL DEFAULT 0,
      deaths         INTEGER NOT NULL DEFAULT 0,
      assists        INTEGER NOT NULL DEFAULT 0,
      double_kills   INTEGER NOT NULL DEFAULT 0,
      triple_kills   INTEGER NOT NULL DEFAULT 0,
      quadra_kills   INTEGER NOT NULL DEFAULT 0,
      penta_kills    INTEGER NOT NULL DEFAULT 0,
      total_damage_dealt INTEGER NOT NULL DEFAULT 0,
      total_damage_taken INTEGER NOT NULL DEFAULT 0,
      true_damage    INTEGER NOT NULL DEFAULT 0,
      gold_earned    INTEGER NOT NULL DEFAULT 0,
      total_heal     INTEGER NOT NULL DEFAULT 0,
      largest_killing_spree INTEGER NOT NULL DEFAULT 0,
      largest_critical_strike INTEGER NOT NULL DEFAULT 0,
      cs             INTEGER NOT NULL DEFAULT 0,
      early_surrender INTEGER NOT NULL DEFAULT 0,
      -- Records-only fields: overall damage (incl. minions/objectives, unlike
      -- total_damage_dealt which is champion damage despite the name), true
      -- damage to champions, and the biggest single crit of the game.
      total_damage_dealt_all INTEGER NOT NULL DEFAULT 0,
      true_damage_dealt      INTEGER NOT NULL DEFAULT 0,
      -- Copied down from games so an aggregate over every participant never
      -- has to join back. Kept honest by trg_games_denorm_*, since these are
      -- the only three game columns a stats query filters on.
      is_remake      INTEGER NOT NULL DEFAULT 0,
      queue_id       INTEGER,
      game_version   TEXT,
      spell1 INTEGER, spell2 INTEGER,
      rune0 INTEGER, rune1 INTEGER, rune2 INTEGER, rune3 INTEGER, rune4 INTEGER, rune5 INTEGER,
      primary_style INTEGER, secondary_style INTEGER,
      item0 INTEGER, item1 INTEGER, item2 INTEGER,
      item3 INTEGER, item4 INTEGER, item5 INTEGER, item6 INTEGER,
      team_position  TEXT,
      score          REAL,
      PRIMARY KEY (game_id, participant_id)
    );

    -- One row per augment taken by anyone, against game_augments' one row per
    -- augment WE took. champion_id/win/is_remake are denormalized so the
    -- augment leaderboards are a single grouped index scan.
    CREATE TABLE IF NOT EXISTS match_participant_augments (
      game_id        INTEGER NOT NULL,
      participant_id INTEGER NOT NULL,
      slot           INTEGER NOT NULL,
      augment_id     INTEGER NOT NULL,
      champion_id    INTEGER NOT NULL DEFAULT 0,
      win            INTEGER NOT NULL DEFAULT 0,
      is_remake      INTEGER NOT NULL DEFAULT 0,
      queue_id       INTEGER,
      game_version   TEXT,
      PRIMARY KEY (game_id, participant_id, slot)
    );

    CREATE TABLE IF NOT EXISTS player_stats (
      game_id              INTEGER PRIMARY KEY REFERENCES games(game_id),
      champion_id          INTEGER NOT NULL,
      win                  INTEGER NOT NULL,
      kills                INTEGER NOT NULL DEFAULT 0,
      deaths               INTEGER NOT NULL DEFAULT 0,
      assists              INTEGER NOT NULL DEFAULT 0,
      double_kills         INTEGER NOT NULL DEFAULT 0,
      triple_kills         INTEGER NOT NULL DEFAULT 0,
      quadra_kills         INTEGER NOT NULL DEFAULT 0,
      penta_kills          INTEGER NOT NULL DEFAULT 0,
      total_damage_dealt   INTEGER NOT NULL DEFAULT 0,
      total_damage_taken   INTEGER NOT NULL DEFAULT 0,
      gold_earned          INTEGER NOT NULL DEFAULT 0,
      total_heal           INTEGER NOT NULL DEFAULT 0,
      largest_killing_spree INTEGER NOT NULL DEFAULT 0,
      -- Records-only fields, mirrored from match_participants — see the
      -- comment there for why total_damage_dealt_all differs from
      -- total_damage_dealt.
      total_damage_dealt_all INTEGER NOT NULL DEFAULT 0,
      true_damage_dealt      INTEGER NOT NULL DEFAULT 0,
      cs                     INTEGER NOT NULL DEFAULT 0,
      largest_critical_strike INTEGER NOT NULL DEFAULT 0,
      score                REAL,
      -- Unclamped score, ordering key only — see PlayerScore.raw
      score_raw            REAL,
      score_badge          TEXT,
      spell1 INTEGER, spell2 INTEGER,
      item0 INTEGER, item1 INTEGER, item2 INTEGER,
      item3 INTEGER, item4 INTEGER, item5 INTEGER, item6 INTEGER
    );

    -- One owner-stat line per tracked account and game.  A game is shared by
    -- accounts, so player_stats remains the legacy/default line while this
    -- table preserves the other tracked accounts' lines without duplicating
    -- the game or participant payload.
    CREATE TABLE IF NOT EXISTS tracked_game_stats (
      game_id INTEGER NOT NULL REFERENCES games(game_id),
      puuid TEXT NOT NULL,
      champion_id INTEGER NOT NULL,
      win INTEGER NOT NULL,
      kills INTEGER NOT NULL DEFAULT 0, deaths INTEGER NOT NULL DEFAULT 0,
      assists INTEGER NOT NULL DEFAULT 0,
      double_kills INTEGER NOT NULL DEFAULT 0, triple_kills INTEGER NOT NULL DEFAULT 0,
      quadra_kills INTEGER NOT NULL DEFAULT 0, penta_kills INTEGER NOT NULL DEFAULT 0,
      total_damage_dealt INTEGER NOT NULL DEFAULT 0,
      total_damage_taken INTEGER NOT NULL DEFAULT 0,
      gold_earned INTEGER NOT NULL DEFAULT 0, total_heal INTEGER NOT NULL DEFAULT 0,
      largest_killing_spree INTEGER NOT NULL DEFAULT 0,
      total_damage_dealt_all INTEGER NOT NULL DEFAULT 0,
      true_damage_dealt INTEGER NOT NULL DEFAULT 0,
      cs INTEGER NOT NULL DEFAULT 0, largest_critical_strike INTEGER NOT NULL DEFAULT 0,
      score REAL, score_raw REAL, score_badge TEXT,
      spell1 INTEGER, spell2 INTEGER,
      item0 INTEGER, item1 INTEGER, item2 INTEGER, item3 INTEGER,
      item4 INTEGER, item5 INTEGER, item6 INTEGER,
      PRIMARY KEY (game_id, puuid)
    );

    CREATE TABLE IF NOT EXISTS game_augments (
      game_id    INTEGER NOT NULL REFERENCES games(game_id),
      slot       INTEGER NOT NULL,
      augment_id INTEGER NOT NULL,
      PRIMARY KEY (game_id, slot)
    );

    CREATE TABLE IF NOT EXISTS summoner (
      puuid        TEXT PRIMARY KEY,
      game_name    TEXT,
      tag_line     TEXT,
      summoner_id  INTEGER,
      account_id   INTEGER,
      profile_icon INTEGER,
      updated_at   INTEGER NOT NULL,
      platform     TEXT,
      summoner_level INTEGER,
      ranked_solo_json TEXT,
      ranked_flex_json TEXT,
      mastery_json TEXT,
      last_seen INTEGER
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Games seen during a backfill that aren't Mayhem. Remembering them keeps
    -- repeat backfills from re-fetching every ARAM/Arena game each time.
    CREATE TABLE IF NOT EXISTS ignored_games (
      game_id INTEGER PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS riot_sync_state (
      puuid        TEXT PRIMARY KEY,
      platform     TEXT NOT NULL,
      last_sync_at INTEGER,
      last_match_id TEXT,
      complete     INTEGER NOT NULL DEFAULT 0
    );
  `);
}

// Split out from createTables because an index over a migrated-in column can
// only be built after runMigrations has actually added it. The triggers belong
// here too: a trigger body naming a column blocks ALTER TABLE ... DROP COLUMN
// on that table, and migrateToV2 drops games.raw_json.
function createIndexes() {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_games_creation ON games(game_creation DESC);
    CREATE INDEX IF NOT EXISTS idx_games_puuid ON games(puuid);
    CREATE INDEX IF NOT EXISTS idx_tracked_game_stats_puuid ON tracked_game_stats(puuid);
    CREATE INDEX IF NOT EXISTS idx_games_version ON games(game_version);
    CREATE INDEX IF NOT EXISTS idx_games_queue ON games(queue_id);
    CREATE INDEX IF NOT EXISTS idx_player_stats_champion ON player_stats(champion_id);
    CREATE INDEX IF NOT EXISTS idx_game_augments_augment ON game_augments(augment_id);

    -- champion_id first because every global aggregate either groups by it or
    -- filters on it; is_remake and win ride along so the common counts are
    -- answered from the index alone.
    CREATE INDEX IF NOT EXISTS idx_mp_champion
      ON match_participants(champion_id, is_remake, win);
    CREATE INDEX IF NOT EXISTS idx_mp_puuid ON match_participants(puuid);
    -- The teammate self-join matches a game's two teams against each other.
    CREATE INDEX IF NOT EXISTS idx_mp_game_team ON match_participants(game_id, team_id);
    CREATE INDEX IF NOT EXISTS idx_mpa_augment
      ON match_participant_augments(augment_id, is_remake, win, champion_id);
  `);

  // is_remake, queue_id and game_version live on games but are copied onto
  // every participant row. Syncing them here rather than at each call site
  // means a future writer of those columns can't silently desync the copies.
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_games_denorm_participants
    AFTER UPDATE OF is_remake, queue_id, game_version ON games
    BEGIN
      UPDATE match_participants
         SET is_remake = NEW.is_remake, queue_id = NEW.queue_id, game_version = NEW.game_version
       WHERE game_id = NEW.game_id;
      UPDATE match_participant_augments
         SET is_remake = NEW.is_remake, queue_id = NEW.queue_id, game_version = NEW.game_version
       WHERE game_id = NEW.game_id;
    END;
  `);
}

// ---- Migrations ----
//
// Stamped in PRAGMA user_version. Version 0 means the database predates
// versioning, so it could be missing any subset of the columns v1 adds — which
// is why each step checks for its column rather than assuming. A database that
// createTables just built is also version 0, and lands on the same no-op path.
const SCHEMA_VERSION = 20;

function tableColumns(table: string): Set<string> {
  const rows = db.pragma(`table_info(${table})`) as { name: string }[];
  return new Set(rows.map((r) => r.name));
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

// Brings pre-versioning databases up to the schema createTables now declares.
// Each column is added only if absent, so this is a no-op on both new databases
// and ones already carried forward by the old try/catch migrations.
function migrateToV1() {
  const games = tableColumns("games");

  if (!games.has("is_remake")) {
    db.exec("ALTER TABLE games ADD COLUMN is_remake INTEGER NOT NULL DEFAULT 0");
    backfillRemakes();
  }

  if (!games.has("puuid")) {
    db.exec("ALTER TABLE games ADD COLUMN puuid TEXT NOT NULL DEFAULT ''");
    backfillGamePuuids();
  }

  if (!games.has("game_version")) {
    db.exec("ALTER TABLE games ADD COLUMN game_version TEXT");
    backfillGameVersions();
  }

  // Pins games to the top of match history; nothing to backfill.
  if (!games.has("favorite")) {
    db.exec("ALTER TABLE games ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0");
  }

  // Scores are populated by checkScoreBackfill once champion data has loaded,
  // so the columns only need to exist here.
  const playerStats = tableColumns("player_stats");
  if (!playerStats.has("score")) {
    db.exec("ALTER TABLE player_stats ADD COLUMN score REAL");
  }
  if (!playerStats.has("score_badge")) {
    db.exec("ALTER TABLE player_stats ADD COLUMN score_badge TEXT");
  }

  // Remember our own profile icon so the home page can show it
  if (!tableColumns("summoner").has("profile_icon")) {
    db.exec("ALTER TABLE summoner ADD COLUMN profile_icon INTEGER");
  }
}
// Payloads are read a page at a time wherever they're read in bulk: a library
// of a few thousand is a hundred megabytes-plus of JSON, and holding it all at
// once is what this whole change exists to stop doing.
const PAYLOAD_PAGE_SIZE = 200;

interface NormalizeResult {
  /** Games that produced at least one participant row. */
  normalized: number;
  /** Games whose payload wouldn't parse, or carried no participants. */
  unusable: number;
}

// Re-derives match_participants and match_participant_augments for every game
// that still has its payload. This is the one place that turns a stored payload
// into rows, shared by the v2 migration and by Repair — so the two can't drift
// into disagreeing about what a participant row should contain.
function rebuildParticipantsFromPayloads(): NormalizeResult {
  const page = db.prepare(`
    SELECT game_id, is_remake, queue_id, game_version, raw_gz
    FROM games
    WHERE raw_gz IS NOT NULL AND game_id > ?
    ORDER BY game_id
    LIMIT ?
  `);

  let lastId = 0;
  const result: NormalizeResult = { normalized: 0, unusable: 0 };
  for (;;) {
    const rows = page.all(lastId, PAYLOAD_PAGE_SIZE) as {
      game_id: number;
      is_remake: number;
      queue_id: number | null;
      game_version: string | null;
      raw_gz: Buffer;
    }[];
    if (rows.length === 0) break;

    const tx = db.transaction(() => {
      for (const row of rows) {
        const participants = participantRowsFromRaw(unpackRaw(row.raw_gz));
        if (participants.length === 0) {
          result.unusable++;
          continue;
        }
        writeParticipants(
          row.game_id,
          {
            is_remake: row.is_remake,
            queue_id: row.queue_id,
            game_version: row.game_version,
          },
          participants,
        );
        result.normalized++;
      }
    });
    tx();

    lastId = rows[rows.length - 1].game_id;
  }

  return result;
}

// Compresses the raw payloads, normalizes them into match_participants, and
// then drops the raw_json column. This is the only chance to extract from the
// text column, so the rows are written and checked before it goes away.
function migrateToV2() {
  const games = tableColumns("games");
  // Nothing to carry over: either a database this version created, or one
  // already migrated whose user_version didn't stick.
  if (!games.has("raw_json")) return;

  if (!games.has("raw_gz")) {
    db.exec("ALTER TABLE games ADD COLUMN raw_gz BLOB");
  }
  // The v2 rebuild uses the current participant writer, so old unversioned
  // databases need the current participant columns before payload replay.
  migrateToV5();

  // Pass one moves the payloads across as-is. The stored text is compressed
  // rather than reserialized, so a backup taken after this migration is byte
  // for byte the backup that would have been taken before it.
  const page = db.prepare(`
    SELECT game_id, raw_json
    FROM games
    WHERE raw_json IS NOT NULL AND raw_gz IS NULL AND game_id > ?
    ORDER BY game_id
    LIMIT ?
  `);
  const compress = db.prepare("UPDATE games SET raw_gz = ? WHERE game_id = ?");

  let lastId = 0;
  for (;;) {
    const rows = page.all(lastId, PAYLOAD_PAGE_SIZE) as {
      game_id: number;
      raw_json: string;
    }[];
    if (rows.length === 0) break;

    const tx = db.transaction(() => {
      for (const row of rows) compress.run(zlib.gzipSync(row.raw_json), row.game_id);
    });
    tx();

    lastId = rows[rows.length - 1].game_id;
  }

  // Pass two derives the rows every query now reads.
  const { normalized, unusable } = rebuildParticipantsFromPayloads();

  // Nothing below this line is reversible, so confirm the rows are actually on
  // disk first: every game holding a payload should have participants, bar the
  // ones this pass already reported it couldn't read.
  const stranded = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM games g
      WHERE g.raw_json IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM match_participants mp WHERE mp.game_id = g.game_id)
    `)
    .get() as { count: number };

  if (stranded.count > unusable) {
    console.error(
      `Skipping raw_json drop: ${stranded.count} games have no participant rows (expected at most ${unusable})`,
    );
    return;
  }

  db.exec("ALTER TABLE games DROP COLUMN raw_json");
  // The dropped column's pages are free but still in the file — for a typical
  // library that's most of it, so reclaim them now rather than leaving the
  // saving invisible.
  db.exec("VACUUM");
  console.log(
    `Normalized ${normalized} games into match_participants` +
      (unusable > 0 ? ` (${unusable} payloads unreadable)` : ""),
  );
}

// Adds the summoner spell columns and fills them from the stored payloads.
function migrateToV3() {
  for (const table of ["match_participants", "player_stats"]) {
    const cols = tableColumns(table);
    if (!cols.has("spell1")) db.exec(`ALTER TABLE ${table} ADD COLUMN spell1 INTEGER`);
    if (!cols.has("spell2")) db.exec(`ALTER TABLE ${table} ADD COLUMN spell2 INTEGER`);
  }
  // Re-deriving the participant rows wholesale is how spells reach
  // match_participants; the copy below then narrows them to the game's owner.
  rebuildParticipantsFromPayloads();
  backfillPlayerStatsSpells();
}

// Adds the unclamped score column. Nothing to backfill here: bumping
// SCORE_FORMULA_VERSION alongside it makes checkScoreBackfill rescore every
// game on the next launch, which is what fills it in.
function migrateToV4() {
  if (!tableColumns("player_stats").has("score_raw")) {
    db.exec("ALTER TABLE player_stats ADD COLUMN score_raw REAL");
  }
}

// Adds the participant combat statistics introduced after the original
// normalized schema. Existing rows keep a safe zero until their raw payload is
// replayed by v6.
function migrateToV5() {
  const participants = tableColumns("match_participants");
  if (!participants.has("true_damage")) {
    db.exec("ALTER TABLE match_participants ADD COLUMN true_damage INTEGER NOT NULL DEFAULT 0");
  }
  if (!participants.has("largest_critical_strike")) {
    db.exec(
      "ALTER TABLE match_participants ADD COLUMN largest_critical_strike INTEGER NOT NULL DEFAULT 0",
    );
  }
  if (!participants.has("cs")) {
    db.exec("ALTER TABLE match_participants ADD COLUMN cs INTEGER NOT NULL DEFAULT 0");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS riot_sync_state (
      puuid TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      last_sync_at INTEGER,
      last_match_id TEXT,
      complete INTEGER NOT NULL DEFAULT 0
    )
  `);
}

function migrateToV6() {
  const mp = tableColumns("match_participants");
  if (!mp.has("total_damage_dealt_all")) {
    db.exec(
      "ALTER TABLE match_participants ADD COLUMN total_damage_dealt_all INTEGER NOT NULL DEFAULT 0",
    );
  }
  if (!mp.has("true_damage_dealt")) {
    db.exec(
      "ALTER TABLE match_participants ADD COLUMN true_damage_dealt INTEGER NOT NULL DEFAULT 0",
    );
  }
  const ps = tableColumns("player_stats");
  if (!ps.has("total_damage_dealt_all")) {
    db.exec(
      "ALTER TABLE player_stats ADD COLUMN total_damage_dealt_all INTEGER NOT NULL DEFAULT 0",
    );
  }
  if (!ps.has("true_damage_dealt")) {
    db.exec("ALTER TABLE player_stats ADD COLUMN true_damage_dealt INTEGER NOT NULL DEFAULT 0");
  }
  if (!ps.has("cs")) db.exec("ALTER TABLE player_stats ADD COLUMN cs INTEGER NOT NULL DEFAULT 0");
  if (!ps.has("largest_critical_strike")) {
    db.exec(
      "ALTER TABLE player_stats ADD COLUMN largest_critical_strike INTEGER NOT NULL DEFAULT 0",
    );
  }
  rebuildParticipantsFromPayloads();
  rebuildDerivedStats();
}

// Repairs databases stamped by earlier partial records migrations.
function migrateToV7() {
  try {
    const required = {
      match_participants: [
        ["true_damage", "INTEGER NOT NULL DEFAULT 0"],
        ["total_damage_dealt_all", "INTEGER NOT NULL DEFAULT 0"],
        ["true_damage_dealt", "INTEGER NOT NULL DEFAULT 0"],
        ["largest_critical_strike", "INTEGER NOT NULL DEFAULT 0"],
        ["cs", "INTEGER NOT NULL DEFAULT 0"],
      ],
      player_stats: [
        ["total_damage_dealt_all", "INTEGER NOT NULL DEFAULT 0"],
        ["true_damage_dealt", "INTEGER NOT NULL DEFAULT 0"],
        ["cs", "INTEGER NOT NULL DEFAULT 0"],
        ["largest_critical_strike", "INTEGER NOT NULL DEFAULT 0"],
      ],
    } as const;
    for (const [table, columns] of Object.entries(required)) {
      const existing = tableColumns(table);
      for (const [column, definition] of columns) {
        if (!existing.has(column))
          db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      }
    }
    rebuildParticipantsFromPayloads();
    rebuildDerivedStats();
  } catch (error) {
    console.error("Database schema migration v7 failed:", error);
    throw error;
  }
}

// Copies each game owner's spells from their participant row onto player_stats.
// Owner resolution mirrors rebuildDerivedStats: puuid first, then the stored
// stats line for old imports whose owner puuid was never recovered.
function backfillPlayerStatsSpells() {
  const games = db
    .prepare(`
      SELECT g.game_id, g.puuid, ps.champion_id, ps.kills, ps.deaths, ps.assists
      FROM games g
      JOIN player_stats ps ON g.game_id = ps.game_id
    `)
    .all() as {
    game_id: number;
    puuid: string;
    champion_id: number;
    kills: number;
    deaths: number;
    assists: number;
  }[];

  const participants = groupByGame(
    db
      .prepare(`
        SELECT game_id, puuid, champion_id, kills, deaths, assists, spell1, spell2
        FROM match_participants
      `)
      .all() as {
      game_id: number;
      puuid: string | null;
      champion_id: number;
      kills: number;
      deaths: number;
      assists: number;
      spell1: number | null;
      spell2: number | null;
    }[],
  );

  const updateStmt = db.prepare("UPDATE player_stats SET spell1 = ?, spell2 = ? WHERE game_id = ?");
  const tx = db.transaction(() => {
    for (const game of games) {
      const rows = participants.get(game.game_id) ?? [];
      let owner = game.puuid ? rows.find((p) => p.puuid === game.puuid) : undefined;
      owner ??= rows.find(
        (p) =>
          p.champion_id === game.champion_id &&
          p.kills === game.kills &&
          p.deaths === game.deaths &&
          p.assists === game.assists,
      );
      if (owner) updateStmt.run(owner.spell1, owner.spell2, game.game_id);
    }
  });
  tx();
}

// Retroactively detect remakes for games stored before the flag existed
function backfillRemakes() {
  const games = db.prepare("SELECT game_id, game_duration, raw_json FROM games").all() as {
    game_id: number;
    game_duration: number;
    raw_json: string | null;
  }[];
  const updateStmt = db.prepare("UPDATE games SET is_remake = 1 WHERE game_id = ?");
  const tx = db.transaction(() => {
    for (const game of games) {
      // Runs inside migrateToV1, before the blobs have been normalized, so the
      // participant rows have to come from the payload itself.
      let rows: { early_surrender: number }[] = [];
      if (game.raw_json) {
        try {
          rows = participantRowsFromRaw(JSON.parse(game.raw_json));
        } catch {
          /* ignore parse errors */
        }
      }
      if (detectRemake(game.game_duration, rows)) {
        updateStmt.run(game.game_id);
      }
    }
  });
  tx();
}

// Recover each game's owner by matching stored player_stats against the
// raw_json participants, for databases from before multi-account support
function backfillGamePuuids() {
  const gamesToBackfill = db
    .prepare(`
      SELECT g.game_id, g.raw_json,
             ps.champion_id, ps.kills, ps.deaths, ps.assists
      FROM games g
      JOIN player_stats ps ON g.game_id = ps.game_id
      WHERE g.puuid = '' AND g.raw_json IS NOT NULL
    `)
    .all() as {
    game_id: number;
    raw_json: string;
    champion_id: number;
    kills: number;
    deaths: number;
    assists: number;
  }[];

  const updateStmt = db.prepare("UPDATE games SET puuid = ? WHERE game_id = ?");
  const upsertStmt = db.prepare(`
    INSERT OR IGNORE INTO summoner (puuid, game_name, tag_line, summoner_id, account_id, updated_at)
    VALUES (?, ?, ?, NULL, NULL, ?)
  `);

  const tx = db.transaction(() => {
    for (const game of gamesToBackfill) {
      try {
        const raw = JSON.parse(game.raw_json);
        const participants = raw.participants || [];
        const identities = raw.participantIdentities || [];

        for (let i = 0; i < participants.length; i++) {
          const p = participants[i];
          const identity = identities[i];
          const s = p.stats || p;
          const championId = p.championId ?? s.championId ?? 0;

          if (
            championId === game.champion_id &&
            (s.kills ?? 0) === game.kills &&
            (s.deaths ?? 0) === game.deaths &&
            (s.assists ?? 0) === game.assists
          ) {
            const pPuuid = p.puuid || identity?.player?.puuid;
            if (pPuuid) {
              updateStmt.run(pPuuid, game.game_id);
              const gameName =
                identity?.player?.gameName ||
                identity?.player?.summonerName ||
                p.summonerName ||
                p.riotIdGameName ||
                null;
              const tagLine = identity?.player?.tagLine || p.riotIdTagline || null;
              upsertStmt.run(pPuuid, gameName, tagLine, Date.now());
            }
            break;
          }
        }
      } catch {
        /* ignore parse errors */
      }
    }
  });
  tx();
}

function backfillGameVersions() {
  const games = db
    .prepare("SELECT game_id, raw_json FROM games WHERE raw_json IS NOT NULL")
    .all() as { game_id: number; raw_json: string }[];
  const updateStmt = db.prepare("UPDATE games SET game_version = ? WHERE game_id = ?");
  const tx = db.transaction(() => {
    for (const game of games) {
      try {
        const raw = JSON.parse(game.raw_json);
        const patch = parsePatch(raw.gameVersion);
        if (patch) updateStmt.run(patch, game.game_id);
      } catch {
        /* ignore parse errors */
      }
    }
  });
  tx();
}

// game_augments holds our own picks; match_participant_augments holds
// everyone's. Once a game is normalized the former is just the latter narrowed
// to the game's owner, so widening our stored slots is a copy, not a re-parse.
function backfillAugmentSlots() {
  db.exec(`
    INSERT OR IGNORE INTO game_augments (game_id, slot, augment_id)
    SELECT a.game_id, a.slot, a.augment_id
    FROM match_participant_augments a
    JOIN games g ON g.game_id = a.game_id
    JOIN match_participants p
      ON p.game_id = a.game_id AND p.participant_id = a.participant_id
    WHERE g.puuid != '' AND p.puuid = g.puuid
  `);
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

export function upsertSummoner(summoner: {
  puuid: string;
  gameName?: string | null;
  tagLine?: string | null;
  summonerId?: number | null;
  accountId?: number | null;
  profileIconId?: number | null;
  platform?: string | null;
  summonerLevel?: number | null;
  displayName?: string | null;
  internalName?: string | null;
  game_name?: string | null;
  tag_line?: string | null;
  summoner_id?: number | null;
  account_id?: number | null;
  profile_icon?: number | null;
  summoner_level?: number | null;
}): void {
  const now = Date.now();
  const gameName =
    summoner.gameName ??
    summoner.displayName ??
    summoner.internalName ??
    summoner.game_name ??
    null;
  const tagLine = summoner.tagLine ?? summoner.tag_line ?? null;
  const summonerId = summoner.summonerId ?? summoner.summoner_id ?? null;
  const accountId = summoner.accountId ?? summoner.account_id ?? null;
  const profileIconId = summoner.profileIconId ?? summoner.profile_icon ?? null;
  const summonerLevel = summoner.summonerLevel ?? summoner.summoner_level ?? null;

  db.prepare(`
    INSERT INTO summoner (
      puuid,
      game_name,
      tag_line,
      summoner_id,
      account_id,
      profile_icon,
      updated_at,
      platform,
      summoner_level,
      last_seen
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(puuid) DO UPDATE SET
      game_name = COALESCE(excluded.game_name, summoner.game_name),
      tag_line = COALESCE(excluded.tag_line, summoner.tag_line),
      summoner_id = COALESCE(excluded.summoner_id, summoner.summoner_id),
      account_id = COALESCE(excluded.account_id, summoner.account_id),
      profile_icon = COALESCE(excluded.profile_icon, summoner.profile_icon),
      platform = COALESCE(excluded.platform, summoner.platform),
      summoner_level = COALESCE(excluded.summoner_level, summoner.summoner_level),
      updated_at = excluded.updated_at,
      last_seen = excluded.last_seen
  `).run(
    summoner.puuid,
    gameName,
    tagLine,
    summonerId,
    accountId,
    profileIconId,
    now,
    summoner.platform ?? null,
    summonerLevel,
    now,
  );
}

function restoreSummonerFull(row: {
  puuid: string;
  game_name: string | null;
  tag_line: string | null;
  summoner_id: number | null;
  account_id: number | null;
  profile_icon: number | null;
  updated_at: number;
  platform: string | null;
  summoner_level: number | null;
  ranked_solo_json: string | null;
  ranked_flex_json: string | null;
  mastery_json: string | null;
  last_seen: number | null;
}): void {
  db.prepare(`
    INSERT OR REPLACE INTO summoner (
      puuid,
      game_name,
      tag_line,
      summoner_id,
      account_id,
      profile_icon,
      updated_at,
      platform,
      summoner_level,
      ranked_solo_json,
      ranked_flex_json,
      mastery_json,
      last_seen
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.puuid,
    row.game_name,
    row.tag_line,
    row.summoner_id,
    row.account_id,
    row.profile_icon,
    row.updated_at,
    row.platform,
    row.summoner_level,
    row.ranked_solo_json,
    row.ranked_flex_json,
    row.mastery_json,
    row.last_seen,
  );
}

export function saveAccountSnapshot(snapshot: {
  puuid: string;
  gameName?: string | null;
  tagLine?: string | null;
  profileIconId?: number | null;
  platform?: string | null;
  summonerLevel?: number | null;
  rankedSolo?: RankEntry | null;
  rankedFlex?: RankEntry | null;
  topMasteryChampions?: MasteryChampion[];
}): void {
  console.log("[db] saveAccountSnapshot called:", { puuid: snapshot.puuid });
  const tx = db.transaction(() => {
    upsertSummoner({
      puuid: snapshot.puuid,
      gameName: snapshot.gameName,
      tagLine: snapshot.tagLine,
      profileIconId: snapshot.profileIconId,
      platform: snapshot.platform,
      summonerLevel: snapshot.summonerLevel,
    });

    const rankedSoloJson = snapshot.rankedSolo == null ? null : JSON.stringify(snapshot.rankedSolo);
    const rankedFlexJson = snapshot.rankedFlex == null ? null : JSON.stringify(snapshot.rankedFlex);
    const masteryJson =
      snapshot.topMasteryChampions == null ? null : JSON.stringify(snapshot.topMasteryChampions);

    db.prepare(`
      UPDATE summoner
      SET
        platform = COALESCE(?, platform),
        summoner_level = COALESCE(?, summoner_level),
        ranked_solo_json = COALESCE(?, ranked_solo_json),
        ranked_flex_json = COALESCE(?, ranked_flex_json),
        mastery_json = COALESCE(?, mastery_json),
        last_seen = ?
      WHERE puuid = ?
    `).run(
      snapshot.platform ?? null,
      snapshot.summonerLevel ?? null,
      rankedSoloJson,
      rankedFlexJson,
      masteryJson,
      Date.now(),
      snapshot.puuid,
    );
  });

  tx();
  console.log("[db] saveAccountSnapshot done:", { puuid: snapshot.puuid });
}

export function updateParticipantNames(puuid: string, gameName: string, tagLine: string): number {
  const info = db
    .prepare(`
      UPDATE match_participants
      SET game_name = ?, tag_line = ?
      WHERE puuid = ?
        AND (game_name IS NOT ? OR tag_line IS NOT ?)
    `)
    .run(gameName, tagLine, puuid, gameName, tagLine);
  return info.changes;
}

export function reconcileAllParticipantNames(): { accounts: number; rows: number } {
  const summoners = db
    .prepare(`
      SELECT puuid, game_name, tag_line
      FROM summoner
      WHERE game_name IS NOT NULL
    `)
    .all() as Array<{ puuid: string; game_name: string; tag_line: string | null }>;

  const tx = db.transaction(() => {
    let rows = 0;
    for (const summoner of summoners) {
      rows += updateParticipantNames(summoner.puuid, summoner.game_name, summoner.tag_line ?? "");
    }
    return { accounts: summoners.length, rows };
  });

  return tx();
}

function parseSnapshotJson<T>(value: string | null): T | null {
  if (value == null) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function getAccountSnapshot(puuid: string): {
  puuid: string;
  gameName: string | null;
  tagLine: string | null;
  profileIconId: number | null;
  platform: string | null;
  summonerLevel: number | null;
  rankedSolo: RankEntry | null;
  rankedFlex: RankEntry | null;
  topMasteryChampions: MasteryChampion[];
  lastSeen: number | null;
} | null {
  console.log("[db] getAccountSnapshot called:", { puuid });
  const row = db
    .prepare(`
      SELECT
        puuid,
        game_name,
        tag_line,
        profile_icon,
        platform,
        summoner_level,
        ranked_solo_json,
        ranked_flex_json,
        mastery_json,
        last_seen
      FROM summoner
      WHERE puuid = ?
    `)
    .get(puuid) as
    | {
        puuid: string;
        game_name: string | null;
        tag_line: string | null;
        profile_icon: number | null;
        platform: string | null;
        summoner_level: number | null;
        ranked_solo_json: string | null;
        ranked_flex_json: string | null;
        mastery_json: string | null;
        last_seen: number | null;
      }
    | undefined;

  if (!row) {
    console.log("[db] getAccountSnapshot done:", { found: false });
    return null;
  }

  console.log("[db] getAccountSnapshot done:", { found: true, puuid });
  return {
    puuid: row.puuid,
    gameName: row.game_name,
    tagLine: row.tag_line,
    profileIconId: row.profile_icon,
    platform: row.platform,
    summonerLevel: row.summoner_level,
    rankedSolo: parseSnapshotJson<RankEntry>(row.ranked_solo_json),
    rankedFlex: parseSnapshotJson<RankEntry>(row.ranked_flex_json),
    topMasteryChampions: parseSnapshotJson<MasteryChampion[]>(row.mastery_json) ?? [],
    lastSeen: row.last_seen,
  };
}

export function listAccountsWithData(): Array<{
  puuid: string;
  gameName: string | null;
  tagLine: string | null;
  profileIconId: number | null;
  platform: string | null;
  summonerLevel: number | null;
  lastSeen: number | null;
  gameCount: number;
}> {
  console.log("[db] listAccountsWithData called:", {});
  const rows = db
    .prepare(`
      SELECT
        s.puuid,
        s.game_name,
        s.tag_line,
        s.profile_icon,
        s.platform,
        s.summoner_level,
        s.last_seen,
        COUNT(tgs.game_id) AS game_count
      FROM summoner s
      INNER JOIN tracked_game_stats tgs ON tgs.puuid = s.puuid
      GROUP BY s.puuid
      HAVING COUNT(tgs.game_id) > 0
      ORDER BY s.last_seen DESC
    `)
    .all() as Array<{
    puuid: string;
    game_name: string | null;
    tag_line: string | null;
    profile_icon: number | null;
    platform: string | null;
    summoner_level: number | null;
    last_seen: number | null;
    game_count: number;
  }>;

  console.log("[db] listAccountsWithData done:", { count: rows.length });
  return rows.map((row) => ({
    puuid: row.puuid,
    gameName: row.game_name,
    tagLine: row.tag_line,
    profileIconId: row.profile_icon,
    platform: row.platform,
    summonerLevel: row.summoner_level,
    lastSeen: row.last_seen,
    gameCount: row.game_count,
  }));
}

export function updateSummonerProfileIcon(puuid: string, profileIcon: number): void {
  db.prepare(`
    INSERT INTO summoner (puuid, profile_icon, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(puuid) DO UPDATE SET
      profile_icon = excluded.profile_icon,
      updated_at = excluded.updated_at
  `).run(puuid, profileIcon, Date.now());
}

export function getSummoner(): any {
  return db.prepare("SELECT * FROM summoner ORDER BY updated_at DESC LIMIT 1").get();
}

// The header names whichever account played most recently, so its name and icon
// always come from the same place. Keying off the summoner table's updated_at
// instead would name the account the client last synced — which need not be the
// one that played, and which repairPuuids rewrites for every account at once.
export function getProfile(): {
  puuid: string | null;
  name: string | null;
  profileIcon: number | null;
  platform: string | null;
} {
  const latest = db
    .prepare(
      "SELECT game_id, puuid FROM games WHERE puuid != '' ORDER BY game_creation DESC LIMIT 1",
    )
    .get() as { game_id: number; puuid: string } | undefined;

  // No games yet — the client is the only thing that knows who we are
  const row = latest
    ? (db.prepare("SELECT * FROM summoner WHERE puuid = ?").get(latest.puuid) as any)
    : getSummoner();
  const profilePuuid = latest?.puuid ?? row?.puuid ?? null;
  const platform = profilePuuid
    ? ((
        db
          .prepare(
            "SELECT platform FROM riot_sync_state WHERE puuid = ? ORDER BY last_sync_at DESC LIMIT 1",
          )
          .get(profilePuuid) as { platform: string } | undefined
      )?.platform ??
      getSetting("riot_platform") ??
      null)
    : (getSetting("riot_platform") ?? null);

  const name = row?.game_name
    ? row.tag_line
      ? `${row.game_name}#${row.tag_line}`
      : row.game_name
    : null;
  const icon = row?.profile_icon ?? null;
  if (name && icon != null) {
    return { puuid: profilePuuid, name, profileIcon: icon, platform };
  }

  // profile_icon only fills in once the client has synced this account, and an
  // imported game may have no summoner row at all — read both off the game
  // itself, still the same account.
  const fallback = latest
    ? identityFromGame(latest.game_id, latest.puuid)
    : { name: null, icon: null };
  return {
    puuid: profilePuuid,
    name: name ?? fallback.name,
    profileIcon: icon ?? fallback.icon,
    platform,
  };
}

export function getAllPuuids(): string[] {
  const rows = db.prepare("SELECT puuid FROM summoner").all() as { puuid: string }[];
  return rows.map((r) => r.puuid);
}

export function listSavedSummoners(): Array<{
  puuid: string;
  game_name: string | null;
  tag_line: string | null;
  profile_icon: number | null;
  updated_at: number;
  games: number;
}> {
  return db
    .prepare(
      `SELECT s.puuid, s.game_name, s.tag_line, s.profile_icon, s.updated_at,
              (SELECT COUNT(*)
                 FROM tracked_game_stats tgs
                 JOIN games g ON g.game_id = tgs.game_id
                WHERE tgs.puuid = s.puuid
                  AND g.source != 'search-import') AS games
       FROM summoner s
       ORDER BY s.updated_at DESC`,
    )
    .all() as Array<{
    puuid: string;
    game_name: string | null;
    tag_line: string | null;
    profile_icon: number | null;
    updated_at: number;
    games: number;
  }>;
}

export function deleteSavedSummoner(puuid: string): {
  deletedGames: number;
  deletedTrackedRows: number;
} {
  // A game is tied to an account two ways: through its own puuid column (the
  // owner), or through a tracked_game_stats row (a tracked participant).
  // An older Repair pass wrote games.puuid without creating a tracked row, so
  // reading only tracked_game_stats left those games behind when the account
  // was deleted. Both sources must feed the orphan check below.
  const gameIds = db
    .prepare(`
      SELECT game_id FROM tracked_game_stats WHERE puuid = ?
      UNION
      SELECT game_id FROM games WHERE puuid = ?
    `)
    .all(puuid, puuid) as { game_id: number }[];
  const ids = gameIds.map((row) => row.game_id);
  let deletedGames = 0;
  let deletedTrackedRows = 0;

  const tx = db.transaction(() => {
    deletedTrackedRows = db
      .prepare("DELETE FROM tracked_game_stats WHERE puuid = ?")
      .run(puuid).changes;

    if (ids.length > 0) {
      const placeholders = ids.map(() => "?").join(", ");
      const orphanIds = (
        db
          .prepare(
            `SELECT g.game_id
             FROM games g
             WHERE g.game_id IN (${placeholders})
               AND NOT EXISTS (
                 SELECT 1 FROM tracked_game_stats tgs WHERE tgs.game_id = g.game_id
               )`,
          )
          .all(...ids) as { game_id: number }[]
      ).map((row) => row.game_id);

      if (orphanIds.length > 0) {
        const orphanPlaceholders = orphanIds.map(() => "?").join(", ");
        db.prepare(`DELETE FROM player_stats WHERE game_id IN (${orphanPlaceholders})`).run(
          ...orphanIds,
        );
        db.prepare(`DELETE FROM game_augments WHERE game_id IN (${orphanPlaceholders})`).run(
          ...orphanIds,
        );
        db.prepare(
          `DELETE FROM match_participant_augments WHERE game_id IN (${orphanPlaceholders})`,
        ).run(...orphanIds);
        db.prepare(`DELETE FROM match_participants WHERE game_id IN (${orphanPlaceholders})`).run(
          ...orphanIds,
        );
        db.prepare(`DELETE FROM games WHERE game_id IN (${orphanPlaceholders})`).run(...orphanIds);
      }
      deletedGames = orphanIds.length;
    }

    db.prepare("DELETE FROM summoner WHERE puuid = ?").run(puuid);
  });
  tx();

  return { deletedGames, deletedTrackedRows };
}

export function deleteSearchedSummoners(): { removed: number; games: number } {
  // A searched summoner has no LCU-sourced identity fields. Keep this
  // conservative so real saved accounts are not removed accidentally.
  const candidates = db
    .prepare(
      `SELECT s.puuid,
              (SELECT COUNT(*) FROM tracked_game_stats t WHERE t.puuid = s.puuid) as games
         FROM summoner s
        WHERE s.puuid IN (
          SELECT DISTINCT t.puuid
          FROM tracked_game_stats t
          JOIN games g ON g.game_id = t.game_id
          WHERE g.source = 'search-import'
        )`,
    )
    .all() as { puuid: string; games: number }[];

  let removed = 0;
  let removedGames = 0;
  const tx = db.transaction(() => {
    for (const candidate of candidates) {
      const result = deleteSavedSummoner(candidate.puuid);
      removed++;
      removedGames += result.deletedGames;
    }
  });
  tx();
  return { removed, games: removedGames };
}

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

// Preserve the owner line already stored in player_stats, then allow later
// imports for another tracked account to add a second line for the same game.
function migrateToV8() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracked_game_stats (
      game_id INTEGER NOT NULL REFERENCES games(game_id), puuid TEXT NOT NULL,
      champion_id INTEGER NOT NULL, win INTEGER NOT NULL,
      kills INTEGER NOT NULL DEFAULT 0, deaths INTEGER NOT NULL DEFAULT 0,
      assists INTEGER NOT NULL DEFAULT 0, double_kills INTEGER NOT NULL DEFAULT 0,
      triple_kills INTEGER NOT NULL DEFAULT 0, quadra_kills INTEGER NOT NULL DEFAULT 0,
      penta_kills INTEGER NOT NULL DEFAULT 0, total_damage_dealt INTEGER NOT NULL DEFAULT 0,
      total_damage_taken INTEGER NOT NULL DEFAULT 0, gold_earned INTEGER NOT NULL DEFAULT 0,
      total_heal INTEGER NOT NULL DEFAULT 0, largest_killing_spree INTEGER NOT NULL DEFAULT 0,
      total_damage_dealt_all INTEGER NOT NULL DEFAULT 0, true_damage_dealt INTEGER NOT NULL DEFAULT 0,
      cs INTEGER NOT NULL DEFAULT 0, largest_critical_strike INTEGER NOT NULL DEFAULT 0,
      score REAL, score_raw REAL, score_badge TEXT, spell1 INTEGER, spell2 INTEGER,
      item0 INTEGER, item1 INTEGER, item2 INTEGER, item3 INTEGER, item4 INTEGER,
      item5 INTEGER, item6 INTEGER, PRIMARY KEY (game_id, puuid)
    );
    INSERT OR IGNORE INTO tracked_game_stats
      (game_id, puuid, champion_id, win, kills, deaths, assists, double_kills,
       triple_kills, quadra_kills, penta_kills, total_damage_dealt, total_damage_taken,
       gold_earned, total_heal, largest_killing_spree, total_damage_dealt_all,
       true_damage_dealt, cs, largest_critical_strike, score, score_raw, score_badge,
       spell1, spell2, item0, item1, item2, item3, item4, item5, item6)
    SELECT g.game_id, g.puuid, ps.champion_id, ps.win, ps.kills, ps.deaths, ps.assists,
      ps.double_kills, ps.triple_kills, ps.quadra_kills, ps.penta_kills,
      ps.total_damage_dealt, ps.total_damage_taken, ps.gold_earned, ps.total_heal,
      ps.largest_killing_spree, ps.total_damage_dealt_all, ps.true_damage_dealt, ps.cs,
      ps.largest_critical_strike, ps.score, ps.score_raw, ps.score_badge, ps.spell1, ps.spell2,
      ps.item0, ps.item1, ps.item2, ps.item3, ps.item4, ps.item5, ps.item6
    FROM games g JOIN player_stats ps ON ps.game_id = g.game_id WHERE g.puuid != ''
  `);
}

function migrateToV9() {
  if (!tableColumns("match_participants").has("team_position")) {
    db.exec("ALTER TABLE match_participants ADD COLUMN team_position TEXT");
  }
  rebuildParticipantsFromPayloads();
}

function migrateToV10() {
  if (!tableColumns("match_participants").has("player_subteam_id")) {
    db.exec("ALTER TABLE match_participants ADD COLUMN player_subteam_id INTEGER");
  }
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
