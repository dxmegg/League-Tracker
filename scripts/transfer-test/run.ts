// Run by scripts/check-transfer.mjs inside Electron's Node, each database in its own folder of
// RR_TEST_DIR. Seeds a small database, then checks that export → import into an empty database,
// snapshot → restore, and account deletion keep exactly what they should.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {
  initDatabase,
  closeDatabase,
  db,
  insertGameFull,
  refreshParticipantTelemetry,
  writeExportTo,
  importData,
  deleteSavedSummoner,
  reconcileOwnerPuuids,
  getSetting,
  setSetting,
  recalculateAllScores,
} from "../../src/main/db";
import { MAYHEM_QUEUE_IDS } from "../../src/shared/queues";
import { restoreSummonerFull } from "../../src/main/db/summoner";
import {
  createBackup,
  getRecoveryReport,
  initDatabaseWithRecovery,
  listBackups,
  restoreBackup,
} from "../../src/main/backup";
import { getBackupDir, getDbDir } from "../../src/main/paths";

const base = process.env.RR_TEST_DIR as string;
const ALICE = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";

async function openDb(name: string): Promise<void> {
  closeDatabase();
  // paths.ts reads the root on every call, so this moves the database to a fresh folder
  process.env.RR_TEST_DIR = path.join(base, name);
  fs.mkdirSync(process.env.RR_TEST_DIR, { recursive: true });
  await initDatabase();
}

function game(gameId: number, owner: string, other: string, ownerName = "Player0") {
  return {
    gameId,
    queueId: 450,
    gameMode: "ARAM",
    gameCreation: 1_760_000_000_000 + gameId,
    gameDuration: 1500,
    gameVersion: "15.20.1.123",
    participants: Array.from({ length: 10 }, (_, i) => ({
      participantId: i + 1,
      puuid: i === 0 ? owner : i === 5 ? other : `p${gameId}-${i}`,
      riotIdGameName: i === 0 ? ownerName : `Player${i}`,
      riotIdTagline: "EUNE",
      teamId: i < 5 ? 100 : 200,
      championId: 10 + i,
      win: i < 5,
      kills: i,
      deaths: 3,
      assists: 7,
      goldEarned: 9000 + i,
      totalDamageDealtToChampions: 20000 + i * 100,
      enemyMissingPings: i,
      spell1Casts: 40 + i,
      challenges: { kda: 2.5 + i, snowballsHit: i },
    })),
  };
}

