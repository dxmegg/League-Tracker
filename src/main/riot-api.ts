import * as db from "./db";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getCurrentSummoner } from "./lcu";
import { getDataDir } from "./paths";
import type {
  ProfileData,
  ProfileRankedEntry,
  RiotAccountConfig,
  RiotSyncProgress,
} from "../shared/api";
import { PROXY_BASE_URL } from "../shared/proxy";
import { isRiotNotFound } from "../shared/diagnostics-rules";
import { markFailure, markSuccess } from "./last-success";
import { logNetwork } from "./logger";
import { nextSlot } from "../shared/rate-limit";
import { getChampionDataVersion } from "./dragon";

export type RiotRegionalRoute = "americas" | "europe" | "asia" | "sea";

export class RiotApiError extends Error {
  constructor(
    readonly status: number,
    readonly endpoint: string,
  ) {
    super(`Riot API returned ${status} for ${endpoint}`);
  }
}

const ROUTES: Record<string, RiotRegionalRoute> = {
  americas: "americas",
  na1: "americas",
  br1: "americas",
  la1: "americas",
  la2: "americas",
  oce: "americas",
  oc1: "americas",
  europe: "europe",
  euw1: "europe",
  eun1: "europe",
  tr1: "europe",
  ru: "europe",
  me1: "europe",
  asia: "asia",
  kr: "asia",
  jp1: "asia",
  sea: "sea",
  sg2: "sea",
  ph2: "sea",
  th2: "sea",
  tw2: "sea",
  vn2: "sea",
};

export function regionalRoute(platform: string | null | undefined): RiotRegionalRoute {
  if (!platform) {
    console.warn("[riot-api] regionalRoute called without platform, defaulting to europe");
    return "europe";
  }
  const normalized = platform.trim().toLowerCase();
  return ROUTES[normalized] ?? "americas";
}

