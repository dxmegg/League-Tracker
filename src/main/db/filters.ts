import { getSetting } from "./settings";
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
} from "../../shared/queues";

// Poro-Snax (base and upgraded) is handed out for free, so it skews item stats
export const EXCLUDED_ITEM_IDS = [2052, 220013];

// Queues switched off on the Settings page, as stored in hidden_queues. An
// absent key means the setting was never written; an empty one means the user
// has everything switched on.
export function getHiddenQueues(): number[] {
  const raw = getSetting("hidden_queues");
  if (!raw) return [];
  return raw
    .split(",")
    .map(Number)
    .filter((id) => Number.isFinite(id));
}

// Appends queue conditions to a query's WHERE list. An explicit queue filter
// wins; otherwise the queues switched off in Settings are excluded everywhere.
export function applyQueueFilter(
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

export function applyTimeFilter(timePeriod?: "24h" | "7d" | "30d" | "full"): {
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
export function localGamesFilter(alias: string): string {
  return `${alias}.source != 'search-import' AND ${alias}.puuid IN (SELECT puuid FROM summoner)`;
}

// Remakes are already left out of every stat; this setting takes them out of
// the match list as well. An absent key means they stay visible.
export function hideRemakes(): boolean {
  return getSetting("hide_remakes") === "true";
}

export function statsSource(account?: string): {
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

export const EXCLUDED_STATS_SQL = NO_STATS_QUEUE_IDS.join(", ");
export const EXCLUDED_CS_SQL = [...NO_CS_QUEUE_IDS, ...NO_STATS_QUEUE_IDS].join(", ");

// Filters for a query over match_participants. is_remake, queue_id and
// game_version are carried on the participant rows themselves, so nothing here
// has to join back to games.
export function participantFilter(patch?: string, queue?: number, alias = "mp") {
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