function seed(): void {
  for (const [puuid, name] of [
    [ALICE, "Alice"],
    [BOB, "Bob"],
  ]) {
    restoreSummonerFull({
      puuid,
      game_name: name,
      tag_line: "EUNE",
      summoner_id: null,
      account_id: null,
      profile_icon: 1,
      updated_at: 1,
      platform: "eun1",
      summoner_level: 100,
      ranked_solo_json: null,
      ranked_flex_json: null,
      mastery_json: null,
      last_seen: 1,
    });
  }
  // 1001, 1002 and 1004 belong to Alice alone; 1003 is Bob's, with Alice in it
  assert.ok(insertGameFull(game(1001, ALICE, "x1"), ALICE, "lcu"));
  assert.ok(insertGameFull(game(1002, ALICE, "x2"), ALICE, "riot-sync"));
  assert.ok(insertGameFull(game(1003, BOB, ALICE), BOB, "lcu"));
  assert.ok(insertGameFull(game(1003, BOB, ALICE), ALICE, "lcu"));
  // A Riot API payload that knows Alice only by the API's id: found by her Riot ID
  assert.ok(
    insertGameFull(game(1004, "riot-api-id-of-alice", "x4", "Alice"), ALICE, "riot-sync", false, {
      gameName: "Alice",
      tagLine: "EUNE",
    }),
  );
  // Fetched after the game was stored, so none of it is in the stored payload
  refreshParticipantTelemetry({
    gameId: 1001,
    participants: Array.from({ length: 10 }, (_, i) => ({
      participantId: i + 1,
      dangerPings: 3 + i,
      summoner1Casts: 5,
      totalHealsOnTeammates: 1200 + i,
      totalDamageShieldedOnTeammates: 800,
      challenges: { kda: 9, damagePerMinute: 1000 + i },
      missions: { Missions_SnowballsHit: 4 },
      totalTimeSpentDead: 60 + i,
    })),
  });
  db.prepare("UPDATE games SET favorite = 1 WHERE game_id = 1002").run();
  db.prepare("INSERT INTO settings (key, value) VALUES ('test_key', 'x')").run();
  db.prepare("INSERT INTO ignored_games (game_id) VALUES (999)").run();
  // What the app does at startup: owner rows moved to the account's id, scores from full rows
  reconcileOwnerPuuids();
  recalculateAllScores();
  db.prepare(
    "INSERT INTO riot_sync_state (puuid, platform, last_sync_at, last_match_id, complete) VALUES (?, 'eun1', 5, 'EUN1_1002', 1)",
  ).run(ALICE);
  for (const gameId of [1001, 1003]) {
    db.prepare(
      "INSERT INTO match_timeline_status (game_id, fetched_at, frame_count, event_count, fetch_error, raw_gz) VALUES (?, 1, 2, 1, NULL, ?)",
    ).run(gameId, zlib.gzipSync("{}"));
    // More than one import batch of frames (5000), so the batches meet the timeline status
    const frameCount = gameId === 1003 ? 5001 : 2;
    for (let frame = 0; frame < frameCount; frame++) {
      db.prepare(
        "INSERT INTO match_timeline_frames (game_id, frame_index, timestamp_ms, participant_id, gold) VALUES (?, ?, ?, 1, ?)",
      ).run(gameId, frame, frame * 60000, 500 + frame);
    }
    db.prepare(
      "INSERT INTO match_timeline_events (game_id, event_index, timestamp_ms, event_type, killer_id, victim_id) VALUES (?, 0, 90000, 'CHAMPION_KILL', 1, 6)",
    ).run(gameId);
    db.prepare(
      "INSERT INTO live_stat_peaks (game_id, puuid, champion_id, stat, peak, final, recorded_at) VALUES (?, ?, 10, 'ad', 300, 280, 1)",
    ).run(gameId, ALICE);
    db.prepare(
      "INSERT INTO live_game_data (game_id, puuid, duration_s, payload, recorded_at) VALUES (?, ?, 1500, ?, 1)",
    ).run(gameId, ALICE, zlib.gzipSync('{"live":1}'));
    db.prepare(
      "INSERT INTO post_game_data (game_id, puuid, kind, payload, recorded_at) VALUES (?, ?, 'eog', ?, 1)",
    ).run(gameId, ALICE, zlib.gzipSync('{"eog":1}'));
  }
}

const tables = () =>
  (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]
  ).map((t) => t.name);

// Order-independent: rows are compared as a sorted set
const hash = (rows: unknown[]) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(rows.map((row) => JSON.stringify(row)).sort()))
    .digest("hex")
    .slice(0, 16);

// Row counts of every table, plus the contents of what an import can only get from the file
// (an import rebuilds the rest from the game payloads, so those are compared by count)
function fingerprint(): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const name of tables()) {
    result[name] = (db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get() as { n: number }).n;
  }
  result.challengeRows = hash(
    db
      .prepare(
        "SELECT * FROM match_participant_challenges ORDER BY game_id, participant_id, challenge_key",
      )
      .all(),
  );
  result.telemetry = hash(
    db
      .prepare(
        `SELECT game_id, participant_id, enemy_missing_pings, danger_pings, spell1_casts, summoner1_casts,
           total_heal_on_teammates, total_damage_shielded_on_teammates, puuid, score
         FROM match_participants ORDER BY game_id, participant_id`,
      )
      .all(),
  );
  for (const table of [
    "tracked_game_stats",
    "player_stats",
    "summoner",
    "ignored_games",
    "riot_sync_state",
    "match_timeline_status",
    "match_timeline_frames",
    "match_timeline_events",
    "live_stat_peaks",
    "live_game_data",
    "post_game_data",
  ]) {
    result[`${table}Rows`] = hash(db.prepare(`SELECT * FROM ${table}`).all());
  }
  result.favorites = hash(
    db.prepare("SELECT game_id, favorite, source FROM games ORDER BY 1").all(),
  );
  return result;
}

