import { db } from "../db";
import { getSetting } from "./settings";
import { identityFromGame } from "./matches";
import type { MasteryChampion, RankEntry } from "../../shared/api";

export type SummonerUpsertSource = "lcu" | "riot" | "import";

function duplicateSummonerRows(
  gameName: string | null,
  tagLine: string | null,
  platform: string | null,
  puuid: string,
) {
  if (!gameName || !tagLine) return [];
  return db
    .prepare(
      `SELECT s.puuid,
              COALESCE((
                SELECT COUNT(*)
                FROM tracked_game_stats t
                JOIN games g ON g.game_id = t.game_id
                WHERE t.puuid = s.puuid AND g.source != 'search-import'
              ), 0) AS games_count,
              COALESCE((
                SELECT COUNT(*)
                FROM tracked_game_stats t
                WHERE t.puuid = s.puuid
              ), 0) AS tracked_count
       FROM summoner s
       WHERE s.puuid != ?
         AND LOWER(TRIM(s.game_name)) = LOWER(TRIM(?))
         AND LOWER(TRIM(s.tag_line)) = LOWER(TRIM(?))
         AND (
           ? IS NULL
           OR s.platform IS NULL
           OR LOWER(TRIM(s.platform)) = LOWER(TRIM(?))
         )
       ORDER BY
         CASE
           WHEN length(s.puuid) = 36
            AND substr(s.puuid, 9, 1) = '-'
            AND substr(s.puuid, 14, 1) = '-'
            AND substr(s.puuid, 19, 1) = '-'
            AND substr(s.puuid, 24, 1) = '-'
           THEN 0 ELSE 1
         END,
         games_count DESC,
         tracked_count DESC,
         s.updated_at DESC`,
    )
    .all(puuid, gameName, tagLine, platform, platform) as {
    puuid: string;
    games_count: number;
    tracked_count: number;
  }[];
}

export function upsertSummoner(
  summoner: {
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
  },
  source: SummonerUpsertSource = "import",
): string {
  console.log("[db] upsertSummoner called:", { puuid: summoner.puuid, source });
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

  const platform = summoner.platform?.trim() || null;
  // The client and the Riot API can call one account by different ids. History is keyed by the id
  // that already has a row, so a second id for the same Riot ID is folded into it.
  const known = db.prepare("SELECT 1 FROM summoner WHERE puuid = ?").get(summoner.puuid);
  const puuid =
    source !== "import" && !known
      ? (duplicateSummonerRows(gameName, tagLine, platform, summoner.puuid)[0]?.puuid ??
        summoner.puuid)
      : summoner.puuid;

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
    puuid,
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
  console.log("[db] upsertSummoner done:", { puuid });
  return puuid;
}

export function getResolvedPlatform(): string | null {
  console.log("[db] getResolvedPlatform called:", {});
  const candidates = [
    getSetting("riot_platform"),
    getSetting("platform"),
    (
      db
        .prepare(
          "SELECT platform FROM riot_sync_state WHERE TRIM(platform) <> '' ORDER BY last_sync_at DESC LIMIT 1",
        )
        .get() as { platform?: string } | undefined
    )?.platform,
    (
      db
        .prepare(
          "SELECT platform FROM summoner WHERE TRIM(platform) <> '' ORDER BY updated_at DESC LIMIT 1",
        )
        .get() as { platform?: string } | undefined
    )?.platform,
  ];
  const platform =
    candidates.find((value): value is string => Boolean(value?.trim()))?.trim() ?? null;
  console.log("[db] getResolvedPlatform done:", { platform });
  return platform;
}

