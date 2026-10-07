import zlib from "zlib";
import { db } from "../db";
import * as backup from "../backup";
import { QUEUE_ID_MAYHEM_CLASSIC } from "../../shared/queues";
import { getSetting, setSetting } from "./settings";
import { groupByGame, parsePatch, detectRemake, rebuildDerivedStats } from "./scoring";
import { unpackRaw, participantRowsFromRaw, writeParticipants } from "./payloads";

// The old hide-Mayhem-Classic switch became a per-queue list. Carry the boolean
// over once; writing the key even when nothing was hidden is what keeps this
// from firing again after the user switches every queue back on.
export function migrateHiddenQueues() {
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

// Every table below is declared in its *current* shape, so a new database is
// correct without running a single migration. Migrations exist only to carry
// databases created by older versions up to the same shape — see runMigrations.
export function createTables() {
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
export function createIndexes() {
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
export const SCHEMA_VERSION = 22;

export function tableColumns(table: string): Set<string> {
  const rows = db.pragma(`table_info(${table})`) as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

// Brings pre-versioning databases up to the schema createTables now declares.
// Each column is added only if absent, so this is a no-op on both new databases
// and ones already carried forward by the old try/catch migrations.
export function migrateToV1() {
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
export function rebuildParticipantsFromPayloads(): NormalizeResult {
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
export function migrateToV2() {
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
export function migrateToV3() {
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
export function migrateToV4() {
  if (!tableColumns("player_stats").has("score_raw")) {
    db.exec("ALTER TABLE player_stats ADD COLUMN score_raw REAL");
  }
}

// Adds the participant combat statistics introduced after the original
// normalized schema. Existing rows keep a safe zero until their raw payload is
// replayed by v6.
export function migrateToV5() {
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

export function migrateToV6() {
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
export function migrateToV7() {
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
export function backfillPlayerStatsSpells() {
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
export function backfillRemakes() {
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
export function backfillGamePuuids() {
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

export function backfillGameVersions() {
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
export function backfillAugmentSlots() {
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

// Preserve the owner line already stored in player_stats, then allow later
// imports for another tracked account to add a second line for the same game.
export function migrateToV8() {
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

export function migrateToV9() {
  if (!tableColumns("match_participants").has("team_position")) {
    db.exec("ALTER TABLE match_participants ADD COLUMN team_position TEXT");
  }
  rebuildParticipantsFromPayloads();
}

export function migrateToV10() {
  if (!tableColumns("match_participants").has("player_subteam_id")) {
    db.exec("ALTER TABLE match_participants ADD COLUMN player_subteam_id INTEGER");
  }
}

export function migrateToV11() {
  if (!tableColumns("match_participants").has("player_subteam_placement")) {
    db.exec("ALTER TABLE match_participants ADD COLUMN player_subteam_placement INTEGER");
  }
  rebuildParticipantsFromPayloads();
}
export function migrateToV12() {
  // v11 and earlier could miss Match-V5's summoner2Id spelling when
  // normalizing participant spells. Rebuild stored payloads so spell2 is
  // populated for existing Arena and ARAM games.
  rebuildParticipantsFromPayloads();
}
export function migrateToV13() {
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
export function migrateToV14() {
  const result = rebuildParticipantsFromPayloads();
  console.log(`[db] v14 rebuild: ${result.normalized} rows rewritten`);
}
export function migrateToV15() {
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
export function migrateToV16() {
  const result = rebuildParticipantsFromPayloads();
  console.log(`[db] v16 rebuild: ${result.normalized} rows rewritten`);
}
export function migrateToV17() {
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
export function migrateToV18() {
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
export function migrateToV19() {
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
export async function migrateToV20() {
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

export function migrateToV21(): void {
  // The rune columns on match_participants have always been in the schema
  // but were never written by the ingestion path. This migration re-derives
  // every participant row from its stored raw_gz payload, which now
  // includes the rune fields.
  const result = rebuildParticipantsFromPayloads();
  console.log(
    `[db] v21 rune backfill: ${result.normalized} rows rewritten, ${result.unusable} unreadable payloads`,
  );
}

export function migrateToV22(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS match_timeline_status (
      game_id      INTEGER PRIMARY KEY,
      fetched_at   INTEGER NOT NULL,
      frame_count  INTEGER NOT NULL,
      event_count  INTEGER NOT NULL,
      fetch_error   TEXT,
      raw_gz        BLOB
    );

    CREATE TABLE IF NOT EXISTS match_timeline_frames (
      game_id         INTEGER NOT NULL,
      frame_index     INTEGER NOT NULL,
      timestamp_ms    INTEGER NOT NULL,
      participant_id  INTEGER NOT NULL,
      puuid           TEXT,
      level           INTEGER,
      xp              INTEGER,
      gold            INTEGER,
      cs              INTEGER,
      position_x      INTEGER,
      position_y      INTEGER,
      attack_damage   INTEGER,
      ability_power   INTEGER,
      armor           INTEGER,
      magic_resist    INTEGER,
      attack_speed    REAL,
      ability_haste   INTEGER,
      move_speed      INTEGER,
      max_health      INTEGER,
      current_health  INTEGER,
      PRIMARY KEY (game_id, frame_index, participant_id)
    );

    CREATE TABLE IF NOT EXISTS match_timeline_events (
      game_id          INTEGER NOT NULL,
      event_index      INTEGER NOT NULL,
      timestamp_ms     INTEGER NOT NULL,
      event_type       TEXT NOT NULL,
      participant_id   INTEGER,
      killer_id        INTEGER,
      victim_id        INTEGER,
      team_id          INTEGER,
      item_id          INTEGER,
      skill_slot       INTEGER,
      level_up_type    TEXT,
      ward_type        TEXT,
      building_type    TEXT,
      monster_type     TEXT,
      monster_subtype  TEXT,
      raw_json         TEXT,
      PRIMARY KEY (game_id, event_index)
    );
  `);
  console.log("[db] v22 added timeline tables");
}

export async function runMigrations() {
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
  if (current < 21) migrateToV21();
  if (current < 22) migrateToV22();

  db.pragma(`user_version = ${SCHEMA_VERSION}`);
}
