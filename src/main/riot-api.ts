import * as db from "./db";
import fs from "fs";
import path from "path";
import { getCurrentSummoner } from "./lcu";
import { getDataDir } from "./paths";
import type {
  ProfileData,
  ProfileRankedEntry,
  RecentRiotMatch,
  RiotAccountConfig,
} from "../shared/api";
import { computeMatchScores, type ScoreInput } from "../shared/opScore";
import { PROXY_BASE_URL } from "../shared/proxy";
import { getChampionClasses, getChampionDataVersion, loadChampionData } from "./dragon";

export type RiotRegionalRoute = "americas" | "europe" | "asia" | "sea";
export type RiotPlatformRoute =
  | "br1"
  | "eun1"
  | "euw1"
  | "jp1"
  | "kr"
  | "la1"
  | "la2"
  | "me1"
  | "na1"
  | "oc1"
  | "ph2"
  | "ru"
  | "sg2"
  | "th2"
  | "tr1"
  | "tw2"
  | "vn2";

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

export function regionalRoute(platform: string): RiotRegionalRoute {
  const normalized = platform.trim().toLowerCase();
  return ROUTES[normalized] ?? "americas";
}

export function normalizeMatchId(value: string): number | null {
  const id = Number(value.includes("_") ? value.slice(value.lastIndexOf("_") + 1) : value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

type RecentMatchResponse = {
  info?: {
    gameCreation?: number;
    gameDuration?: number;
    queueId?: number;
    participants?: Array<{
      puuid?: string;
      teamPosition?: string;
      win?: boolean;
      championId?: number;
      kills?: number;
      deaths?: number;
      assists?: number;
      cs?: number;
      participantId?: number;
      teamId?: number;
      doubleKills?: number;
      tripleKills?: number;
      quadraKills?: number;
      pentaKills?: number;
      totalDamageDealtToChampions?: number;
      totalDamageTaken?: number;
      goldEarned?: number;
      totalHeal?: number;
      totalMinionsKilled?: number;
      neutralMinionsKilled?: number;
    }>;
  };
};

type CachedMatches = { matches: RecentRiotMatch[]; fetchedAt: number };
const recentMatchesCache = new Map<string, CachedMatches>();
const RECENT_MATCHES_TTL_MS = 5 * 60 * 1000;

function recentMatchesCacheKey(puuid: string, platform: string): string {
  return `${platform.toLowerCase()}:${puuid}`;
}

type CachedPayload = { payload: any; fetchedAt: number };
const recentPayloadCache = new Map<number, CachedPayload>();
const RECENT_PAYLOAD_TTL_MS = 10 * 60 * 1000;

function cachePayload(gameId: number, payload: any): void {
  recentPayloadCache.set(gameId, { payload, fetchedAt: Date.now() });
}

function getCachedPayload(gameId: number): any | null {
  const entry = recentPayloadCache.get(gameId);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > RECENT_PAYLOAD_TTL_MS) {
    recentPayloadCache.delete(gameId);
    return null;
  }
  return entry.payload;
}

type RecentMatchesProgressListener = (current: number, total: number) => void;
let recentMatchesProgressListener: RecentMatchesProgressListener | null = null;

export function setRecentMatchesProgressListener(
  listener: RecentMatchesProgressListener | null,
): void {
  recentMatchesProgressListener = listener;
}

export async function getRecentRiotMatches(
  puuid: string,
  platform: string,
  start: number,
  count: number,
  forceNewest = false,
): Promise<{ matches: RecentRiotMatch[]; total: number }> {
  const route = regionalRoute(platform);
  const safeCount = Math.max(0, Math.min(Math.floor(count), 100));
  const safeStart = Math.max(0, Math.floor(start));
  if (safeCount === 0) return { matches: [], total: 0 };

  const cacheKey = recentMatchesCacheKey(puuid, platform);
  const cached = recentMatchesCache.get(cacheKey);
  const now = Date.now();
  if (forceNewest) {
    recentMatchesCache.delete(cacheKey);
    recentPayloadCache.clear();
  }
  const ttlOk = !forceNewest && !!cached && now - cached.fetchedAt < RECENT_MATCHES_TTL_MS;
  const needed = safeStart + safeCount;

  if (ttlOk && cached!.matches.length >= needed) {
    recentMatchesProgressListener?.(needed, needed);
    return {
      matches: cached!.matches.slice(safeStart, safeStart + safeCount),
      total: cached!.matches.length,
    };
  }

  const alreadyHave = ttlOk ? cached!.matches.length : 0;
  const ids = await riotFetch<string[]>(
    `https://${route}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?start=0&count=${needed}`,
    platform,
  );
  const haveIds = new Set(ttlOk ? cached!.matches.map((match) => match.gameId) : []);
  const knownLocally = db.getKnownGameIdsForPuuid(puuid);
  const idsParsed = ids
    .map((rawId) => ({ rawId, gameId: normalizeMatchId(rawId) }))
    .filter((entry): entry is { rawId: string; gameId: number } => entry.gameId !== null)
    .slice(0, needed);
  const newIds = idsParsed.filter(
    (entry) => !haveIds.has(entry.gameId) && !knownLocally.has(entry.gameId),
  );
  const alreadyStoredIds = idsParsed.filter(
    (entry) => !haveIds.has(entry.gameId) && knownLocally.has(entry.gameId),
  );

  let completed = alreadyHave;
  const newMatches = await Promise.all(
    newIds.map(async ({ rawId }): Promise<RecentRiotMatch | null> => {
      try {
        const gameId = normalizeMatchId(rawId);
        if (gameId === null) return null;

        const payload = await riotFetch<RecentMatchResponse>(
          `https://${route}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(rawId)}`,
          platform,
        );
        cachePayload(gameId, payload);
        const info = payload.info;
        const participant = info?.participants?.find((entry) => entry.puuid === puuid);
        if (!info || !participant) return null;

        await loadChampionData();
        const allParticipants = info.participants ?? [];
        const scoreInputs: ScoreInput[] = allParticipants.map((entry, index) => ({
          participantId: entry.participantId ?? index + 1,
          teamId: entry.teamId ?? (index < 5 ? 100 : 200),
          championId: Number(entry.championId) || 0,
          kills: Number(entry.kills) || 0,
          deaths: Number(entry.deaths) || 0,
          assists: Number(entry.assists) || 0,
          doubleKills: Number(entry.doubleKills) || 0,
          tripleKills: Number(entry.tripleKills) || 0,
          quadraKills: Number(entry.quadraKills) || 0,
          pentaKills: Number(entry.pentaKills) || 0,
          totalDamageDealtToChampions: Number(entry.totalDamageDealtToChampions) || 0,
          totalDamageTaken: Number(entry.totalDamageTaken) || 0,
          goldEarned: Number(entry.goldEarned) || 0,
          totalHeal: Number(entry.totalHeal) || 0,
          win: entry.win === true,
        }));
        const ourScore = participant.participantId
          ? computeMatchScores(scoreInputs, getChampionClasses()).get(participant.participantId)
          : undefined;

        return {
          gameId,
          win: participant.win === true,
          championId: Number(participant.championId) || 0,
          kills: Number(participant.kills) || 0,
          deaths: Number(participant.deaths) || 0,
          assists: Number(participant.assists) || 0,
          cs:
            Number(participant.totalMinionsKilled ?? 0) +
            Number(participant.neutralMinionsKilled ?? 0),
          score: ourScore?.score ?? null,
          gameCreation: Number(info.gameCreation) || 0,
          gameDuration: Number(info.gameDuration) || 0,
          queueId: Number(info.queueId) || 0,
          teamPosition: participant.teamPosition ?? null,
        };
      } finally {
        completed += 1;
        recentMatchesProgressListener?.(completed, needed);
      }
    }),
  );

  const filtered = newMatches.filter((m): m is RecentRiotMatch => m !== null);
  const storedStubs =
    alreadyStoredIds.length > 0
      ? db
          .getRecentRiotMatchStubs(puuid, alreadyStoredIds.length * 4)
          .filter((stub) => alreadyStoredIds.some((entry) => entry.gameId === stub.gameId))
      : [];
  const merged = [...filtered, ...storedStubs, ...(ttlOk ? cached!.matches : [])].sort(
    (a, b) => b.gameCreation - a.gameCreation,
  );
  const deduped = merged.filter(
    (match, index, arr) => arr.findIndex((other) => other.gameId === match.gameId) === index,
  );
  recentMatchesCache.set(cacheKey, { matches: deduped, fetchedAt: now });
  const matches = deduped.slice(0, needed);

  return {
    matches: matches.slice(safeStart, safeStart + safeCount),
    total: ids.length,
  };
}

const IMPORT_CONCURRENCY = 3;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<Array<{ ok: true; value: R } | { ok: false; error: unknown }>> {
  const results: Array<{ ok: true; value: R } | { ok: false; error: unknown }> = new Array(
    items.length,
  );
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      try {
        results[index] = { ok: true, value: await worker(items[index], index) };
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

export async function importRecentRiotMatches(
  puuid: string,
  platform: string,
  count: number,
): Promise<{ imported: number; scanned: number; totalAvailable: number }> {
  const route = regionalRoute(platform);
  console.log("[import] starting for", puuid, "platform", platform, "count", count);
  const safeCount = Math.max(1, Math.min(Math.floor(count), 100));

  const ids = await riotFetch<string[]>(
    `https://${route}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?start=0&count=${safeCount}`,
    platform,
  );
  console.log("[import] Riot returned", ids.length, "ids, first 3:", ids.slice(0, 3));

  const candidates = ids
    .map((rawId) => ({ rawId, gameId: normalizeMatchId(rawId) }))
    .filter((entry): entry is { rawId: string; gameId: number } => entry.gameId !== null);

  console.log("[import] candidates:", candidates.length, "of", ids.length);

  const results = await mapWithConcurrency(
    candidates,
    IMPORT_CONCURRENCY,
    async ({ rawId, gameId }) => {
      const cached = getCachedPayload(gameId);
      console.log(
        `[import] worker start ${gameId} (${rawId}) — ${cached ? "cache hit" : "network fetch"}`,
      );
      let payload = cached;
      if (!payload) {
        try {
          payload = await riotFetch<any>(
            `https://${route}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(rawId)}`,
            platform,
          );
          cachePayload(gameId, payload);
          console.log(`[import] worker fetched ${gameId}`);
        } catch (err) {
          const status = err instanceof RiotApiError ? err.status : "?";
          console.log(`[import] worker FAILED ${gameId} with status ${status}`, err);
          if (err instanceof RiotApiError && err.status === 404) {
            db.markIgnoredGame(gameId);
            return false;
          }
          throw err;
        }
      }
      const normalized = normalizeMatchPayload(payload, gameId, puuid);
      const inserted = db.insertGameFull(normalized, puuid, "search-import", true);
      console.log(
        `[import] worker ${gameId} insertGameFull returned ${
          inserted ? "new tracked row" : "already tracked or duplicate"
        }`,
      );
      return true;
    },
  );

  let insertedNew = 0;
  let alreadyKnown = 0;
  let failed = 0;
  for (const result of results) {
    if (!result.ok) {
      failed++;
    } else if (result.value === true) {
      insertedNew++;
    } else {
      alreadyKnown++;
    }
  }
  if (failed > 0) {
    console.warn(
      `[import] ${failed} of ${candidates.length} matches could not be fetched for ${puuid}`,
    );
  }
  const firstFailure = results.find((result) => !result.ok);
  if (firstFailure && !firstFailure.ok) {
    console.error("[import] first worker failure:", firstFailure.error);
  }
  console.log(
    `[import] summary: ${insertedNew} new, ${alreadyKnown} already known, ${failed} failed, ${candidates.length} candidates`,
  );

  return {
    imported: insertedNew,
    scanned: candidates.length,
    totalAvailable: ids.length,
  };
}

export function normalizeMatchPayload(match: any, matchId: number, puuid: string) {
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
      puuid: participant.puuid ?? null,
    })),
    participantIdentities: info.participants.map((participant: any) => ({
      player: {
        puuid: participant.puuid,
        gameName: participant.riotIdGameName,
        tagLine: participant.riotIdTagline,
        summonerName: participant.summonerName,
        profileIcon: participant.profileIcon,
      },
    })),
    ownerPuuid: puuid,
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A personal dev key allows roughly one request per second sustained; 150 ms is
// a safety margin above that so a full sync does not trip the 429 window, and
// the loss is measured in seconds per sync, not minutes.
const REQUEST_PACING_MS = 150;
// A personal key's window is long enough that three retries of two, four and
// eight seconds do not cover it; the loop must stay alive long enough for the
// window to clear.
const MAX_RATE_LIMIT_RETRIES = 20;
let lastRequestAt = 0;
let rateLimitPausedUntil = 0;
let nextRequestStartAt = 0;

async function acquireRequestSlot(): Promise<() => void> {
  const now = Date.now();
  const startAt = Math.max(now, nextRequestStartAt, rateLimitPausedUntil);
  nextRequestStartAt = startAt + REQUEST_PACING_MS;
  const waitMs = startAt - now;
  if (waitMs > 0) await sleep(waitMs);
  return () => {
    void lastRequestAt;
  };
}

async function riotFetch<T>(
  url: string,
  platform: string,
  _key?: string,
  tag?: string,
): Promise<T> {
  const original = new URL(url);
  const originalQuery = original.search.slice(1);
  // The Worker speaks platform ids (na1, euw1); the regional route lives only in the URL hostname, because Riot itself needs it there.
  const proxyUrl = `${PROXY_BASE_URL}/proxy${original.pathname}?platform=${encodeURIComponent(platform)}${
    originalQuery ? `&${originalQuery}` : ""
  }`;
  const logPrefix = tag ? `[sync ${tag}] ` : "";
  for (let attempt = 0; ; attempt++) {
    console.log(`${logPrefix}Riot API request: ${proxyUrl}`);
    const release = await acquireRequestSlot();
    let response: Response;
    try {
      response = await fetch(proxyUrl, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      lastRequestAt = Date.now();
    } finally {
      release();
    }
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
      if (response.status !== 404) {
        console.error(
          `${logPrefix}Riot API error ${response.status} for ${proxyUrl}: ${body || "<empty response>"}`,
        );
      }
      throw new RiotApiError(response.status, proxyUrl);
    }
    return JSON.parse(body) as T;
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
  const accountUrl = `https://${route}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(normalizedGameName)}/${encodeURIComponent(normalizedTagLine)}`;
  console.log("[profile] regional route:", route);
  console.log("[profile] account URL:", accountUrl);
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
  console.log("[ranked] puuid:", puuid, "platform:", normalizedPlatform);
  console.log("[ranked] summoner.id:", summoner?.id);
  console.log("[ranked] league by-puuid:", league);
  console.log("[ranked] league (final):", league);

  const masteryEntries = mastery ?? [];
  const topMasteryEntries = [...masteryEntries]
    .sort((left, right) => right.championPoints - left.championPoints)
    .slice(0, 5)
    .map(({ championId, championPoints, championLevel }) => ({
      championId,
      championPoints,
      championLevel,
    }));
  const smallestMasteryEntries = [...masteryEntries]
    .sort((left, right) => left.championPoints - right.championPoints)
    .slice(0, 5)
    .map(({ championId }) => championId);
  console.log("[mastery] entry count:", masteryEntries.length);
  console.log(
    "[mastery] total champion points:",
    masteryEntries.reduce((total, entry) => total + entry.championPoints, 0),
  );
  console.log("[mastery] top 5 entries:", topMasteryEntries);
  console.log("[mastery] smallest 5 champion IDs:", smallestMasteryEntries);
  console.log("[mastery] raw score response:", masteryScore);

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
    topMasteryChampions: topMasteryEntries,
    rankedSolo: rankedEntry(league, "RANKED_SOLO_5x5"),
    rankedFlex: rankedEntry(league, "RANKED_FLEX_SR"),
  };
}

export async function getProfileIcon(puuid: string, platform?: string): Promise<number | null> {
  const normalizedPlatform =
    platform?.trim().toLowerCase() || db.getSetting("riot_platform")?.trim().toLowerCase();
  if (!normalizedPlatform) {
    console.warn("[riot] getProfileIcon missing platform:", { puuid });
    return null;
  }

  console.log("[riot] getProfileIcon called:", { puuid, platform: normalizedPlatform });
  const base = `https://${normalizedPlatform}.api.riotgames.com`;
  const summoner = await riotFetchOrNull<SummonerResponse>(
    `${base}/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`,
    normalizedPlatform,
  );
  const profileIconId = summoner?.profileIconId ?? null;
  if (profileIconId === null || !Number.isInteger(profileIconId) || profileIconId <= 0) {
    console.warn("[riot] getProfileIcon empty result:", { puuid });
    return null;
  }

  db.updateSummonerProfileIcon(puuid, profileIconId);
  console.log("[riot] getProfileIcon done:", { puuid, profileIconId });
  return profileIconId;
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
      const platform = String(
        db.getSetting("riot_platform") ?? current.region ?? current.platform ?? "na1",
      );
      db.upsertSummoner({ ...current, gameName, tagLine });
      return { puuid: current.puuid, gameName, tagLine, platform };
    }
  } catch {
    // The Riot API path is intentionally independent of the running client.
  }

  const gameName = configured?.gameName.trim() || db.getSetting("riot_game_name")?.trim();
  const tagLine = configured?.tagLine.trim() || db.getSetting("riot_tag_line")?.trim();
  const platform = configured?.platform.trim() || db.getSetting("riot_platform")?.trim() || "na1";
  if (!gameName || !tagLine) {
    throw new Error("No account selected. Open the League client or enter a Riot ID in Settings.");
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
  db.upsertSummoner({ puuid: account.puuid, gameName: account.gameName, tagLine: account.tagLine });
  return { puuid: account.puuid, gameName: account.gameName, tagLine: account.tagLine, platform };
}