export function restoreSummonerFull(row: {
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
    const puuid = upsertSummoner(
      {
        puuid: snapshot.puuid,
        gameName: snapshot.gameName,
        tagLine: snapshot.tagLine,
        profileIconId: snapshot.profileIconId,
        platform: snapshot.platform,
        summonerLevel: snapshot.summonerLevel,
      },
      "lcu",
    );

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
      puuid,
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

export function parseSnapshotJson<T>(value: string | null): T | null {
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
  // Decided games only: remakes are neither a win nor a loss
  wins: number;
  decidedGames: number;
}> {
  console.log("[db] listAccountsWithData called:", {});
  const rows = db
    .prepare(`
      SELECT
        s.puuid,
        s.game_name,
        s.tag_line,
        COALESCE(s.profile_icon, 29) AS profile_icon,
        s.platform,
        s.summoner_level,
        s.last_seen,
        COUNT(tgs.game_id) AS game_count,
        COALESCE(SUM(CASE WHEN g.is_remake = 0 THEN tgs.win ELSE 0 END), 0) AS wins,
        COUNT(CASE WHEN g.is_remake = 0 THEN 1 END) AS decided_games
      FROM visible_summoner s
      INNER JOIN tracked_game_stats tgs ON tgs.puuid = s.puuid
      INNER JOIN games g ON g.game_id = tgs.game_id
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
    wins: number;
    decided_games: number;
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
    wins: row.wins,
    decidedGames: row.decided_games,
  }));
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

export function getVisiblePuuids(): string[] {
  const rows = db.prepare("SELECT puuid FROM visible_summoner").all() as { puuid: string }[];
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

// Games this account owned that another saved account also played. Left alone they would keep an
// owner that no longer exists, which hides them from every owner-based view.
function handOverOwnedGames(puuid: string): void {
  const shared = db
    .prepare(
      `SELECT g.game_id, MIN(t.puuid) AS heir
         FROM games g
         JOIN tracked_game_stats t ON t.game_id = g.game_id
        WHERE g.puuid = ? AND t.puuid IN (SELECT puuid FROM summoner WHERE puuid != ?)
        GROUP BY g.game_id`,
    )
    .all(puuid, puuid) as { game_id: number; heir: string }[];
  if (shared.length === 0) return;

  // player_stats and tracked_game_stats share every column but the account id
  const columns = (db.pragma("table_info(player_stats)") as { name: string }[])
    .map((column) => column.name)
    .join(", ");
  const setOwner = db.prepare("UPDATE games SET puuid = ? WHERE game_id = ?");
  const setStats = db.prepare(
    `INSERT OR REPLACE INTO player_stats (${columns})
     SELECT ${columns} FROM tracked_game_stats WHERE game_id = ? AND puuid = ?`,
  );
  const clearAugments = db.prepare("DELETE FROM game_augments WHERE game_id = ?");
  const setAugments = db.prepare(
    `INSERT OR IGNORE INTO game_augments (game_id, slot, augment_id)
     SELECT a.game_id, a.slot, a.augment_id
       FROM match_participant_augments a
       JOIN match_participants p
         ON p.game_id = a.game_id AND p.participant_id = a.participant_id
      WHERE a.game_id = ? AND p.puuid = ?`,
  );
  for (const { game_id, heir } of shared) {
    setOwner.run(heir, game_id);
    setStats.run(game_id, heir);
    clearAugments.run(game_id);
    setAugments.run(game_id, heir);
  }
}

export function deleteSavedSummoner(puuid: string): {
  deletedGames: number;
  deletedTrackedRows: number;
} {
  console.log("[db] deleteSummoner", puuid);
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
    console.log("[db] delete tracked_game_stats", deletedTrackedRows);

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
        // match_teams, match_bans and challenges follow through ON DELETE CASCADE
        for (const table of [
          "player_stats",
          "game_augments",
          "match_participant_augments",
          "match_participants",
          "match_timeline_status",
          "match_timeline_frames",
          "match_timeline_events",
          "live_stat_peaks",
          "live_game_data",
          "post_game_data",
          "games",
        ]) {
          const removed = db
            .prepare(`DELETE FROM ${table} WHERE game_id IN (${orphanPlaceholders})`)
            .run(...orphanIds).changes;
          console.log(`[db] delete ${table}`, removed);
        }
      }
      deletedGames = orphanIds.length;
    }

    handOverOwnedGames(puuid);

    const deletedSummonerRows = db
      .prepare("DELETE FROM summoner WHERE puuid = ?")
      .run(puuid).changes;
    console.log("[db] delete summoner", deletedSummonerRows);
  });
  tx();

  return { deletedGames, deletedTrackedRows };
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
