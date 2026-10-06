import { db } from "../db";
import zlib from "zlib";
import type { QueueStat } from "../../shared/api";
import {
  ARENA_QUEUE_IDS,
  QUEUE_GROUP_ARENA,
  QUEUE_SCOPE_NORMAL,
  QUEUE_SCOPE_ARAM,
  QUEUE_SCOPE_ARENA,
  QUEUE_SCOPE_MAYHEM,
  QUEUE_SCOPE_RANKED,
  QUEUE_SCOPE_REST,
} from "../../shared/queues";
import {
  applyQueueFilter,
  applyTimeFilter,
  localGamesFilter,
  hideRemakes,
  statsSource,
  EXCLUDED_STATS_SQL,
  GAME_MAX_STATS_SQL,
} from "./filters";
import { extractRunes, displayName } from "./payloads";

export const MATCH_SORT_COLUMNS: Record<string, string> = {
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

export function matchOrderBy(sort?: string, sortDir?: string): string {
  const key = sort && MATCH_SORT_COLUMNS[sort] ? sort : "date";
  const dir = sortDir === "asc" ? "ASC" : "DESC";
  const parts: string[] = [];
  // Games without a score belong at the bottom whichever way we're sorting
  if (key === "score") parts.push("ps.score_raw IS NULL");
  parts.push(`${MATCH_SORT_COLUMNS[key]} ${dir}`);
  if (key !== "date") parts.push("g.game_creation DESC");
  return parts.join(", ");
}

export const MULTIKILL_COLUMNS: Record<string, string> = {
  doubles: "ps.double_kills",
  triples: "ps.triple_kills",
  quadras: "ps.quadra_kills",
  pentas: "ps.penta_kills",
};

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
export function getMatchParticipants(gameId: number): any[] {
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

export function getChampionMatchHistory(
  championId: number,
  limit: number,
  offset: number,
  patch?: string,
  queue?: number,
  account?: string,
): { matches: any[]; total: number } {
  const source = statsSource(account);
  const hasConcreteAccount = account !== undefined && account !== "all";
  const playerPuuidSql = account ? "ps.puuid" : "g.puuid";
  const where = ["ps.champion_id = ?"];
  where.push(source.accountFilter);
  const params: any[] = hasConcreteAccount ? [championId, account] : [championId];
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
    SELECT g.game_id, g.game_creation, g.game_duration, g.is_remake, g.favorite, g.queue_id,
           ${playerPuuidSql} as puuid,
           ps.champion_id, ps.win, ps.kills, ps.deaths, ps.assists,
           ps.double_kills, ps.triple_kills, ps.quadra_kills, ps.penta_kills,
           ps.total_damage_dealt, ps.total_damage_taken, ps.total_heal, ps.gold_earned, ps.cs,
           ps.score, ps.score_badge,
           COALESCE(ps.spell1, (
             SELECT mp.spell1 FROM match_participants mp
             WHERE mp.game_id = g.game_id AND mp.puuid = ${playerPuuidSql}
           )) as spell1,
           COALESCE(ps.spell2, (
             SELECT mp.spell2 FROM match_participants mp
             WHERE mp.game_id = g.game_id AND mp.puuid = ${playerPuuidSql}
           )) as spell2,
           ps.item0, ps.item1, ps.item2, ps.item3, ps.item4, ps.item5, ps.item6,
           (SELECT GROUP_CONCAT(mp.rune0 || ',' || mp.rune1 || ',' || mp.rune2 || ',' || mp.rune3 || ',' || mp.rune4 || ',' || mp.rune5)
             FROM match_participants mp
             WHERE mp.game_id = g.game_id AND mp.puuid = ${playerPuuidSql}
               AND mp.rune0 IS NOT NULL AND mp.rune0 > 0) as rune_ids,
           (SELECT mp.primary_style FROM match_participants mp
             WHERE mp.game_id = g.game_id AND mp.puuid = ${playerPuuidSql}) as primary_style,
           (SELECT mp.secondary_style FROM match_participants mp
             WHERE mp.game_id = g.game_id AND mp.puuid = ${playerPuuidSql}) as secondary_style,
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

// One account's name and icon as that game recorded them. Covers databases
// built purely from an import, where the client has never connected and the
// summoner table has no icon.
export function identityFromGame(
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
          AND g.queue_id NOT IN (${EXCLUDED_STATS_SQL})
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
      WHERE mp.puuid = ?
        AND mp.is_remake = 0
        AND mp.queue_id IN (${arenaPlaceholders})
        AND mp.queue_id NOT IN (${EXCLUDED_STATS_SQL})
    `)
    .get(puuid, ...ARENA_QUEUE_IDS) as { games: number; wins: number } | undefined;
  const nonArenaRow = db
    .prepare(`
      SELECT queue_id, COUNT(*) AS games, SUM(win) AS wins
      FROM match_participants
      WHERE puuid = ? AND is_remake = 0
        AND queue_id IS NOT NULL
        AND queue_id NOT IN (${arenaPlaceholders})
        AND queue_id NOT IN (${EXCLUDED_STATS_SQL})
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
        AND mp.queue_id NOT IN (${EXCLUDED_STATS_SQL})
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
        AND queue_id NOT IN (${EXCLUDED_STATS_SQL})
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
