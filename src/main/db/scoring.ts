import { db } from "../db";
import { getSetting, setSetting } from "./settings";
import {
  SCORE_FORMULA_VERSION,
  computeMatchScores,
  type PlayerScore,
  type ScoreInput,
} from "../../shared/opScore";
import { AUGMENT_SLOTS } from "../../shared/queues";
import { getChampionClasses, getChampionDataVersion } from "../dragon";
import { participantRowsFromRaw, unpackRaw } from "./payloads";

export let scoreBackfillInFlight = false;

// Score backfills are keyed on formula version + champion data version, so
// stored scores recompute when either changes (new formula, new patch,
// re-tagged champion).
export function scoreFormulaKey() {
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
export interface ScoreRow {
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

export const SCORE_ROW_COLUMNS = `participant_id, puuid, team_id, champion_id, win,
       kills, deaths, assists, double_kills, triple_kills, quadra_kills, penta_kills,
       total_damage_dealt, total_damage_taken, gold_earned, total_heal`;

export function scoreInputsFromRows(rows: ScoreRow[]): (ScoreInput & { puuid: string | null })[] {
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
export function groupByGame<T extends { game_id: number }>(rows: T[]): Map<number, T[]> {
  const byGame = new Map<number, T[]>();
  for (const row of rows) {
    const list = byGame.get(row.game_id);
    if (list) list.push(row);
    else byGame.set(row.game_id, [row]);
  }
  return byGame;
}

export function computeOwnerScore(
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

export function backfillScores() {
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

export function parsePatch(version: unknown): string | null {
  if (typeof version !== "string") return null;
  const m = version.match(/^(\d+)\.(\d+)/);
  return m ? `${m[1]}.${m[2]}` : null;
}

export function detectRemake(gameDuration: number, rows: { early_surrender: number }[]): boolean {
  // Very short games are always remakes
  if (gameDuration < 300) return true;
  // An early surrender still inside the first ten minutes counts as one too
  if (gameDuration < 600) return rows.some((r) => r.early_surrender === 1);
  return false;
}

// Rebuild everything derived from the participant rows for each game's current
// owner: player_stats (champion, KDA, items), augments, the remake flag, and
// the score under the current formula. Heals games whose owner puuid changed
// during repair (their stored stats still described the old participant) and
// doubles as a manual "rescore now" for formula changes.
export function rebuildDerivedStats(): number {
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
