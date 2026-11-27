import fs from "fs";
import os from "os";
import { app } from "electron";
import * as db from "./db";
import * as lcu from "./lcu";
import { lcuRequest } from "./lcu/connection";
import { getLogsDir, logNetwork } from "./logger";
import { lastFailure, lastSuccess, markFailure, markSuccess } from "./last-success";
import { checkForUpdate, getLastRelease } from "./updater";
import { getBackupDir, getDbDir } from "./paths";
import { PROXY_BASE_URL } from "../shared/proxy";
import type { Diagnostics } from "../shared/api";

// Asks for an account that does not exist: any answer but a refused key means the way is open
async function checkRiotProxy(): Promise<string> {
  const startedAt = performance.now();
  try {
    const { status } = await fetch(
      `${PROXY_BASE_URL}/proxy/riot/account/v1/accounts/by-riot-id/test/test?platform=europe`,
      { signal: AbortSignal.timeout(10_000) },
    );
    logNetwork("riot probe", status, startedAt);
    if (status === 200 || status === 404) return "Working";
    if (status === 401 || status === 403) return "The API key was refused";
    if (status === 429) return "Rate limited";
    return `HTTP ${status}`;
  } catch {
    logNetwork("riot probe", "unreachable", startedAt);
    return "Not reachable";
  }
}

// Only a running client is asked: otherwise the request would go looking for one
async function clientVersion(): Promise<string | null> {
  if (!lcu.isClientConnected()) return null;
  try {
    // The build number is enough; the rest names the branch it was built from
    return String(await lcuRequest("/lol-patch/v1/game-version")).split("+")[0];
  } catch {
    return null;
  }
}

function fileBytes(file: string): number {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

// Not getDbStats(): that counts every table on the main thread and froze the window
function databaseFacts() {
  const database = db.getDatabase();
  const pragma = (name: string) => database.pragma(name, { simple: true }) as number;
  const row = database
    .prepare("SELECT COUNT(*) AS games, MAX(game_creation) AS newestGame FROM games")
    .get() as { games: number; newestGame: number | null };
  // Nothing recorded yet: the newest game arrived about when it ended
  const ended = database
    .prepare(
      "SELECT game_creation + game_duration * 1000 AS at FROM games ORDER BY game_creation DESC LIMIT 1",
    )
    .get() as { at: number } | undefined;
  const file = db.getDbPath();
  return {
    ...row,
    lastGameAdded: Number(db.getSetting("last_game_added_at")) || (ended?.at ?? null),
    schemaVersion: pragma("user_version"),
    dbBytes: fileBytes(file) + fileBytes(`${file}-wal`),
    freeBytes: pragma("freelist_count") * pragma("page_size"),
  };
}

// The page asks every few seconds; only a probe goes out to the proxy
let riotProbedAt = 0;
// An open page notices a service that stopped answering within this long
const RIOT_RECHECK_MS = 60_000;
let version: string | null = null;

export async function getDiagnostics(probe: boolean): Promise<Diagnostics> {
  const probeRiot = probe || Date.now() - riotProbedAt > RIOT_RECHECK_MS;
  if (probeRiot) {
    riotProbedAt = Date.now();
    const answer = await checkRiotProxy();
    if (answer === "Working") markSuccess("riot");
    else markFailure("riot", answer);
  }
  if (probe) await checkForUpdate();
  if (!lcu.isClientConnected()) version = null;
  else if (probe || !version) version = await clientVersion();
  return {
    appVersion: app.getVersion(),
    installed: app.isPackaged,
    system: `${os.version()} (${os.release()}, ${process.arch})`,
    runtime: `Electron ${process.versions.electron}, Chrome ${process.versions.chrome}, Node ${process.versions.node}`,
    clientStatus: lcu.getStatus(),
    clientVersion: version,
    lastSuccess: lastSuccess(),
    lastFailure: lastFailure(),
    release: getLastRelease(),
    latestSchemaVersion: db.SCHEMA_VERSION,
    appDir: app.getPath("userData"),
    dbDir: getDbDir(),
    backupDir: getBackupDir(),
    logsDir: getLogsDir(),
    ...databaseFacts(),
  };
}
