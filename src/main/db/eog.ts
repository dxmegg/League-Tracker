import { gunzipSync, gzipSync } from "zlib";
import { db } from "../db";
import { EOG_COLUMNS, findEogPlayer, stripEogSecrets } from "../../shared/eog";

const unpack = (payload: Buffer): any => JSON.parse(gunzipSync(payload).toString("utf8"));

export function getEogBlock(gameId: number): any {
  const row = db
    .prepare(
      "SELECT payload FROM post_game_data WHERE game_id = ? AND kind = 'eog' ORDER BY recorded_at DESC LIMIT 1",
    )
    .get(gameId) as { payload: Buffer } | undefined;
  return row ? unpack(row.payload) : null;
}

// Fills the participant columns the match history left empty. Safe to repeat; it runs both when the
// block arrives and when the match is written, whichever comes second.
export function applyEogTelemetry(gameId: number): void {
  const eog = getEogBlock(gameId);
  if (!eog) return;
  const rows = db
    .prepare(
      "SELECT participant_id, puuid, champion_id, team_id FROM match_participants WHERE game_id = ?",
    )
    .all(gameId) as Array<{
    participant_id: number;
    puuid: string | null;
    champion_id: number;
    team_id: number;
  }>;
  const columns = Object.keys(EOG_COLUMNS);
  const update = db.prepare(
    `UPDATE match_participants SET ${columns
      .map((c) => `${c} = COALESCE(NULLIF(${c}, 0), ?, ${c})`)
      .join(", ")} WHERE game_id = ? AND participant_id = ?`,
  );
  for (const row of rows) {
    const player = findEogPlayer(eog, {
      puuid: row.puuid,
      championId: row.champion_id,
      teamId: row.team_id,
    });
    if (!player) continue;
    const values = columns.map((c) => player.stats?.[EOG_COLUMNS[c]] ?? null);
    update.run(...values, gameId, row.participant_id);
  }
}

// One-time cleanup of what earlier versions stored, then the backfill from the stored blocks
export function scrubStoredSecrets(): void {
  const rewrite = (table: string, where: string, clean: (data: any) => any) => {
    const keys = db.prepare(`SELECT rowid AS id FROM ${table} ${where}`).all() as Array<{
      id: number;
    }>;
    const read = db.prepare(`SELECT payload FROM ${table} WHERE rowid = ?`);
    const write = db.prepare(`UPDATE ${table} SET payload = ? WHERE rowid = ?`);
    for (const { id } of keys) {
      try {
        const data = unpack((read.get(id) as { payload: Buffer }).payload);
        write.run(gzipSync(JSON.stringify(clean(data))), id);
      } catch (error) {
        console.warn(`[db] could not clean ${table} row ${id}:`, error);
      }
    }
  };
  rewrite("post_game_data", "WHERE kind = 'eog'", stripEogSecrets);
  rewrite("live_game_data", "", (data) => {
    if (data?.snapshot?.session) delete data.snapshot.session.spectatorKey;
    return data;
  });
}

export function backfillEogTelemetry(): void {
  const games = db
    .prepare("SELECT DISTINCT game_id FROM post_game_data WHERE kind = 'eog'")
    .all() as Array<{ game_id: number }>;
  for (const { game_id: gameId } of games) applyEogTelemetry(gameId);
}
