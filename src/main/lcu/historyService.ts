import * as db from "../db";
import { markFailure, markSuccess } from "../last-success";
import { logNetwork } from "../logger";
import { parseTimeline } from "../timeline";
import { MAYHEM_QUEUE_IDS } from "../../shared/queues";
import { lcuRequest, getCurrentSummoner, isInGame } from "./connection";

// --- Deep history (SGP) ---------------------------------------------------
//
// The LCU's match list is capped at 20 games: begIndex/endIndex are accepted
// but ignored by the backend, so paging it just returns the same 20 over and
// over. The client itself gets its ids from Riot's player-platform service
// instead, which does honour startIndex/count and reaches back years. We use
// the same endpoint to get ids, then hydrate each one through the LCU — that
// still returns full detail for arbitrary old games, in the shape we parse.

const SGP_HOSTS = [
  "https://usw2-red.pp.sgp.pvp.net",
  "https://euc1-red.pp.sgp.pvp.net",
  "https://apne1-red.pp.sgp.pvp.net",
  "https://apse1-red.pp.sgp.pvp.net",
];

const SGP_HOST_BY_REGION: Record<string, string> = {
  NA: SGP_HOSTS[0],
  BR: SGP_HOSTS[0],
  LAN: SGP_HOSTS[0],
  LAS: SGP_HOSTS[0],
  LA1: SGP_HOSTS[0],
  LA2: SGP_HOSTS[0],
  EUW: SGP_HOSTS[1],
  EUNE: SGP_HOSTS[1],
  EUN: SGP_HOSTS[1],
  TR: SGP_HOSTS[1],
  RU: SGP_HOSTS[1],
  ME: SGP_HOSTS[1],
  KR: SGP_HOSTS[2],
  JP: SGP_HOSTS[2],
  OCE: SGP_HOSTS[3],
  OC1: SGP_HOSTS[3],
  PH: SGP_HOSTS[3],
  SG: SGP_HOSTS[3],
  TH: SGP_HOSTS[3],
  TW: SGP_HOSTS[3],
  VN: SGP_HOSTS[3],
};

const SGP_PAGE_SIZE = 100;

// Safety bound only. Paging normally ends when the service returns a short
// page; this just stops a runaway loop, and hitting it is reported rather than
// silently trimming someone's history.
export const SGP_MAX_PAGES = 2000;

// Shard probing walks candidates in turn, so one unresponsive host must not
// stall the whole search. Paging gets longer, since those requests do real work.
const SGP_PROBE_TIMEOUT_MS = 8_000;

const SGP_PAGE_TIMEOUT_MS = 30_000;

let sgpHost: string | null = null;

// Match-V5 doesn't serve Mayhem, so its timelines can only come from the client
async function fetchClientTimeline(gameId: number): Promise<void> {
  const raw: any = await lcuRequest(`/lol-match-history/v1/game-timelines/${gameId}`);
  const parsed = parseTimeline(raw);
  if (parsed.frames.length === 0) throw new Error(`LCU request failed: 404 empty ${gameId}`);
  db.insertTimeline(gameId, parsed, raw);
}

// The match history service has what the client leaves out for Mayhem and ARAM: the whole
// timeline (items, skill order, per-minute stats) and every number of the match summary
async function fetchFullMatchData(gameId: number): Promise<void> {
  const known = db.resolveGamePlatform(gameId);
  const guess = known ? null : db.platformGuesses(gameId);
  const platforms = known ? [known] : guess!.platforms;
  if (platforms.length === 0) throw new Error(`No platform found for game ${gameId}`);
  const token = await fetchSgpToken();
  const host = await resolveSgpHost((await getCurrentSummoner()).puuid, token);

  const get = async (platform: string, kind: "SUMMARY" | "DETAILS"): Promise<any> => {
    const response = await historyFetch(
      `${host}/match-history-query/v1/products/lol/${platform.toUpperCase()}_${gameId}/${kind}`,
      token,
    );
    if (!response.ok) throw new SgpHttpError(response.status, kind);
    const body: any = await response.json();
    return body.json ?? body;
  };

  let platform = "";
  let summary: any;
  // Kept for the case where no server has the game: anything but a 404 says nothing about it
  let failure: unknown;
  for (const candidate of platforms) {
    try {
      const answer = await get(candidate, "SUMMARY");
      // A guessed server may hold an older game under this id
      if (guess && !(Math.abs(answer.gameCreation - guess.created) < 60 * 60 * 1000)) continue;
      platform = candidate;
      summary = answer;
      break;
    } catch (err) {
      if (!(err instanceof SgpHttpError && err.status === 404)) failure ??= err;
    }
  }
  if (!platform && failure) throw failure;
  if (!platform) throw new SgpHttpError(404, `SUMMARY on ${platforms.join(", ")}`);
  const details = await get(platform, "DETAILS");
  const parsed = parseTimeline(details);
  if (parsed.frames.length === 0) throw new Error(`Empty timeline for game ${gameId}`);
  db.refreshParticipantTelemetry({ ...summary, gameId });
  db.insertTimeline(gameId, parsed, details);
}