// Rewrites an export as the previous format: v6 header, none of the newer record types
function asV6(file: string, out: string, drop: string[]): void {
  const lines = zlib.gunzipSync(fs.readFileSync(file)).toString("utf8").split("\n");
  const kept = lines
    .filter((line) => line && !drop.includes(JSON.parse(line).type))
    .map((line) =>
      JSON.parse(line).type === "header" ? line.replace(/"version":\d+/, '"version":6') : line,
    );
  fs.writeFileSync(out, zlib.gzipSync(kept.join("\n") + "\n"));
}

// ---- export → import ----
await openDb("source");
seed();
const original = fingerprint();
assert.equal(original.games, 4);
const exportFile = path.join(base, "export.json.gz");
assert.deepEqual(await writeExportTo(exportFile), { games: 4 });

await openDb("imported");
const imported = await importData(exportFile);
assert.equal(imported.imported, 4);
assert.deepEqual(fingerprint(), original);

// ---- a whole timeline already stored is kept, a damaged one is rewritten ----
await openDb("again");
await importData(exportFile);
const gold = (gameId: number) =>
  (
    db
      .prepare("SELECT gold FROM match_timeline_frames WHERE game_id = ? AND frame_index = 0")
      .get(gameId) as { gold: number } | undefined
  )?.gold;
db.prepare(
  "UPDATE match_timeline_frames SET gold = 1 WHERE game_id = 1001 AND frame_index = 0",
).run();
db.prepare("DELETE FROM match_timeline_frames WHERE game_id = 1003 AND frame_index = 0").run();
const percents: number[] = [];
await importData(exportFile, (p) => percents.push(p.percent as number));
assert.equal(gold(1001), 1);
assert.equal(gold(1003), 500);
assert.equal(percents.at(-1), 100);
assert.deepEqual(
  percents,
  [...percents].sort((a, b) => a - b),
);

// a newer timeline in the file replaces the stored one
db.prepare("UPDATE match_timeline_status SET fetched_at = 0 WHERE game_id = 1001").run();
await importData(exportFile);
assert.equal(gold(1001), 500);

// ---- a Mayhem-only export counts only what it writes ----
db.prepare("UPDATE games SET queue_id = ? WHERE game_id = 1001").run(MAYHEM_QUEUE_IDS[0]);
const mayhemFile = path.join(base, "export-mayhem.json.gz");
assert.deepEqual(await writeExportTo(mayhemFile, undefined, true), { games: 1 });
const [header] = zlib.gunzipSync(fs.readFileSync(mayhemFile)).toString("utf8").split("\n", 1);
assert.deepEqual(JSON.parse(header).totals, {
  game: 1,
  challenges: 10,
  telemetry: 10,
  timelineStatus: 1,
  timelineFrame: 2,
  timelineEvent: 1,
});

// ---- an export that can't be written fails instead of hanging ----
await assert.rejects(writeExportTo(path.join(base, "no-such-folder", "export.json.gz")), {
  code: "ENOENT",
});

// ---- the previous export format still imports ----
const v6File = path.join(base, "export-v6.json.gz");
asV6(exportFile, v6File, ["trackedAccount", "challenges", "telemetry"]);
await openDb("from-v6");
await importData(v6File);
assert.equal((db.prepare("SELECT COUNT(*) AS n FROM games").get() as { n: number }).n, 4);

// ---- a game the import can't store doesn't stop the rest ----
const lines = zlib.gunzipSync(fs.readFileSync(exportFile)).toString("utf8").split("\n");
const withoutGame = lines.filter(
  (line) => !line.startsWith('{"type":"game"') || !line.includes('"gameId":1003,'),
);
assert.equal(withoutGame.length, lines.length - 1);
const partialFile = path.join(base, "export-partial.json.gz");
fs.writeFileSync(partialFile, zlib.gzipSync(withoutGame.join("\n")));
await openDb("partial");
assert.equal((await importData(partialFile)).imported, 3);
assert.equal(
  (
    db
      .prepare("SELECT COUNT(*) AS n FROM match_participant_challenges WHERE game_id = 1003")
      .get() as { n: number }
  ).n,
  0,
);