export function normalizeMatchId(value: string): number | null {
  const id = Number(value.includes("_") ? value.slice(value.lastIndexOf("_") + 1) : value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function toMatchV5Id(gameId: number, platform: string): string {
  return `${platform.trim().toUpperCase()}_${gameId}`;
}

// `localPuuid` is the id this database knows the account by, when it differs from the API's `puuid`
export function normalizeMatchPayload(
  match: any,
  matchId: number,
  puuid: string,
  localPuuid = puuid,
) {
  const stored = (id: unknown) => (id === puuid ? localPuuid : (id ?? null));
  const info = match?.info;
  if (!info || !Array.isArray(info.participants)) {
    throw new Error(`Riot match ${matchId} did not include participant data`);
  }

  return {
    gameId: matchId,
    queueId: Number(info.queueId) || 0,
    gameMode: String(info.gameMode ?? "UNKNOWN"),
    gameCreation: Number(info.gameCreation) || 0,
    gameDuration: Number(info.gameDuration) || 0,
    gameVersion: String(info.gameVersion ?? ""),
    participants: info.participants.map((participant: any, index: number) => ({
      ...participant,
      participantId: participant.participantId ?? index + 1,
      summonerName: participant.riotIdGameName ?? participant.summonerName ?? null,
      riotIdGameName: participant.riotIdGameName ?? null,
      riotIdTagline: participant.riotIdTagline ?? null,
      puuid: stored(participant.puuid),
    })),
    participantIdentities: info.participants.map((participant: any) => ({
      player: {
        puuid: stored(participant.puuid),
        gameName: participant.riotIdGameName,
        tagLine: participant.riotIdTagline,
        summonerName: participant.summonerName,
        profileIcon: participant.profileIcon,
      },
    })),
    ownerPuuid: localPuuid,
  };
}

type StoredRiotAccount = RiotAccountConfig;

export function readAccounts(): StoredRiotAccount[] {
  const raw = db.getSetting("riot_accounts");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as StoredRiotAccount[];
    const unique = new Map<string, StoredRiotAccount>();
    for (const account of parsed) {
      const key = accountKey(account);
      if (!unique.has(key)) unique.set(key, account);
    }
    return [...unique.values()];
  } catch {
    return [];
  }
}

function writeAccounts(accounts: StoredRiotAccount[]) {
  db.setSetting("riot_accounts", JSON.stringify(accounts));
}

function accountKey(account: Pick<StoredRiotAccount, "gameName" | "tagLine" | "platform">): string {
  return [
    account.gameName.trim().toLocaleLowerCase(),
    account.tagLine.trim().toLocaleLowerCase(),
    account.platform.trim().toLocaleLowerCase(),
  ].join("\u0000");
}

export function getRiotAccounts(): RiotAccountConfig[] {
  return readAccounts();
}

export function saveRiotAccount(account: RiotAccountConfig): void {
  const stored = readAccounts();
  const normalized = {
    id: account.id,
    gameName: account.gameName.trim(),
    tagLine: account.tagLine.trim(),
    platform: account.platform.trim().toLowerCase(),
  };
  const existingIndex = stored.findIndex((existing) => existing.id === normalized.id);
  if (existingIndex >= 0) {
    stored[existingIndex] = normalized;
    writeAccounts(stored);
    return;
  }

  if (stored.some((existing) => accountKey(existing) === accountKey(normalized))) return;
  stored.push(normalized);
  writeAccounts(stored);
}

export function removeRiotAccount(id: string): void {
  writeAccounts(readAccounts().filter((account) => account.id !== id));
}

export function seedDefaultRiotAccounts(): void {
  const stored = readAccounts();
  const summoners = db
    .getDatabase()
    .prepare(
      "SELECT game_name, tag_line, platform FROM summoner WHERE game_name IS NOT NULL AND tag_line IS NOT NULL AND game_name != '' AND tag_line != ''",
    )
    .all() as Array<{
    game_name: string;
    tag_line: string;
    platform: string | null;
  }>;
  let seeded = 0;
  for (const summoner of summoners) {
    const gameName = summoner.game_name.trim();
    const tagLine = summoner.tag_line.trim();
    if (
      !gameName ||
      !tagLine ||
      stored.some(
        (account) =>
          account.gameName.trim().toLocaleLowerCase() === gameName.toLocaleLowerCase() &&
          account.tagLine.trim().toLocaleLowerCase() === tagLine.toLocaleLowerCase(),
      )
    ) {
      continue;
    }
    const account = {
      id: crypto.randomUUID(),
      gameName,
      tagLine,
      platform: summoner.platform?.trim().toLowerCase() || "euw1",
    };
    saveRiotAccount(account);
    stored.push(account);
    seeded += 1;
  }
  console.log(`[riot] seeded ${seeded} accounts from summoner table`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A personal key's window is long enough that three retries of two, four and
// eight seconds do not cover it; the loop must stay alive long enough for the
// window to clear.
const MAX_RATE_LIMIT_RETRIES = 20;
let rateLimitPausedUntil = 0;
// Start times handed out, oldest first; only the largest window's worth is kept
const requestStarts: number[] = [];

async function acquireRequestSlot(): Promise<void> {
  const now = Date.now();
  const startAt = nextSlot(requestStarts, Math.max(now, rateLimitPausedUntil));
  requestStarts.push(startAt);
  if (requestStarts.length > 100) requestStarts.shift();
  if (startAt > now) await sleep(startAt - now);
}
async function riotFetch<T>(
  url: string,
  platform: string,
  _key?: string,
  tag?: string,
): Promise<T> {
  const original = new URL(url);
  const originalQuery = original.search.slice(1);
  // The Worker expects the regional route (americas, europe, asia, sea) in the
  // query parameter, matching the regional Match-V5 hostname.
  const proxyUrl = `${PROXY_BASE_URL}/proxy${original.pathname}?platform=${encodeURIComponent(platform)}${
    originalQuery ? `&${originalQuery}` : ""
  }`;
  const logPrefix = tag ? `[sync ${tag}] ` : "";
  for (let attempt = 0; ; attempt++) {
    await acquireRequestSlot();
    const startedAt = performance.now();
    const response = await fetch(proxyUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    }).catch((err: unknown) => {
      markFailure("riot", "Not reachable");
      logNetwork("riot", "unreachable", startedAt);
      throw err;
    });
    logNetwork("riot", response.status, startedAt);
    if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      const retryAfterHeader = response.headers.get("Retry-After");
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
      const retryAfterMs =
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : Math.min(2 ** attempt * 1000, 60_000);
      rateLimitPausedUntil = Math.max(rateLimitPausedUntil, Date.now() + retryAfterMs);
      console.warn(
        `${logPrefix}Riot API 429 on ${proxyUrl}, pausing for ${Math.round(retryAfterMs / 1000)}s (attempt ${attempt + 1}/${MAX_RATE_LIMIT_RETRIES})`,
      );
      continue;
    }
    const body = await response.text();
    if (!response.ok) {
      // "No such thing" is an answer too
      if (isRiotNotFound(response.status, body)) markSuccess("riot");
      else markFailure("riot", `HTTP ${response.status}`);
      if (response.status !== 404) {
        console.error(
          `${logPrefix}Riot API error ${response.status} for ${proxyUrl}: ${body || "<empty response>"}`,
        );
      }
      throw new RiotApiError(response.status, proxyUrl);
    }
    const parsed = JSON.parse(body) as T;
    markSuccess("riot");
    return parsed;
  }
}

export async function accountByRiotId(
  route: RiotRegionalRoute,
  platform: string,
  gameName: string,
  tagLine: string,
  tag?: string,
): Promise<{ puuid: string; gameName: string; tagLine: string }> {
  return riotFetch(
    `https://${route}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
    platform,
    undefined,
    tag,
  );
}

export async function resolveRiotPuuid(
  gameName: string,
  tagLine: string,
  platform: string,
): Promise<string> {
  const route = regionalRoute(platform);
  const url = `https://${route}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  const data = await riotFetch<{ puuid: string }>(url, route, undefined, `account-v1-${gameName}`);
  if (!data?.puuid) {
    console.warn("[riot] resolveRiotPuuid missing puuid:", { gameName, tagLine });
    throw new Error(`Could not resolve puuid for ${gameName}#${tagLine}`);
  }
  return data.puuid;
}

export async function getProfileDataByRiotId(
  gameName: string,
  tagLine: string,
  platform: string,
  force = false,
): Promise<ProfileData | { error: string } | null> {
  const normalizedGameName = gameName.trim();
  const normalizedTagLine = tagLine.trim();
  const normalizedPlatform = platform.trim().toLowerCase();
  const route = regionalRoute(normalizedPlatform);
  let account: { puuid: string; gameName: string; tagLine: string };
  try {
    account = await accountByRiotId(
      route,
      normalizedPlatform,
      normalizedGameName,
      normalizedTagLine,
    );
  } catch (err) {
    console.error("[profile] accountByRiotId failed:", err);
    throw err;
  }
  const profile = await getProfileData(account.puuid, normalizedPlatform, force);
  return profile
    ? {
        ...profile,
        gameName: account.gameName || normalizedGameName,
        tagLine: account.tagLine || normalizedTagLine,
      }
    : null;
}

interface SummonerResponse {
  id: string;
  profileIconId: number;
  summonerLevel: number;
  puuid: string;
}

interface MasteryResponse {
  championId: number;
  championPoints: number;
  championLevel: number;
}

interface LeagueResponse {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
}

async function riotFetchOrNull<T>(url: string, platform: string): Promise<T | null> {
  try {
    return await riotFetch<T>(url, platform);
  } catch (err) {
    if (err instanceof RiotApiError && err.status === 404) return null;
    throw err;
  }
}

async function riotFetchOrNullCached<T>(
  url: string,
  platform: string,
  cachedValue: T | null,
  logLabel: string,
): Promise<T | null> {
  try {
    return await riotFetchOrNull<T>(url, platform);
  } catch (err) {
    if (err instanceof RiotApiError && err.status === 429 && cachedValue !== null) {
      console.warn(`[profile] 429 on ${logLabel}, falling back to cached value`);
      return cachedValue;
    }
    throw err;
  }
}

function rankedEntry(
  entries: LeagueResponse[] | null,
  queueType: string,
): ProfileRankedEntry | null {
  const entry = entries?.find((candidate) => candidate.queueType === queueType);
  return entry
    ? {
        tier: entry.tier,
        rank: entry.rank,
        leaguePoints: entry.leaguePoints,
        wins: entry.wins,
        losses: entry.losses,
      }
    : null;
}

type CachedProfileMaster = {
  summoner: SummonerResponse | null;
  mastery: MasteryResponse[] | null;
  masteryScore: number | null;
  league: LeagueResponse[] | null;
  fetchedAt: number;
};
const profileMasterCache = new Map<string, CachedProfileMaster>();
const PROFILE_MASTER_TTL_MS = 10 * 60 * 1000;
type PersistedProfileMaster = {
  version: 1;
  entries: Record<string, CachedProfileMaster>;
};

const PROFILE_MASTER_FILE = () => path.join(getDataDir(), "profile-master-cache.json");

function loadProfileMasterCacheFromDisk(): void {
  try {
    const raw = fs.readFileSync(PROFILE_MASTER_FILE(), "utf8");
    const parsed = JSON.parse(raw) as PersistedProfileMaster;
    if (parsed?.version !== 1 || !parsed.entries) return;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [key, entry] of Object.entries(parsed.entries)) {
      if (entry?.fetchedAt && entry.fetchedAt > cutoff) {
        profileMasterCache.set(key, entry);
      }
    }
  } catch {
    // Missing or unreadable cache file is fine — a fresh fetch will rebuild it.
  }
}

function saveProfileMasterCacheToDisk(): void {
  try {
    const entries: Record<string, CachedProfileMaster> = {};
    for (const [key, entry] of profileMasterCache) entries[key] = entry;
    fs.writeFileSync(
      PROFILE_MASTER_FILE(),
      JSON.stringify({ version: 1, entries } satisfies PersistedProfileMaster),
    );
  } catch (err) {
    console.error("Failed to persist profile master cache:", err);
  }
}

loadProfileMasterCacheFromDisk();

export async function getProfileData(
  puuid: string,
  platform: string,
  force = false,
): Promise<ProfileData | null> {
  const normalizedPlatform = platform.trim().toLowerCase();
  const base = `https://${normalizedPlatform}.api.riotgames.com`;
  const now = Date.now();
  const cacheKey = `${normalizedPlatform}:${puuid}`;
  const cachedMaster = profileMasterCache.get(cacheKey);
  const cacheUsable =
    !force && cachedMaster && now - cachedMaster.fetchedAt < PROFILE_MASTER_TTL_MS;

  let summoner: SummonerResponse | null;
  let mastery: MasteryResponse[] | null;
  let masteryScore: number | null;
  let league: LeagueResponse[] | null;

  if (cacheUsable) {
    summoner = cachedMaster!.summoner;
    mastery = cachedMaster!.mastery;
    masteryScore = cachedMaster!.masteryScore;
    league = cachedMaster!.league;
  } else {
    const [freshSummoner, freshMastery, freshScore] = await Promise.all([
      riotFetchOrNullCached<SummonerResponse>(
        `${base}/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`,
        normalizedPlatform,
        cachedMaster?.summoner ?? null,
        "summoner",
      ),
      riotFetchOrNullCached<MasteryResponse[]>(
        `${base}/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodeURIComponent(puuid)}`,
        normalizedPlatform,
        cachedMaster?.mastery ?? null,
        "mastery",
      ),
      riotFetchOrNullCached<number>(
        `${base}/lol/champion-mastery/v4/scores/by-puuid/${encodeURIComponent(puuid)}`,
        normalizedPlatform,
        cachedMaster?.masteryScore ?? null,
        "mastery score",
      ),
    ]);
    summoner = freshSummoner;
    mastery = freshMastery;
    masteryScore = freshScore;

    let freshLeague = await riotFetchOrNullCached<LeagueResponse[]>(
      `${base}/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`,
      normalizedPlatform,
      cachedMaster?.league ?? null,
      "league by-puuid",
    );
    if (!freshLeague && summoner?.id) {
      freshLeague = await riotFetchOrNullCached<LeagueResponse[]>(
        `${base}/lol/league/v4/entries/by-summoner/${encodeURIComponent(summoner.id)}`,
        normalizedPlatform,
        cachedMaster?.league ?? null,
        "league by-summoner",
      );
    }
    league = freshLeague;

    profileMasterCache.set(cacheKey, {
      summoner,
      mastery,
      masteryScore,
      league,
      fetchedAt: now,
    });
    saveProfileMasterCacheToDisk();
  }

  const masteryEntries = mastery ?? [];
  const topMasteryEntries = [...masteryEntries]
    .sort((left, right) => right.championPoints - left.championPoints)
    .slice(0, 5)
    .map(({ championId, championPoints, championLevel }) => ({
      championId,
      championPoints,
      championLevel,
    }));

  if (!summoner) return null;
  return {
    puuid: summoner.puuid || puuid,
    gameName: db.getSetting("riot_game_name") ?? "Summoner",
    tagLine: db.getSetting("riot_tag_line") ?? "",
    platform: normalizedPlatform,
    profileIconId: summoner.profileIconId,
    summonerLevel: summoner.summonerLevel,
    dataDragonVersion: getChampionDataVersion(),
    // Riot's live mastery totals can differ slightly from op.gg's cached snapshot.
    masteryPoints: mastery?.reduce((total, entry) => total + entry.championPoints, 0) ?? 0,
    masteryScore: masteryScore ?? 0,
    totalMasteryPoints: 0,
    totalMasteryScore: 0,
    topMasteryChampions: topMasteryEntries,
    rankedSolo: rankedEntry(league, "RANKED_SOLO_5x5"),
    rankedFlex: rankedEntry(league, "RANKED_FLEX_SR"),
  };
}

async function configuredIdentity(
  configured?: Pick<StoredRiotAccount, "gameName" | "tagLine" | "platform">,
): Promise<{
  puuid: string;
  gameName: string | null;
  tagLine: string | null;
  platform: string;
}> {
  try {
    if (configured) throw new Error("use configured account");
    const current = await getCurrentSummoner();
    if (current?.puuid) {
      const gameName = current.gameName ?? current.displayName ?? current.internalName ?? null;
      const tagLine = current.tagLine ?? null;
      const platform = db.getResolvedPlatform() ?? current.platform?.trim().toLowerCase() ?? null;
      if (!platform) {
        throw new Error("No platform configured. Start the League client once.");
      }
      db.upsertSummoner({ ...current, gameName, tagLine }, "riot");
      return { puuid: current.puuid, gameName, tagLine, platform };
    }
  } catch {
    // The Riot API path is intentionally independent of the running client.
  }

  const gameName = configured?.gameName.trim() || db.getSetting("riot_game_name")?.trim();
  const tagLine = configured?.tagLine.trim() || db.getSetting("riot_tag_line")?.trim();
  const platform = configured?.platform.trim().toLowerCase() || db.getResolvedPlatform();
  if (!platform) {
    throw new Error("No platform configured. Start the League client once.");
  }
  if (!gameName || !tagLine) {
    throw new Error("No account selected. Open the League client and try again.");
  }

  let account: { puuid: string; gameName: string; tagLine: string };
  try {
    account = await accountByRiotId(
      regionalRoute(platform),
      platform,
      gameName,
      tagLine,
      `${gameName}#${tagLine}`,
    );
  } catch (err) {
    throw new Error(friendlyRiotError(err, "account"));
  }
  db.setSetting("riot_puuid", account.puuid);
  db.upsertSummoner(
    { puuid: account.puuid, gameName: account.gameName, tagLine: account.tagLine, platform },
    "riot",
  );
  return { puuid: account.puuid, gameName: account.gameName, tagLine: account.tagLine, platform };
}

export type RiotSyncResult = {
  added: number;
  scanned: number;
  totalGames: number;
  complete: boolean;
  cancelled: boolean;
  error?: string;
};

let syncCancelRequested = false;

export function cancelRiotSync(): void {
  syncCancelRequested = true;
}

export async function syncRiotHistory(
  options: {
    refreshExisting?: boolean;
    onProgress?: (info: RiotSyncProgress) => void;
  } = {},
): Promise<RiotSyncResult> {
  syncCancelRequested = false;
  const stored = readAccounts();
  const resolvedPuuids = new Map<string, string>();
  const identities = stored.length
    ? await Promise.all(
        stored.map(async (account) => {
          const identity = await configuredIdentity(account);
          return { identity };
        }),
      )
    : [{ identity: await configuredIdentity() }];
  let added = 0;
  let scanned = 0;
  let complete = true;
  let cancelled = false;
  let error: string | undefined;
  for (const [index, { identity }] of identities.entries()) {
    if (syncCancelRequested) {
      console.log("[sync] cancelled by user");
      cancelled = true;
      break;
    }
    let result: RiotSyncResult;
    try {
      result = await syncRiotAccount(identity, resolvedPuuids, {
        ...options,
        accountIndex: index,
        accountTotal: identities.length,
      });
    } catch (err) {
      error = friendlyRiotError(err, "match");
      complete = false;
      console.error("[sync] account sync failed:", { accountIndex: index, error });
      break;
    }
    added += result.added;
    scanned += result.scanned;
    complete &&= result.complete;
    if (result.error) {
      error = result.error;
      complete = false;
      break;
    }
    if (result.cancelled) {
      cancelled = true;
      break;
    }
  }
  return {
    added,
    scanned,
    totalGames: db.getDashboardData().totalGames,
    complete: complete && !cancelled,
    cancelled,
    ...(error ? { error } : {}),
  };
}

async function syncRiotAccount(
  identity: Awaited<ReturnType<typeof configuredIdentity>>,
  resolvedPuuids: Map<string, string>,
  options: {
    refreshExisting?: boolean;
    onProgress?: (info: RiotSyncProgress) => void;
    accountIndex?: number;
    accountTotal?: number;
  } = {},
): Promise<RiotSyncResult> {
  const refreshExisting = options.refreshExisting ?? false;
  const route = regionalRoute(identity.platform);
  let puuid = identity.puuid;
  if (identity.gameName && identity.tagLine) {
    const gameName = identity.gameName.trim();
    const tagLine = identity.tagLine.trim();
    const cacheKey = `${gameName.toLowerCase()}#${tagLine.toLowerCase()}@${identity.platform}`;
    puuid = resolvedPuuids.get(cacheKey) ?? "";
    if (!puuid) {
      puuid = await resolveRiotPuuid(gameName, tagLine, identity.platform);
      resolvedPuuids.set(cacheKey, puuid);
    }
  } else {
    console.warn("[riot] syncRiotAccount missing Riot ID; using identity puuid:", {
      puuid: identity.puuid,
    });
  }
  const tag = `${identity.gameName ?? puuid}#${identity.tagLine ?? ""}`;
  // The API is asked with `puuid`; rows are written under the account this database already has
  const localPuuid =
    identity.gameName && identity.tagLine
      ? db.upsertSummoner(
          {
            puuid,
            gameName: identity.gameName,
            tagLine: identity.tagLine,
            platform: identity.platform,
          },
          "riot",
        )
      : puuid;
  const accountIndex = options.accountIndex ?? 0;
  const accountTotal = options.accountTotal ?? 1;
  const known = db.getAllKnownGameIds();
  const ignored = db.getIgnoredGameIds();
  const pageSize = 100;
  const configuredPage = Number(db.getSetting("riot_sync_page_size") ?? pageSize);
  const count = Math.min(
    100,
    Math.max(1, Number.isFinite(configuredPage) ? configuredPage : pageSize),
  );
  const ids: number[] = [];
  let cancelled = false;
  let error: string | undefined;

  for (let start = 0; start < 10_000; start += count) {
    if (syncCancelRequested) {
      console.log("[sync] cancelled by user");
      cancelled = true;
      break;
    }
    let page: string[] = [];
    try {
      page = await riotFetch<string[]>(
        `https://${route}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?start=${start}&count=${count}`,
        route,
        undefined,
        tag,
      );
    } catch (err) {
      console.error("[sync] by-puuid failed:", err);
      throw new Error(friendlyRiotError(err, "match"));
    }
    for (const raw of page) {
      const id = normalizeMatchId(raw);
      if (id === null || ids.includes(id)) continue;
      if (refreshExisting || !ignored.has(id)) ids.push(id);
    }
    options.onProgress?.({
      phase: "collecting",
      accountIndex,
      accountTotal,
      currentGame: 0,
      totalGames: ids.length,
      currentAccount: tag,
    });
    if (
      page.length < count ||
      (!refreshExisting && page.every((id) => known.has(normalizeMatchId(id) ?? -1)))
    )
      break;
  }

  let added = 0;
  let processed = 0;
  for (const [index, id] of ids.entries()) {
    if (syncCancelRequested) {
      console.log("[sync] cancelled by user");
      cancelled = true;
      break;
    }
    if (refreshExisting && index > 0) await sleep(500);
    options.onProgress?.({
      phase: "refreshing",
      accountIndex,
      accountTotal,
      currentGame: index + 1,
      totalGames: ids.length,
      currentAccount: tag,
    });
    const knownAlready = known.has(id);
    if (knownAlready && !refreshExisting) {
      processed++;
      continue;
    }
    try {
      const payload = await riotFetch<any>(
        `https://${route}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(toMatchV5Id(id, identity.platform))}`,
        route,
        undefined,
        tag,
      );
      const normalized = normalizeMatchPayload(payload, id, puuid, localPuuid);
      const trackedPentakiller = normalized.participants.find(
        (participant: any) =>
          participant.puuid === localPuuid && Number(participant.pentaKills ?? 0) >= 1,
      );
      if (knownAlready) {
        db.refreshParticipantTelemetry(normalized);
        console.log(`[sync] refreshed ${id} (${normalized.participants.length} participants)`);
      } else if (db.insertGameFull(normalized, localPuuid, "riot-sync")) {
        added++;
      }
      if (trackedPentakiller) {
        try {
          const timeline = await fetchMatchTimeline(id, identity.platform);
          const pentakillTime = findPentakillTime(timeline, trackedPentakiller.participantId);
          if (pentakillTime !== null) {
            db.setParticipantPentakillTime(id, localPuuid, pentakillTime);
          } else {
            console.warn(`[sync ${tag}] No pentakill event found in timeline for match ${id}`);
          }
        } catch (timelineError) {
          console.warn(
            `[sync ${tag}] Failed to fetch pentakill timeline for match ${id}:`,
            timelineError,
          );
        }
      }
      processed++;
    } catch (err) {
      if (err instanceof RiotApiError && err.status === 404) {
        console.warn(`[sync ${tag}] Match ${id} not available on Riot's servers (404), skipping.`);
        db.markIgnoredGame(id);
        processed++;
        continue;
      }
      error = `Failed at match ${index + 1} (${id}): ${friendlyRiotError(err, "match")}`;
      console.error("[sync] stopping after match failure:", { matchNumber: index + 1, id, error });
      break;
    }
  }

  if (!error) {
    db.setRiotSyncState(localPuuid, identity.platform, ids[0] ?? null, ids.length < 10_000);
  }
  return {
    added,
    scanned: error ? processed : ids.length,
    totalGames: db.getDashboardData().totalGames,
    complete: !error && !cancelled && ids.length < 10_000,
    cancelled,
    ...(error ? { error } : {}),
  };
}

export function friendlyRiotError(err: unknown, context: "account" | "match" = "match"): string {
  if (err instanceof RiotApiError) {
    if (err.status === 401 || err.status === 403)
      return "Riot API key is missing, invalid, or expired";
    if (err.status === 404) {
      return context === "account"
        ? "Riot account not found. Check that the GameName#TagLine is correct and that the account exists on the selected server."
        : "Riot match not found.";
    }
    if (err.status === 429) return "Riot API rate limit reached — try again later";
    if (err.status >= 500) return "Riot API is temporarily unavailable";
  }
  return err instanceof Error ? err.message : String(err);
}

function findPentakillTime(timeline: any, participantId: number): number | null {
  const events = (timeline?.info?.frames ?? []).flatMap((frame: any) =>
    Array.isArray(frame?.events) ? frame.events : [],
  );
  const killEvents = events
    .filter((event: any) => event?.type === "CHAMPION_KILL" && typeof event?.timestamp === "number")
    .sort((a: any, b: any) => a.timestamp - b.timestamp);
  let streak: any[] = [];
  for (const event of killEvents) {
    if (event.victimId === participantId) {
      streak = [];
      continue;
    }
    if (event.killerId !== participantId || typeof event.victimId !== "number") continue;
    streak = streak.filter((kill) => event.timestamp - kill.timestamp <= 10_000);
    streak.push(event);
    const distinctVictims = new Set(streak.map((kill) => kill.victimId));
    if (distinctVictims.size >= 5) {
      return Math.floor(event.timestamp / 1000);
    }
  }
  return null;
}

export async function fetchMatchTimeline(gameId: number, platform: string): Promise<any> {
  const route = regionalRoute(platform);
  // Riot Match-V5 requires the matchId to carry the platform prefix
  // (EUN1_4011462332), while we store the bare numeric game_id in SQLite.
  const fullMatchId = `${platform.toUpperCase()}_${gameId}`;
  const payload = await riotFetch<any>(
    `https://${route}.api.riotgames.com/lol/match/v5/matches/${fullMatchId}/timeline`,
    route,
    undefined,
    `timeline-${gameId}`,
  );
  return payload;
}
