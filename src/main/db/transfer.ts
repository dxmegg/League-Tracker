import fs from "fs";
import zlib from "zlib";
import { db, type GameSource } from "../db";
import { unpackRaw } from "./payloads";
import { insertGameFull, insertTrackedStatsOnly } from "./ingest";
import { upsertSummoner, restoreSummonerFull, getAllPuuids } from "./summoner";
import { getSetting, setSetting } from "./settings";
import { rebuildDerivedStats } from "./scoring";
import { rebuildParticipantsFromPayloads } from "./schema";
import type { ExportProgress, ImportProgress } from "../../shared/api";

// ---- Export / Import ----

// Every record is written independently so neither the exporter nor importer
// needs to materialize the complete backup as one V8 string.
const EXPORT_PAGE_SIZE = 200;
const TIMELINE_PAGE_SIZE = 5000;

export async function writeExportTo(
  filePath: string,
  onProgress?: (progress: ExportProgress) => void,
): Promise<{ games: number }> {
  const out = fs.createWriteStream(filePath);
  const gz = zlib.createGzip();
  gz.pipe(out);
  const write = (record: object) =>
    new Promise<void>((resolve, reject) => {
      gz.write(`${JSON.stringify(record)}\n`, (err) => (err ? reject(err) : resolve()));
    });

  let count = 0;
  try {
    const totalGames = (
      db.prepare("SELECT COUNT(*) AS count FROM games WHERE raw_gz IS NOT NULL").get() as {
        count: number;
      }
    ).count;
    const totalStatuses = (
      db.prepare("SELECT COUNT(*) AS count FROM match_timeline_status").get() as { count: number }
    ).count;
    const totalFrames = (
      db.prepare("SELECT COUNT(*) AS count FROM match_timeline_frames").get() as { count: number }
    ).count;
    const totalEvents = (
      db.prepare("SELECT COUNT(*) AS count FROM match_timeline_events").get() as { count: number }
    ).count;
    const summoners = db.prepare("SELECT * FROM summoner").all();
    const settings = db.prepare("SELECT key, value FROM settings").all();
    const ignoredGames = db.prepare("SELECT game_id FROM ignored_games").all();
    const riotSyncState = db
      .prepare("SELECT puuid, platform, last_sync_at, last_match_id, complete FROM riot_sync_state")
      .all();
    await write({ type: "header", version: 6, exportedAt: Date.now() });
    for (const summoner of summoners) await write({ type: "summoner", data: summoner });
    for (const setting of settings) await write({ type: "setting", data: setting });
    for (const ignoredGame of ignoredGames) {
      await write({ type: "ignoredGame", data: ignoredGame });
    }
    for (const syncState of riotSyncState) {
      await write({ type: "riotSyncState", data: syncState });
    }

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

      for (const row of rows) {
        // A backup stays the untouched payloads, so an import into any version
        // rebuilds whatever that version derives from them.
        const game = unpackRaw(row.raw_gz);
        if (!game) continue;
        game._ownerPuuid = row.puuid;
        game._favorite = row.favorite;
        game._source = row.source;
        await write({ type: "game", data: game });
        count++;
      }
      lastId = rows[rows.length - 1].game_id;
      onProgress?.({
        phase: "games",
        current: count,
        total: totalGames,
        label: "Writing games",
      });
    }

    const statusPage = db.prepare(`
      SELECT game_id, fetched_at, frame_count, event_count, fetch_error, raw_gz
      FROM match_timeline_status
      WHERE game_id > ?
      ORDER BY game_id
      LIMIT ?
    `);
    let lastStatusId = 0;
    let statusCount = 0;
    for (;;) {
      const rows = statusPage.all(lastStatusId, TIMELINE_PAGE_SIZE) as Array<{
        game_id: number;
        fetched_at: number;
        frame_count: number;
        event_count: number;
        fetch_error: string | null;
        raw_gz: Buffer | null;
      }>;
      if (rows.length === 0) break;
      for (const row of rows) {
        await write({
          type: "timelineStatus",
          data: {
            ...row,
            raw_gz: row.raw_gz?.toString("base64") ?? null,
          },
        });
        statusCount++;
      }
      lastStatusId = rows[rows.length - 1].game_id;
      onProgress?.({
        phase: "timeline-status",
        current: statusCount,
        total: totalStatuses,
        label: "Writing timeline status",
      });
    }

    const framePage = db.prepare(`
      SELECT game_id, frame_index, timestamp_ms, participant_id, puuid, level, xp, gold, cs,
             position_x, position_y, attack_damage, ability_power, armor, magic_resist,
             attack_speed, ability_haste, move_speed, max_health, current_health
      FROM match_timeline_frames
      WHERE (game_id, frame_index, participant_id) > (?, ?, ?)
      ORDER BY game_id, frame_index, participant_id
      LIMIT ?
    `);
    let lastFrame = { game_id: 0, frame_index: -1, participant_id: -1 };
    let frameCount = 0;
    for (;;) {
      const rows = framePage.all(
        lastFrame.game_id,
        lastFrame.frame_index,
        lastFrame.participant_id,
        TIMELINE_PAGE_SIZE,
      ) as Array<
        { game_id: number; frame_index: number; participant_id: number } & Record<string, unknown>
      >;
      if (rows.length === 0) break;
      for (const row of rows) await write({ type: "timelineFrame", data: row });
      frameCount += rows.length;
      onProgress?.({
        phase: "timeline-frames",
        current: frameCount,
        total: totalFrames,
        label: "Writing timeline frames",
      });
      const last = rows[rows.length - 1];
      lastFrame = {
        game_id: last.game_id,
        frame_index: last.frame_index,
        participant_id: last.participant_id,
      };
    }

    const eventPage = db.prepare(`
      SELECT game_id, event_index, timestamp_ms, event_type, participant_id, killer_id, victim_id,
             team_id, item_id, skill_slot, level_up_type, ward_type, building_type,
             monster_type, monster_subtype, raw_json
      FROM match_timeline_events
      WHERE (game_id, event_index) > (?, ?)
      ORDER BY game_id, event_index
      LIMIT ?
    `);
    let lastEvent = { game_id: 0, event_index: -1 };
    let eventCount = 0;
    for (;;) {
      const rows = eventPage.all(
        lastEvent.game_id,
        lastEvent.event_index,
        TIMELINE_PAGE_SIZE,
      ) as Array<{ game_id: number; event_index: number } & Record<string, unknown>>;
      if (rows.length === 0) break;
      for (const row of rows) await write({ type: "timelineEvent", data: row });
      eventCount += rows.length;
      onProgress?.({
        phase: "timeline-events",
        current: eventCount,
        total: totalEvents,
        label: "Writing timeline events",
      });
      const last = rows[rows.length - 1];
      lastEvent = { game_id: last.game_id, event_index: last.event_index };
    }
    onProgress?.({ phase: "done", current: count, total: totalGames, label: "Export complete" });
  } finally {
    await new Promise<void>((resolve, reject) => {
      out.once("error", reject);
      gz.once("error", reject);
      out.once("finish", resolve);
      gz.end();
    });
  }
  return { games: count };
}

