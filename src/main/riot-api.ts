import * as db from "./db";
import { getCurrentSummoner } from "./lcu";
import type {
  ProfileData,
  ProfileRankedEntry,
  RecentRiotMatch,
  RiotAccountConfig,
} from "../shared/api";
import { PROXY_BASE_URL } from "../shared/proxy";
import { getChampionDataVersion } from "./dragon";

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
      totalMinionsKilled?: number;
      neutralMinionsKilled?: number;
    }>;
  };
};

export async function getRecentRiotMatches(
  puuid: string,
  platform: string,
  count: number,
  start = 0,
): Promise<RecentRiotMatch[]> {
  const route = regionalRoute(platform);
  const safeCount = Math.max(0, Math.min(Math.floor(count), 100));
  const safeStart = Math.max(0, Math.floor(start));
  if (safeCount === 0) return [];

  const ids = await riotFetch<string[]>(
    `https://${route}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?start=${safeStart}&count=${safeCount}`,
  );
  const matches = await Promise.all(
    ids.slice(0, safeCount).map(async (rawId): Promise<RecentRiotMatch | null> => {
      const gameId = normalizeMatchId(rawId);
      if (gameId === null) return null;

      const payload = await riotFetch<RecentMatchResponse>(
        `https://${route}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(rawId)}`,
      );
      const info = payload.info;
      const participant = info?.participants?.find((entry) => entry.puuid === puuid);
      if (!info || !participant) return null;

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
        gameCreation: Number(info.gameCreation) || 0,
        gameDuration: Number(info.gameDuration) || 0,
        queueId: Number(info.queueId) || 0,
        teamPosition: participant.teamPosition ?? null,
      };
    }),
  );
  return matches.filter((match): match is RecentRiotMatch => match !== null);
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

// A small gap between requests keeps a full history sync (which can issue
// thousands of calls) well under Riot's short per-second rate window instead
// of bursting and immediately drawing a 429.
const REQUEST_PACING_MS = 60;
const MAX_RATE_LIMIT_RETRIES = 5;
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

async function riotFetch<T>(url: string, _key?: string, tag?: string): Promise<T> {
  const original = new URL(url);
  const originalPlatform = original.hostname.split(".")[0];
  const originalQuery = original.search.slice(1);
  const proxyUrl = `${PROXY_BASE_URL}/proxy${original.pathname}?platform=${encodeURIComponent(originalPlatform)}${
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
      const retryAfterHeader = Number(response.headers.get("Retry-After"));
      const retryAfterMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
        ? retryAfterHeader * 1000
        : 2 ** attempt * 1000;
      rateLimitPausedUntil = Math.max(rateLimitPausedUntil, Date.now() + retryAfterMs);
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

async function accountByRiotId(
  route: RiotRegionalRoute,
  gameName: string,
  tagLine: string,
  tag?: string,
): Promise<{ puuid: string; gameName: string; tagLine: string }> {
  return riotFetch(
    `https://${route}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
    undefined,
    tag,
  );
}

export async function getProfileDataByRiotId(
  gameName: string,
  tagLine: string,
  platform: string,
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
    account = await accountByRiotId(route, normalizedGameName, normalizedTagLine);
  } catch (err) {
    console.error("[profile] accountByRiotId failed:", err);
    throw err;
  }
  const profile = await getProfileData(account.puuid, normalizedPlatform);
  return profile
    ? {
        ...profile,
        gameName: account.gameName || normalizedGameName,
        tagLine: account.tagLine || normalizedTagLine,
      }
    : null;
}

interface SummonerResponse {
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

async function riotFetchOrNull<T>(url: string): Promise<T | null> {
  try {
    return await riotFetch<T>(url);
  } catch (err) {
    if (err instanceof RiotApiError && err.status === 404) return null;
    throw err;
  }
}

function rankedEntry(entries: LeagueResponse[] | null, queueType: string): ProfileRankedEntry | null {
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

export async function getProfileData(
  puuid: string,
  platform: string,
): Promise<ProfileData | null> {
  const normalizedPlatform = platform.trim().toLowerCase();
  const base = `https://${normalizedPlatform}.api.riotgames.com`;
  const [summoner, mastery, masteryScore, league] = await Promise.all([
    riotFetchOrNull<SummonerResponse>(
      `${base}/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`,
    ),
    riotFetchOrNull<MasteryResponse[]>(
      `${base}/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodeURIComponent(puuid)}`,
    ),
    riotFetchOrNull<number>(
      `${base}/lol/champion-mastery/v4/scores/by-puuid/${encodeURIComponent(puuid)}`,
    ),
    riotFetchOrNull<LeagueResponse[]>(
      `${base}/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`,
    ),
  ]);

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
    if (page.length < count || page.some((id) => known.has(normalizeMatchId(id) ?? -1))) break;
  }

  let added = 0;
  for (const id of ids) {
    if (known.has(id)) continue;
    let payload: any;
    try {
      payload = await riotFetch<any>(
        `https://${route}.api.riotgames.com/lol/match/v5/matches/${id}`,
        undefined,
        tag,
      );
    } catch (err) {
      if (err instanceof RiotApiError && err.status === 404) {
        console.warn(
          `[sync ${tag}] Match ${id} not available on Riot's servers (404), skipping.`,
        );
        db.markIgnoredGame(id);
        continue;
      }
      throw new Error(friendlyRiotError(err, "match"));
    }
    const normalized = normalizeMatchPayload(payload, id, identity.puuid);
    if (db.insertGameFull(normalized, identity.puuid)) added++;
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
