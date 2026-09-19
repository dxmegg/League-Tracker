import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import {
  SCORE_FORMULA_VERSION,
  computeMatchScores,
  type PlayerScore,
  type ScoreInput,
} from "../shared/opScore";
import { AUGMENT_SLOTS, QUEUE_ID_MAYHEM_CLASSIC } from "../shared/queues";
import {
  ARENA_QUEUE_IDS,
  MAYHEM_QUEUE_IDS,
  NO_CS_QUEUE_IDS,
  NO_STATS_QUEUE_IDS,
  QUEUE_GROUP_ARENA,
  QUEUE_SCOPE_NORMAL,
  QUEUE_SCOPE_ARAM,
  QUEUE_SCOPE_ARENA,
  QUEUE_SCOPE_MAYHEM,
  QUEUE_SCOPE_RANKED,
  QUEUE_SCOPE_REST,
} from "../shared/queues";
import { getDataDir } from "./paths";
import { getChampionClasses, getChampionDataVersion } from "./dragon";
import type { ItemStats, MasteryChampion, QueueStat, RankEntry } from "../shared/api";
import * as backup from "./backup";

export type GameSource = "lcu" | "riot-sync" | "search-import";

// Poro-Snax (base and upgraded) is handed out for free, so it skews item stats
const EXCLUDED_ITEM_IDS = [2052, 220013];

let db: Database.Database;
let scoreBackfillInFlight = false;

export function getDbPath() {
  return path.join(getDataDir(), "matches.db");
}