// The older sources, so a game still gets a timeline if the history service fails
async function fetchFallbackTimeline(gameId: number, queueId: number): Promise<void> {
  if (db.getTimelineStatus(gameId)?.frame_count) return;
  if (MAYHEM_QUEUE_IDS.includes(queueId)) await fetchClientTimeline(gameId);
  else await db.fetchAndStoreTimeline(gameId);
}

async function fetchMatchData(gameId: number, queueId: number): Promise<void> {
  try {
    await fetchFullMatchData(gameId);
  } catch (err) {
    await fetchFallbackTimeline(gameId, queueId).catch(() => {});
    throw err;
  }
}

const FULL_DATA_BATCH = 25;

// Asked this session; asked again after a restart instead of on every poll
const fullDataTried = new Set<number>();

// Catches up stored Mayhem and ARAM games a few per poll, since the service may drop old ones
export async function syncFullMatchData(): Promise<void> {
  const pending = db
    .listGamesMissingFullData()
    .filter((g) => !fullDataTried.has(g.game_id))
    .slice(0, FULL_DATA_BATCH);

  for (const { game_id: gameId, game_creation: created, queue_id: queueId } of pending) {
    if (await isInGame()) return;
    try {
      await fetchMatchData(gameId, queueId);
      // An answer without everything would otherwise be downloaded again on every poll
      fullDataTried.add(gameId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`[timeline] full data fetch failed for game ${gameId}: ${message}`);
      // Throttled or down says nothing about this game: leave the rest for a later poll
      if (err instanceof SgpHttpError && (err.status === 429 || err.status >= 500)) return;
      // A fresh game can be missing until Riot has written it, so only old ones are set aside
      if (Date.now() - created > 24 * 60 * 60 * 1000) fullDataTried.add(gameId);
    }
  }
}

export function autoFetchTimelineQuiet(gameId: number, queueId: number): void {
  const full = db.FULL_DATA_QUEUE_IDS.includes(queueId);
  if (!full && db.isTimelineSkippedQueue(queueId)) return;

  // Keep the post-game screen responsive; a failed timeline request must
  // not change the outcome of the match capture.
  const fetching = full ? fetchMatchData(gameId, queueId) : db.fetchAndStoreTimeline(gameId);
  void fetching.catch((err) => {
    console.log(
      `[timeline] auto-fetch failed for game ${gameId}:`,
      err instanceof Error ? err.message : err,
    );
  });
}

function sgpMatchIdsUrl(host: string, puuid: string, startIndex: number, count: number) {
  return (
    `${host}/match-history-query/v1/products/lol/player/${puuid}` +
    `?startIndex=${startIndex}&count=${count}&tagsQueryType=AND`
  );
}

// A request to the match history service, noted for Diagnostics
async function historyFetch(url: string, token: string): Promise<Response> {
  const startedAt = performance.now();
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(SGP_PAGE_TIMEOUT_MS),
  }).catch((err: unknown) => {
    markFailure("history", "Not reachable");
    logNetwork("history", "unreachable", startedAt);
    throw err;
  });
  logNetwork("history", response.status, startedAt);
  // A game the server does not have is an answer too
  if (response.ok || response.status === 404) markSuccess("history");
  else markFailure("history", `HTTP ${response.status}`);
  return response;
}

// The LCU's league-session token used to be accepted here, but the service now
// answers it with 403 "RBAC: access denied". The RSO access token is what the
// entitlement follows, and it lives an hour instead of ten minutes. The old one
// stays as a fallback in case the requirement differs by region or flips back.
export async function fetchSgpToken(): Promise<string> {
  try {
    const rso = (await lcuRequest("/lol-rso-auth/v1/authorization/access-token")) as any;
    const token = typeof rso === "string" ? rso : rso?.token;
    if (typeof token === "string" && token) return token;
  } catch {
    // Fall through to the legacy token
  }

  const legacy = (await lcuRequest("/lol-league-session/v1/league-session-token")) as any;
  if (typeof legacy !== "string" || !legacy) {
    throw new Error("League client hasn't finished signing in — try again in a moment");
  }
  return legacy;
}