export type RiotSyncResult = {
  added: number;
  scanned: number;
  totalGames: number;
  complete: boolean;
};

export async function syncRiotHistory(): Promise<RiotSyncResult> {
  const stored = readAccounts();
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
  for (const { identity } of identities) {
    const result = await syncRiotAccount(identity);
    added += result.added;
    scanned += result.scanned;
    complete &&= result.complete;
  }
  return { added, scanned, totalGames: db.getDashboardData().totalGames, complete };
}

async function syncRiotAccount(
  identity: Awaited<ReturnType<typeof configuredIdentity>>,
): Promise<RiotSyncResult> {
  const route = regionalRoute(identity.platform);
  const tag = `${identity.gameName ?? identity.puuid}#${identity.tagLine ?? ""}`;
  // Per-account, not the global getKnownGameIds(): a game only counts as
  // known for *this* account once it shows up among its own participants,
  // so pagination doesn't stop early just because another tracked account
  // already synced a game this account also happened to play in.
  const known = db.getKnownGameIdsForPuuid(identity.puuid);
  const ignored = db.getIgnoredGameIds();
  const pageSize = 100;
  const configuredPage = Number(db.getSetting("riot_sync_page_size") ?? pageSize);
  const count = Math.min(
    100,
    Math.max(1, Number.isFinite(configuredPage) ? configuredPage : pageSize),
  );
  const ids: number[] = [];

  for (let start = 0; start < 10_000; start += count) {
    let page: string[];
    try {
      page = await riotFetch<string[]>(
        `https://${route}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(identity.puuid)}/ids?start=${start}&count=${count}`,
        identity.platform,
        undefined,
        tag,
      );
    } catch (err) {
      throw new Error(friendlyRiotError(err, "match"));
    }
    for (const raw of page) {
      const id = normalizeMatchId(raw);
      if (id !== null && !ids.includes(id) && !ignored.has(id)) ids.push(id);
    }
    if (page.length < count || page.every((id) => known.has(normalizeMatchId(id) ?? -1))) break;
  }

  let added = 0;
  for (const id of ids) {
    if (known.has(id)) continue;
    let payload: any;
    try {
      payload = await riotFetch<any>(
        `https://${route}.api.riotgames.com/lol/match/v5/matches/${id}`,
        identity.platform,
        undefined,
        tag,
      );
    } catch (err) {
      if (err instanceof RiotApiError && err.status === 404) {
        console.warn(`[sync ${tag}] Match ${id} not available on Riot's servers (404), skipping.`);
        db.markIgnoredGame(id);
        continue;
      }
      throw new Error(friendlyRiotError(err, "match"));
    }
    const normalized = normalizeMatchPayload(payload, id, identity.puuid);
    if (db.insertGameFull(normalized, identity.puuid, "riot-sync")) added++;
  }

  db.setRiotSyncState(identity.puuid, identity.platform, ids[0] ?? null, ids.length < 10_000);
  return {
    added,
    scanned: ids.length,
    totalGames: db.getDashboardData().totalGames,
    complete: ids.length < 10_000,
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