export async function initDatabase() {
  const dbPath = getDbPath();
  db = new Database(dbPath);
  // Prepared statements belong to the connection that made them, so the cache
  // can't outlive it.
  writeParticipantsStmts = null;
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
  writeParticipantsStmts = null;
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

// ---- Raw match payloads ----
//
// A match is ~30 KB of JSON and gzips to about an eighth of that, which is the
// difference between the blobs being most of the database and being a rounding
// error. Nothing reads them to answer a query — only export, and the one-time
// normalization in migrateToV2.

function packRaw(raw: any): Buffer {
  return zlib.gzipSync(JSON.stringify(raw));
}

function unpackRaw(blob: Buffer | null): any {
  if (!blob) return null;
  try {
    return JSON.parse(zlib.gunzipSync(blob).toString("utf8"));
  } catch {
    return null;
  }
}

// ---- Participant extraction ----

// Riot hands us two shapes: the LCU's participants[i] + participantIdentities[i]
// pair, and SGP's flattened participant with its stats inline. Both are
// unpicked exactly once, here, on the way into match_participants — so no read
// path has to know the difference.
interface RawParticipantRow {
  participant_id: number;
  puuid: string | null;
  game_name: string | null;
  tag_line: string | null;
  profile_icon: number | null;
  team_id: number;
  player_subteam_id: number | null;
  player_subteam_placement: number | null;
  champion_id: number;
  win: number;
  kills: number;
  deaths: number;
  assists: number;
  double_kills: number;
  triple_kills: number;
  quadra_kills: number;
  penta_kills: number;
  total_damage_dealt: number;
  total_damage_taken: number;
  true_damage: number;
  gold_earned: number;
  total_heal: number;
  largest_killing_spree: number;
  largest_critical_strike: number;
  cs: number;
  team_position: string | null;
  early_surrender: number;
  total_damage_dealt_all: number;
  true_damage_dealt: number;
  spell1: number | null;
  spell2: number | null;
  rune0: number | null;
  rune1: number | null;
  rune2: number | null;
  rune3: number | null;
  rune4: number | null;
  rune5: number | null;
  primary_style: number | null;
  secondary_style: number | null;
  items: (number | null)[];
  augments: { slot: number; augment_id: number }[];
}

// Bots and unresolved players carry an all-zeroes puuid. Dropping it here means
// every read path can treat "has a puuid" as "is a real, identifiable player".
function realPuuid(value: unknown): string | null {
  if (typeof value !== "string" || value === "") return null;
  return /^0+(-0+)*$/.test(value) ? null : value;
}

// "Name#TAG" where we have both halves, the bare name where we don't.
function displayName(gameName: string | null, tagLine: string | null): string | null {
  if (!gameName) return null;
  return tagLine ? `${gameName}#${tagLine}` : gameName;
}

// Every game stored in this database so far came in through the legacy
// LCU match-history shape (participant.stats.perk0..perk5/perkPrimaryStyle/
// perkSubStyle, no participant.perks at all) rather than the Match-V5 shape
// (participant.perks.styles[].selections[].perk). Reading only the Match-V5
// path — as every previous fix in this area did — silently produced empty
// rune data for 100% of real matches, which is the actual cause of the
// persistent "R" placeholder / "Primary / Secondary" fallback text: it was
// never a broken icon URL, it was rune data that never reached the UI.
// `owner` is a raw participant object; `stats` is `owner.stats` when present
// (legacy shape) or `owner` itself (Match-V5 shape, which is already flat).
export interface ExtractedRunes {
  runeIds: number[];
  primaryStyle: number | null;
  secondaryStyle: number | null;
  statShardIds: number[];
}

export function extractRunes(owner: any): ExtractedRunes {
  const stats = owner?.stats ?? owner ?? {};
  const styles: any[] = owner?.perks?.styles ?? stats?.perks?.styles ?? [];
  if (styles.length > 0) {
    const statPerks = owner?.perks?.statPerks ?? stats?.perks?.statPerks ?? {};
    const runeIds = styles
      .flatMap((style: any) => [
        style.style,
        ...(style.selections ?? []).map((selection: any) => selection.perk),
      ])
      .filter((id: any) => Number(id))
      .map(Number);
    return {
      runeIds,
      primaryStyle: Number(styles[0]?.style) || null,
      secondaryStyle: Number(styles[1]?.style) || null,
      statShardIds: [statPerks.offense, statPerks.flex, statPerks.defense]
        .map(Number)
        .filter(Boolean),
    };
  }

  // Legacy shape: flat perkN fields, in slot order rather than tree-grouped —
  // perk0 is the keystone plus 3 more primary perks (perk1-3), perk4-5 are the
  // two secondary perks. Positions must stay fixed through the slice below
  // (a missing/zero perk is still a slot), so zeros are only filtered out
  // after slicing, not before.
  const primaryStyle = Number(stats.perkPrimaryStyle) || null;
  const secondaryStyle = Number(stats.perkSubStyle) || null;
  const legacyPerks = [
    stats.perk0,
    stats.perk1,
    stats.perk2,
    stats.perk3,
    stats.perk4,
    stats.perk5,
  ].map(Number);
  const runeIds = [
    primaryStyle,
    ...legacyPerks.slice(0, 4),
    secondaryStyle,
    ...legacyPerks.slice(4, 6),
  ].filter((id): id is number => id != null && Number.isFinite(id) && id > 0);
  const statShardIds = [stats.statPerk0, stats.statPerk1, stats.statPerk2]
    .map(Number)
    .filter((id) => Number.isFinite(id) && id > 0);
  return { runeIds, primaryStyle, secondaryStyle, statShardIds };
}

// Riot Match-V5 sends teamPosition directly, but the League Client's own match
// payload does not: it sends timeline.lane + timeline.role instead. Normalize
// both spellings to the Match-V5 vocabulary so the rest of the app only ever
// sees "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY" | null.
function normalizeTeamPosition(raw: any, stats: any): string | null {
  const direct = raw?.teamPosition ?? stats?.teamPosition;
  if (typeof direct === "string" && direct) return direct;

  const lane = raw?.timeline?.lane ?? stats?.timeline?.lane;
  const role = raw?.timeline?.role ?? stats?.timeline?.role;
  if (typeof lane !== "string" || !lane || lane === "NONE") return null;

  // Bot lane is the only lane whose role disambiguates the position: support
  // is reported as UTILITY by Match-V5, carry as BOTTOM.
  if (lane === "BOTTOM" && role === "DUO_SUPPORT") return "UTILITY";
  return lane;
}

function participantRowsFromRaw(raw: any): RawParticipantRow[] {
  const participants = raw?.participants;
  if (!Array.isArray(participants)) return [];
  const identities = raw.participantIdentities || [];

  return participants.map((p: any, i: number): RawParticipantRow => {
    const s = p.stats || p;
    const player = identities[i]?.player || {};
    const augments: { slot: number; augment_id: number }[] = [];
    for (let slot = 1; slot <= AUGMENT_SLOTS; slot++) {
      const augId = s[`playerAugment${slot}`];
      if (augId && augId > 0) augments.push({ slot, augment_id: augId });
    }
    const icon = player.profileIcon;
    const runes = extractRunes(p);
    const perks = runes.runeIds.filter(
      (id) => id !== runes.primaryStyle && id !== runes.secondaryStyle,
    );
    const subteamRaw = p.playerSubteamId ?? s.playerSubteamId ?? p.subteamId ?? s.subteamId;
    const subteamId = Number(subteamRaw);
    const playerSubteamId = Number.isFinite(subteamId) && subteamId > 0 ? subteamId : null;
    const placementRaw =
      p.playerSubteamPlacement ??
      s.playerSubteamPlacement ??
      p.subteamPlacement ??
      s.subteamPlacement ??
      p.placement ??
      s.placement;
    const placementNum = Number(placementRaw);
    const playerSubteamPlacement =
      Number.isFinite(placementNum) && placementNum > 0 ? placementNum : null;

    return {
      participant_id: p.participantId ?? i + 1,
      puuid: realPuuid(p.puuid) ?? realPuuid(player.puuid),
      game_name:
        player.gameName || player.summonerName || p.summonerName || p.riotIdGameName || null,
      tag_line: player.tagLine || p.riotIdTagline || null,
      profile_icon: typeof icon === "number" && icon > 0 ? icon : null,
      team_id: p.teamId ?? s.teamId ?? 100,
      player_subteam_id: playerSubteamId,
      player_subteam_placement: playerSubteamPlacement,
      champion_id: p.championId ?? s.championId ?? 0,
      win: s.win ? 1 : 0,
      kills: s.kills ?? 0,
      deaths: s.deaths ?? 0,
      assists: s.assists ?? 0,
      double_kills: s.doubleKills ?? 0,
      triple_kills: s.tripleKills ?? 0,
      quadra_kills: s.quadraKills ?? 0,
      penta_kills: s.pentaKills ?? 0,
      total_damage_dealt: s.totalDamageDealtToChampions ?? s.totalDamageDealt ?? 0,
      total_damage_taken: s.totalDamageTaken ?? 0,
      true_damage: s.trueDamageDealtToChampions ?? 0,
      gold_earned: s.goldEarned ?? 0,
      total_heal: s.totalHeal ?? 0,
      largest_killing_spree: s.largestKillingSpree ?? 0,
      largest_critical_strike: s.largestCriticalStrike ?? 0,
      early_surrender: s.gameEndedInEarlySurrender ? 1 : 0,
      // Riot's "totalDamageDealt" is all damage the participant dealt —
      // champions, minions, jungle, structures — unlike total_damage_dealt
      // above, which prefers the champions-only figure. Keep both: the
      // scoreboard/records want champion damage, this new "total" record
      // wants the raw everything-included number.
      total_damage_dealt_all: Number(s.totalDamageDealt ?? 0),
      true_damage_dealt: Number(s.trueDamageDealtToChampions ?? s.trueDamageDealt ?? 0),
      spell1: p.spell1Id ?? p.summoner1Id ?? s.spell1Id ?? s.summoner1Id ?? null,
      spell2: p.spell2Id ?? p.summoner2Id ?? s.spell2Id ?? s.summoner2Id ?? null,
      cs:
        s.totalCreepScore != null
          ? Number(s.totalCreepScore)
          : Number(s.totalMinionsKilled ?? p.totalMinionsKilled ?? 0) +
            Number(s.neutralMinionsKilled ?? p.neutralMinionsKilled ?? 0),
      team_position: normalizeTeamPosition(p, s),
      rune0: perks[0] ?? null,
      rune1: perks[1] ?? null,
      rune2: perks[2] ?? null,
      rune3: perks[3] ?? null,
      rune4: perks[4] ?? null,
      rune5: perks[5] ?? null,
      primary_style: runes.primaryStyle,
      secondary_style: runes.secondaryStyle,
      items: [s.item0, s.item1, s.item2, s.item3, s.item4, s.item5, s.item6].map((it) =>
        typeof it === "number" ? it : null,
      ),
      augments,
    };
  });
}

interface GameDenorm {
  is_remake: number;
  queue_id: number | null;
  game_version: string | null;
}

let writeParticipantsStmts: {
  participant: Database.Statement;
  augment: Database.Statement;
  clearParticipants: Database.Statement;
  clearAugments: Database.Statement;
} | null = null;

function participantStatements() {
  if (!writeParticipantsStmts) {
    writeParticipantsStmts = {
      participant: db.prepare(`
        INSERT OR REPLACE INTO match_participants (
          game_id, participant_id, puuid, game_name, tag_line, profile_icon,
          team_id, player_subteam_id, player_subteam_placement, champion_id, win, kills, deaths, assists,
          double_kills, triple_kills, quadra_kills, penta_kills,
          total_damage_dealt, total_damage_taken, true_damage, gold_earned, total_heal,
          largest_killing_spree, largest_critical_strike, cs, early_surrender,
          total_damage_dealt_all, true_damage_dealt,
          is_remake, queue_id, game_version,
          spell1, spell2, item0, item1, item2, item3, item4, item5, item6,
          team_position
        ) VALUES (
          @game_id, @participant_id, @puuid, @game_name, @tag_line, @profile_icon,
          @team_id, @player_subteam_id, @player_subteam_placement, @champion_id, @win, @kills, @deaths, @assists,
          @double_kills, @triple_kills, @quadra_kills, @penta_kills,
          @total_damage_dealt, @total_damage_taken, @true_damage, @gold_earned, @total_heal,
          @largest_killing_spree, @largest_critical_strike, @cs, @early_surrender,
          @total_damage_dealt_all, @true_damage_dealt,
          @is_remake, @queue_id, @game_version,
          @spell1, @spell2, @item0, @item1, @item2, @item3, @item4, @item5, @item6,
          @team_position
        )
      `),
      augment: db.prepare(`
        INSERT OR REPLACE INTO match_participant_augments (
          game_id, participant_id, slot, augment_id,
          champion_id, win, is_remake, queue_id, game_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      clearParticipants: db.prepare("DELETE FROM match_participants WHERE game_id = ?"),
      clearAugments: db.prepare("DELETE FROM match_participant_augments WHERE game_id = ?"),
    };
  }
  return writeParticipantsStmts;
}

// Replaces one game's participant rows wholesale. Callers are already inside a
// transaction; this deliberately isn't one, so a game and its participants
// commit together or not at all.
function writeParticipants(gameId: number, meta: GameDenorm, rows: RawParticipantRow[]): void {
  const stmts = participantStatements();
  stmts.clearParticipants.run(gameId);
  stmts.clearAugments.run(gameId);

  for (const row of rows) {
    stmts.participant.run({
      game_id: gameId,
      participant_id: row.participant_id,
      puuid: row.puuid,
      game_name: row.game_name,
      tag_line: row.tag_line,
      profile_icon: row.profile_icon,
      team_id: row.team_id,
      player_subteam_id: row.player_subteam_id,
      player_subteam_placement: row.player_subteam_placement,
      champion_id: row.champion_id,
      win: row.win,
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
      double_kills: row.double_kills,
      triple_kills: row.triple_kills,
      quadra_kills: row.quadra_kills,
      penta_kills: row.penta_kills,
      total_damage_dealt: row.total_damage_dealt,
      total_damage_taken: row.total_damage_taken,
      true_damage: row.true_damage,
      gold_earned: row.gold_earned,
      total_heal: row.total_heal,
      largest_killing_spree: row.largest_killing_spree,
      largest_critical_strike: row.largest_critical_strike,
      cs: row.cs,
      early_surrender: row.early_surrender,
      total_damage_dealt_all: row.total_damage_dealt_all,
      true_damage_dealt: row.true_damage_dealt,
      team_position: row.team_position,
      is_remake: meta.is_remake,
      queue_id: meta.queue_id,
      game_version: meta.game_version,
      spell1: row.spell1,
      spell2: row.spell2,
      item0: row.items[0],
      item1: row.items[1],
      item2: row.items[2],
      item3: row.items[3],
      item4: row.items[4],
      item5: row.items[5],
      item6: row.items[6],
    });

    for (const aug of row.augments) {
      stmts.augment.run(
        gameId,
        row.participant_id,
        aug.slot,
        aug.augment_id,
        row.champion_id,
        row.win,
        meta.is_remake,
        meta.queue_id,
        meta.game_version,
      );
    }
  }
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

// Queues switched off on the Settings page, as stored in hidden_queues. An
// absent key means the setting was never written; an empty one means the user
// has everything switched on.
function getHiddenQueues(): number[] {
  const raw = getSetting("hidden_queues");
  if (!raw) return [];
  return raw
    .split(",")
    .map(Number)
    .filter((id) => Number.isFinite(id));
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

// Appends queue conditions to a query's WHERE list. An explicit queue filter
// wins; otherwise the queues switched off in Settings are excluded everywhere.
function applyQueueFilter(
  where: string[],
  params: any[],
  queue?: number | number[],
  alias = "g",
): void {
  if (Array.isArray(queue)) {
    if (queue.length === 0) return;
    if (queue.length === 1) {
      where.push(`${alias}.queue_id = ?`);
      params.push(queue[0]);
      return;
    }
    where.push(`${alias}.queue_id IN (${queue.map(() => "?").join(", ")})`);
    params.push(...queue);
    return;
  }
  if (queue == null) {
    const hidden = getHiddenQueues();
    if (hidden.length > 0) {
      where.push(`${alias}.queue_id NOT IN (${hidden.map(() => "?").join(", ")})`);
      params.push(...hidden);
    }
    return;
  }
  if (queue === QUEUE_GROUP_ARENA) {
    where.push(`${alias}.queue_id IN (${ARENA_QUEUE_IDS.map(() => "?").join(", ")})`);
    params.push(...ARENA_QUEUE_IDS);
    return;
  }
  if (queue === QUEUE_SCOPE_MAYHEM) {
    where.push(`${alias}.queue_id IN (${MAYHEM_QUEUE_IDS.map(() => "?").join(", ")})`);
    params.push(...MAYHEM_QUEUE_IDS);
    return;
  }
  if (queue === QUEUE_SCOPE_REST) {
    where.push(`${alias}.queue_id NOT IN (${MAYHEM_QUEUE_IDS.map(() => "?").join(", ")})`);
    params.push(...MAYHEM_QUEUE_IDS);
    return;
  }
  if (queue === QUEUE_SCOPE_RANKED) {
    where.push(`${alias}.queue_id IN (?,?)`);
    params.push(420, 440);
    return;
  }
  if (queue === QUEUE_SCOPE_NORMAL) {
    where.push(`${alias}.queue_id IN (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    params.push(400, 480, 830, 840, 850, 870, 880, 890, 900, 2000, 2010, 2020, 3140, 3270, 4310);
    return;
  }
  if (queue === QUEUE_SCOPE_ARAM) {
    where.push(`${alias}.queue_id IN (?,?,?,?)`);
    params.push(65, 67, 100, 450);
    return;
  }
  if (queue === QUEUE_SCOPE_ARENA) {
    where.push(`${alias}.queue_id IN (?,?,?)`);
    params.push(1700, 1740, 1750);
    return;
  }
  if (queue != null) {
    where.push(`${alias}.queue_id = ?`);
    params.push(queue);
    return;
  }
}

function applyTimeFilter(timePeriod?: "24h" | "7d" | "30d" | "full"): {
  sql: string;
  params: unknown[];
} {
  if (timePeriod === "24h") {
    return {
      sql: "AND g.game_creation >= ?",
      params: [Date.now() - 24 * 60 * 60 * 1000],
    };
  }
  if (timePeriod === "7d") {
    return {
      sql: "AND g.game_creation >= ?",
      params: [Date.now() - 7 * 24 * 60 * 60 * 1000],
    };
  }
  if (timePeriod === "30d") {
    return {
      sql: "AND g.game_creation >= ?",
      params: [Date.now() - 30 * 24 * 60 * 60 * 1000],
    };
  }
  if (timePeriod === "full") return { sql: "", params: [] };
  return { sql: "", params: [] };
}

// A locally-owned game came from the client or a Riot sync and its owner puuid
// still has a summoner row. A deleted owner leaves an orphaned game that must
// not appear in any local view.
function localGamesFilter(alias: string): string {
  return `${alias}.source != 'search-import' AND ${alias}.puuid IN (SELECT puuid FROM summoner)`;
}

// Remakes are already left out of every stat; this setting takes them out of
// the match list as well. An absent key means they stay visible.
function hideRemakes(): boolean {
  return getSetting("hide_remakes") === "true";
}

// Score backfills are keyed on formula version + champion data version, so
// stored scores recompute when either changes (new formula, new patch,
// re-tagged champion).
function scoreFormulaKey() {
  return `${SCORE_FORMULA_VERSION}@${getChampionDataVersion()}`;
}

// Recompute stored scores from the participant rows. Runs whenever the formula version or
// the champion class data changes (new patch, re-tagged champion) so stored
// scores never go stale. Call after champion data has loaded; returns whether
// a backfill ran so the caller can refresh the renderer.
export function checkScoreBackfill(): boolean {
  if (getSetting("score_formula_version") === scoreFormulaKey()) return false;
  backfillScores();
  setSetting("score_formula_version", scoreFormulaKey());
  return true;
}

// Scoring grades a player against the other nine, so it always works on a whole
// game's worth of participant rows.
interface ScoreRow {
  participant_id: number;
  puuid: string | null;
  team_id: number;
  champion_id: number;
  win: number;
  kills: number;
  deaths: number;
  assists: number;
  double_kills: number;
  triple_kills: number;
  quadra_kills: number;
  penta_kills: number;
  total_damage_dealt: number;
  total_damage_taken: number;
  gold_earned: number;
  total_heal: number;
}

const SCORE_ROW_COLUMNS = `participant_id, puuid, team_id, champion_id, win,
       kills, deaths, assists, double_kills, triple_kills, quadra_kills, penta_kills,
       total_damage_dealt, total_damage_taken, gold_earned, total_heal`;

function scoreInputsFromRows(rows: ScoreRow[]): (ScoreInput & { puuid: string | null })[] {
  return rows.map((r) => ({
    participantId: r.participant_id,
    teamId: r.team_id,
    puuid: r.puuid,
    championId: r.champion_id,
    kills: r.kills,
    deaths: r.deaths,
    assists: r.assists,
    doubleKills: r.double_kills,
    tripleKills: r.triple_kills,
    quadraKills: r.quadra_kills,
    pentaKills: r.penta_kills,
    totalDamageDealtToChampions: r.total_damage_dealt,
    totalDamageTaken: r.total_damage_taken,
    goldEarned: r.gold_earned,
    totalHeal: r.total_heal,
    win: r.win === 1,
  }));
}

// Groups flat participant rows spanning many games back into per-game lists,
// so a whole-library rescore is one query rather than one per game.
function groupByGame<T extends { game_id: number }>(rows: T[]): Map<number, T[]> {
  const byGame = new Map<number, T[]>();
  for (const row of rows) {
    const list = byGame.get(row.game_id);
    if (list) list.push(row);
    else byGame.set(row.game_id, [row]);
  }
  return byGame;
}

function computeOwnerScore(
  participants: ScoreRow[],
  ownerPuuid: string | null,
  fallback?: { champion_id: number; kills: number; deaths: number; assists: number },
): PlayerScore | null {
  const inputs = scoreInputsFromRows(participants);
  if (inputs.length === 0) return null;
  let owner = ownerPuuid ? inputs.find((p) => p.puuid === ownerPuuid) : undefined;
  if (!owner && fallback) {
    owner = inputs.find(
      (p) =>
        p.championId === fallback.champion_id &&
        p.kills === fallback.kills &&
        p.deaths === fallback.deaths &&
        p.assists === fallback.assists,
    );
  }
  if (!owner) return null;
  return computeMatchScores(inputs, getChampionClasses()).get(owner.participantId) ?? null;
}

export function getMissingScoreCount(): number {
  console.log("[db] getMissingScoreCount called:", {});
  const row = db
    .prepare("SELECT COUNT(*) as n FROM match_participants WHERE score IS NULL")
    .get() as { n: number };
  console.log("[db] getMissingScoreCount done:", { count: row.n });
  return row.n;
}

export async function backfillParticipantScores(
  onProgress: (done: number, total: number) => void,
): Promise<number> {
  if (scoreBackfillInFlight) return 0;
  scoreBackfillInFlight = true;

  try {
    console.log("[db] backfillParticipantScores called:", {});
    const total = (
      db
        .prepare(
          `SELECT COUNT(*) as n
         FROM games g
         WHERE g.raw_gz IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM match_participants mp
             WHERE mp.game_id = g.game_id AND mp.score IS NULL
           )`,
        )
        .get() as { n: number }
    ).n;
    const pageSize = 100;
    const updateScore = db.prepare(
      "UPDATE match_participants SET score = ? WHERE game_id = ? AND participant_id = ?",
    );
    let done = 0;
    let updated = 0;

    while (done < total) {
      const rows = db
        .prepare(
          `SELECT g.game_id, g.raw_gz
         FROM games g
         WHERE g.raw_gz IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM match_participants mp
             WHERE mp.game_id = g.game_id AND mp.score IS NULL
           )
         ORDER BY g.game_id
         LIMIT ? OFFSET ?`,
        )
        .all(pageSize, 0) as { game_id: number; raw_gz: Buffer }[];
      if (rows.length === 0) break;

      const updatePage = db.transaction(() => {
        for (const row of rows) {
          const raw = unpackRaw(row.raw_gz);
          const participants = participantRowsFromRaw(raw);
          const scores = computeMatchScores(
            scoreInputsFromRows(participants as ScoreRow[]),
            getChampionClasses(),
          );
          for (const participant of participants) {
            const score = scores.get(participant.participant_id)?.score ?? null;
            updated += updateScore.run(score, row.game_id, participant.participant_id).changes;
          }

          done++;
          if (done % 50 === 0) onProgress(done, total);
        }
      });
      updatePage();
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    if (done > 0 && done % 50 !== 0) onProgress(done, total);
    console.log("[db] backfillParticipantScores done:", { done, total, updated });
    return updated;
  } finally {
    scoreBackfillInFlight = false;
  }
}

export function runScoreBackfillIfNeeded(onProgress?: (done: number, total: number) => void): void {
  if (scoreBackfillInFlight) return;
  if (getMissingScoreCount() === 0) return;
  void backfillParticipantScores(onProgress ?? (() => undefined)).catch((err) => {
    console.warn("[db] runScoreBackfillIfNeeded failed:", err);
  });
}

function backfillScores() {
  const games = db
    .prepare(`
      SELECT g.game_id, g.puuid, g.is_remake,
             ps.champion_id, ps.kills, ps.deaths, ps.assists
      FROM games g
      JOIN player_stats ps ON g.game_id = ps.game_id
    `)
    .all() as {
    game_id: number;
    puuid: string;
    is_remake: number;
    champion_id: number;
    kills: number;
    deaths: number;
    assists: number;
  }[];

  const participants = groupByGame(
    db
      .prepare(`SELECT game_id, ${SCORE_ROW_COLUMNS} FROM match_participants`)
      .all() as (ScoreRow & { game_id: number })[],
  );

  const updateStmt = db.prepare(
    "UPDATE player_stats SET score = ?, score_raw = ?, score_badge = ? WHERE game_id = ?",
  );
  const updateTrackedStmt = db.prepare(
    "UPDATE tracked_game_stats SET score = ?, score_raw = ?, score_badge = ? WHERE game_id = ? AND puuid = ?",
  );
  const trackedPuuidsStmt = db.prepare("SELECT puuid FROM tracked_game_stats WHERE game_id = ?");
  const tx = db.transaction(() => {
    for (const row of games) {
      const gameParticipants = participants.get(row.game_id) ?? [];
      let result: PlayerScore | null = null;
      if (row.is_remake) {
        updateStmt.run(null, null, null, row.game_id);
      } else {
        result = computeOwnerScore(gameParticipants, row.puuid || null, row);
        updateStmt.run(
          result?.score ?? null,
          result?.raw ?? null,
          result?.badge ?? null,
          row.game_id,
        );
      }

      const trackedPuuids = trackedPuuidsStmt.all(row.game_id) as { puuid: string }[];
      for (const { puuid: trackedPuuid } of trackedPuuids) {
        const trackedScore = row.is_remake
          ? null
          : computeOwnerScore(gameParticipants, trackedPuuid, undefined);
        updateTrackedStmt.run(
          trackedScore?.score ?? null,
          trackedScore?.raw ?? null,
          trackedScore?.badge ?? null,
          row.game_id,
          trackedPuuid,
        );
      }
    }
  });
  tx();
}

function parsePatch(version: unknown): string | null {
  if (typeof version !== "string") return null;
  const m = version.match(/^(\d+)\.(\d+)/);
  return m ? `${m[1]}.${m[2]}` : null;
}

function detectRemake(gameDuration: number, rows: { early_surrender: number }[]): boolean {
  // Very short games are always remakes
  if (gameDuration < 300) return true;
  // An early surrender still inside the first ten minutes counts as one too
  if (gameDuration < 600) return rows.some((r) => r.early_surrender === 1);
  return false;
}

// ---- Helpers ----

// The per-game maxima the match list scales its stat bars against. Selected
// alongside the row rather than derived in JS: three correlated MAX()es over a
// page of 25 games cost a fraction of a millisecond, where the old version
// parsed 25 raw payloads to find them.
const GAME_MAX_STATS_SQL = `
           MAX(IFNULL((SELECT MAX(mp.total_damage_dealt) FROM match_participants mp
                        WHERE mp.game_id = g.game_id), 0), 1) as game_max_dmg,
           MAX(IFNULL((SELECT MAX(mp.total_damage_taken) FROM match_participants mp
                        WHERE mp.game_id = g.game_id), 0), 1) as game_max_taken,
           MAX(IFNULL((SELECT MAX(mp.total_heal) FROM match_participants mp
                        WHERE mp.game_id = g.game_id), 0), 1) as game_max_heal`;

// ---- Query functions ----

const MATCH_SORT_COLUMNS: Record<string, string> = {
  date: "g.game_creation",
  kda: "(ps.kills + ps.assists) * 1.0 / MAX(ps.deaths, 1)",
  kills: "ps.kills",
  duration: "g.game_duration",
  // Ordered on the unclamped score so the 10s at the top of the list — and
  // every 0.1-rounding tie below them — keep their real order.
  score: "ps.score_raw",
  damageDealt: "ps.total_damage_dealt",
  damageTaken: "ps.total_damage_taken",
  healing: "ps.total_heal",
};

function matchOrderBy(sort?: string, sortDir?: string): string {
  const key = sort && MATCH_SORT_COLUMNS[sort] ? sort : "date";
  const dir = sortDir === "asc" ? "ASC" : "DESC";
  const parts: string[] = [];
  // Games without a score belong at the bottom whichever way we're sorting
  if (key === "score") parts.push("ps.score_raw IS NULL");
  parts.push(`${MATCH_SORT_COLUMNS[key]} ${dir}`);
  if (key !== "date") parts.push("g.game_creation DESC");
  return parts.join(", ");
}

const MULTIKILL_COLUMNS: Record<string, string> = {
  doubles: "ps.double_kills",
  triples: "ps.triple_kills",
  quadras: "ps.quadra_kills",
  pentas: "ps.penta_kills",
};

function statsSource(account?: string): {
  table: "player_stats" | "tracked_game_stats";
  alias: "ps";
  accountFilter: string;
} {
  if (account === "all") {
    return {
      table: "tracked_game_stats",
      alias: "ps",
      accountFilter: "ps.puuid IN (SELECT puuid FROM summoner)",
    };
  }
  if (account) return { table: "tracked_game_stats", alias: "ps", accountFilter: "ps.puuid = ?" };
  return { table: "player_stats", alias: "ps", accountFilter: localGamesFilter("g") };
}

export function getMatchHistory(
  limit: number,
  offset: number,
  filters?: {
    championId?: number;
    patch?: string;
    queue?: number | number[];
    account?: string;
    sort?: string;
    sortDir?: string;
    multikills?: string[];
    favorites?: boolean;
    ignoreHiddenQueues?: boolean;
  },
  timePeriod?: "24h" | "7d" | "30d" | "full",
): { matches: any[]; total: number } {
  const statsTable = filters?.account ? "tracked_game_stats" : "player_stats";
  const statsAlias = filters?.account ? "tgs" : "ps";
  const where: string[] = [];
  const params: any[] = [];
  if (hideRemakes()) {
    where.push("g.is_remake = 0");
  }
  if (filters?.favorites) {
    where.push("g.favorite = 1");
  }
  if (filters?.account) {
    if (filters.account === "all") {
      where.push("tgs.puuid IN (SELECT puuid FROM summoner)");
    } else {
      where.push("tgs.puuid = ?");
      params.push(filters.account);
    }
  }
  if (filters?.championId != null) {
    where.push(`${statsAlias}.champion_id = ?`);
    params.push(filters.championId);
  }
  if (filters?.patch) {
    where.push("g.game_version = ?");
    params.push(filters.patch);
  }
  if (filters?.ignoreHiddenQueues) {
    if (filters.queue != null) applyQueueFilter(where, params, filters.queue);
  } else {
    applyQueueFilter(where, params, filters?.queue);
  }
  if (filters?.multikills && filters.multikills.length > 0) {
    const cols = filters.multikills
      .map((k) => MULTIKILL_COLUMNS[k])
      .filter((col): col is string => !!col);
    if (cols.length > 0) {
      where.push(
        `(${cols.map((col) => col.replace(/^ps\./, `${statsAlias}.`) + " > 0").join(" OR ")})`,
      );
    }
  }
  if (!filters?.account) {
    where.push(localGamesFilter("g"));
  }
  const timeFilter = applyTimeFilter(timePeriod);
  const whereSql =
    where.length > 0
      ? `WHERE ${where.join(" AND ")} ${timeFilter.sql}`
      : timeFilter.sql
        ? `WHERE 1 = 1 ${timeFilter.sql}`
        : "";
  const orderBy = matchOrderBy(filters?.sort, filters?.sortDir).replaceAll("ps.", `${statsAlias}.`);
  const matchPuuid = filters?.account ? "tgs.puuid" : "g.puuid";
  const augmentIdsSql = filters?.account
    ? `(SELECT GROUP_CONCAT(augment_id, ',')
        FROM (
          SELECT mpa.augment_id
          FROM match_participant_augments mpa
          JOIN match_participants mp
            ON mp.game_id = mpa.game_id AND mp.participant_id = mpa.participant_id
          WHERE mp.game_id = g.game_id AND mp.puuid = ${matchPuuid}
          ORDER BY mpa.slot
        ))`
    : `(SELECT GROUP_CONCAT(augment_id, ',')
        FROM (SELECT augment_id FROM game_augments
              WHERE game_id = g.game_id
              ORDER BY slot))`;

  const total = db
    .prepare(`
    SELECT COUNT(*) as count
    FROM games g
    JOIN ${statsTable} ${statsAlias} ON g.game_id = ${statsAlias}.game_id
    ${whereSql}
  `)
    .get(...params, ...timeFilter.params) as any;
  const matches = db
    .prepare(`
    SELECT g.game_id, g.queue_id, g.game_creation, g.game_duration, g.is_remake, g.favorite,
           ${matchPuuid} as puuid, g.game_version,
           ${statsAlias}.champion_id, ${statsAlias}.win, ${statsAlias}.kills, ${statsAlias}.deaths, ${statsAlias}.assists,
           ${statsAlias}.double_kills, ${statsAlias}.triple_kills, ${statsAlias}.quadra_kills, ${statsAlias}.penta_kills,
           ${statsAlias}.total_damage_dealt, ${statsAlias}.total_damage_taken, ${statsAlias}.total_heal, ${statsAlias}.gold_earned,
           ${statsAlias}.score, ${statsAlias}.score_badge,
           COALESCE(${statsAlias}.spell1, (
             SELECT mp.spell1 FROM match_participants mp
             WHERE mp.game_id = g.game_id AND mp.puuid = ${matchPuuid}
           )) as spell1,
           COALESCE(${statsAlias}.spell2, (
             SELECT mp.spell2 FROM match_participants mp
             WHERE mp.game_id = g.game_id AND mp.puuid = ${matchPuuid}
           )) as spell2,
           ${statsAlias}.item0, ${statsAlias}.item1, ${statsAlias}.item2, ${statsAlias}.item3, ${statsAlias}.item4, ${statsAlias}.item5, ${statsAlias}.item6,
           ${augmentIdsSql} as augment_ids,
           g.raw_gz,
           (SELECT mp.team_position FROM match_participants mp
             WHERE mp.game_id = g.game_id AND mp.puuid = ${matchPuuid}) as team_position,
           (SELECT mp.player_subteam_placement FROM match_participants mp
             WHERE mp.game_id = g.game_id AND mp.puuid = ${matchPuuid}) as player_subteam_placement,
${GAME_MAX_STATS_SQL}
    FROM games g
    JOIN ${statsTable} ${statsAlias} ON g.game_id = ${statsAlias}.game_id
    ${whereSql}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `)
    .all(...params, ...timeFilter.params, limit, offset)
    .map((match: any) => {
      let rune_ids: number[] = [];
      let primary_style: number | null = null;
      let secondary_style: number | null = null;
      let stat_shard_ids: number[] = [];
      let cs = 0;
      if (match.raw_gz) {
        try {
          const raw = JSON.parse(zlib.gunzipSync(match.raw_gz).toString("utf8"));
          const participants = raw.info?.participants ?? raw.participants ?? [];
          const identities = raw.participantIdentities ?? raw.info?.participantIdentities ?? [];
          const participant = participants.find((p: any, index: number) => {
            const identity = identities[Number(p.participantId ?? index + 1) - 1]?.player;
            return p.puuid === match.puuid || identity?.puuid === match.puuid;
          });
          if (!participant || Number(participant.championId) !== Number(match.champion_id)) {
            const fallback = participants.find((p: any) => {
              const candidateStats = p.stats ?? p;
              return (
                Number(p.championId ?? candidateStats.championId) === Number(match.champion_id) &&
                Number(candidateStats.kills ?? p.kills) === Number(match.kills) &&
                Number(candidateStats.deaths ?? p.deaths) === Number(match.deaths) &&
                Number(candidateStats.assists ?? p.assists) === Number(match.assists)
              );
            });
            if (fallback) {
              match.puuid = fallback.puuid ?? match.puuid;
              Object.assign(match, { __owner: fallback });
            }
          }
          const owner = (match as any).__owner ?? participant;
          const ownerStats = owner?.stats ?? owner;
          cs = Number(
            ownerStats?.totalCreepScore ??
              owner?.totalCreepScore ??
              Number(ownerStats?.totalMinionsKilled ?? owner?.totalMinionsKilled ?? 0) +
                Number(ownerStats?.neutralMinionsKilled ?? owner?.neutralMinionsKilled ?? 0),
          );
          const runes = extractRunes(owner);
          rune_ids = runes.runeIds;
          primary_style = runes.primaryStyle;
          secondary_style = runes.secondaryStyle;
          stat_shard_ids = runes.statShardIds;
        } catch {
          rune_ids = [];
        }
      }
      const { raw_gz: _raw, ...safeMatch } = match;
      return {
        ...safeMatch,
        cs,
        rune_ids: rune_ids.join(",") || null,
        primary_style,
        secondary_style,
        stat_shard_ids: stat_shard_ids.join(",") || null,
      };
    });
  return { matches, total: total.count };
}

export function getMatchFilterOptions(filters?: {
  championId?: number;
  patch?: string;
  queue?: number;
  account?: string;
}): {
  patches: string[];
  champions: number[];
  queues: number[];
  accounts: { puuid: string; name: string | null; profileIcon: number | null }[];
  hasFavorites: boolean;
} {
  // Each list is narrowed by the OTHER filters so a dropdown never hides its own selection
  const applyAccountFilter = (where: string[], params: any[]) => {
    if (filters?.account) {
      where.push(
        "EXISTS (SELECT 1 FROM tracked_game_stats tgs WHERE tgs.game_id = g.game_id AND tgs.puuid = ?)",
      );
      params.push(filters.account);
    }
  };

  const patchWhere = ["g.game_version IS NOT NULL AND g.game_version != ''"];
  const patchParams: any[] = [];
  if (filters?.championId != null) {
    patchWhere.push("ps.champion_id = ?");
    patchParams.push(filters.championId);
  }
  applyQueueFilter(patchWhere, patchParams, filters?.queue);
  applyAccountFilter(patchWhere, patchParams);
  const patchRows = db
    .prepare(`
    SELECT DISTINCT g.game_version
    FROM games g
    JOIN player_stats ps ON g.game_id = ps.game_id
    WHERE ${patchWhere.join(" AND ")}
  `)
    .all(...patchParams) as { game_version: string }[];
  const patches = patchRows
    .map((r) => r.game_version)
    .sort((a, b) => {
      const [aMajor, aMinor] = a.split(".").map(Number);
      const [bMajor, bMinor] = b.split(".").map(Number);
      return bMajor - aMajor || bMinor - aMinor;
    });

  const champWhere = ["1 = 1"];
  const champParams: any[] = [];
  if (filters?.patch) {
    champWhere.push("g.game_version = ?");
    champParams.push(filters.patch);
  }
  applyQueueFilter(champWhere, champParams, filters?.queue);
  applyAccountFilter(champWhere, champParams);
  const champRows = db
    .prepare(`
    SELECT DISTINCT ps.champion_id
    FROM player_stats ps
    JOIN games g ON ps.game_id = g.game_id
    WHERE ${champWhere.join(" AND ")}
    ORDER BY ps.champion_id
  `)
    .all(...champParams) as { champion_id: number }[];

  const queueWhere = ["1 = 1"];
  const queueParams: any[] = [];
  if (filters?.championId != null) {
    queueWhere.push("ps.champion_id = ?");
    queueParams.push(filters.championId);
  }
  if (filters?.patch) {
    queueWhere.push("g.game_version = ?");
    queueParams.push(filters.patch);
  }
  if (
    filters?.queue === QUEUE_SCOPE_MAYHEM ||
    filters?.queue === QUEUE_SCOPE_REST ||
    filters?.queue === QUEUE_SCOPE_RANKED ||
    filters?.queue === QUEUE_SCOPE_NORMAL ||
    filters?.queue === QUEUE_SCOPE_ARAM ||
    filters?.queue === QUEUE_SCOPE_ARENA
  ) {
    applyQueueFilter(queueWhere, queueParams, filters.queue);
  }
  applyQueueFilter(queueWhere, queueParams, undefined);
  applyAccountFilter(queueWhere, queueParams);
  const queueRows = db
    .prepare(`
    SELECT DISTINCT g.queue_id
    FROM games g
    JOIN player_stats ps ON g.game_id = ps.game_id
    WHERE ${queueWhere.join(" AND ")}
    ORDER BY g.queue_id
  `)
    .all(...queueParams) as { queue_id: number }[];
  const hasArena = queueRows.some((row) => [1700, 1740, 1750].includes(row.queue_id));
  const queueIds = [...(hasArena ? [QUEUE_GROUP_ARENA] : []), ...queueRows.map((r) => r.queue_id)];

  // Like the favorites toggle below, this list ignores the other filters: the
  // set of tracked accounts is stable, and the dropdown shouldn't reshuffle as
  // the user narrows by champion or patch. Games whose owner was never resolved
  // carry an empty puuid and aren't an account.
  const accountRows = db
    .prepare(`
    SELECT tgs.puuid, s.game_name, s.tag_line, s.profile_icon
    FROM tracked_game_stats tgs
    JOIN games g ON g.game_id = tgs.game_id
    INNER JOIN summoner s ON s.puuid = tgs.puuid
    GROUP BY tgs.puuid
    ORDER BY MAX(g.game_creation) DESC
  `)
    .all() as {
    puuid: string;
    game_name: string | null;
    tag_line: string | null;
    profile_icon: number | null;
  }[];
  // An imported database may have no summoner row for an account — fall back to
  // the name and icon its most recent game recorded, same as getProfile does.
  const latestGameStmt = db.prepare(
    "SELECT game_id FROM tracked_game_stats tgs JOIN games g USING (game_id) WHERE tgs.puuid = ? ORDER BY g.game_creation DESC LIMIT 1",
  );
  const seenNames = new Set<string>();
  const accounts = accountRows
    .map((r) => {
      let name = displayName(r.game_name, r.tag_line);
      let profileIcon = r.profile_icon;
      if (!name || profileIcon == null) {
        const latest = latestGameStmt.get(r.puuid) as { game_id: number } | undefined;
        const fromGame = latest
          ? identityFromGame(latest.game_id, r.puuid)
          : { name: null, icon: null };
        name = name ?? fromGame.name;
        profileIcon = profileIcon ?? fromGame.icon;
      }
      return { puuid: r.puuid, name, profileIcon };
    })
    .filter((account) => {
      // Two puuids can carry the same display name when the same Riot ID
      // exists on different servers. Keep the first (most recent) and drop
      // the rest so the dropdown does not grow with every platform the user
      // has ever searched.
      const key = (account.name ?? account.puuid).toLowerCase();
      if (seenNames.has(key)) return false;
      seenNames.add(key);
      return true;
    });

  // Unlike the lists above, this one ignores the other filters: the favorites
  // toggle should stay put while the user narrows the list rather than blinking
  // out whenever the current selection happens to hold no favorites.
  const favoriteRow = db
    .prepare(`
    SELECT EXISTS (
      SELECT 1
      FROM games g
      JOIN player_stats ps ON g.game_id = ps.game_id
      WHERE g.favorite = 1
    ) as has
  `)
    .get() as { has: number };

  return {
    patches,
    champions: champRows.map((r) => r.champion_id),
    queues: queueIds,
    accounts,
    hasFavorites: !!favoriteRow.has,
  };
}

// The full ten-player scoreboard for one game, in the shape the renderer draws.
// This is what the match detail view used to reconstruct by parsing raw_json in
// the renderer; the payload is now a few kilobytes instead of thirty.
function getMatchParticipants(gameId: number): any[] {
  const rawRow = db.prepare("SELECT raw_gz FROM games WHERE game_id = ?").get(gameId) as
    | { raw_gz: Buffer | null }
    | undefined;
  let rawParticipants: any[] = [];
  try {
    rawParticipants = rawRow?.raw_gz
      ? (() => {
          const payload = JSON.parse(zlib.gunzipSync(rawRow.raw_gz).toString("utf8"));
          return payload.info?.participants ?? payload.participants ?? [];
        })()
      : [];
  } catch {
    rawParticipants = [];
  }
  const rows = db
    .prepare(`
      SELECT participant_id, puuid, game_name, tag_line, team_id, player_subteam_id, player_subteam_placement, champion_id, win,
             kills, deaths, assists, double_kills, triple_kills, quadra_kills, penta_kills,
             total_damage_dealt, total_damage_taken, gold_earned, total_heal,
             largest_killing_spree, spell1, spell2,
             item0, item1, item2, item3, item4, item5, item6
      FROM match_participants
      WHERE game_id = ?
      ORDER BY participant_id
    `)
    .all(gameId) as any[];

  const augmentRows = db
    .prepare(`
      SELECT participant_id, augment_id
      FROM match_participant_augments
      WHERE game_id = ?
      ORDER BY participant_id, slot
    `)
    .all(gameId) as { participant_id: number; augment_id: number }[];

  const augments = new Map<number, number[]>();
  for (const row of augmentRows) {
    const list = augments.get(row.participant_id);
    if (list) list.push(row.augment_id);
    else augments.set(row.participant_id, [row.augment_id]);
  }

  return rows.map((r) => {
    const raw = rawParticipants.find((p: any) => Number(p.participantId) === r.participant_id);
    const runes = extractRunes(raw);
    return {
      participantId: r.participant_id,
      puuid: r.puuid,
      gameName: r.game_name,
      tagLine: r.tag_line,
      championId: r.champion_id,
      teamId: r.team_id,
      playerSubteamId: r.player_subteam_id ?? null,
      playerSubteamPlacement: r.player_subteam_placement ?? null,
      win: r.win === 1,
      kills: r.kills,
      deaths: r.deaths,
      assists: r.assists,
      doubleKills: r.double_kills,
      tripleKills: r.triple_kills,
      quadraKills: r.quadra_kills,
      pentaKills: r.penta_kills,
      totalDamageDealtToChampions: r.total_damage_dealt,
      totalDamageTaken: r.total_damage_taken,
      goldEarned: r.gold_earned,
      totalHeal: r.total_heal,
      largestKillingSpree: r.largest_killing_spree,
      spell1Id: r.spell1,
      spell2Id: r.spell2,
      items: [r.item0, r.item1, r.item2, r.item3, r.item4, r.item5, r.item6].map((i) => i ?? 0),
      augments: augments.get(r.participant_id) ?? [],
      cs: Number(
        raw?.stats?.totalCreepScore ??
          raw?.totalCreepScore ??
          Number(raw?.stats?.totalMinionsKilled ?? raw?.totalMinionsKilled ?? 0) +
            Number(raw?.stats?.neutralMinionsKilled ?? raw?.neutralMinionsKilled ?? 0),
      ),
      runeIds: runes.runeIds,
      primaryStyle: runes.primaryStyle,
      secondaryStyle: runes.secondaryStyle,
      statShardIds: runes.statShardIds,
    };
  });
}

export function getMatchDetail(gameId: number): any {
  // Columns are listed rather than starred so the compressed payload stays out
  // of an IPC message that only needs the game's metadata.
  const game = db
    .prepare(`
      SELECT game_id, queue_id, game_mode, game_creation, game_duration,
             is_remake, puuid, game_version, favorite
      FROM games WHERE game_id = ?
    `)
    .get(gameId) as any;
  if (!game) return null;
  const stats = db.prepare("SELECT * FROM player_stats WHERE game_id = ?").get(gameId);
  const augments = db
    .prepare("SELECT * FROM game_augments WHERE game_id = ? ORDER BY slot")
    .all(gameId);
  return {
    game,
    stats,
    augments,
    participants: getMatchParticipants(gameId),
  };
}

export function getChampionStatsAll(
  patch?: string,
  queue?: number | number[],
  account?: string,
  timePeriod?: "24h" | "7d" | "30d" | "full",
): any[] {
  const source = statsSource(account);
  const where = ["g.is_remake = 0"];
  where.push(source.accountFilter);
  const params: any[] = account && account !== "all" ? [account] : [];
  if (patch) {
    where.push("g.game_version = ?");
    params.push(patch);
  }
  applyQueueFilter(where, params, queue);
  const timeFilter = applyTimeFilter(timePeriod);
  const statsPlaceholders = NO_STATS_QUEUE_IDS.map(() => "?").join(",");
  return db
    .prepare(`
    SELECT
      ps.champion_id,
      COUNT(*) as games,
      SUM(ps.win) as wins,
      SUM(ps.kills) as kills,
      SUM(ps.deaths) as deaths,
      SUM(ps.assists) as assists,
      ROUND(AVG(ps.kills), 1) as avg_kills,
      ROUND(AVG(ps.deaths), 1) as avg_deaths,
      ROUND(AVG(ps.assists), 1) as avg_assists,
      ROUND(AVG(ps.total_damage_dealt)) as avg_damage,
      ROUND(AVG(ps.gold_earned)) as avg_gold,
      ROUND(AVG(ps.score), 1) as avg_score,
      SUM(CASE WHEN ps.score_badge = 'MVP' THEN 1 ELSE 0 END) as mvps,
      SUM(CASE WHEN ps.score_badge = 'ACE' THEN 1 ELSE 0 END) as aces,
      SUM(ps.double_kills) as double_kills,
      SUM(ps.triple_kills) as triple_kills,
      SUM(ps.quadra_kills) as quadra_kills,
      SUM(ps.penta_kills) as penta_kills
    FROM ${source.table} ${source.alias}
    JOIN games g ON ${source.alias}.game_id = g.game_id
    WHERE ${where.join(" AND ")} ${timeFilter.sql}
      AND g.queue_id NOT IN (${statsPlaceholders})
    GROUP BY ps.champion_id
    ORDER BY games DESC
  `)
    .all(...params, ...timeFilter.params, ...NO_STATS_QUEUE_IDS);
}

export function getAugmentStatsAll(
  championId?: number,
  patch?: string,
  queue?: number,
  account?: string,
): any[] {
  const source = statsSource(account);
  const where = ["g.is_remake = 0"];
  where.push(source.accountFilter);
  const params: any[] = account ? [account] : [];
  if (championId !== undefined) {
    where.push("ps.champion_id = ?");
    params.push(championId);
  }
  if (patch) {
    where.push("g.game_version = ?");
    params.push(patch);
  }
  applyQueueFilter(where, params, queue);
  where.push(`g.queue_id NOT IN (${EXCLUDED_STATS_SQL})`);
  const augmentId = account ? "mpa.augment_id" : "ga.augment_id";
  const augmentSource = account
    ? `FROM match_participant_augments mpa
       JOIN match_participants mp
         ON mp.game_id = mpa.game_id
        AND mp.participant_id = mpa.participant_id
        AND mp.puuid = ps.puuid
       JOIN ${source.table} ${source.alias} ON mpa.game_id = ps.game_id
       JOIN games g ON mpa.game_id = g.game_id`
    : `FROM game_augments ga
       JOIN ${source.table} ${source.alias} ON ga.game_id = ps.game_id
       JOIN games g ON ga.game_id = g.game_id`;
  return db
    .prepare(`
    SELECT ${augmentId} as augment_id, COUNT(*) as picks, SUM(ps.win) as wins
    ${augmentSource}
    WHERE ${where.join(" AND ")}
    GROUP BY ${augmentId}
    ORDER BY picks DESC
  `)
    .all(...params);
}

const EXCLUDED_STATS_SQL = NO_STATS_QUEUE_IDS.join(", ");
const EXCLUDED_CS_SQL = [...NO_CS_QUEUE_IDS, ...NO_STATS_QUEUE_IDS].join(", ");

export function getDashboardData(
  filters?: {
    championId?: number;
    patch?: string;
    queue?: number | number[];
    account?: string;
  },
  timePeriod?: "24h" | "7d" | "30d" | "full",
): any {
  const source = statsSource(filters?.account);
  const where: string[] = ["g.is_remake = 0", source.accountFilter];
  const params: any[] = filters?.account && filters.account !== "all" ? [filters.account] : [];
  if (filters?.championId != null) {
    where.push("ps.champion_id = ?");
    params.push(filters.championId);
  }

  if (filters?.patch) {
    where.push("g.game_version = ?");
    params.push(filters.patch);
  }
  applyQueueFilter(where, params, filters?.queue);
  const timeFilter = applyTimeFilter(timePeriod);
  const whereSql = `WHERE ${where.join(" AND ")} ${timeFilter.sql}`;
  const queryParams = [...params, ...timeFilter.params];

  const totals = db
    .prepare(`
    SELECT COUNT(*) as totalGames,
           SUM(g.game_duration) as totalDuration,
           SUM(ps.win) as wins,
           SUM(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN ps.kills ELSE 0 END) as totalKills,
           SUM(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN ps.deaths ELSE 0 END) as totalDeaths,
           SUM(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN ps.assists ELSE 0 END) as totalAssists,
           AVG(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN ps.total_damage_dealt END) as avgDamageDealt,
           AVG(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN ps.total_damage_taken END) as avgDamageTaken,
           AVG(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN ps.total_heal END) as avgDamageHealed,
           AVG(CASE WHEN g.queue_id NOT IN (${EXCLUDED_CS_SQL}) THEN ps.cs END) as avgCs,
           SUM(CASE WHEN g.queue_id NOT IN (${EXCLUDED_CS_SQL}) THEN ps.cs END) as csTotal,
           AVG(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN ps.gold_earned END) as avgGold,
           SUM(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN ps.gold_earned END) as goldTotal,
           SUM(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN ps.double_kills ELSE 0 END) as doubles,
           SUM(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN ps.triple_kills ELSE 0 END) as triples,
           SUM(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN ps.quadra_kills ELSE 0 END) as quadras,
           SUM(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN ps.penta_kills ELSE 0 END) as pentas,
           COUNT(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) AND ps.double_kills > 0 THEN 1 END) as gamesWithDoubles,
           COUNT(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) AND ps.triple_kills > 0 THEN 1 END) as gamesWithTriples,
           COUNT(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) AND ps.quadra_kills > 0 THEN 1 END) as gamesWithQuadras,
           COUNT(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) AND ps.penta_kills > 0 THEN 1 END) as gamesWithPentas,
           AVG(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) THEN ps.score END) as avgScore,
           SUM(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) AND ps.score_badge = 'MVP' THEN 1 ELSE 0 END) as mvps,
           SUM(CASE WHEN g.queue_id NOT IN (${EXCLUDED_STATS_SQL}) AND ps.score_badge = 'ACE' THEN 1 ELSE 0 END) as aces,
           SUM(CASE WHEN ps.score IS NOT NULL AND ps.win = 1 THEN 1 ELSE 0 END) as scoredWins,
           SUM(CASE WHEN ps.score IS NOT NULL AND ps.win = 0 THEN 1 ELSE 0 END) as scoredLosses,
           -- Every total here pools all tracked accounts; games whose owner was
           -- never resolved carry an empty puuid and aren't an account
           COUNT(DISTINCT NULLIF(${filters?.account ? "ps.puuid" : "g.puuid"}, '')) as accounts
    FROM ${source.table} ${source.alias}
    JOIN games g ON ${source.alias}.game_id = g.game_id
    ${whereSql}
  `)
    .get(...queryParams) as any;

  const recentForm = db
    .prepare(`
    SELECT ps.win, g.game_id, g.is_remake, ps.champion_id, ps.kills, ps.deaths, ps.assists
    FROM games g
    JOIN ${source.table} ${source.alias} ON g.game_id = ${source.alias}.game_id
    ${whereSql}
    ORDER BY g.game_creation DESC
    LIMIT 20
  `)
    .all(...queryParams);

  const topChampions = db
    .prepare(`
    SELECT
      ps.champion_id,
      COUNT(*) as games,
      SUM(ps.win) as wins,
      ROUND(AVG(ps.kills), 1) as avg_kills,
      ROUND(AVG(ps.deaths), 1) as avg_deaths,
      ROUND(AVG(ps.assists), 1) as avg_assists
    FROM ${source.table} ${source.alias}
    JOIN games g ON ${source.alias}.game_id = g.game_id
    ${whereSql} AND g.queue_id NOT IN (${EXCLUDED_STATS_SQL})
    GROUP BY ps.champion_id
    ORDER BY games DESC
    LIMIT 5
  `)
    .all(...queryParams);

  const augmentId = filters?.account ? "mpa.augment_id" : "ga.augment_id";
  const augmentSource = filters?.account
    ? `FROM match_participant_augments mpa
     JOIN match_participants mp
       ON mp.game_id = mpa.game_id
      AND mp.participant_id = mpa.participant_id
      AND mp.puuid = ps.puuid
     JOIN ${source.table} ${source.alias} ON mpa.game_id = ps.game_id
     JOIN games g ON mpa.game_id = g.game_id`
    : `FROM game_augments ga
     JOIN ${source.table} ${source.alias} ON ga.game_id = ps.game_id
     JOIN games g ON ga.game_id = g.game_id`;
  const topAugments = db
    .prepare(`
  SELECT ${augmentId} as augment_id, COUNT(*) as picks, SUM(ps.win) as wins
  ${augmentSource}
  ${whereSql} AND g.queue_id NOT IN (${EXCLUDED_STATS_SQL})
  GROUP BY ${augmentId}
    ORDER BY picks DESC
    LIMIT 5
  `)
    .all(...queryParams);

  const teamAvgScoreRow = db
    .prepare(`
  SELECT AVG(mp.score) as teamAvgScore
  FROM games g
  JOIN ${source.table} ${source.alias} ON g.game_id = ${source.alias}.game_id
  JOIN match_participants owner
    ON owner.game_id = g.game_id
    AND owner.champion_id = ${source.alias}.champion_id
    AND owner.kills = ${source.alias}.kills
    AND owner.deaths = ${source.alias}.deaths
    AND owner.assists = ${source.alias}.assists
  JOIN match_participants mp
    ON mp.game_id = g.game_id
    AND mp.team_id = owner.team_id
    AND mp.participant_id != owner.participant_id
    AND mp.score IS NOT NULL
  ${whereSql} AND g.queue_id NOT IN (${EXCLUDED_STATS_SQL})
  `)
    .get(...queryParams) as { teamAvgScore: number | null } | undefined;

  return {
    totalGames: totals.totalGames ?? 0,
    totalDuration: totals.totalDuration ?? 0,
    wins: totals.wins ?? 0,
    totalKills: totals.totalKills ?? 0,
    totalDeaths: totals.totalDeaths ?? 0,
    totalAssists: totals.totalAssists ?? 0,
    avgKills: totals.totalGames > 0 ? (totals.totalKills ?? 0) / totals.totalGames : 0,
    avgDeaths: totals.totalGames > 0 ? (totals.totalDeaths ?? 0) / totals.totalGames : 0,
    avgAssists: totals.totalGames > 0 ? (totals.totalAssists ?? 0) / totals.totalGames : 0,
    avgDamageDealt: totals.avgDamageDealt ?? 0,
    avgDamageTaken: totals.avgDamageTaken ?? 0,
    avgDamageHealed: totals.avgDamageHealed ?? 0,
    avgCs: totals.avgCs ?? 0,
    csTotal: totals.csTotal ?? 0,
    csPerMin:
      (totals.totalDuration ?? 0) > 0
        ? (totals.csTotal ?? 0) / ((totals.totalDuration ?? 0) / 60)
        : 0,
    avgGameLength: totals.totalGames > 0 ? (totals.totalDuration ?? 0) / totals.totalGames : 0,
    avgGold: totals.avgGold ?? 0,
    goldTotal: totals.goldTotal ?? 0,
    avgScore: totals.avgScore ?? null,
    teamAvgScore: teamAvgScoreRow?.teamAvgScore ?? 0,
    mvps: totals.mvps ?? 0,
    aces: totals.aces ?? 0,
    scoredWins: totals.scoredWins ?? 0,
    scoredLosses: totals.scoredLosses ?? 0,
    accounts: totals.accounts ?? 0,
    recentForm,
    topChampions,
    multikills: {
      doubles: totals.doubles ?? 0,
      triples: totals.triples ?? 0,
      quadras: totals.quadras ?? 0,
      pentas: totals.pentas ?? 0,
      gamesWithDoubles: totals.gamesWithDoubles ?? 0,
      gamesWithTriples: totals.gamesWithTriples ?? 0,
      gamesWithQuadras: totals.gamesWithQuadras ?? 0,
      gamesWithPentas: totals.gamesWithPentas ?? 0,
    },
    topAugments,
  };
}

export function getQueueStatsForAccount(puuid: string): QueueStat[] {
  console.log("[db] getQueueStatsForAccount called:", { puuid });
  const rows = db
    .prepare(
      `
        SELECT
          g.queue_id AS queue_id,
          COUNT(*) AS count,
          SUM(CASE WHEN tgs.win = 1 THEN 1 ELSE 0 END) AS wins,
          SUM(CASE WHEN tgs.win = 0 THEN 1 ELSE 0 END) AS losses
        FROM tracked_game_stats tgs
        INNER JOIN games g ON g.game_id = tgs.game_id
        WHERE tgs.puuid = ?
          AND g.queue_id IS NOT NULL
        GROUP BY g.queue_id
        ORDER BY count DESC
      `,
    )
    .all(puuid) as Array<{
    queue_id: number;
    count: number;
    wins: number;
    losses: number;
  }>;
  const result = rows
    .filter((row) => row.queue_id !== 0)
    .map(({ queue_id, count, wins, losses }) => ({
      queueId: queue_id,
      count,
      wins,
      losses,
    }));
  console.log("[db] getQueueStatsForAccount done:", { count: result.length });
  return result;
}

export function getMostPlayedQueue(
  puuid: string,
): { queue_id: number; games: number; wins: number; isArenaGroup: boolean } | null {
  const arenaPlaceholders = ARENA_QUEUE_IDS.map(() => "?").join(", ");
  const arenaRow = db
    .prepare(`
      SELECT COUNT(*) AS games, SUM(mp.win) AS wins
      FROM match_participants mp
      WHERE mp.puuid = ? AND mp.is_remake = 0 AND mp.queue_id IN (${arenaPlaceholders})
    `)
    .get(puuid, ...ARENA_QUEUE_IDS) as { games: number; wins: number } | undefined;
  const nonArenaRow = db
    .prepare(`
      SELECT queue_id, COUNT(*) AS games, SUM(win) AS wins
      FROM match_participants
      WHERE puuid = ? AND is_remake = 0
        AND queue_id IS NOT NULL
        AND queue_id NOT IN (${arenaPlaceholders})
      GROUP BY queue_id
      ORDER BY games DESC
      LIMIT 1
    `)
    .get(puuid, ...ARENA_QUEUE_IDS) as
    | { queue_id: number; games: number; wins: number }
    | undefined;
  const arenaGames = arenaRow?.games ?? 0;
  const nonArenaGames = nonArenaRow?.games ?? 0;
  if (arenaGames === 0 && nonArenaGames === 0) return null;
  if (arenaGames >= nonArenaGames) {
    return {
      queue_id: ARENA_QUEUE_IDS[0],
      games: arenaGames,
      wins: arenaRow?.wins ?? 0,
      isArenaGroup: true,
    };
  }
  return { ...nonArenaRow!, isArenaGroup: false };
}

export function getMostPlayedQueueByName(
  gameName: string,
  tagLine: string,
): { queue_id: number; games: number; wins: number; isArenaGroup: boolean } | null {
  const arenaPlaceholders = ARENA_QUEUE_IDS.map(() => "?").join(", ");
  const arenaRow = db
    .prepare(`
      SELECT COUNT(*) AS games, SUM(mp.win) AS wins
      FROM match_participants mp
      WHERE LOWER(mp.game_name) = LOWER(?)
        AND LOWER(mp.tag_line) = LOWER(?)
        AND mp.is_remake = 0
        AND mp.queue_id IN (${arenaPlaceholders})
    `)
    .get(gameName, tagLine, ...ARENA_QUEUE_IDS) as { games: number; wins: number } | undefined;
  const nonArenaRow = db
    .prepare(`
      SELECT queue_id, COUNT(*) AS games, SUM(win) AS wins
      FROM match_participants
      WHERE LOWER(game_name) = LOWER(?)
        AND LOWER(tag_line) = LOWER(?)
        AND is_remake = 0
        AND queue_id IS NOT NULL
        AND queue_id NOT IN (${arenaPlaceholders})
      GROUP BY queue_id
      ORDER BY games DESC
      LIMIT 1
    `)
    .get(gameName, tagLine, ...ARENA_QUEUE_IDS) as
    | { queue_id: number; games: number; wins: number }
    | undefined;
  const arenaGames = arenaRow?.games ?? 0;
  const nonArenaGames = nonArenaRow?.games ?? 0;
  if (arenaGames === 0 && nonArenaGames === 0) return null;
  if (arenaGames >= nonArenaGames) {
    return {
      queue_id: ARENA_QUEUE_IDS[0],
      games: arenaGames,
      wins: arenaRow?.wins ?? 0,
      isArenaGroup: true,
    };
  }
  return { ...nonArenaRow!, isArenaGroup: false };
}

export function getTotalMatchesPlayed(puuid: string): { games: number; wins: number } | null {
  const row = db
    .prepare(`
      SELECT COUNT(*) AS games, SUM(ps.win) AS wins
      FROM games g
      JOIN player_stats ps ON ps.game_id = g.game_id
      WHERE g.puuid = ? AND g.is_remake = 0
    `)
    .get(puuid) as { games: number; wins: number } | undefined;
  if (!row || row.games === 0) return null;
  return row;
}

export function getTotalMatchesPlayedByName(
  gameName: string,
  tagLine: string,
): { games: number; wins: number } | null {
  const row = db
    .prepare(`
      SELECT COUNT(*) AS games, SUM(ps.win) AS wins
      FROM games g
      JOIN player_stats ps ON ps.game_id = g.game_id
      WHERE g.puuid IN (
        SELECT DISTINCT mp.puuid
        FROM match_participants mp
        WHERE LOWER(mp.game_name) = LOWER(?)
          AND LOWER(mp.tag_line) = LOWER(?)
          AND mp.puuid IS NOT NULL
      )
        AND g.is_remake = 0
    `)
    .get(gameName, tagLine) as { games: number; wins: number } | undefined;
  if (!row || row.games === 0) return null;
  return row;
}

export function getRankedRecordForPuuid(puuid: string): {
  solo: { wins: number; losses: number };
  flex: { wins: number; losses: number };
} | null {
  const rows = db
    .prepare(
      `SELECT g.queue_id AS queue_id, mp.win AS win
       FROM match_participants mp
       JOIN games g ON g.game_id = mp.game_id
       WHERE mp.puuid = ? AND mp.is_remake = 0 AND g.queue_id IN (420, 440)`,
    )
    .all(puuid) as { queue_id: number; win: number }[];

  if (rows.length === 0) return null;

  const result = {
    solo: { wins: 0, losses: 0 },
    flex: { wins: 0, losses: 0 },
  };
  for (const row of rows) {
    const bucket = row.queue_id === 420 ? result.solo : result.flex;
    if (row.win) bucket.wins++;
    else bucket.losses++;
  }
  return result;
}

export function getRecentGames(
  puuid: string,
  queueIds: number[],
  limit: number,
): Array<{
  game_id: number;
  champion_id: number;
  win: number;
  is_remake: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  game_duration: number;
  score: number | null;
  team_position: string | null;
  queue_id: number;
}> | null {
  if (limit <= 0) return null;
  const queueFilter =
    queueIds.length > 0 ? `AND mp.queue_id IN (${queueIds.map(() => "?").join(", ")})` : "";
  const rows = db
    .prepare(`
      SELECT
        mp.game_id,
        COALESCE(tgs.champion_id, ps.champion_id, mp.champion_id) AS champion_id,
        mp.win,
        mp.is_remake,
        COALESCE(tgs.kills, ps.kills, mp.kills) AS kills,
        COALESCE(tgs.deaths, ps.deaths, mp.deaths) AS deaths,
        COALESCE(tgs.assists, ps.assists, mp.assists) AS assists,
        COALESCE(tgs.cs, ps.cs, mp.cs) AS cs,
        g.game_duration,
        COALESCE(tgs.score, ps.score) AS score,
        mp.team_position AS team_position,
        mp.queue_id
      FROM match_participants mp
      JOIN games g ON g.game_id = mp.game_id
      LEFT JOIN tracked_game_stats tgs
        ON tgs.game_id = g.game_id AND tgs.puuid = mp.puuid
      LEFT JOIN player_stats ps
        ON ps.game_id = g.game_id
        AND ps.champion_id = mp.champion_id
        AND ps.kills = mp.kills
        AND ps.deaths = mp.deaths
        AND ps.assists = mp.assists
      WHERE mp.puuid = ?
        ${queueFilter}
      ORDER BY g.game_creation DESC
      LIMIT ?
    `)
    .all(puuid, ...queueIds, limit) as Array<{
    game_id: number;
    champion_id: number;
    win: number;
    is_remake: number;
    kills: number;
    deaths: number;
    assists: number;
    cs: number;
    game_duration: number;
    score: number | null;
    team_position: string | null;
    queue_id: number;
  }>;
  return rows.length > 0 ? rows : null;
}

export function getRecentGamesByName(
  gameName: string,
  tagLine: string,
  queueIds: number[],
  limit: number,
): Array<{
  game_id: number;
  champion_id: number;
  win: number;
  is_remake: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  game_duration: number;
  score: number | null;
  team_position: string | null;
  queue_id: number;
}> | null {
  if (limit <= 0) return null;
  const queueFilter =
    queueIds.length > 0 ? `AND mp.queue_id IN (${queueIds.map(() => "?").join(", ")})` : "";
  const rows = db
    .prepare(`
      SELECT
        mp.game_id,
        COALESCE(tgs.champion_id, ps.champion_id, mp.champion_id) AS champion_id,
        mp.win,
        mp.is_remake,
        COALESCE(tgs.kills, ps.kills, mp.kills) AS kills,
        COALESCE(tgs.deaths, ps.deaths, mp.deaths) AS deaths,
        COALESCE(tgs.assists, ps.assists, mp.assists) AS assists,
        COALESCE(tgs.cs, ps.cs, mp.cs) AS cs,
        g.game_duration,
        COALESCE(tgs.score, ps.score) AS score,
        mp.team_position AS team_position,
        mp.queue_id
      FROM match_participants mp
      JOIN games g ON g.game_id = mp.game_id
      LEFT JOIN tracked_game_stats tgs
        ON tgs.game_id = g.game_id AND tgs.puuid = mp.puuid
      LEFT JOIN player_stats ps
        ON ps.game_id = g.game_id
        AND ps.champion_id = mp.champion_id
        AND ps.kills = mp.kills
        AND ps.deaths = mp.deaths
        AND ps.assists = mp.assists
      WHERE LOWER(mp.game_name) = LOWER(?)
        AND LOWER(mp.tag_line) = LOWER(?)
        ${queueFilter}
      ORDER BY g.game_creation DESC
      LIMIT ?
    `)
    .all(gameName, tagLine, ...queueIds, limit) as Array<{
    game_id: number;
    champion_id: number;
    win: number;
    is_remake: number;
    kills: number;
    deaths: number;
    assists: number;
    cs: number;
    game_duration: number;
    score: number | null;
    team_position: string | null;
    queue_id: number;
  }>;
  return rows.length > 0 ? rows : null;
}

export function getRecentRiotMatchStubs(
  puuid: string,
  limit: number,
): Array<{
  gameId: number;
  win: boolean;
  championId: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  score: number | null;
  gameCreation: number;
  gameDuration: number;
  queueId: number;
  teamPosition: string | null;
}> {
  const rows = db
    .prepare(
      `SELECT mp.game_id AS gameId,
              mp.win AS win,
              mp.champion_id AS championId,
              COALESCE(tgs.kills, mp.kills) AS kills,
              COALESCE(tgs.deaths, mp.deaths) AS deaths,
              COALESCE(tgs.assists, mp.assists) AS assists,
              COALESCE(tgs.cs, mp.cs) AS cs,
              tgs.score AS score,
              g.game_creation AS gameCreation,
              g.game_duration AS gameDuration,
              g.queue_id AS queueId,
              mp.team_position AS teamPosition
       FROM match_participants mp
       JOIN games g ON g.game_id = mp.game_id
       LEFT JOIN tracked_game_stats tgs
         ON tgs.game_id = g.game_id AND tgs.puuid = mp.puuid
       WHERE mp.puuid = ?
       ORDER BY g.game_creation DESC
       LIMIT ?`,
    )
    .all(puuid, limit) as Array<{
    gameId: number;
    win: number;
    championId: number;
    kills: number;
    deaths: number;
    assists: number;
    cs: number;
    score: number | null;
    gameCreation: number;
    gameDuration: number;
    queueId: number;
    teamPosition: string | null;
  }>;
  return rows.map((row) => ({
    gameId: row.gameId,
    win: row.win === 1,
    championId: row.championId,
    kills: row.kills,
    deaths: row.deaths,
    assists: row.assists,
    cs: row.cs ?? 0,
    score: row.score ?? null,
    gameCreation: row.gameCreation,
    gameDuration: row.gameDuration,
    queueId: row.queueId,
    teamPosition: row.teamPosition ?? null,
  }));
}

export function getAugmentStatsWithChampions(
  patch?: string,
  queue?: number,
  account?: string,
): {
  totalGames: number;
  augments: {
    augment_id: number;
    picks: number;
    wins: number;
    champions: { champion_id: number; picks: number; wins: number }[];
  }[];
} {
  const source = statsSource(account);
  const where = ["g.is_remake = 0", source.accountFilter];
  const params: any[] = account ? [account] : [];
  if (patch) {
    where.push("g.game_version = ?");
    params.push(patch);
  }
  applyQueueFilter(where, params, queue);
  where.push(`g.queue_id NOT IN (${EXCLUDED_STATS_SQL})`);
  const augmentId = account ? "mpa.augment_id" : "ga.augment_id";
  const augmentSource = account
    ? `FROM match_participant_augments mpa
       JOIN match_participants mp
         ON mp.game_id = mpa.game_id
        AND mp.participant_id = mpa.participant_id
        AND mp.puuid = ps.puuid
       JOIN ${source.table} ${source.alias} ON mpa.game_id = ps.game_id
       JOIN games g ON mpa.game_id = g.game_id`
    : `FROM game_augments ga
       JOIN ${source.table} ${source.alias} ON ga.game_id = ps.game_id
       JOIN games g ON ga.game_id = g.game_id`;
  const augments = db
    .prepare(`
    SELECT ${augmentId} as augment_id, COUNT(*) as picks, SUM(ps.win) as wins
    ${augmentSource}
    WHERE ${where.join(" AND ")}
    GROUP BY ${augmentId}
    ORDER BY picks DESC
  `)
    .all(...params) as { augment_id: number; picks: number; wins: number }[];

  const champBreakdown = db
    .prepare(`
    SELECT ${augmentId} as augment_id, ps.champion_id, COUNT(*) as picks, SUM(ps.win) as wins
    ${augmentSource}
    WHERE ${where.join(" AND ")}
    GROUP BY ${augmentId}, ps.champion_id
    ORDER BY picks DESC
  `)
    .all(...params) as { augment_id: number; champion_id: number; picks: number; wins: number }[];

  const champMap = new Map<number, { champion_id: number; picks: number; wins: number }[]>();
  for (const row of champBreakdown) {
    if (!champMap.has(row.augment_id)) champMap.set(row.augment_id, []);
    champMap
      .get(row.augment_id)!
      .push({ champion_id: row.champion_id, picks: row.picks, wins: row.wins });
  }

  // Counted here rather than derived from the augment rows. Picks are slots,
  // not games: a game carries up to AUGMENT_SLOTS of them and often fewer, so
  // dividing picks by the slot count lands on neither number and disagrees
  // with what the Champions tab sums for the same filters.
  const { totalGames } = db
    .prepare(`
    SELECT COUNT(*) as totalGames
    FROM ${source.table} ps
    JOIN games g ON ps.game_id = g.game_id
    WHERE ${where.join(" AND ")}
  `)
    .get(...params) as { totalGames: number };

  return {
    totalGames,
    augments: augments.map((a) => ({
      ...a,
      champions: champMap.get(a.augment_id) ?? [],
    })),
  };
}

export function getChampionMatchHistory(
  championId: number,
  limit: number,
  offset: number,
  patch?: string,
  queue?: number,
  account?: string,
): { matches: any[]; total: number } {
  const source = statsSource(account);
  const playerPuuidSql = account ? "ps.puuid" : "g.puuid";
  const where = ["ps.champion_id = ?"];
  where.push(source.accountFilter);
  const params: any[] = [championId, ...(account ? [account] : [])];
  if (patch) {
    where.push("g.game_version = ?");
    params.push(patch);
  }
  applyQueueFilter(where, params, queue);
  const whereSql = `WHERE ${where.join(" AND ")}`;
  const augmentIdsSql = account
    ? `(SELECT GROUP_CONCAT(augment_id, ',')
        FROM (
          SELECT mpa.augment_id
          FROM match_participant_augments mpa
          JOIN match_participants mp
            ON mp.game_id = mpa.game_id AND mp.participant_id = mpa.participant_id
          WHERE mp.game_id = g.game_id AND mp.puuid = ${playerPuuidSql}
          ORDER BY mpa.slot
        ))`
    : `(SELECT GROUP_CONCAT(augment_id, ',')
        FROM (SELECT augment_id FROM game_augments
              WHERE game_id = g.game_id
              ORDER BY slot))`;
  const total = db
    .prepare(`
    SELECT COUNT(*) as count
    FROM games g
    JOIN ${source.table} ps ON g.game_id = ps.game_id
    ${whereSql}
  `)
    .get(...params) as any;
  const matches = db
    .prepare(`
    SELECT g.game_id, g.game_creation, g.game_duration, g.is_remake, g.favorite,
           ${playerPuuidSql} as puuid,
           ps.champion_id, ps.win, ps.kills, ps.deaths, ps.assists,
           ps.double_kills, ps.triple_kills, ps.quadra_kills, ps.penta_kills,
           ps.total_damage_dealt, ps.total_damage_taken, ps.total_heal, ps.gold_earned,
           ps.score, ps.score_badge,
           COALESCE(ps.spell1, (
             SELECT mp.spell1 FROM match_participants mp
             WHERE mp.game_id = g.game_id AND mp.puuid = ${playerPuuidSql}
           )) as spell1,
           COALESCE(ps.spell2, (
             SELECT mp.spell2 FROM match_participants mp
             WHERE mp.game_id = g.game_id AND mp.puuid = ${playerPuuidSql}
           )) as spell2,
           ps.item0, ps.item1, ps.item2, ps.item3, ps.item4, ps.item5,
           ${augmentIdsSql} as augment_ids,
           (SELECT mp.team_position FROM match_participants mp
             WHERE mp.game_id = g.game_id AND mp.puuid = g.puuid) as team_position,
           (SELECT mp.player_subteam_placement FROM match_participants mp
             WHERE mp.game_id = g.game_id AND mp.puuid = g.puuid) as player_subteam_placement,
${GAME_MAX_STATS_SQL}
    FROM games g
    JOIN ${source.table} ps ON g.game_id = ps.game_id
    ${whereSql}
    ORDER BY g.game_creation DESC
    LIMIT ? OFFSET ?
  `)
    .all(...params, limit, offset);
  return { matches, total: total.count };
}

export function toggleFavorite(gameId: number): boolean {
  db.prepare("UPDATE games SET favorite = 1 - favorite WHERE game_id = ?").run(gameId);
  const row = db.prepare("SELECT favorite FROM games WHERE game_id = ?").get(gameId) as
    | { favorite: number }
    | undefined;
  return !!row?.favorite;
}

export function gameExists(gameId: number): boolean {
  const row = db.prepare("SELECT 1 FROM games WHERE game_id = ?").get(gameId);
  return !!row;
}

// Every game id we've already made a decision about — stored or deliberately
// skipped. One query beats a lookup per id when a backfill checks hundreds.
export function getKnownGameIds(): Set<number> {
  // Ignored games were used by the Mayhem-only importer. The general League
  // history path must be able to revisit those IDs after an upgrade.
  const rows = db.prepare("SELECT game_id FROM games").all() as { game_id: number }[];
  return new Set(rows.map((r) => r.game_id));
}

// Games already known *for this specific account*. A game only counts as
// known here if the account's puuid shows up among the stored participants
// (match_participants holds every real participant of an already-imported
// game, regardless of which tracked account originally synced it) — not
// merely because some *other* tracked account has already synced it. Using
// the global getKnownGameIds() for a second account's pagination cutoff would
// stop scanning as soon as it saw a game shared with the first account, even
// though older games unique to this account still need to be fetched.
export function getKnownGameIdsForPuuid(puuid: string): Set<number> {
  const rows = db
    .prepare(
      `SELECT DISTINCT game_id FROM match_participants WHERE puuid = ?
       UNION
       SELECT game_id FROM games WHERE puuid = ?`,
    )
    .all(puuid, puuid) as { game_id: number }[];
  return new Set(rows.map((r) => r.game_id));
}

export function getTrackedGameIdsForPuuid(puuid: string): Set<number> {
  const rows = db.prepare("SELECT game_id FROM tracked_game_stats WHERE puuid = ?").all(puuid) as {
    game_id: number;
  }[];
  return new Set(rows.map((r) => r.game_id));
}

export function getTrackedRowCountForPuuid(puuid: string): {
  trackedRows: number;
  gamesRows: number;
  joinedRows: number;
} {
  const trackedRows = (
    db.prepare("SELECT COUNT(*) as n FROM tracked_game_stats WHERE puuid = ?").get(puuid) as {
      n: number;
    }
  ).n;
  const gamesRows = (
    db
      .prepare(
        `SELECT COUNT(*) as n FROM games g
         JOIN tracked_game_stats tgs ON g.game_id = tgs.game_id
         WHERE tgs.puuid = ?`,
      )
      .get(puuid) as { n: number }
  ).n;
  const joinedRows = (
    db
      .prepare(
        `SELECT COUNT(*) as n FROM games g
         JOIN tracked_game_stats tgs ON g.game_id = tgs.game_id
         WHERE tgs.puuid = ? AND g.is_remake = 0`,
      )
      .get(puuid) as { n: number }
  ).n;
  return { trackedRows, gamesRows, joinedRows };
}

export function markIgnoredGame(gameId: number): void {
  db.prepare("INSERT OR IGNORE INTO ignored_games (game_id) VALUES (?)").run(gameId);
}

export function getIgnoredGameIds(): Set<number> {
  const rows = db.prepare("SELECT game_id FROM ignored_games").all() as { game_id: number }[];
  return new Set(rows.map((row) => row.game_id));
}

export function restoreOlderGames(): { restored: number; remaining: number } {
  console.log("[db] restoreOlderGames called");
  const tx = db.transaction(() => {
    const before = (db.prepare("SELECT COUNT(*) AS n FROM ignored_games").get() as { n: number }).n;
    db.prepare(`
      DELETE FROM ignored_games
      WHERE game_id IN (SELECT game_id FROM games)
         OR game_id IN (SELECT game_id FROM match_participants)
    `).run();
    const after = (db.prepare("SELECT COUNT(*) AS n FROM ignored_games").get() as { n: number }).n;
    return { restored: before - after, remaining: after };
  });
  const result = tx();
  console.log("[db] restoreOlderGames done:", result);
  return result;
}

// The game's owner among its participant rows. participantRowsFromRaw has
// already folded participantIdentities into each row's puuid, so one lookup
// covers both the LCU and SGP shapes.
function findOwnerRow(
  rows: RawParticipantRow[],
  puuid: string,
  gameName?: string | null,
  tagLine?: string | null,
): RawParticipantRow | null {
  if (puuid) {
    const byPuuid = rows.find((r) => r.puuid === puuid);
    if (byPuuid) return byPuuid;
  }
  if (gameName && tagLine) {
    const targetName = gameName.trim().toLowerCase();
    const targetTag = tagLine.trim().toLowerCase();
    return (
      rows.find(
        (r) =>
          (r.game_name ?? "").trim().toLowerCase() === targetName &&
          (r.tag_line ?? "").trim().toLowerCase() === targetTag,
      ) ?? null
    );
  }
  return null;
}

type TrackedOnlyResult = "inserted" | "duplicate" | "no-owner-row";

function insertTrackedStatsOnly(gameId: number, puuid: string): TrackedOnlyResult {
  const rows = db
    .prepare(`
      SELECT participant_id, puuid, team_id, champion_id, win,
             kills, deaths, assists,
             double_kills, triple_kills, quadra_kills, penta_kills,
             total_damage_dealt, total_damage_taken, gold_earned, total_heal,
             largest_killing_spree, total_damage_dealt_all, true_damage_dealt, cs,
             largest_critical_strike, spell1, spell2,
             item0, item1, item2, item3, item4, item5, item6
      FROM match_participants
      WHERE game_id = ?
    `)
    .all(gameId) as Array<
    ScoreRow & {
      largest_killing_spree: number;
      total_damage_dealt_all: number;
      true_damage_dealt: number;
      cs: number;
      largest_critical_strike: number;
      spell1: number | null;
      spell2: number | null;
      item0: number | null;
      item1: number | null;
      item2: number | null;
      item3: number | null;
      item4: number | null;
      item5: number | null;
      item6: number | null;
    }
  >;

  const owner = rows.find((r) => r.puuid === puuid);
  if (!owner) return "no-owner-row";

  const gameRow = db.prepare("SELECT is_remake FROM games WHERE game_id = ?").get(gameId) as
    | { is_remake: number }
    | undefined;
  const isRemake = !!gameRow?.is_remake;

  let ownerScore: PlayerScore | null = null;
  if (!isRemake) {
    ownerScore = computeOwnerScore(rows as ScoreRow[], puuid, {
      champion_id: owner.champion_id,
      kills: owner.kills,
      deaths: owner.deaths,
      assists: owner.assists,
    });
  }

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO tracked_game_stats (
      game_id, puuid, champion_id, win, kills, deaths, assists,
      double_kills, triple_kills, quadra_kills, penta_kills,
      total_damage_dealt, total_damage_taken, gold_earned, total_heal,
      largest_killing_spree, total_damage_dealt_all, true_damage_dealt, cs,
      largest_critical_strike, score, score_raw, score_badge, spell1, spell2,
      item0, item1, item2, item3, item4, item5, item6
    ) VALUES (
      @game_id, @puuid, @champion_id, @win, @kills, @deaths, @assists,
      @double_kills, @triple_kills, @quadra_kills, @penta_kills,
      @total_damage_dealt, @total_damage_taken, @gold_earned, @total_heal,
      @largest_killing_spree, @total_damage_dealt_all, @true_damage_dealt, @cs,
      @largest_critical_strike, @score, @score_raw, @score_badge, @spell1, @spell2,
      @item0, @item1, @item2, @item3, @item4, @item5, @item6
    )
  `);

  const result = stmt.run({
    game_id: gameId,
    puuid,
    champion_id: owner.champion_id,
    win: owner.win,
    kills: owner.kills,
    deaths: owner.deaths,
    assists: owner.assists,
    double_kills: owner.double_kills,
    triple_kills: owner.triple_kills,
    quadra_kills: owner.quadra_kills,
    penta_kills: owner.penta_kills,
    total_damage_dealt: owner.total_damage_dealt,
    total_damage_taken: owner.total_damage_taken,
    gold_earned: owner.gold_earned,
    total_heal: owner.total_heal,
    largest_killing_spree: owner.largest_killing_spree,
    total_damage_dealt_all: owner.total_damage_dealt_all,
    true_damage_dealt: owner.true_damage_dealt,
    cs: owner.cs,
    largest_critical_strike: owner.largest_critical_strike,
    score: ownerScore?.score ?? null,
    score_raw: ownerScore?.raw ?? null,
    score_badge: ownerScore?.badge ?? null,
    spell1: owner.spell1,
    spell2: owner.spell2,
    item0: owner.item0,
    item1: owner.item1,
    item2: owner.item2,
    item3: owner.item3,
    item4: owner.item4,
    item5: owner.item5,
    item6: owner.item6,
  });

  return result.changes > 0 ? "inserted" : "duplicate";
}

export function insertGameFull(
  gameData: any,
  puuid: string,
  source: GameSource,
  foreign = false,
  ownerIdentity?: { gameName: string | null; tagLine: string | null },
): boolean {
  // 'search-import' and foreign=true are two views of the same fact: this
  // game was pulled from a searched player's history and must never be
  // treated as locally owned. Keep them in lockstep.
  if ((source === "search-import") !== foreign) {
    throw new Error(`insertGameFull: source ${source} disagrees with foreign=${foreign}`);
  }

  if (gameExists(gameData.gameId)) {
    const fast = insertTrackedStatsOnly(gameData.gameId, puuid);
    if (fast === "no-owner-row") {
      // The games row exists but our participant row does not, which happens
      // when the game was originally imported under a different puuid, or
      // before a repair that changed ownership. Fall through to the normal
      // parse so the newly fetched Riot payload can seed the participant rows
      // and then the tracked row.
      console.log(
        `[insertGameFull] fast path missed owner row for game ${gameData.gameId}, falling back to full parse`,
      );
    } else {
      return fast === "inserted";
    }
  }

  const rows = participantRowsFromRaw(gameData);
  const owner = findOwnerRow(rows, puuid, ownerIdentity?.gameName, ownerIdentity?.tagLine);
  if (!owner) return false;

  const isRemake = detectRemake(gameData.gameDuration, rows) ? 1 : 0;

  let ownerScore: PlayerScore | null = null;
  if (!isRemake) {
    ownerScore = computeOwnerScore(rows, puuid, {
      champion_id: owner.champion_id,
      kills: owner.kills,
      deaths: owner.deaths,
      assists: owner.assists,
    });
  }

  const gameVersion = parsePatch(gameData.gameVersion);

  const insertGameStmt = db.prepare(`
    INSERT OR IGNORE INTO games (game_id, queue_id, game_mode, game_creation, game_duration, is_remake, puuid, game_version, source, raw_gz)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertStatsStmt = db.prepare(`
    INSERT OR IGNORE INTO player_stats (
      game_id, champion_id, win, kills, deaths, assists,
      double_kills, triple_kills, quadra_kills, penta_kills,
      total_damage_dealt, total_damage_taken, gold_earned, total_heal,
      largest_killing_spree,
      total_damage_dealt_all, true_damage_dealt, cs, largest_critical_strike,
      spell1, spell2,
      item0, item1, item2, item3, item4, item5, item6,
      score, score_raw, score_badge
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAugmentStmt = db.prepare(`
    INSERT OR IGNORE INTO game_augments (game_id, slot, augment_id) VALUES (?, ?, ?)
  `);
  const insertTrackedStatsStmt = db.prepare(`
    INSERT OR IGNORE INTO tracked_game_stats (
      game_id, puuid, champion_id, win, kills, deaths, assists,
      double_kills, triple_kills, quadra_kills, penta_kills,
      total_damage_dealt, total_damage_taken, gold_earned, total_heal,
      largest_killing_spree, total_damage_dealt_all, true_damage_dealt, cs,
      largest_critical_strike, score, score_raw, score_badge, spell1, spell2,
      item0, item1, item2, item3, item4, item5, item6
    ) VALUES (
      @game_id, @puuid, @champion_id, @win, @kills, @deaths, @assists,
      @double_kills, @triple_kills, @quadra_kills, @penta_kills,
      @total_damage_dealt, @total_damage_taken, @gold_earned, @total_heal,
      @largest_killing_spree, @total_damage_dealt_all, @true_damage_dealt, @cs,
      @largest_critical_strike, @score, @score_raw, @score_badge, @spell1, @spell2,
      @item0, @item1, @item2, @item3, @item4, @item5, @item6
    )
  `);
  const ownerStats = {
    champion_id: owner.champion_id,
    win: owner.win,
    kills: owner.kills,
    deaths: owner.deaths,
    assists: owner.assists,
    double_kills: owner.double_kills,
    triple_kills: owner.triple_kills,
    quadra_kills: owner.quadra_kills,
    penta_kills: owner.penta_kills,
    total_damage_dealt: owner.total_damage_dealt,
    total_damage_taken: owner.total_damage_taken,
    gold_earned: owner.gold_earned,
    total_heal: owner.total_heal,
    largest_killing_spree: owner.largest_killing_spree,
    total_damage_dealt_all: owner.total_damage_dealt_all,
    true_damage_dealt: owner.true_damage_dealt,
    cs: owner.cs,
    largest_critical_strike: owner.largest_critical_strike,
    score: ownerScore?.score ?? null,
    score_raw: ownerScore?.raw ?? null,
    score_badge: ownerScore?.badge ?? null,
    spell1: owner.spell1,
    spell2: owner.spell2,
    item0: owner.items[0],
    item1: owner.items[1],
    item2: owner.items[2],
    item3: owner.items[3],
    item4: owner.items[4],
    item5: owner.items[5],
    item6: owner.items[6],
  };

  const tx = db.transaction(() => {
    const ownerPuuidForGamesRow = foreign ? "" : puuid;
    const result = insertGameStmt.run(
      gameData.gameId,
      gameData.queueId,
      gameData.gameMode,
      gameData.gameCreation,
      gameData.gameDuration,
      isRemake,
      ownerPuuidForGamesRow,
      gameVersion,
      source,
      packRaw(gameData),
    );

    if (result.changes === 0) {
      // The game payload is shared, but its owner line is not. A second
      // tracked account must still be retained when this game was seen before.
      // writeParticipants is safe here: it deletes and replaces this game's
      // rows, so the fallback path repairs participant data in the same trip.
      writeParticipants(
        gameData.gameId,
        { is_remake: isRemake, queue_id: gameData.queueId, game_version: gameVersion },
        rows,
      );
      const added = insertTrackedStatsStmt.run({ game_id: gameData.gameId, puuid, ...ownerStats });
      return added.changes > 0;
    }

    writeParticipants(
      gameData.gameId,
      { is_remake: isRemake, queue_id: gameData.queueId, game_version: gameVersion },
      rows,
    );

    if (!foreign) {
      insertStatsStmt.run(
        gameData.gameId,
        owner.champion_id,
        owner.win,
        owner.kills,
        owner.deaths,
        owner.assists,
        owner.double_kills,
        owner.triple_kills,
        owner.quadra_kills,
        owner.penta_kills,
        owner.total_damage_dealt,
        owner.total_damage_taken,
        owner.gold_earned,
        owner.total_heal,
        owner.largest_killing_spree,
        owner.total_damage_dealt_all,
        owner.true_damage_dealt,
        owner.cs,
        owner.largest_critical_strike,
        owner.spell1,
        owner.spell2,
        owner.items[0],
        owner.items[1],
        owner.items[2],
        owner.items[3],
        owner.items[4],
        owner.items[5],
        owner.items[6],
        ownerScore?.score ?? null,
        ownerScore?.raw ?? null,
        ownerScore?.badge ?? null,
      );
    }
    insertTrackedStatsStmt.run({ game_id: gameData.gameId, puuid, ...ownerStats });

    // Augments
    for (const aug of owner.augments) {
      insertAugmentStmt.run(gameData.gameId, aug.slot, aug.augment_id);
    }

    return true;
  });

  return tx() as boolean;
}

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

// One account's name and icon as that game recorded them. Covers databases
// built purely from an import, where the client has never connected and the
// summoner table has no icon.
function identityFromGame(
  gameId: number,
  puuid: string,
): { name: string | null; icon: number | null } {
  const row = db
    .prepare(
      "SELECT game_name, tag_line, profile_icon FROM match_participants WHERE game_id = ? AND puuid = ?",
    )
    .get(gameId, puuid) as
    | { game_name: string | null; tag_line: string | null; profile_icon: number | null }
    | undefined;
  if (!row) return { name: null, icon: null };
  return {
    name: displayName(row.game_name, row.tag_line),
    icon: row.profile_icon,
  };
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

// The id the Friends list keys a teammate on — puuid when we know it, so name
// changes don't split a player in two.
function teammateKey(puuid: string | null, name: string): string {
  return puuid || name;
}

function teammateName(gameName: string | null, tagLine: string | null, participantId: number) {
  return displayName(gameName, tagLine) ?? `Player ${participantId}`;
}

interface TeammateRow {
  game_id: number;
  game_creation: number;
  participant_id: number;
  puuid: string | null;
  game_name: string | null;
  tag_line: string | null;
  profile_icon: number | null;
  champion_id: number;
  win: number;
  kills: number;
  deaths: number;
  assists: number;
}

// Every participant who shared a team with one of our accounts, one row per
// player per game.
//
// Which (game, team) pairs are ours is resolved up front in a CTE rather than
// as an EXISTS against each candidate row: the CTE is a single indexed lookup
// per account, where the correlated form made SQLite build a throwaway index
// on every call — 2.8 ms against 46 ms on a 580-game library, and it doesn't
// swing on whether ANALYZE has ever run. DISTINCT is what keeps the row count
// honest when two of our own accounts played the same game on the same side.
function teammateRows(
  puuids: string[],
  queue?: number,
  relation: "friends" | "enemies" = "friends",
): TeammateRow[] {
  const ours = puuids.map(() => "?").join(", ");
  const where = ["o.is_remake = 0", `(o.puuid IS NULL OR o.puuid NOT IN (${ours}))`];
  const params: any[] = [...puuids];
  applyQueueFilter(where, params, queue, "o");

  return db
    .prepare(`
      WITH our_teams AS (
        SELECT DISTINCT game_id, team_id FROM match_participants WHERE puuid IN (${ours})
      )
      SELECT o.game_id, g.game_creation, o.participant_id, o.puuid, o.game_name, o.tag_line,
             o.profile_icon, o.champion_id, o.win, o.kills, o.deaths, o.assists
      FROM our_teams t
      JOIN match_participants o ON o.game_id = t.game_id
      JOIN games g ON g.game_id = o.game_id
      WHERE ${where.join(" AND ")}
        AND ${relation === "enemies" ? "o.team_id != t.team_id" : "o.team_id = t.team_id"}
      ORDER BY g.game_creation DESC
    `)
    .all(...puuids, ...params) as TeammateRow[];
}

export function getTeammateStats(
  queue?: number,
  relation: "friends" | "enemies" = "friends",
): any[] {
  const puuids = getAllPuuids();
  if (puuids.length === 0) return [];

  const playerMap = new Map<
    string,
    {
      name: string;
      puuid: string | null;
      profileIcon: number | null;
      games: number;
      wins: number;
      kills: number;
      deaths: number;
      assists: number;
      champions: Map<number, number>;
      lastPlayed: number;
    }
  >();

  for (const row of teammateRows(puuids, queue, relation)) {
    const name = teammateName(row.game_name, row.tag_line, row.participant_id);
    const key = teammateKey(row.puuid, name);

    // If we now have a puuid but previously tracked this player by name, merge
    if (row.puuid && !playerMap.has(row.puuid) && playerMap.has(name)) {
      const old = playerMap.get(name)!;
      if (!old.puuid) {
        playerMap.set(row.puuid, old);
        old.puuid = row.puuid;
        playerMap.delete(name);
      }
    }

    if (!playerMap.has(key)) {
      playerMap.set(key, {
        name,
        puuid: row.puuid,
        profileIcon: null,
        games: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        champions: new Map(),
        lastPlayed: 0,
      });
    }

    const entry = playerMap.get(key)!;
    // Update name and icon to the most recent version
    if (row.game_creation > entry.lastPlayed) {
      entry.name = name;
      if (row.profile_icon != null) entry.profileIcon = row.profile_icon;
    }
    entry.games++;
    if (row.win) entry.wins++;
    entry.kills += row.kills;
    entry.deaths += row.deaths;
    entry.assists += row.assists;
    entry.lastPlayed = Math.max(entry.lastPlayed, row.game_creation);
    entry.champions.set(row.champion_id, (entry.champions.get(row.champion_id) || 0) + 1);
  }

  return Array.from(playerMap.entries())
    .filter(([, p]) => p.games >= 1)
    .map(([key, p]) => ({
      key,
      name: p.name,
      puuid: p.puuid,
      profileIcon: p.profileIcon,
      games: p.games,
      wins: p.wins,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      // Champion id breaks ties so the same five champions come back in the
      // same order every time, rather than in whatever order the rows arrived.
      champions: Array.from(p.champions.entries())
        .sort((a, b) => b[1] - a[1] || a[0] - b[0])
        .slice(0, 5)
        .map(([champion_id, games]) => ({ champion_id, games })),
      lastPlayed: p.lastPlayed,
    }))
    .sort((a, b) => b.games - a.games);
}

// Every game we played alongside one teammate, from both sides: our stored
// stats for the row plus the teammate's own line in that game.
export function getTeammateDetail(
  key: string,
  queue?: number,
  relation: "friends" | "enemies" = "friends",
): { player: any; matches: any[] } | null {
  const puuids = getAllPuuids();
  if (puuids.length === 0) return null;

  // Rows are newest-first, so the first hit carries the current name and icon.
  // Older games can be missing puuids; once we know who we're looking at, match
  // those on name too — the same merge the Friends list does.
  const theirs: TeammateRow[] = [];
  let name: string | null = null;
  for (const row of teammateRows(puuids, queue, relation)) {
    const rowName = teammateName(row.game_name, row.tag_line, row.participant_id);
    if (teammateKey(row.puuid, rowName) === key) {
      name ??= rowName;
      theirs.push(row);
    } else if (name != null && row.puuid == null && rowName === name) {
      theirs.push(row);
    }
  }
  if (theirs.length === 0) return null;

  const byGame = new Map(theirs.map((row) => [row.game_id, row]));
  const gameIds = Array.from(byGame.keys());
  const idList = gameIds.map(() => "?").join(", ");

  // Our own row for each shared game — the same columns the match list shows.
  const ourMatches = db
    .prepare(`
      SELECT g.game_id, g.queue_id, g.game_creation, g.game_duration, g.is_remake, g.favorite,
             g.puuid, g.game_version,
             ps.champion_id, ps.win, ps.kills, ps.deaths, ps.assists,
             ps.double_kills, ps.triple_kills, ps.quadra_kills, ps.penta_kills,
             ps.total_damage_dealt, ps.total_damage_taken, ps.total_heal, ps.gold_earned,
             ps.score, ps.score_badge, ps.spell1, ps.spell2,
             ps.item0, ps.item1, ps.item2, ps.item3, ps.item4, ps.item5,
             (SELECT GROUP_CONCAT(augment_id, ',')
              FROM (SELECT augment_id FROM game_augments
                    WHERE game_id = g.game_id
                    ORDER BY slot)) as augment_ids,
${GAME_MAX_STATS_SQL}
      FROM games g
      JOIN player_stats ps ON g.game_id = ps.game_id
      WHERE g.game_id IN (${idList})
      ORDER BY g.game_creation DESC
    `)
    .all(...gameIds) as any[];

  // The teammate's score has to be computed rather than looked up — player_stats
  // only ever scores our own row — so each shared game needs all ten players.
  const scoreRows = groupByGame(
    db
      .prepare(
        `SELECT game_id, ${SCORE_ROW_COLUMNS} FROM match_participants WHERE game_id IN (${idList})`,
      )
      .all(...gameIds) as (ScoreRow & { game_id: number })[],
  );

  interface ChampionTotals {
    games: number;
    wins: number;
    kills: number;
    deaths: number;
    assists: number;
  }

  const matches: any[] = [];
  const champions = new Map<number, ChampionTotals>();
  const first = theirs[0];
  const player = {
    key,
    name: name ?? key,
    puuid: first.puuid,
    profileIcon: first.profile_icon,
    games: 0,
    wins: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    champions: [] as ({ champion_id: number } & ChampionTotals)[],
    lastPlayed: first.game_creation,
  };

  for (const row of ourMatches) {
    const friend = byGame.get(row.game_id);
    if (!friend) continue;

    if (player.profileIcon == null) player.profileIcon = friend.profile_icon;

    player.games++;
    if (friend.win) player.wins++;
    player.kills += friend.kills;
    player.deaths += friend.deaths;
    player.assists += friend.assists;

    if (!champions.has(friend.champion_id)) {
      champions.set(friend.champion_id, { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 });
    }
    const champ = champions.get(friend.champion_id)!;
    champ.games++;
    if (friend.win) champ.wins++;
    champ.kills += friend.kills;
    champ.deaths += friend.deaths;
    champ.assists += friend.assists;

    const gameRows = scoreRows.get(row.game_id) ?? [];
    const friendScore = computeMatchScores(scoreInputsFromRows(gameRows), getChampionClasses()).get(
      friend.participant_id,
    );
    const friendStats = gameRows.find((p) => p.participant_id === friend.participant_id);

    const base = {
      ...row,
      friend: {
        champion_id: friend.champion_id,
        win: friend.win,
        kills: friend.kills,
        deaths: friend.deaths,
        assists: friend.assists,
        total_damage_dealt: friendStats?.total_damage_dealt ?? 0,
        total_damage_taken: friendStats?.total_damage_taken ?? 0,
        total_heal: friendStats?.total_heal ?? 0,
        score: friendScore?.score ?? null,
        score_badge: friendScore?.badge ?? null,
      },
    };
    if (relation === "enemies") {
      const enemy = base.friend;
      base.friend = {
        champion_id: row.champion_id,
        win: row.win,
        kills: row.kills,
        deaths: row.deaths,
        assists: row.assists,
        total_damage_dealt: row.total_damage_dealt,
        total_damage_taken: row.total_damage_taken,
        total_heal: row.total_heal,
        score: row.score,
        score_badge: row.score_badge,
      };
      base.champion_id = enemy.champion_id;
      base.win = enemy.win;
      base.kills = enemy.kills;
      base.deaths = enemy.deaths;
      base.assists = enemy.assists;
      base.total_damage_dealt = enemy.total_damage_dealt;
      base.total_damage_taken = enemy.total_damage_taken;
      base.total_heal = enemy.total_heal;
      base.score = enemy.score;
      base.score_badge = enemy.score_badge;
    }
    matches.push(base);
  }

  if (player.games === 0) return null;
  player.champions = Array.from(champions.entries())
    .map(([champion_id, totals]) => ({ champion_id, ...totals }))
    .sort((a, b) => b.games - a.games);

  return { player, matches };
}

export function getChampionItemStats(
  championId: number,
  patch?: string,
  queue?: number,
): { item_id: number; picks: number; wins: number }[] {
  const extraWhere: string[] = [];
  extraWhere.push(localGamesFilter("g"));
  extraWhere.push(`g.queue_id NOT IN (${EXCLUDED_STATS_SQL})`);
  const extraParams: any[] = [];
  if (patch) {
    extraWhere.push("g.game_version = ?");
    extraParams.push(patch);
  }
  applyQueueFilter(extraWhere, extraParams, queue);
  const extraSql = extraWhere.length > 0 ? ` AND ${extraWhere.join(" AND ")}` : "";
  const itemCols = ["item0", "item1", "item2", "item3", "item4", "item5", "item6"];
  const excludedList = EXCLUDED_ITEM_IDS.join(", ");
  const subquery = (col: string) =>
    `SELECT ps.${col} as item_id, ps.win FROM player_stats ps JOIN games g ON ps.game_id = g.game_id WHERE ps.champion_id = ? AND ps.${col} IS NOT NULL AND ps.${col} > 0 AND ps.${col} NOT IN (${excludedList}) AND g.is_remake = 0${extraSql}`;
  const params = itemCols.flatMap(() => [championId, ...extraParams]);
  return db
    .prepare(`
    SELECT item_id, COUNT(*) as picks, SUM(win) as wins
    FROM (
      ${itemCols.map(subquery).join("\n      UNION ALL\n      ")}
    )
    GROUP BY item_id
    ORDER BY picks DESC
  `)
    .all(...params) as any[];
}

// Filters for a query over match_participants. is_remake, queue_id and
// game_version are carried on the participant rows themselves, so nothing here
// has to join back to games.
function participantFilter(patch?: string, queue?: number, alias = "mp") {
  const where = [`${alias}.is_remake = 0`];
  const params: any[] = [];
  if (patch) {
    where.push(`${alias}.game_version = ?`);
    params.push(patch);
  }
  applyQueueFilter(where, params, queue, alias);
  where.push(
    `EXISTS (SELECT 1 FROM games g WHERE g.game_id = ${alias}.game_id AND ${localGamesFilter("g")} AND g.queue_id NOT IN (${EXCLUDED_STATS_SQL}))`,
  );
  return { where, params, sql: where.join(" AND ") };
}

export function getGlobalStats(
  patch?: string,
  queue?: number,
): {
  champions: { champion_id: number; games: number; wins: number }[];
  augments: { augment_id: number; picks: number; wins: number }[];
  items: { item_id: number; picks: number; wins: number }[];
  totalParticipantSlots: number;
  totalGames: number;
} {
  const mp = participantFilter(patch, queue);
  const mpa = participantFilter(patch, queue, "mpa");

  const champions = db
    .prepare(`
      SELECT mp.champion_id, COUNT(*) as games, SUM(mp.win) as wins
      FROM match_participants mp
      WHERE ${mp.sql} AND mp.champion_id > 0
      GROUP BY mp.champion_id
      ORDER BY games DESC
    `)
    .all(...mp.params) as { champion_id: number; games: number; wins: number }[];

  const augments = db
    .prepare(`
      SELECT mpa.augment_id, COUNT(*) as picks, SUM(mpa.win) as wins
      FROM match_participant_augments mpa
      WHERE ${mpa.sql}
      GROUP BY mpa.augment_id
      ORDER BY picks DESC
    `)
    .all(...mpa.params) as { augment_id: number; picks: number; wins: number }[];

  const itemCols = [0, 1, 2, 3, 4, 5, 6];
  const excludedList = EXCLUDED_ITEM_IDS.join(", ");
  const items = db
    .prepare(`
      SELECT item_id, COUNT(*) as picks, SUM(win) as wins
      FROM (
        ${itemCols
          .map(
            (i) => `SELECT mp.item${i} as item_id, mp.win as win
                FROM match_participants mp
                WHERE ${mp.sql}
                  AND mp.item${i} > 0 AND mp.item${i} NOT IN (${excludedList})`,
          )
          .join("\n        UNION ALL\n        ")}
      )
      GROUP BY item_id
      ORDER BY picks DESC
    `)
    .all(...itemCols.flatMap(() => mp.params)) as {
    item_id: number;
    picks: number;
    wins: number;
  }[];

  const slots = db
    .prepare(`
      SELECT COUNT(*) as count
      FROM match_participants mp
      WHERE ${mp.sql} AND mp.champion_id > 0
    `)
    .get(...mp.params) as { count: number };

  const games = db
    .prepare(`
      SELECT COUNT(DISTINCT mp.game_id) as count
      FROM match_participants mp
      WHERE ${mp.sql} AND mp.champion_id > 0
    `)
    .get(...mp.params) as { count: number };

  return {
    champions,
    augments,
    items,
    totalParticipantSlots: slots.count,
    totalGames: games.count,
  };
}

export function getOwnedItemStats(patch?: string, queue?: number, account?: string): ItemStats[] {
  const source = statsSource(account);
  const where = ["g.is_remake = 0"];
  where.push(source.accountFilter);
  const params: any[] = account ? [account] : [];
  if (patch) {
    where.push("g.game_version = ?");
    params.push(patch);
  }

  applyQueueFilter(where, params, queue);
  where.push(`g.queue_id NOT IN (${EXCLUDED_STATS_SQL})`);
  const columns = [0, 1, 2, 3, 4, 5, 6];
  const excluded = EXCLUDED_ITEM_IDS.join(", ");
  return db
    .prepare(`
      SELECT item_id, COUNT(*) AS picks, SUM(win) AS wins
      FROM (
        ${columns
          .map(
            (i) => `SELECT ps.item${i} AS item_id, ps.win
                    FROM ${source.table} ps JOIN games g ON g.game_id = ps.game_id
                    WHERE ${where.join(" AND ")}
                      AND ps.item${i} > 0 AND ps.item${i} NOT IN (${excluded})`,
          )
          .join(" UNION ALL ")}
      )
      GROUP BY item_id
      ORDER BY picks DESC
    `)
    .all(...columns.flatMap(() => params)) as ItemStats[];
}

export function getOwnedItemDetail(itemId: number, patch?: string, queue?: number) {
  const where = [
    "g.is_remake = 0",
    "(ps.item0 = ? OR ps.item1 = ? OR ps.item2 = ? OR ps.item3 = ? OR ps.item4 = ? OR ps.item5 = ? OR ps.item6 = ?)",
  ];
  where.push(localGamesFilter("g"));
  const params: any[] = Array(7).fill(itemId);
  if (patch) {
    where.push("g.game_version = ?");
    params.push(patch);
  }

  applyQueueFilter(where, params, queue);
  const rows = db
    .prepare(
      `SELECT ps.game_id, ps.champion_id, g.game_creation, g.game_duration, ps.win, ps.kills, ps.deaths, ps.assists FROM player_stats ps JOIN games g ON g.game_id = ps.game_id WHERE ${where.join(" AND ")} ORDER BY g.game_creation DESC`,
    )
    .all(...params) as {
    game_id: number;
    champion_id: number;
    game_creation: number;
    game_duration: number;
    win: number;
    kills: number;
    deaths: number;
    assists: number;
  }[];
  const totalWhere = ["g.is_remake = 0"];
  totalWhere.push(localGamesFilter("g"));
  const totalParams: any[] = [];
  if (patch) {
    totalWhere.push("g.game_version = ?");
    totalParams.push(patch);
  }
  applyQueueFilter(totalWhere, totalParams, queue);
  const totalGames = (
    db
      .prepare(`SELECT COUNT(*) count FROM games g WHERE ${totalWhere.join(" AND ")}`)
      .get(...totalParams) as {
      count: number;
    }
  ).count;
  const champions = new Map<number, { games: number; wins: number; matches: typeof rows }>();
  for (const row of rows) {
    const current = champions.get(row.champion_id) ?? { games: 0, wins: 0, matches: [] };
    current.games++;
    current.wins += row.win;
    current.matches.push(row);
    champions.set(row.champion_id, current);
  }
  const championTotals = db
    .prepare(
      `SELECT ps.champion_id, COUNT(*) games
       FROM player_stats ps JOIN games g ON g.game_id = ps.game_id
       WHERE ${totalWhere.join(" AND ")}
       GROUP BY ps.champion_id`,
    )
    .all(...totalParams) as { champion_id: number; games: number }[];
  const totalByChampion = new Map(championTotals.map((row) => [row.champion_id, row.games]));
  return {
    item_id: itemId,
    picks: rows.length,
    wins: rows.reduce((sum, row) => sum + row.win, 0),
    totalGames,
    champions: [...champions.entries()]
      .map(([champion_id, value]) => ({
        champion_id,
        ...value,
        championGames: totalByChampion.get(champion_id) ?? value.games,
      }))
      .sort((a, b) => b.games - a.games),
  };
}

export function getOwnedRuneStats(queue?: number, patch?: string) {
  const where = ["g.is_remake = 0", "g.raw_gz IS NOT NULL"];
  where.push(localGamesFilter("g"));
  const params: any[] = [];
  if (patch) {
    where.push("g.game_version = ?");
    params.push(patch);
  }
  applyQueueFilter(where, params, queue);
  const rows = db
    .prepare(
      `SELECT g.raw_gz, g.puuid, ps.win, ps.champion_id, ps.kills, ps.deaths, ps.assists
       FROM games g JOIN player_stats ps ON ps.game_id = g.game_id
       WHERE ${where.join(" AND ")}`,
    )
    .all(...params) as {
    raw_gz: Buffer;
    puuid: string;
    win: number;
    champion_id: number;
    kills: number;
    deaths: number;
    assists: number;
  }[];
  const totals = new Map<number, { picks: number; wins: number }>();
  const champions = new Map<number, { games: number; keystones: Map<number, number> }>();
  for (const row of rows) {
    let raw: any;
    try {
      raw = JSON.parse(zlib.gunzipSync(row.raw_gz).toString("utf8"));
    } catch {
      continue;
    }
    const participants = raw.info?.participants ?? raw.participants ?? [];
    const identities = raw.participantIdentities ?? raw.info?.participantIdentities ?? [];
    const participantIndex = participants.findIndex((p: any, index: number) => {
      const participantId = Number(p.participantId ?? index + 1);
      const identity = identities[participantId - 1]?.player;
      return (
        p.puuid === row.puuid || identity?.puuid === row.puuid || identity?.summonerId === row.puuid
      );
    });
    const participant =
      participantIndex >= 0
        ? participants[participantIndex]
        : participants.find((p: any) => {
            const stats = p.stats ?? p;
            return (
              Number(p.championId ?? stats.championId) === row.champion_id &&
              Number(stats.kills ?? p.kills) === row.kills &&
              Number(stats.deaths ?? p.deaths) === row.deaths &&
              Number(stats.assists ?? p.assists) === row.assists
            );
          });
    const championId = Number(participant?.championId ?? participant?.stats?.championId ?? 0);
    const champion = champions.get(championId) ?? { games: 0, keystones: new Map() };
    if (championId > 0) champion.games++;
    const perks =
      participant?.perks ??
      participant?.stats?.perks ??
      participant?.stats?.runes ??
      participant?.runes;
    const styles = perks?.styles ?? perks?.perkStyles ?? [];
    const legacyRunes = Array.isArray(perks) ? perks : [];
    const legacyIds = [
      participant?.perk0,
      participant?.perk1,
      participant?.perk2,
      participant?.perk3,
      participant?.perk4,
      participant?.perk5,
      participant?.stats?.perk0,
      participant?.stats?.perk1,
      participant?.stats?.perk2,
      participant?.stats?.perk3,
      participant?.stats?.perk4,
      participant?.stats?.perk5,
    ]
      .map(Number)
      .filter(Boolean);
    for (const id of legacyIds) {
      const current = totals.get(id) ?? { picks: 0, wins: 0 };
      current.picks++;
      current.wins += row.win;
      totals.set(id, current);
    }
    for (const style of styles) {
      const keystone = Number(style.selections?.[0]?.perk);
      if (championId > 0 && keystone) {
        champion.keystones.set(keystone, (champion.keystones.get(keystone) ?? 0) + 1);
      }
      // Only the selected perks are runes a player actually picked;
      // style.style is the tree ID (e.g. 8000/8100) and must not be
      // counted as a rune itself.
      for (const selection of style.selections ?? []) {
        const id = Number(selection?.perk);
        if (!id) continue;
        const current = totals.get(id) ?? { picks: 0, wins: 0 };
        current.picks++;
        current.wins += row.win;
        totals.set(id, current);
      }
      if (championId > 0) champions.set(championId, champion);
    }
    for (const rune of legacyRunes) {
      const id = Number(rune.runeId ?? rune.perk ?? rune.id);
      if (!id) continue;
      const current = totals.get(id) ?? { picks: 0, wins: 0 };
      current.picks++;
      current.wins += row.win;
      totals.set(id, current);
    }
  }
  return {
    runes: [...totals.entries()]
      .map(([rune_id, value]) => ({ rune_id, ...value }))
      .sort((a, b) => b.picks - a.picks),
    champions: [...champions.entries()]
      .filter(([id]) => id > 0)
      .map(([champion_id, value]) => ({
        champion_id,
        games: value.games,
        keystones: [...value.keystones.entries()]
          .map(([rune_id, picks]) => ({ rune_id, picks }))
          .sort((a, b) => b.picks - a.picks)
          .slice(0, 3),
      }))
      .sort((a, b) => b.games - a.games),
  };
}

// Everything we know about one champion across every stored game, counting all
// ten players in each game (not just our own). Items and augments come from the
// participant tables for the same reason — the player_stats/game_augments
// tables only hold our own picks.
export function getGlobalChampionDetail(
  championId: number,
  patch?: string,
  queue?: number,
): {
  champion_id: number;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  avgDamage: number;
  avgDamageTaken: number;
  avgGold: number;
  avgHeal: number;
  damageShare: number;
  killParticipation: number;
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  totalParticipantSlots: number;
  items: { item_id: number; picks: number; wins: number }[];
  augments: { augment_id: number; picks: number; wins: number }[];
} {
  const mp = participantFilter(patch, queue);
  const mpa = participantFilter(patch, queue, "mpa");

  // Shares are per-game ratios averaged over the games they're defined in, so
  // a game with no team damage/kills recorded can't drag the average to zero —
  // which is what AVG over a NULLable expression does.
  const totals = db
    .prepare(`
      WITH teams AS (
        SELECT mp.game_id, mp.team_id,
               SUM(mp.total_damage_dealt) as team_damage,
               SUM(mp.kills) as team_kills
        FROM match_participants mp
        WHERE ${mp.sql}
        GROUP BY mp.game_id, mp.team_id
      )
      SELECT COUNT(*) as games,
             SUM(mp.win) as wins,
             SUM(mp.kills) as kills,
             SUM(mp.deaths) as deaths,
             SUM(mp.assists) as assists,
             SUM(mp.total_damage_dealt) as damage,
             SUM(mp.total_damage_taken) as damageTaken,
             SUM(mp.gold_earned) as gold,
             SUM(mp.total_heal) as heal,
             SUM(mp.double_kills) as doubleKills,
             SUM(mp.triple_kills) as tripleKills,
             SUM(mp.quadra_kills) as quadraKills,
             SUM(mp.penta_kills) as pentaKills,
             AVG(CASE WHEN t.team_damage > 0
                      THEN mp.total_damage_dealt * 1.0 / t.team_damage END) as damageShare,
             AVG(CASE WHEN t.team_kills > 0
                      THEN (mp.kills + mp.assists) * 1.0 / t.team_kills END) as killParticipation
      FROM match_participants mp
      JOIN teams t ON t.game_id = mp.game_id AND t.team_id = mp.team_id
      WHERE ${mp.sql} AND mp.champion_id = ?
    `)
    .get(...mp.params, ...mp.params, championId) as any;

  const slots = db
    .prepare(`
      SELECT COUNT(*) as count
      FROM match_participants mp
      WHERE ${mp.sql} AND mp.champion_id > 0
    `)
    .get(...mp.params) as { count: number };

  const itemCols = [0, 1, 2, 3, 4, 5, 6];
  const excludedList = EXCLUDED_ITEM_IDS.join(", ");
  const items = db
    .prepare(`
      SELECT item_id, COUNT(*) as picks, SUM(win) as wins
      FROM (
        ${itemCols
          .map(
            (i) => `SELECT mp.item${i} as item_id, mp.win as win
                FROM match_participants mp
                WHERE ${mp.sql} AND mp.champion_id = ?
                  AND mp.item${i} > 0 AND mp.item${i} NOT IN (${excludedList})`,
          )
          .join("\n        UNION ALL\n        ")}
      )
      GROUP BY item_id
      ORDER BY picks DESC
    `)
    .all(...itemCols.flatMap(() => [...mp.params, championId])) as {
    item_id: number;
    picks: number;
    wins: number;
  }[];

  const augments = db
    .prepare(`
      SELECT mpa.augment_id, COUNT(*) as picks, SUM(mpa.win) as wins
      FROM match_participant_augments mpa
      WHERE ${mpa.sql} AND mpa.champion_id = ?
      GROUP BY mpa.augment_id
      ORDER BY picks DESC
    `)
    .all(...mpa.params, championId) as {
    augment_id: number;
    picks: number;
    wins: number;
  }[];

  const games = totals?.games ?? 0;
  const avg = (total: number | null) => (games > 0 ? Math.round((total ?? 0) / games) : 0);

  return {
    champion_id: championId,
    games,
    wins: totals?.wins ?? 0,
    kills: totals?.kills ?? 0,
    deaths: totals?.deaths ?? 0,
    assists: totals?.assists ?? 0,
    avgDamage: avg(totals?.damage),
    avgDamageTaken: avg(totals?.damageTaken),
    avgGold: avg(totals?.gold),
    avgHeal: avg(totals?.heal),
    damageShare: totals?.damageShare ?? 0,
    killParticipation: totals?.killParticipation ?? 0,
    doubleKills: totals?.doubleKills ?? 0,
    tripleKills: totals?.tripleKills ?? 0,
    quadraKills: totals?.quadraKills ?? 0,
    pentaKills: totals?.pentaKills ?? 0,
    totalParticipantSlots: slots.count,
    items,
    augments,
  };
}

// Everything the Trends page draws, in one round trip. Days are the finest
// grain the page uses, so the renderer re-buckets them into weeks or months
// itself instead of asking again; patches and clock buckets can't be derived
// from days and come as their own aggregates. All local time — "games per day"
// means the player's day, not UTC's.
export function getTrendsData(queue?: number, account?: string): any {
  const source = statsSource(account);
  const where = ["g.is_remake = 0"];
  where.push(source.accountFilter);
  const params: any[] = account ? [account] : [];
  applyQueueFilter(where, params, queue);
  where.push(`g.queue_id NOT IN (${EXCLUDED_STATS_SQL})`);
  const whereSql = `WHERE ${where.join(" AND ")}`;
  const fromSql = `FROM games g JOIN ${source.table} ps ON g.game_id = ps.game_id`;

  // SUM/COUNT over ps.score skip NULLs, so score averages stay honest for
  // days where only some games have a stored score.
  const daily = db
    .prepare(`
      SELECT date(g.game_creation / 1000, 'unixepoch', 'localtime') as day,
             COUNT(*) as games,
             SUM(ps.win) as wins,
             SUM(ps.kills) as kills,
             SUM(ps.deaths) as deaths,
             SUM(ps.assists) as assists,
             SUM(ps.score) as score_sum,
             COUNT(ps.score) as scored_games
      ${fromSql}
      ${whereSql}
      GROUP BY day
      ORDER BY day
    `)
    .all(...params);

  // Ordered by when the patch was first played rather than by parsing version
  // strings — chronological is what a trend axis wants anyway.
  const patches = db
    .prepare(`
      SELECT g.game_version as patch,
             COUNT(*) as games,
             SUM(ps.win) as wins,
             AVG(ps.score) as avg_score,
             MIN(g.game_creation) as first_played
      ${fromSql}
      ${whereSql} AND g.game_version IS NOT NULL AND g.game_version != ''
      GROUP BY g.game_version
      ORDER BY first_played
    `)
    .all(...params);

  const hours = db
    .prepare(`
      SELECT CAST(strftime('%H', g.game_creation / 1000, 'unixepoch', 'localtime') AS INTEGER) as hour,
             COUNT(*) as games,
             SUM(ps.win) as wins
      ${fromSql}
      ${whereSql}
      GROUP BY hour
      ORDER BY hour
    `)
    .all(...params);

  // strftime('%w'): 0 = Sunday
  const weekdays = db
    .prepare(`
      SELECT CAST(strftime('%w', g.game_creation / 1000, 'unixepoch', 'localtime') AS INTEGER) as weekday,
             COUNT(*) as games,
             SUM(ps.win) as wins
      ${fromSql}
      ${whereSql}
      GROUP BY weekday
      ORDER BY weekday
    `)
    .all(...params);

  return { daily, patches, hours, weekdays };
}

// The trophy case: best single-game marks and longest streaks, from one
// chronological pass over our own rows — streaks need the ordering anyway, and
// the maxima fall out of the same loop. On ties the earliest game keeps the
// record, so a mark has to be strictly beaten to change hands.
export function getRecords(
  queue?: number | number[],
  account?: string,
  timePeriod?: "24h" | "7d" | "30d" | "full",
): any {
  const source = statsSource(account);
  const where = ["g.is_remake = 0"];
  where.push(source.accountFilter);
  const params: any[] = account && account !== "all" ? [account] : [];
  applyQueueFilter(where, params, queue);
  const timeFilter = applyTimeFilter(timePeriod);
  const statsPlaceholders = NO_STATS_QUEUE_IDS.map(() => "?").join(",");

  const rows = db
    .prepare(`
      SELECT g.game_id, g.game_creation, g.game_duration, g.queue_id,
             ps.champion_id, ps.win, ps.kills, ps.deaths, ps.assists,
             ps.total_damage_dealt, ps.total_damage_taken,
             ps.gold_earned, ps.total_heal, ps.largest_killing_spree, ps.score,
             ps.total_damage_dealt_all, ps.true_damage_dealt, ps.cs, ps.largest_critical_strike
      FROM games g
      JOIN ${source.table} ps ON g.game_id = ps.game_id
      WHERE ${where.join(" AND ")} ${timeFilter.sql}
        AND g.queue_id NOT IN (${statsPlaceholders})
      ORDER BY g.game_creation ASC
    `)
    .all(...params, ...timeFilter.params, ...NO_STATS_QUEUE_IDS) as any[];

  // Just enough of the game to render a record's context and open its match
  const matchOf = (r: any) => ({
    game_id: r.game_id,
    game_creation: r.game_creation,
    game_duration: r.game_duration,
    queue_id: r.queue_id,
    champion_id: r.champion_id,
    win: r.win,
    kills: r.kills,
    deaths: r.deaths,
    assists: r.assists,
  });

  const bests: Record<string, { value: number; match: any } | null> = {
    kills: null,
    deaths: null,
    assists: null,
    kda: null,
    score: null,
    killingSpree: null,
    damage: null,
    damageTaken: null,
    totalDamage: null,
    trueDamage: null,
    cs: null,
    csPerMinute: null,
    healing: null,
    gold: null,
    fastestWin: null,
    fastestLoss: null,
    longestGame: null,
    criticalStrike: null,
  };
  const higher = (a: number, b: number) => a > b;
  const lower = (a: number, b: number) => a < b;
  const track = (key: string, value: number | null, row: any, better = higher) => {
    if (value == null) return;
    const current = bests[key];
    if (!current || better(value, current.value)) bests[key] = { value, match: matchOf(row) };
  };

  interface Streak {
    length: number;
    start: number;
    end: number;
    match: any;
  }
  let winStreak: Streak | null = null;
  let lossStreak: Streak | null = null;
  let run: { win: number; length: number; start: number } | null = null;

  for (const r of rows) {
    track("kills", r.kills, r);
    track("deaths", r.deaths, r);
    track("assists", r.assists, r);
    // Deathless games rank by kills+assists rather than dividing by zero; the
    // renderer still labels them "Perfect"
    track("kda", (r.kills + r.assists) / Math.max(r.deaths, 1), r);
    track("score", r.score, r);
    track("killingSpree", r.largest_killing_spree, r);
    track("damage", r.total_damage_dealt, r);
    track("damageTaken", r.total_damage_taken, r);
    track("totalDamage", r.total_damage_dealt_all, r);
    track("trueDamage", r.true_damage_dealt, r);
    track("cs", r.cs, r);
    // CS/min needs at least a minute of game to mean anything; a 0-second
    // remake would otherwise divide by ~0 and post an absurd rate.
    if (r.game_duration >= 60) track("csPerMinute", r.cs / (r.game_duration / 60), r);
    track("criticalStrike", r.largest_critical_strike, r);
    track("healing", r.total_heal, r);
    track("gold", r.gold_earned, r);
    if (r.win) track("fastestWin", r.game_duration, r, lower);
    else track("fastestLoss", r.game_duration, r, lower);
    track("longestGame", r.game_duration, r);

    // Remakes never make it into rows, so they can't break a streak
    if (!run || run.win !== r.win) {
      run = { win: r.win, length: 0, start: r.game_creation };
    }
    run.length++;
    const record: Streak = {
      length: run.length,
      start: run.start,
      end: r.game_creation,
      match: matchOf(r),
    };
    if (r.win) {
      if (!winStreak || run.length > winStreak.length) winStreak = record;
    } else {
      if (!lossStreak || run.length > lossStreak.length) lossStreak = record;
    }
  }

  return { totalGames: rows.length, bests, winStreak, lossStreak };
}

export function getDatabase(): Database.Database {
  return db;
}

// ---- Settings ----

export function getSetting(key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
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

// Rebuild everything derived from the participant rows for each game's current
// owner: player_stats (champion, KDA, items), augments, the remake flag, and
// the score under the current formula. Heals games whose owner puuid changed
// during repair (their stored stats still described the old participant) and
// doubles as a manual "rescore now" for formula changes.
function rebuildDerivedStats(): number {
  const staleGames = db
    .prepare(
      `SELECT COUNT(*) as n FROM games g
       LEFT JOIN player_stats ps ON ps.game_id = g.game_id
       WHERE ps.game_id IS NULL`,
    )
    .get() as { n: number };

  if (staleGames.n === 0) {
    setSetting("score_formula_version", scoreFormulaKey());
    setSetting("augment_slots", String(AUGMENT_SLOTS));
    return 0;
  }

  const games = db
    .prepare(`
      SELECT g.game_id, g.puuid, g.game_duration,
             ps.champion_id, ps.kills, ps.deaths, ps.assists
      FROM games g
      LEFT JOIN player_stats ps ON g.game_id = ps.game_id
    `)
    .all() as {
    game_id: number;
    puuid: string;
    game_duration: number;
    champion_id: number | null;
    kills: number | null;
    deaths: number | null;
    assists: number | null;
  }[];

  const participants = groupByGame(
    db
      .prepare(`
        SELECT game_id, ${SCORE_ROW_COLUMNS}, early_surrender, largest_killing_spree,
               total_damage_dealt_all, true_damage_dealt, largest_critical_strike, cs,
               spell1, spell2, item0, item1, item2, item3, item4, item5, item6
        FROM match_participants
      `)
      .all() as (ScoreRow & {
      game_id: number;
      early_surrender: number;
      largest_killing_spree: number;
      total_damage_dealt_all: number;
      true_damage_dealt: number;
      largest_critical_strike: number;
      cs: number;
      spell1: number | null;
      spell2: number | null;
      item0: number | null;
      item1: number | null;
      item2: number | null;
      item3: number | null;
      item4: number | null;
      item5: number | null;
      item6: number | null;
    })[],
  );

  const augmentsByGame = groupByGame(
    db
      .prepare("SELECT game_id, participant_id, slot, augment_id FROM match_participant_augments")
      .all() as {
      game_id: number;
      participant_id: number;
      slot: number;
      augment_id: number;
    }[],
  );

  const upsertStats = db.prepare(`
    INSERT OR REPLACE INTO player_stats (
      game_id, champion_id, win, kills, deaths, assists,
      double_kills, triple_kills, quadra_kills, penta_kills,
      total_damage_dealt, total_damage_taken, gold_earned, total_heal,
      largest_killing_spree,
      total_damage_dealt_all, true_damage_dealt, cs, largest_critical_strike,
      spell1, spell2,
      item0, item1, item2, item3, item4, item5, item6,
      score, score_raw, score_badge
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateRemake = db.prepare("UPDATE games SET is_remake = ? WHERE game_id = ?");
  const deleteAugments = db.prepare("DELETE FROM game_augments WHERE game_id = ?");
  const insertAugment = db.prepare(
    "INSERT OR IGNORE INTO game_augments (game_id, slot, augment_id) VALUES (?, ?, ?)",
  );
  const updateTrackedScore = db.prepare(
    "UPDATE tracked_game_stats SET score = ?, score_raw = ?, score_badge = ? WHERE game_id = ? AND puuid = ?",
  );
  const trackedPuuidsStmt = db.prepare("SELECT puuid FROM tracked_game_stats WHERE game_id = ?");

  let rebuilt = 0;
  const tx = db.transaction(() => {
    for (const row of games) {
      const rows = participants.get(row.game_id);
      if (!rows || rows.length === 0) continue;

      let owner = row.puuid ? rows.find((p) => p.puuid === row.puuid) : undefined;
      // Owner puuid unknown (old imports): fall back to matching the stored
      // stats row, same as the puuid backfill migration.
      if (!owner && row.champion_id != null) {
        owner = rows.find(
          (p) =>
            p.champion_id === row.champion_id &&
            p.kills === row.kills &&
            p.deaths === row.deaths &&
            p.assists === row.assists,
        );
      }
      if (!owner) continue;

      // Writing is_remake fires trg_games_denorm_participants, which carries
      // the new value down to the participant rows.
      const isRemake = detectRemake(row.game_duration, rows) ? 1 : 0;
      updateRemake.run(isRemake, row.game_id);

      let ownerScore: PlayerScore | null = null;
      if (!isRemake) {
        ownerScore = computeOwnerScore(rows, row.puuid || null, {
          champion_id: owner.champion_id,
          kills: owner.kills,
          deaths: owner.deaths,
          assists: owner.assists,
        });
      }

      upsertStats.run(
        row.game_id,
        owner.champion_id,
        owner.win,
        owner.kills,
        owner.deaths,
        owner.assists,
        owner.double_kills,
        owner.triple_kills,
        owner.quadra_kills,
        owner.penta_kills,
        owner.total_damage_dealt,
        owner.total_damage_taken,
        owner.gold_earned,
        owner.total_heal,
        owner.largest_killing_spree,
        owner.total_damage_dealt_all,
        owner.true_damage_dealt,
        owner.cs,
        owner.largest_critical_strike,
        owner.spell1,
        owner.spell2,
        owner.item0,
        owner.item1,
        owner.item2,
        owner.item3,
        owner.item4,
        owner.item5,
        owner.item6,
        ownerScore?.score ?? null,
        ownerScore?.raw ?? null,
        ownerScore?.badge ?? null,
      );

      const trackedPuuids = trackedPuuidsStmt.all(row.game_id) as { puuid: string }[];
      for (const { puuid: trackedPuuid } of trackedPuuids) {
        const trackedScore = isRemake ? null : computeOwnerScore(rows, trackedPuuid, undefined);
        updateTrackedScore.run(
          trackedScore?.score ?? null,
          trackedScore?.raw ?? null,
          trackedScore?.badge ?? null,
          row.game_id,
          trackedPuuid,
        );
      }

      deleteAugments.run(row.game_id);
      for (const aug of augmentsByGame.get(row.game_id) ?? []) {
        if (aug.participant_id === owner.participant_id) {
          insertAugment.run(row.game_id, aug.slot, aug.augment_id);
        }
      }
      rebuilt++;
    }
  });
  tx();

  // Stamp the startup-backfill keys — the rebuild just did their work
  setSetting("score_formula_version", scoreFormulaKey());
  setSetting("augment_slots", String(AUGMENT_SLOTS));
  return rebuilt;
}

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

// A game whose owner is correct but whose tracked_game_stats row is missing
// is the shape left behind by a partial LCU payload: the participants table
// gets one row (the owner), player_stats gets one row, and tracked_game_stats
// gets nothing. Repair fixes it, but Repair is O(all games) and rewrites
// every derived row — too heavy to run at every launch for a problem that is
// usually a handful of games. This narrows the work to exactly the missing
// rows so it can run on startup without cost. If the participant row is
// missing, the same-shaped player_stats row is copied instead of skipped.
export function backfillMissingTrackedRows(): number {
  const missing = db
    .prepare(`
      SELECT g.game_id, g.puuid
      FROM games g
      WHERE g.puuid != ''
        AND g.puuid IN (SELECT puuid FROM summoner)
        AND g.source != 'search-import'
        AND NOT EXISTS (
          SELECT 1 FROM tracked_game_stats tgs
          WHERE tgs.game_id = g.game_id AND tgs.puuid = g.puuid
        )
    `)
    .all() as { game_id: number; puuid: string }[];

  if (missing.length === 0) return 0;

  let added = 0;
  const tx = db.transaction(() => {
    for (const row of missing) {
      const result = insertTrackedStatsOnly(row.game_id, row.puuid);
      if (result === "inserted") added++;
      else if (result === "no-owner-row") {
        // The owner's participant row is genuinely missing — the game was
        // written before reconcileOwnerPuuids ran, or the payload never had it.
        // player_stats already holds everything tracked_game_stats needs for
        // this game (same column list, one row per game, keyed on the owner's
        // line), so copy it across rather than skip the game.
        const copied = db
          .prepare(`
            INSERT OR IGNORE INTO tracked_game_stats (
              game_id, puuid, champion_id, win, kills, deaths, assists,
              double_kills, triple_kills, quadra_kills, penta_kills,
              total_damage_dealt, total_damage_taken, gold_earned, total_heal,
              largest_killing_spree, total_damage_dealt_all, true_damage_dealt, cs,
              largest_critical_strike, score, score_raw, score_badge, spell1, spell2,
              item0, item1, item2, item3, item4, item5, item6
            )
            SELECT
              ps.game_id, ?, ps.champion_id, ps.win, ps.kills, ps.deaths, ps.assists,
              ps.double_kills, ps.triple_kills, ps.quadra_kills, ps.penta_kills,
              ps.total_damage_dealt, ps.total_damage_taken, ps.gold_earned, ps.total_heal,
              ps.largest_killing_spree, ps.total_damage_dealt_all, ps.true_damage_dealt, ps.cs,
              ps.largest_critical_strike, ps.score, ps.score_raw, ps.score_badge, ps.spell1, ps.spell2,
              ps.item0, ps.item1, ps.item2, ps.item3, ps.item4, ps.item5, ps.item6
            FROM player_stats ps
            WHERE ps.game_id = ?
          `)
          .run(row.puuid, row.game_id);
        if (copied.changes > 0) added++;
      }
    }
  });
  tx();

  if (added > 0) {
    console.log(`[backfill-tracked] created ${added} missing tracked_game_stats row(s)`);
  }
  return added;
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