// Carries the status through so a caller can tell a shard that has stopped
// serving this account apart from a service that is merely unhappy.
export class SgpHttpError extends Error {
  constructor(
    readonly status: number,
    what?: string,
  ) {
    super(`Match history service returned ${status}${what ? ` for ${what}` : ""}`);
  }
}

// A shard answers this way for a player it doesn't hold, which is what an
// account transfer or a Riot re-shard leaves us with: the remembered host is
// now the wrong one, and stays wrong until we go looking again.
export const SGP_REHOME_STATUSES = new Set([401, 403, 404]);

// The service is sharded by geography, not by game region, so the region map is
// a first guess only. Probe candidates until one answers, then remember it.
async function probeSgpHost(puuid: string, token: string, skip?: string): Promise<string | null> {
  let guess: string | undefined;
  try {
    const regionLocale = await lcuRequest("/riotclient/region-locale");
    guess = SGP_HOST_BY_REGION[String(regionLocale?.region || "").toUpperCase()];
  } catch {
    // Fall through to probing every shard
  }

  const candidates = guess ? [guess, ...SGP_HOSTS.filter((h) => h !== guess)] : SGP_HOSTS;
  for (const host of candidates) {
    if (host === skip) continue;
    try {
      const response = await fetch(sgpMatchIdsUrl(host, puuid, 0, 1), {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(SGP_PROBE_TIMEOUT_MS),
      });
      if (response.ok) {
        sgpHost = host;
        db.setSetting("sgp_host", host);
        return host;
      }
    } catch {
      // Try the next shard
    }
  }

  return null;
}

export async function resolveSgpHost(puuid: string, token: string): Promise<string> {
  if (sgpHost) return sgpHost;

  const cached = db.getSetting("sgp_host");
  if (cached && SGP_HOSTS.includes(cached)) {
    sgpHost = cached;
    return cached;
  }

  const host = await probeSgpHost(puuid, token);
  if (!host) {
    throw new Error("Could not reach Riot's match history service for your region");
  }
  return host;
}

// Nothing else ever rewrites the remembered host, so a stale one would fail the
// same way on every future run with no way out short of editing the database.
// Re-probe instead — but only replace what we have if another shard actually
// answers, since an expired token fails everywhere and is not the host's fault.
export async function rehomeSgpHost(
  puuid: string,
  token: string,
  failed: string,
): Promise<string | null> {
  sgpHost = null;
  const host = await probeSgpHost(puuid, token, failed);
  if (!host) {
    sgpHost = failed;
    return null;
  }
  console.warn(`Match history shard ${failed} no longer serves this account; moved to ${host}`);
  return host;
}

export async function fetchAllMatchIds(
  host: string,
  puuid: string,
  token: string,
  stopAfterPage: (pageIds: number[]) => boolean,
): Promise<{ ids: number[]; truncated: boolean }> {
  const ids: number[] = [];

  for (let page = 0; page < SGP_MAX_PAGES; page++) {
    const response = await historyFetch(
      sgpMatchIdsUrl(host, puuid, page * SGP_PAGE_SIZE, SGP_PAGE_SIZE),
      token,
    );
    if (!response.ok) {
      throw new SgpHttpError(response.status);
    }

    const body = await response.json();
    if (!Array.isArray(body) || body.length === 0) {
      console.log(
        `[backfill] SGP returned an empty page at startIndex=${page * SGP_PAGE_SIZE} — end of history reached`,
      );
      return { ids, truncated: false };
    }
    console.log(
      `[backfill] page ${page}: got ${body.length} ids (startIndex=${page * SGP_PAGE_SIZE})`,
    );

    // Ids arrive platform-prefixed, e.g. "NA1_5616465966"
    const pageIds: number[] = [];
    for (const id of body) {
      const gameId = Number(String(id).split("_").pop());
      if (Number.isFinite(gameId)) pageIds.push(gameId);
    }
    ids.push(...pageIds);

    // A short page means we've reached the end of the account's history
    if (body.length < SGP_PAGE_SIZE) {
      console.log(
        `[backfill] SGP returned a short page (${body.length} ids) at startIndex=${page * SGP_PAGE_SIZE} — treating as end of history`,
      );
      return { ids, truncated: false };
    }
    if (stopAfterPage(pageIds)) {
      console.log(
        `[backfill] stopAfterPage returned true at page ${page} — all ids on this page were already known`,
      );
      return { ids, truncated: false };
    }
  }

  console.log(
    `[backfill] stopped after ${SGP_MAX_PAGES} pages (${ids.length} ids) — this means the SGP page cap was hit`,
  );
  return { ids, truncated: true };
}