// ---- snapshot → delete an account → restore ----
await openDb("imported");
const snapshot = await createBackup("manual");
assert.equal(snapshot.games, 4);

const deleted = deleteSavedSummoner(ALICE);
assert.deepEqual(deleted, { deletedGames: 3, deletedTrackedRows: 4 });
assert.equal(db.prepare("SELECT 1 FROM summoner WHERE puuid = ?").get(ALICE), undefined);
for (const name of tables()) {
  const columns = (db.pragma(`table_info(${name})`) as { name: string }[]).map((c) => c.name);
  if (!columns.includes("game_id") || name === "ignored_games") continue;
  const left = db
    .prepare(`SELECT COUNT(*) AS n FROM ${name} WHERE game_id IN (1001, 1002, 1004)`)
    .get() as { n: number };
  assert.equal(left.n, 0, `${name} still holds rows of a deleted game`);
}
assert.equal((db.prepare("SELECT COUNT(*) AS n FROM games").get() as { n: number }).n, 1);
assert.ok(
  (
    db.prepare("SELECT COUNT(*) AS n FROM match_participants WHERE game_id = 1003").get() as {
      n: number;
    }
  ).n === 10,
  "Bob's game keeps its players",
);

assert.deepEqual(await restoreBackup(snapshot.file), { games: 4 });
assert.deepEqual(fingerprint(), original);

// ---- compressed and pre-compression snapshots ----
assert.match(snapshot.file, /-manual-4g\.db\.gz$/);
const inBackups = (file: string) => path.join(getBackupDir(), file);
const files = () => listBackups().map((backup) => backup.file);
const legacy = "matches-2020-01-01T00-00-00-manual.db";
const plain = zlib.gunzipSync(fs.readFileSync(inBackups(snapshot.file)));
const putLegacy = () => fs.writeFileSync(inBackups(legacy), plain);
putLegacy();
assert.deepEqual(
  listBackups().map((backup) => backup.games),
  [4, 4],
);
assert.deepEqual(await restoreBackup(legacy), { games: 4 });
assert.deepEqual(fingerprint(), original);

const dead = inBackups("matches-2020-01-01T00-00-00-auto.db.part");
fs.writeFileSync(dead, "cut off");
const monthly = await createBackup("monthly");
assert.ok(!fs.existsSync(dead));
assert.deepEqual(files().sort(), [legacy, snapshot.file, monthly.file].sort()); // the plain .db stays

// Called off: nothing changes
deleteSavedSummoner(ALICE);
assert.equal(await restoreBackup(snapshot.file, async () => false), null);
assert.equal((db.prepare("SELECT COUNT(*) AS n FROM games").get() as { n: number }).n, 1);

// The "before restore" snapshot replaces the very file being restored
const restored = await restoreBackup(snapshot.file, async () => {
  await createBackup("pre-restore");
  return true;
});
assert.deepEqual(restored, { games: 4 });
assert.deepEqual(fingerprint(), original);
assert.ok(!files().includes(snapshot.file));
assert.equal(files().length, 3); // pre-restore, monthly and the plain .db

// ---- recovery from a damaged database, from either kind of snapshot ----
for (const kind of [".db.gz", ".db"]) {
  if (kind === ".db") {
    putLegacy();
    for (const file of files()) if (file !== legacy) fs.rmSync(inBackups(file));
  }
  closeDatabase();
  const dbFile = path.join(getDbDir(), "matches.db");
  fs.writeFileSync(dbFile, "not a database".repeat(1000));
  fs.rmSync(`${dbFile}-wal`, { force: true });
  await initDatabaseWithRecovery();
  const report = getRecoveryReport();
  assert.ok(report?.restoredFrom?.endsWith(kind), JSON.stringify(report));
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM games").get() as { n: number }).n, 4);
}

