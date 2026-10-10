import fs from "fs";
import { db, type GameSource } from "../db";
import { unpackRaw } from "./payloads";
import { insertGameFull, insertTrackedStatsOnly } from "./ingest";
import { upsertSummoner, restoreSummonerFull, getAllPuuids } from "./summoner";
import { getSetting, setSetting } from "./settings";
import { rebuildDerivedStats } from "./scoring";
import { rebuildParticipantsFromPayloads } from "./schema";

// ---- Export / Import ----

// Games are read a page at a time and written straight to disk, rather than
// building the whole backup in memory and handing one huge string to
// writeFileSync. Two reasons: a library of a few thousand games is a hundred
// megabytes-plus of JSON to hold twice over, and every await here returns the
// main process to the event loop, so exporting no longer freezes the window.
const EXPORT_PAGE_SIZE = 200;
const TIMELINE_EXPORT_PAGE_SIZE = 5000;

function timelineStatusForExport(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    raw_gz: row.raw_gz instanceof Buffer ? row.raw_gz.toString("base64") : null,
  };
}

async function writeJsonArray(
  write: (chunk: string) => Promise<void>,
  rows: Record<string, unknown>[],
): Promise<void> {
  for (const [index, row] of rows.entries()) {
    await write(`${index === 0 ? "" : ","}${JSON.stringify(row)}`);
  }
}

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
    const timelineStatus = db.prepare("SELECT * FROM match_timeline_status").all() as Record<
      string,
      unknown
    >[];
    await write(
      `{"version":5,"summoners":${JSON.stringify(summoners)},"settings":${JSON.stringify(settings)},"ignoredGames":${JSON.stringify(ignoredGames)},"riotSyncState":${JSON.stringify(riotSyncState)},"timelineStatus":[`,
    );
    await writeJsonArray(write, timelineStatus.map(timelineStatusForExport));
    await write(`],"timelineFrames":[`);

    const framePage = db.prepare(`
      SELECT game_id, frame_index, timestamp_ms, participant_id, puuid, level, xp, gold, cs,
        position_x, position_y, attack_damage, ability_power, armor, magic_resist,
        attack_speed, ability_haste, move_speed, max_health, current_health
      FROM match_timeline_frames
      WHERE (game_id > ?)
        OR (game_id = ? AND frame_index > ?)
        OR (game_id = ? AND frame_index = ? AND participant_id > ?)
      ORDER BY game_id, frame_index, participant_id
      LIMIT ?
    `);
    let lastFrame = { gameId: 0, frameIndex: -1, participantId: -1 };
    let firstFrame = true;
    for (;;) {
      const rows = framePage.all(
        lastFrame.gameId,
        lastFrame.gameId,
        lastFrame.frameIndex,
        lastFrame.gameId,
        lastFrame.frameIndex,
        lastFrame.participantId,
        TIMELINE_EXPORT_PAGE_SIZE,
      ) as Record<string, unknown>[];
      if (rows.length === 0) break;
      for (const row of rows) {
        await write(`${firstFrame ? "" : ","}${JSON.stringify(row)}`);
        firstFrame = false;
      }
      const last = rows[rows.length - 1];
      lastFrame = {
        gameId: last.game_id as number,
        frameIndex: last.frame_index as number,
        participantId: last.participant_id as number,
      };
    }
    await write(`],"timelineEvents":[`);

    const eventPage = db.prepare(`
      SELECT game_id, event_index, timestamp_ms, event_type, participant_id, killer_id,
        victim_id, team_id, item_id, skill_slot, level_up_type, ward_type, building_type,
        monster_type, monster_subtype, raw_json
      FROM match_timeline_events
      WHERE (game_id > ?) OR (game_id = ? AND event_index > ?)
      ORDER BY game_id, event_index
      LIMIT ?
    `);
    let lastEvent = { gameId: 0, eventIndex: -1 };
    let firstEvent = true;
    for (;;) {
      const rows = eventPage.all(
        lastEvent.gameId,
        lastEvent.gameId,
        lastEvent.eventIndex,
        TIMELINE_EXPORT_PAGE_SIZE,
      ) as Record<string, unknown>[];
      if (rows.length === 0) break;
      for (const row of rows) {
        await write(`${firstEvent ? "" : ","}${JSON.stringify(row)}`);
        firstEvent = false;
      }
      const last = rows[rows.length - 1];
      lastEvent = {
        gameId: last.game_id as number,
        eventIndex: last.event_index as number,
      };
    }
    await write(`],"games":[`);

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

