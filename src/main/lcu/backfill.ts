import { BrowserWindow } from "electron";
import * as db from "../db";
import { invalidateDashboardCache } from "../db/dashboard-cache";
import type { CurrentSummoner } from "../../shared/api";
import { accountByRiotId, regionalRoute } from "../riot-api";
import {
  friendlyErrorMessage,
  connect,
  getCurrentSummoner,
  fetchMatchHistoryByPuuid,
  fetchMatchHistory,
  fetchGameDetails,
  isInGame,
} from "./connection";
import {
  SGP_MAX_PAGES,
  fetchSgpToken,
  SgpHttpError,
  SGP_REHOME_STATUSES,
  resolveSgpHost,
  rehomeSgpHost,
  fetchAllMatchIds,
  syncFullMatchData,
  autoFetchTimelineQuiet,
} from "./historyService";

// How many new games to accumulate before nudging the UI to re-query, so a long
// import fills the app in as it runs instead of landing all at once.
const GAMES_UPDATED_BATCH = 25;

// Wait this long before automatically retrying a backfill that errored, so a
// transient failure doesn't relaunch a full history walk every poll tick.
const AUTO_BACKFILL_RETRY_DELAY = 15 * 60 * 1000;

export let backfillRunning = false;

let backfillCancelled = false;

// Suppresses only the *automatic* backfill. Cleared on restart, and a manual
// run from Settings always ignores it.
let autoBackfillPausedUntil = 0;

export function notifyGamesUpdated(win?: BrowserWindow | null) {
  if (win && !win.isDestroyed()) {
    invalidateDashboardCache();
    win.webContents.send("lcu:games-updated");
  }
}

export function cancelBackfill(): void {
  if (backfillRunning) backfillCancelled = true;
}

export function isBackfillRunning(): boolean {
  return backfillRunning;
}

export type BackfillResult = {
  added: number;
  scanned: number;
  checked: number;
  totalGames: number;
  truncated: boolean;
  cancelled: boolean;
};

