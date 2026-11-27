import {
  authenticate,
  ClientElevatedPermsError,
  ClientNotFoundError,
  createHttp1Request,
  Credentials,
  HttpRequestOptions,
} from "league-connect";
import { BrowserWindow } from "electron";
import * as db from "../db";
import { markSuccess } from "../last-success";
import { logNetwork } from "../logger";
import type { CurrentSummoner, LcuStatus, RankEntry } from "../../shared/api";

let credentials: Credentials | null = null;

export let status: LcuStatus = "disconnected";

export function setStatus(newStatus: typeof status, win?: BrowserWindow | null) {
  status = newStatus;
  if (win && !win.isDestroyed()) {
    win.webContents.send("lcu:status-changed", status);
  }
}

export function getStatus() {
  return status;
}

// Both of these mean the client is there and answering — only the phase differs
export function isClientConnected() {
  return status === "connected" || status === "ingame";
}

export function friendlyErrorMessage(err: unknown): string {
  if (err instanceof ClientNotFoundError) {
    return "League client is not running";
  }
  if (err instanceof ClientElevatedPermsError) {
    return "League client is running as administrator — run Rift Records as administrator to connect";
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/ECONNREFUSED|ECONNRESET|socket hang up|EPIPE/i.test(message)) {
    return "Lost connection to the League client";
  }
  return message;
}

export async function connect(): Promise<Credentials> {
  credentials = await authenticate({ windowsShell: "powershell" });
  return credentials;
}

// A client that has restarted answers on another port, so the next request must authenticate again
export function forgetCredentials() {
  credentials = null;
}

export async function lcuRequest(url: string, method: HttpRequestOptions["method"] = "GET") {
  if (!credentials) {
    await connect();
  }
  // The request has no timeout of its own, and one that hangs would leave the sync guard set
  // for the rest of the session
  let timer: ReturnType<typeof setTimeout> | undefined;
  const startedAt = performance.now();
  const response = await Promise.race([
    createHttp1Request({ url, method }, credentials!),
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`LCU request timed out: ${url}`)), 30_000);
    }),
  ]).finally(() => clearTimeout(timer));
  // 404 is how the client says "no game running"
  if ((!response.ok && response.status !== 404) || performance.now() - startedAt > 1_000) {
    logNetwork(`client ${url}`, response.status, startedAt);
  }
  if (!response.ok) {
    throw new Error(`LCU request failed: ${response.status} ${url}`);
  }
  markSuccess("client");
  return response.json();
}

async function fetchCurrentSummoner(): Promise<any> {
  return lcuRequest("/lol-summoner/v1/current-summoner");
}

async function fetchLoginSession(): Promise<unknown> {
  return lcuRequest("/lol-login/v1/session");
}

async function fetchRegionLocale(): Promise<unknown> {
  return lcuRequest("/riotclient/region-locale");
}

export function recordPayload(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizePlatform(value: unknown): string {
  const normalized = stringField(value).trim().toLowerCase();
  const aliases: Record<string, string> = {
    na: "na1",
    lan: "la1",
    las: "la2",
    oce: "oc1",
    eune: "eun1",
    euw: "euw1",
    turkey: "tr1",
    brazil: "br1",
    korea: "kr",
    japan: "jp1",
  };
  return aliases[normalized] ?? normalized;
}

export function numberField(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function rankEntry(value: unknown): RankEntry | null {
  const entry = recordPayload(value);
  const tier = stringField(entry.tier).toUpperCase();
  const division = stringField(entry.division).toUpperCase();
  if (!tier || !division || tier === "UNRANKED" || division === "NA") return null;
  return {
    tier,
    division,
    leaguePoints: numberField(entry.leaguePoints),
    wins: numberField(entry.wins),
    losses: numberField(entry.losses),
  };
}

// Used by the Riot API sync as a best-effort account detector. Historical
// syncing never depends on this endpoint; configured Riot ID settings remain
// the fallback when the client is closed.
export async function getCurrentSummoner(): Promise<CurrentSummoner> {
  await connect();
  const rawSummoner = recordPayload(await fetchCurrentSummoner());
  const gameName = stringField(rawSummoner.gameName);
  const displayName = stringField(rawSummoner.displayName) || gameName;
  const fallbackPlatform = normalizePlatform(rawSummoner.platform);
  let platform = fallbackPlatform;
  try {
    const session = recordPayload(await fetchLoginSession());
    const platformId = normalizePlatform(session.platformId);
    if (platformId) platform = platformId;
  } catch (err) {
    console.warn("[lcu] login session platform unavailable:", err);
  }
  if (!platform) {
    try {
      const regionLocale = recordPayload(await fetchRegionLocale());
      platform = normalizePlatform(regionLocale.region);
    } catch (err) {
      console.warn("[lcu] region locale platform unavailable:", err);
    }
  }

  const summoner: CurrentSummoner = {
    puuid: stringField(rawSummoner.puuid),
    gameName: gameName || displayName,
    tagLine: stringField(rawSummoner.tagLine),
    displayName,
    internalName: stringField(rawSummoner.internalName),
    region: stringField(rawSummoner.region),
    platform,
    profileIconId: numberField(rawSummoner.profileIconId),
    summonerLevel: numberField(rawSummoner.summonerLevel),
  };
  if (summoner.puuid) {
    const savedPuuid = db.upsertSummoner({ ...rawSummoner, ...summoner }, "lcu");
    if (savedPuuid !== summoner.puuid) {
      summoner.puuid = savedPuuid;
    }
    if (summoner.platform) {
      db.setRiotSyncState(summoner.puuid, summoner.platform, null, false);
    }
  }
  return summoner;
}

export async function fetchMatchHistoryByPuuid(
  puuid: string,
  begIndex = 0,
  endIndex = 19,
): Promise<any> {
  return lcuRequest(
    `/lol-match-history/v1/products/lol/${puuid}/matches?begIndex=${begIndex}&endIndex=${endIndex}`,
  );
}

export async function fetchMatchHistory(begIndex = 0, endIndex = 19): Promise<any> {
  return lcuRequest(
    `/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=${begIndex}&endIndex=${endIndex}`,
  );
}

export async function fetchGameDetails(gameId: number): Promise<any> {
  return lcuRequest(`/lol-match-history/v1/games/${gameId}`);
}

// Reconnect is the phase for rejoining a match already underway, so it counts
// as being in a game just as much as InProgress does.
export const IN_GAME_PHASES = new Set(["InProgress", "Reconnect"]);

export async function fetchGameflowPhase(): Promise<string | null> {
  try {
    // The endpoint returns a bare JSON string, e.g. "InProgress"
    return (await lcuRequest("/lol-gameflow/v1/gameflow-phase")) as unknown as string;
  } catch {
    return null;
  }
}

export async function isInGame(): Promise<boolean> {
  const phase = await fetchGameflowPhase();
  return phase !== null && IN_GAME_PHASES.has(phase);
}