// A snapshot taken with automatic backups off doesn't switch them off again
setSetting("auto_backup", "false");
const switchedOff = await createBackup("manual");
setSetting("auto_backup", "true");
await restoreBackup(switchedOff.file);
assert.equal(getSetting("auto_backup"), "true");

// ---- a v33 database comes up to v34 with every row ----
await openDb("v33");
seed();
const beforeUpgrade = fingerprint();
// Back to the v33 layout: challenges in a table of their own, timelines with rowids and raw_json
db.exec(`
  CREATE TABLE v33_challenges AS SELECT * FROM match_participant_challenges;
  DROP VIEW match_participant_challenges;
  DELETE FROM match_challenge_values;
  DELETE FROM match_challenge_names;
  CREATE TABLE match_participant_challenges (
    game_id INTEGER NOT NULL, participant_id INTEGER NOT NULL, challenge_key TEXT NOT NULL, value REAL,
    PRIMARY KEY (game_id, participant_id, challenge_key),
    FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE
  );
  INSERT INTO match_participant_challenges SELECT * FROM v33_challenges;
  DROP TABLE v33_challenges;
  CREATE TABLE v33_frames AS SELECT * FROM match_timeline_frames;
  DROP TABLE match_timeline_frames;
  ALTER TABLE v33_frames RENAME TO match_timeline_frames;
  CREATE TABLE v33_events AS SELECT *, '{"type":"CHAMPION_KILL"}' AS raw_json FROM match_timeline_events;
  DROP TABLE match_timeline_events;
  ALTER TABLE v33_events RENAME TO match_timeline_events;
  PRAGMA user_version = 33;
`);
// The monthly slot, so the backup taken ahead of the upgrade leaves it alone
const oldSnapshot = await createBackup("monthly");
await openDb("v33");
assert.equal(db.pragma("user_version", { simple: true }), 34);
const shape = (name: string) =>
  db.prepare("SELECT type, sql FROM sqlite_master WHERE name = ?").get(name) as {
    type: string;
    sql: string;
  };
assert.equal(shape("match_participant_challenges").type, "view");
for (const table of ["match_timeline_frames", "match_timeline_events"]) {
  assert.match(shape(table).sql, /WITHOUT ROWID/);
}
assert.ok(
  !(db.pragma("table_info(match_timeline_events)") as { name: string }[]).some(
    (c) => c.name === "raw_json",
  ),
);
assert.deepEqual(fingerprint(), beforeUpgrade);
assert.ok(listBackups().some((backup) => backup.reason === "pre-migration-34"));
assert.equal(getSetting("vacuum_pending"), null);
// Writing a known counter again replaces its value and keeps its name's id
const names = () => db.prepare("SELECT id, name FROM match_challenge_names ORDER BY id").all();
const namesBefore = names();
db.prepare("INSERT OR REPLACE INTO match_participant_challenges VALUES (1001, 1, 'kda', 42)").run();
assert.deepEqual(names(), namesBefore);
assert.equal(
  db
    .prepare(
      "SELECT value FROM match_participant_challenges WHERE game_id = 1001 AND participant_id = 1 AND challenge_key = 'kda'",
    )
    .pluck()
    .get(),
  42,
);

// No room to upgrade an older snapshot: refused before anything is asked or replaced
const statfs = fs.statfsSync;
fs.statfsSync = (() => ({ bavail: -1e12, bsize: 1 })) as unknown as typeof fs.statfsSync;
let asked = false;
await assert.rejects(
  restoreBackup(oldSnapshot.file, async () => (asked = true)),
  /Nothing was changed/,
);
fs.statfsSync = statfs;
assert.equal(asked, false);
assert.equal(db.pragma("user_version", { simple: true }), 34);
assert.deepEqual(await restoreBackup(oldSnapshot.file), { games: 4 });
assert.deepEqual(fingerprint(), beforeUpgrade);

closeDatabase();
console.log("transfer checks passed");