async function runBackfillForAccount(
  account: { puuid: string; gameName: string; tagLine: string; platform: string },
  win?: BrowserWindow | null,
  forceFull = false,
): Promise<BackfillResult> {
  const savedPuuid = db.upsertSummoner(account, "lcu");
  if (savedPuuid !== account.puuid) {
    account = { ...account, puuid: savedPuuid };
  }

  const { gameName, tagLine, platform } = account;
  let realPuuid = account.puuid;
  if (gameName && tagLine) {
    try {
      console.log(
        `[backfill] puuid resolve: gameName=${gameName} tagLine=${tagLine} lcuPuuidLen=${account.puuid.length}`,
      );
      const riotAccount = await accountByRiotId(
        regionalRoute(platform),
        platform,
        gameName,
        tagLine,
      );
      realPuuid = riotAccount.puuid;
      console.log(
        `[backfill] resolved real Riot PUUID: ${realPuuid.slice(0, 12)}... (len=${realPuuid.length})`,
      );
      if (realPuuid.length !== 78) {
        console.warn(
          `[backfill] WARNING: resolved puuid has length ${realPuuid.length}, expected 78 — Riot API may reject it`,
        );
      }
    } catch (err) {
      console.warn(
        `[backfill] FAILED to resolve real Riot PUUID — falling back to LCU UUID (len=${account.puuid.length}). DB writes will use a 36-char key.`,
        err,
      );
    }
  } else {
    console.warn(
      `[backfill] FAILED to resolve real Riot PUUID — account has no usable gameName/tagLine; falling back to LCU UUID (len=${account.puuid.length}). DB writes will use a 36-char key.`,
    );
  }

  const token = await fetchSgpToken();
  const host = await resolveSgpHost(account.puuid, token);

  const known = db.getKnownGameIdsForPuuid(account.puuid);

  // Once an account has been walked all the way back, a later run only needs
  // the new games at the front. Results are newest-first, so the first page
  // we've already fully accounted for means everything older is accounted for
  // too. Tracked per account, since a newly added one still needs a full walk.
  const completedKey = `backfill_complete_${account.puuid}`;
  const walkedBefore = !forceFull && db.getSetting(completedKey) === "1";
  console.log(
    `[backfill] start: puuid=${realPuuid.slice(0, 12)}... (len=${realPuuid.length}) platform=${platform}`,
  );

  const walk = (from: string) =>
    fetchAllMatchIds(
      from,
      account.puuid,
      token,
      (pageIds) => walkedBefore && pageIds.every((id) => known.has(id)),
    );

  let walked: { ids: number[]; truncated: boolean };
  try {
    walked = await walk(host);
  } catch (err) {
    // The remembered shard may simply be the wrong one now. Find the right
    // one and restart the walk there; if none answers, the original failure
    // is the honest one to report.
    if (!(err instanceof SgpHttpError) || !SGP_REHOME_STATUSES.has(err.status)) throw err;
    const rehomed = await rehomeSgpHost(account.puuid, token, host);
    if (!rehomed) throw err;
    walked = await walk(rehomed);
  }
  const { ids, truncated } = walked;

  if (truncated) {
    console.warn(
      `Backfill stopped at the ${SGP_MAX_PAGES}-page limit (${ids.length} games); older games were not checked`,
    );
  }

  const pending = ids.filter((id) => !known.has(id));

  const progress = (current: number, added: number) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send("lcu:backfill-progress", { current, total: pending.length, added });
    }
  };
  progress(0, 0);

  let added = 0;
  let announced = 0;
  for (let i = 0; i < pending.length; i++) {
    if (backfillCancelled) break;
    const gameId = pending[i];

    let game: any;
    try {
      game = await fetchGameDetails(gameId);
    } catch {
      // Leave it unrecorded so a later run retries it
      progress(i + 1, added);
      continue;
    }

    if (
      db.insertGameFull(game, account.puuid, "lcu", false, {
        gameName: account.gameName,
        tagLine: account.tagLine,
      })
    ) {
      added++;
      console.log(`Backfilled League game ${gameId}`);
    }

    // Let the app fill in as it goes rather than staying empty for minutes
    if (added - announced >= GAMES_UPDATED_BATCH) {
      announced = added;
      notifyGamesUpdated(win);
      db.runScoreBackfillIfNeeded();
    }
    progress(i + 1, added);
  }

  const cancelled = backfillCancelled;

  // Only claim the account is fully walked once every id has actually been
  // resolved. Marking it earlier would let a later run early-exit on the first
  // fully-known page and never reach the older games we skipped.
  if (!truncated && !cancelled) {
    db.setSetting(completedKey, "1");
  } else {
    // Neither outcome sets the completion flag, so without this the poll would
    // relaunch the whole walk a minute later — including right after the user
    // deliberately cancelled it. Resumes on next launch, or from Settings.
    autoBackfillPausedUntil = Infinity;
  }

  if (added > announced) {
    notifyGamesUpdated(win);
    db.runScoreBackfillIfNeeded();
  }

  const dashboard = db.getDashboardData();
  const result: BackfillResult = {
    added,
    scanned: ids.length,
    checked: pending.length,
    totalGames: dashboard.totalGames,
    truncated,
    cancelled,
  };

  if (win && !win.isDestroyed()) {
    win.webContents.send("lcu:backfill-done", result);
  }
  console.log("[lcu] runBackfillForAccount done:", {
    puuid: account.puuid,
    added: result.added,
    scanned: result.scanned,
  });
  return result;
}

export async function backfillHistory(
  win?: BrowserWindow | null,
  forceFull = false,
): Promise<BackfillResult> {
  if (backfillRunning) throw new Error("A backfill is already running");
  backfillRunning = true;
  backfillCancelled = false;

  try {
    await connect();
    const summoner = await getCurrentSummoner();
    return await runBackfillForAccount(
      {
        puuid: summoner.puuid,
        gameName: summoner.gameName ?? "",
        tagLine: summoner.tagLine ?? "",
        platform: summoner.platform,
      },
      win,
      forceFull,
    );
  } catch (err) {
    if (win && !win.isDestroyed()) {
      win.webContents.send("lcu:backfill-done", { error: friendlyErrorMessage(err) });
    }
    throw err;
  } finally {
    backfillRunning = false;
    backfillCancelled = false;
  }
}