function restoreTimelineData(data: any): void {
  const timelineStatus = data.timelineStatus;
  if (!Array.isArray(timelineStatus) || timelineStatus.length === 0) return;

  const restore = db.transaction(() => {
    const deleteFrames = db.prepare("DELETE FROM match_timeline_frames WHERE game_id = ?");
    const deleteEvents = db.prepare("DELETE FROM match_timeline_events WHERE game_id = ?");
    const restoreStatus = db.prepare(`
      INSERT OR REPLACE INTO match_timeline_status
        (game_id, fetched_at, frame_count, event_count, fetch_error, raw_gz)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const restoreFrame = db.prepare(`
      INSERT OR REPLACE INTO match_timeline_frames
        (game_id, frame_index, timestamp_ms, participant_id, puuid, level, xp, gold, cs,
         position_x, position_y, attack_damage, ability_power, armor, magic_resist,
         attack_speed, ability_haste, move_speed, max_health, current_health)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const restoreEvent = db.prepare(`
      INSERT OR REPLACE INTO match_timeline_events
        (game_id, event_index, timestamp_ms, event_type, participant_id, killer_id,
         victim_id, team_id, item_id, skill_slot, level_up_type, ward_type,
         building_type, monster_type, monster_subtype, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const gameIds = new Set<number>();
    for (const status of timelineStatus) {
      const rawGz =
        typeof status.raw_gz === "string" && status.raw_gz.length > 0
          ? Buffer.from(status.raw_gz, "base64")
          : null;
      gameIds.add(status.game_id);
      restoreStatus.run(
        status.game_id,
        status.fetched_at,
        status.frame_count,
        status.event_count,
        status.fetch_error ?? null,
        rawGz,
      );
    }
    for (const gameId of gameIds) {
      deleteFrames.run(gameId);
      deleteEvents.run(gameId);
    }
    for (const frame of data.timelineFrames ?? []) {
      restoreFrame.run(
        frame.game_id,
        frame.frame_index,
        frame.timestamp_ms,
        frame.participant_id,
        frame.puuid ?? null,
        frame.level ?? null,
        frame.xp ?? null,
        frame.gold ?? null,
        frame.cs ?? null,
        frame.position_x ?? null,
        frame.position_y ?? null,
        frame.attack_damage ?? null,
        frame.ability_power ?? null,
        frame.armor ?? null,
        frame.magic_resist ?? null,
        frame.attack_speed ?? null,
        frame.ability_haste ?? null,
        frame.move_speed ?? null,
        frame.max_health ?? null,
        frame.current_health ?? null,
      );
    }
    for (const event of data.timelineEvents ?? []) {
      restoreEvent.run(
        event.game_id,
        event.event_index,
        event.timestamp_ms,
        event.event_type,
        event.participant_id ?? null,
        event.killer_id ?? null,
        event.victim_id ?? null,
        event.team_id ?? null,
        event.item_id ?? null,
        event.skill_slot ?? null,
        event.level_up_type ?? null,
        event.ward_type ?? null,
        event.building_type ?? null,
        event.monster_type ?? null,
        event.monster_subtype ?? null,
        event.raw_json ?? null,
      );
    }
  });
  restore();
}

export function importData(data: any): { imported: number; total: number; skipped: number } {
  if (data.version >= 5) {
    const result = importData({ ...data, version: 4 });
    restoreTimelineData(data);
    return result;
  }
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
