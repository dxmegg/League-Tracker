import { db } from "../db";
import { getSetting } from "./settings";
import { identityFromGame } from "./matches";
import type { MasteryChampion, RankEntry } from "../../shared/api";

export type SummonerUpsertSource = "lcu" | "riot" | "import";

function duplicateSummonerRows(gameName: string | null, tagLine: string | null, puuid: string) {
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
       ORDER BY games_count DESC, tracked_count DESC, length(s.puuid) DESC, s.updated_at DESC`,
    )
    .all(puuid, gameName, tagLine) as {
    puuid: string;
    games_count: number;
    tracked_count: number;
  }[];
}

function mergeSummonerReferences(stalePuuid: string, canonicalPuuid: string): void {
  const merge = db.transaction(() => {
    for (const table of ["games", "tracked_game_stats", "match_participants"]) {
      const result = db
        .prepare(`UPDATE ${table} SET puuid = ? WHERE puuid = ?`)
        .run(canonicalPuuid, stalePuuid);
      console.log("[db] merged rows:", { table, count: result.changes });
    }

    const staleSync = db.prepare("SELECT 1 FROM riot_sync_state WHERE puuid = ?").get(stalePuuid);
    const canonicalSync = db
      .prepare("SELECT 1 FROM riot_sync_state WHERE puuid = ?")
      .get(canonicalPuuid);
    if (staleSync && !canonicalSync) {
      db.prepare("UPDATE riot_sync_state SET puuid = ? WHERE puuid = ?").run(
        canonicalPuuid,
        stalePuuid,
      );
    } else if (staleSync) {
      const result = db.prepare("DELETE FROM riot_sync_state WHERE puuid = ?").run(stalePuuid);
      console.log("[db] merged rows:", { table: "riot_sync_state", count: result.changes });
    }

    const staleSetting = `backfill_complete_${stalePuuid}`;
    const canonicalSetting = `backfill_complete_${canonicalPuuid}`;
    const staleComplete = db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(staleSetting) as { value: string } | undefined;
    if (staleComplete) {
      if (!db.prepare("SELECT 1 FROM settings WHERE key = ?").get(canonicalSetting)) {
        db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
          canonicalSetting,
          staleComplete.value,
        );
      }
      db.prepare("DELETE FROM settings WHERE key = ?").run(staleSetting);
    }
  });
  merge();
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

  const duplicates = duplicateSummonerRows(gameName, tagLine, summoner.puuid);
  if (duplicates.length > 0 && source === "lcu") {
    console.log("[db] upsertSummoner reused existing PUUID:", {
      requestedPuuid: summoner.puuid,
      existingPuuid: duplicates[0].puuid,
    });
    return duplicates[0].puuid;
  }
  if (duplicates.length > 0 && source === "riot") {
    for (const duplicate of duplicates) {
      if (duplicate.tracked_count === 0) {
        mergeSummonerReferences(duplicate.puuid, summoner.puuid);
        const result = db.prepare("DELETE FROM summoner WHERE puuid = ?").run(duplicate.puuid);
        console.log("[db] merged duplicate summoner:", {
          stalePuuid: duplicate.puuid,
          canonicalPuuid: summoner.puuid,
          deleted: result.changes,
        });
      }
    }
  }

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
  console.log("[db] upsertSummoner done:", { puuid: summoner.puuid });
  return summoner.puuid;
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
    upsertSummoner(
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
        const deletedPlayerStats = db
          .prepare(`DELETE FROM player_stats WHERE game_id IN (${orphanPlaceholders})`)
          .run(...orphanIds).changes;
        console.log("[db] delete player_stats", deletedPlayerStats);
        const deletedGameAugments = db
          .prepare(`DELETE FROM game_augments WHERE game_id IN (${orphanPlaceholders})`)
          .run(...orphanIds).changes;
        console.log("[db] delete game_augments", deletedGameAugments);
        const deletedParticipantAugments = db
          .prepare(
            `DELETE FROM match_participant_augments WHERE game_id IN (${orphanPlaceholders})`,
          )
          .run(...orphanIds).changes;
        console.log("[db] delete match_participant_augments", deletedParticipantAugments);
        const deletedParticipants = db
          .prepare(`DELETE FROM match_participants WHERE game_id IN (${orphanPlaceholders})`)
          .run(...orphanIds).changes;
        console.log("[db] delete match_participants", deletedParticipants);
        const deletedGameRows = db
          .prepare(`DELETE FROM games WHERE game_id IN (${orphanPlaceholders})`)
          .run(...orphanIds).changes;
        console.log("[db] delete games", deletedGameRows);
      }
      deletedGames = orphanIds.length;
    }

    const deletedSummonerRows = db
      .prepare("DELETE FROM summoner WHERE puuid = ?")
      .run(puuid).changes;
    console.log("[db] delete summoner", deletedSummonerRows);
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
