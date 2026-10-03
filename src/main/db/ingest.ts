import { db, type GameSource } from "../db";
import type { PlayerScore } from "../../shared/opScore";
import { gameExists } from "./matches";
import {
  packRaw,
  participantRowsFromRaw,
  writeParticipants,
  type RawParticipantRow,
} from "./payloads";
import { computeOwnerScore, detectRemake, parsePatch, type ScoreRow } from "./scoring";

// The game's owner among its participant rows. participantRowsFromRaw has
// already folded participantIdentities into each row's puuid, so one lookup
// covers both the LCU and SGP shapes.
export function findOwnerRow(
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

export function insertTrackedStatsOnly(gameId: number, puuid: string): TrackedOnlyResult {
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