type ImportResult = { imported: number; total: number; skipped: number };

function importLegacyData(data: any): ImportResult {
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

const MAX_IMPORT_LINE_BYTES = 50 * 1024 * 1024;

export async function importData(
  filePath: string,
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportResult> {
  console.log("[db] importData called:", { filePath });
  const handle = await fs.promises.open(filePath, "r");
  const magic = Buffer.alloc(2);
  try {
    await handle.read(magic, 0, 2, 0);
  } finally {
    await handle.close();
  }

  if (magic[0] !== 0x1f || magic[1] !== 0x8b) {
    onProgress?.({ phase: "reading", current: 0, total: 0, label: "Parsing legacy JSON" });
    const raw = await fs.promises.readFile(filePath, "utf8");
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || !Array.isArray(data.games)) {
      throw new Error("That file isn't a Mayhem Tracker backup");
    }
    const result = importLegacyData(data);
    onProgress?.({ phase: "done", current: 0, total: 0, label: "Import complete" });
    console.log("[db] importData done:", result);
    return result;
  }

  const input = fs.createReadStream(filePath).pipe(zlib.createGunzip());
  const restoreSetting = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
  const restoreIgnoredGame = db.prepare("INSERT OR IGNORE INTO ignored_games (game_id) VALUES (?)");
  const restoreSyncState = db.prepare(`
      INSERT OR REPLACE INTO riot_sync_state
        (puuid, platform, last_sync_at, last_match_id, complete)
      VALUES (?, ?, ?, ?, ?)
    `);
  const restoreStatus = db.prepare(`
      INSERT OR REPLACE INTO match_timeline_status
        (game_id, fetched_at, frame_count, event_count, fetch_error, raw_gz)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
  const deleteTimelineFrames = db.prepare("DELETE FROM match_timeline_frames WHERE game_id = ?");
  const deleteTimelineEvents = db.prepare("DELETE FROM match_timeline_events WHERE game_id = ?");
  const restoreFrame = db.prepare(`
      INSERT OR REPLACE INTO match_timeline_frames (
        game_id, frame_index, timestamp_ms, participant_id, puuid, level, xp, gold, cs,
        position_x, position_y, attack_damage, ability_power, armor, magic_resist,
        attack_speed, ability_haste, move_speed, max_health, current_health
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  const restoreEvent = db.prepare(`
      INSERT OR REPLACE INTO match_timeline_events (
        game_id, event_index, timestamp_ms, event_type, participant_id, killer_id,
        victim_id, team_id, item_id, skill_slot, level_up_type, ward_type,
        building_type, monster_type, monster_subtype, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

  const games: Array<{ data: any }> = [];
  const statuses: Array<{ data: any }> = [];
  const frames: Array<{ data: any }> = [];
  const events: Array<{ data: any }> = [];
  const statusGameIds = new Set<number>();
  const clearedTimelineGameIds = new Set<number>();
  let imported = 0;
  let total = 0;
  let skipped = 0;

  const flushGames = () => {
    for (const record of games.splice(0)) {
      total++;
      const game = record.data;
      try {
        const puuid = game?._ownerPuuid;
        if (!puuid) {
          skipped++;
          continue;
        }
        const source: GameSource = game._source ?? "lcu";
        if (insertGameFull(game, puuid, source, source === "search-import")) imported++;
        db.prepare("UPDATE games SET favorite = ? WHERE game_id = ?").run(
          game._favorite ?? 0,
          game.gameId,
        );
      } catch (err: unknown) {
        skipped++;
        console.warn("[db] v6 game restore failed:", {
          gameId: game?.gameId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };
  const flushStatuses = () => {
    const tx = db.transaction(() => {
      for (const record of statuses.splice(0)) {
        const status = record.data;
        const rawGz =
          typeof status.raw_gz === "string" ? Buffer.from(status.raw_gz, "base64") : null;
        restoreStatus.run(
          status.game_id,
          status.fetched_at,
          status.frame_count,
          status.event_count,
          status.fetch_error,
          rawGz,
        );
        statusGameIds.add(status.game_id);
      }
    });
    tx();
  };
  const flushFrames = () => {
    const tx = db.transaction(() => {
      for (const record of frames.splice(0)) {
        const frame = record.data;
        if (statusGameIds.has(frame.game_id) && !clearedTimelineGameIds.has(frame.game_id)) {
          deleteTimelineFrames.run(frame.game_id);
          deleteTimelineEvents.run(frame.game_id);
          clearedTimelineGameIds.add(frame.game_id);
        }
        restoreFrame.run(
          frame.game_id,
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
    });
    tx();
  };
  const flushEvents = () => {
    const tx = db.transaction(() => {
      for (const record of events.splice(0)) {
        const event = record.data;
        if (statusGameIds.has(event.game_id) && !clearedTimelineGameIds.has(event.game_id)) {
          deleteTimelineFrames.run(event.game_id);
          deleteTimelineEvents.run(event.game_id);
          clearedTimelineGameIds.add(event.game_id);
        }
        restoreEvent.run(
          event.game_id,
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
          event.raw_json,
        );
      }
    });
    tx();
  };

  let pending = Buffer.alloc(0);
  let headerSeen = false;
  let lineNumber = 0;
  let lastProgressPhase: ImportProgress["phase"] | null = null;
  const reportProgress = (phase: ImportProgress["phase"], label: string, force = false): void => {
    if (!force && phase === lastProgressPhase && lineNumber % 1000 !== 0) return;
    lastProgressPhase = phase;
    onProgress?.({ phase, current: lineNumber, total: 0, label });
  };
  const processLine = (line: string) => {
    if (!line.trim()) return;
    lineNumber++;
    let record: { type?: string; version?: number; data?: any };
    try {
      record = JSON.parse(line);
    } catch (err) {
      throw new Error(
        `Invalid JSON on backup line ${lineNumber}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!headerSeen) {
      if (record.type !== "header" || typeof record.version !== "number" || record.version < 6) {
        throw new Error("That file isn't a supported League Tracker v6 backup");
      }
      headerSeen = true;
      reportProgress("reading", "Reading backup", true);
      return;
    }
    let progressPhase: ImportProgress["phase"] = "reading";
    let progressLabel = "Reading backup";
    switch (record.type) {
      case "summoner":
        restoreSummonerFull(record.data);
        break;
      case "setting":
        restoreSetting.run(record.data.key, record.data.value);
        break;
      case "ignoredGame":
        restoreIgnoredGame.run(record.data.game_id);
        break;
      case "riotSyncState":
        restoreSyncState.run(
          record.data.puuid,
          record.data.platform,
          record.data.last_sync_at,
          record.data.last_match_id,
          record.data.complete,
        );
        break;
      case "game":
        games.push({ data: record.data });
        if (games.length >= 200) flushGames();
        progressPhase = "games";
        progressLabel = "Reading games";
        break;
      case "timelineStatus":
        statuses.push({ data: record.data });
        if (statuses.length >= 200) flushStatuses();
        progressPhase = "timeline-status";
        progressLabel = "Reading timeline status";
        break;
      case "timelineFrame":
        frames.push({ data: record.data });
        if (frames.length >= TIMELINE_PAGE_SIZE) flushFrames();
        progressPhase = "timeline-frames";
        progressLabel = "Reading timeline frames";
        break;
      case "timelineEvent":
        events.push({ data: record.data });
        if (events.length >= TIMELINE_PAGE_SIZE) flushEvents();
        progressPhase = "timeline-events";
        progressLabel = "Reading timeline events";
        break;
      default:
        throw new Error(`Unknown record type on backup line ${lineNumber}`);
    }
    reportProgress(progressPhase, progressLabel);
  };

  for await (const chunk of input) {
    pending = Buffer.concat([pending, chunk as Buffer]);
    if (pending.length > MAX_IMPORT_LINE_BYTES && pending.indexOf(0x0a) === -1) {
      throw new Error("Backup line exceeds the 50 MB limit");
    }
    let newline = pending.indexOf(0x0a);
    while (newline !== -1) {
      const line = pending.subarray(0, newline);
      if (line.length > MAX_IMPORT_LINE_BYTES)
        throw new Error("Backup line exceeds the 50 MB limit");
      processLine(line.toString("utf8").replace(/\r$/, ""));
      pending = pending.subarray(newline + 1);
      newline = pending.indexOf(0x0a);
    }
  }
  if (pending.length > MAX_IMPORT_LINE_BYTES)
    throw new Error("Backup line exceeds the 50 MB limit");
  if (pending.length > 0) processLine(pending.toString("utf8"));
  if (!headerSeen) throw new Error("That file isn't a League Tracker backup");
  flushGames();
  flushStatuses();
  flushFrames();
  flushEvents();
  onProgress?.({ phase: "done", current: lineNumber, total: 0, label: "Import complete" });
  const result = { imported, total, skipped: total - imported };
  console.log("[db] importData done:", result);
  return result;
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