export async function backfillHistoryForAccount(
  account: { puuid: string; gameName: string; tagLine: string; platform: string },
  win?: BrowserWindow | null,
  forceFull = false,
): Promise<BackfillResult> {
  if (backfillRunning) throw new Error("A backfill is already running");
  backfillRunning = true;
  backfillCancelled = false;

  try {
    const result = await runBackfillForAccount(account, win, forceFull);
    console.log("[lcu] backfillHistoryForAccount done:", {
      puuid: account.puuid,
      added: result.added,
    });
    return result;
  } catch (err) {
    if (win && !win.isDestroyed()) {
      win.webContents.send("lcu:backfill-done", { error: friendlyErrorMessage(err) });
    }
    throw err;
  } finally {
    backfillRunning = false;
    backfillCancelled = false;
  }
}

export async function fetchNewGames(
  win?: BrowserWindow | null,
  knownSummoner?: any,
): Promise<{ newGames: number; totalGames: number }> {
  await connect();

  const summoner = knownSummoner ?? (await getCurrentSummoner());
  const savedPuuid = db.upsertSummoner(summoner, "lcu");
  const trackedSummoner =
    savedPuuid === summoner.puuid ? summoner : { ...summoner, puuid: savedPuuid };

  let newGamesCount = 0;

  let historyResponse: any;
  try {
    historyResponse = await fetchMatchHistoryByPuuid(trackedSummoner.puuid, 0, 19);
  } catch {
    try {
      historyResponse = await fetchMatchHistory(0, 19);
    } catch {
      return { newGames: 0, totalGames: 0 };
    }
  }

  const games = historyResponse.games?.games || historyResponse.games || [];

  for (const game of games) {
    if (db.gameExists(game.gameId)) continue;
    let fullGame: any;
    try {
      fullGame = await fetchGameDetails(game.gameId);
    } catch {
      fullGame = game;
    }

    const inserted = db.insertGameFull(fullGame, trackedSummoner.puuid, "lcu");
    if (inserted) {
      newGamesCount++;
      console.log(`Stored League game ${fullGame.gameId}`);
      autoFetchTimelineQuiet(fullGame.gameId, fullGame.queueId);
    }
  }

  if (newGamesCount > 0 && win && !win.isDestroyed()) {
    invalidateDashboardCache();
    win.webContents.send("lcu:games-updated");
    db.runScoreBackfillIfNeeded();
  }

  const dashboard = db.getDashboardData();
  return { newGames: newGamesCount, totalGames: dashboard.totalGames };
}

// Accounts whose full history has been checked since launch
const caughtUp = new Set<string>();

// Each account gets its full history checked on its first connect of a session, so games played
// while the app was closed are all picked up, however many there were. Only the missing ones are
// downloaded. Every later tick takes the cheap recent-games path. Deferred while a game is in
// progress so we aren't hammering the client mid-match; a later poll picks it up.
export async function syncGames(win: BrowserWindow) {
  let summoner: CurrentSummoner | null = null;
  try {
    summoner = await getCurrentSummoner();
  } catch {
    // Fall through to the recent-games sync, which reports its own errors
  }

  const wantsBackfill =
    summoner && Date.now() >= autoBackfillPausedUntil && !caughtUp.has(summoner.puuid);

  if (wantsBackfill && !(await isInGame())) {
    const { puuid } = summoner!;
    try {
      await backfillHistory(win, true);
      caughtUp.add(puuid);
      return;
    } catch (err) {
      console.log("Automatic backfill failed, falling back to recent games:", err);
      autoBackfillPausedUntil = Date.now() + AUTO_BACKFILL_RETRY_DELAY;
    }
  }

  await fetchNewGames(win, summoner ?? undefined);
  if (!(await isInGame())) await syncFullMatchData();
}
