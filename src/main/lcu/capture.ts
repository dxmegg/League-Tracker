import { createWebSocketConnection, LeagueWebSocket } from "league-connect";
import { BrowserWindow } from "electron";
import * as db from "../db";
import { createPostGameCapture } from "../post-game";
import {
  status,
  setStatus,
  isClientConnected,
  forgetCredentials,
  lcuRequest,
  getCurrentSummoner,
  fetchGameDetails,
  fetchGameflowPhase,
  IN_GAME_PHASES,
} from "./connection";
import { autoFetchTimelineQuiet } from "./historyService";
import { notifyGamesUpdated } from "./backfill";
import { restartConnectLoop } from "./polling";

// --- Instant capture from the post-game screen ----------------------------
//
// The poll above is at the mercy of the client's match *list* cache, which is
// never invalidated when a game ends — the LCU can hand back the same stale
// twenty games for an entire client session, which is why a finished match
// could take hours to appear here. The end-of-game resource has no such delay:
// the client is pushed the stats within a second of the game terminating, and
// what it publishes carries the game id and queue id directly. We take the id
// from there and hydrate it through the by-id endpoint, which does not go
// through the list cache and answers in the same shape everything else parses.

// Compared without a leading slash: most LCU resources publish their uri with
// one, but not all of them do, and missing the event would put us straight back
// to waiting on the poll.
const EOG_STATS_PATHS = [
  // What the client actually publishes. The stats are pushed to it from Riot's
  // match-history ingest the moment the game terminates and land here. Carries
  // the game id, but no queue id.
  "lol-end-of-game/v1/eog-stats-block",
  // The endpoint the game client posts to itself. Not published during ordinary
  // play, but it carries the queue id on the occasions it is, which saves us a
  // request, so it stays in the list.
  "lol-end-of-game/v1/gameclient-eog-stats-block",
];

// The gameflow is the trigger that doesn't depend on the stats resource being
// published at all: the session carries the game id and queue id for the whole
// match, and the phase reliably reaches EndOfGame afterwards. Between the two
// sources, a finished game has to go out of its way not to be noticed.
const GAMEFLOW_SESSION_PATH = "lol-gameflow/v1/session";

const GAMEFLOW_PHASE_PATH = "lol-gameflow/v1/gameflow-phase";

// Game id and queue of the match currently being played, remembered from the
// gameflow session so the phase change has something to act on.
let liveGame: { gameId: number; queueId: number } | null = null;

// The phase only decides between the two connected states. Whether the client
// is reachable at all is the connect loop's business, so a phase arriving late
// must never talk the status back up out of "disconnected".
function applyPhase(win: BrowserWindow | null | undefined, phase: string | null) {
  if (!isClientConnected()) return;
  setStatus(phase !== null && IN_GAME_PHASES.has(phase) ? "ingame" : "connected", win);
}

// The by-id endpoint can still miss for a moment while the match is being
// written, so a failure is retried on a widening schedule instead of being
// dropped. Roughly five and a half minutes in all; past that the poll is the
// safety net, and one missed capture only costs the delay we had before.
const EOG_RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 60_000, 120_000, 120_000];

const postGame = createPostGameCapture({
  get: (url) => lcuRequest(url),
  save: async (gameId, kind, data) => {
    const { puuid } = await getCurrentSummoner();
    db.savePostGameData(gameId, puuid, kind, data);
    console.log(`[post-game] stored ${kind} for game ${gameId}`);
  },
});

export let eogSocket: LeagueWebSocket | null = null;

let eogAttaching = false;

// Games the capture path is already working on. The resource updates more than
// once while the screen is open, so without this every update would start its
// own chain of retries for the same match. A null value means an attempt is
// running right now; a timer means one is scheduled.
const eogPending = new Map<number, ReturnType<typeof setTimeout> | null>();

async function captureEogGame(
  win: BrowserWindow | null | undefined,
  gameId: number,
  attempt: number,
): Promise<void> {
  eogPending.set(gameId, null);

  // A retry can be scheduled minutes out, by which time the ordinary poll may
  // have picked the game up anyway
  if (db.gameExists(gameId)) {
    eogPending.delete(gameId);
    return;
  }

  try {
    // Cheap, and it keeps the stored identity current the same way the poll
    // does — the capture may well be the first thing to run after a switch.
    const summoner = await getCurrentSummoner();
    const savedPuuid = db.upsertSummoner(summoner, "lcu");
    const trackedSummoner =
      savedPuuid === summoner.puuid ? summoner : { ...summoner, puuid: savedPuuid };

    const game = await fetchGameDetails(gameId);

    if (db.insertGameFull(game, trackedSummoner.puuid, "lcu")) {
      console.log(`Stored League game ${gameId} from the post-game screen`);
      notifyGamesUpdated(win);
      db.runScoreBackfillIfNeeded();
      autoFetchTimelineQuiet(gameId, game.queueId);
    }
    eogPending.delete(gameId);
  } catch (err) {
    const delay = EOG_RETRY_DELAYS_MS[attempt];
    if (delay === undefined) {
      console.log(`Gave up capturing game ${gameId} from the post-game screen:`, err);
      eogPending.delete(gameId);
      return;
    }

    const timer = setTimeout(() => {
      captureEogGame(win, gameId, attempt + 1);
    }, delay);
    // A scheduled retry must never be the reason the app can't exit
    timer.unref?.();
    eogPending.set(gameId, timer);
  }
}

function startCapture(win: BrowserWindow, gameId: number, _queueId: number): void {
  if (!Number.isFinite(gameId) || gameId <= 0) return;
  if (eogPending.has(gameId) || db.gameExists(gameId)) return;

  captureEogGame(win, gameId, 0);
}

function handleFrame(win: BrowserWindow, payload: any): void {
  const raw = String(payload?.uri ?? "");
  const path = raw.startsWith("/") ? raw.slice(1) : raw;

  if (path === GAMEFLOW_SESSION_PATH) {
    // Only ever set, never cleared: the session drops back to an empty game
    // once the match is over, and by then this is what the phase change needs.
    const gameData = payload.data?.gameData;
    const gameId = Number(gameData?.gameId);
    if (Number.isFinite(gameId) && gameId > 0) {
      liveGame = { gameId, queueId: Number(gameData?.queue?.id) };
    }
    return;
  }

  if (path === GAMEFLOW_PHASE_PATH) {
    applyPhase(win, typeof payload.data === "string" ? payload.data : null);
    // Mastery as it stood before the game, to tell afterwards what the game changed
    if (payload.data === "InProgress") void postGame.onGameStart();
    if (["PreEndOfGame", "EndOfGame"].includes(payload.data) && liveGame) {
      postGame.onGameEnd(liveGame.gameId);
    }

    if (payload.data === "EndOfGame" && liveGame) {
      startCapture(win, liveGame.gameId, liveGame.queueId);
    }
    return;
  }

  if (payload.eventType !== "Delete") void postGame.onFrame(path, payload.data);

  if (EOG_STATS_PATHS.includes(path)) {
    // The resource is also cleared once the screen is dismissed
    if (payload.eventType === "Delete" || !payload.data) return;
    startCapture(win, Number(payload.data.gameId), Number(payload.data.queueId));
  }
}

// The connection has no timeout of its own, and one that never opens and never
// errors would leave the attach guard below set for the rest of the session —
// which would then refuse every later attempt, taking the post-game capture and
// the in-game status down with it.
const EOG_ATTACH_TIMEOUT_MS = 15_000;

function connectEogSocket(): Promise<LeagueWebSocket> {
  const pending = createWebSocketConnection({
    authenticationOptions: { windowsShell: "powershell" },
    // The connect loop in startPolling is already the retry policy; a second
    // one inside the socket would stack reconnect attempts on top of it.
    maxRetries: 0,
  });

  return new Promise<LeagueWebSocket>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      settled = true;
      // Abandoned rather than cancelled — a connection in flight can't be
      // called off — so a socket that does open later still has to be closed,
      // or it would sit there holding a subscription nothing reads.
      pending.then((socket) => socket.close()).catch(() => {});
      reject(new Error("Timed out connecting to the League client event socket"));
    }, EOG_ATTACH_TIMEOUT_MS);
    timer.unref?.();

    pending.then(
      (socket) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(socket);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export async function attachEogListener(win: BrowserWindow): Promise<void> {
  // The guard has to survive the await below, or a poll tick landing mid-attach
  // would open a second socket
  if (eogSocket || eogAttaching) {
    // A socket outlives a poll that failed, and reconnecting puts the status
    // back to plain "connected". Nothing else would notice a match that was
    // already running, since the socket reports changes and misses none.
    if (eogSocket) applyPhase(win, await fetchGameflowPhase());
    return;
  }
  eogAttaching = true;

  try {
    const socket = await connectEogSocket();

    // league-connect drops its own error handler once the socket is open, and
    // an emitter with no 'error' listener throws — which here would crash the
    // app every time the League client closes.
    socket.on("error", () => socket.close());
    socket.on("close", () => {
      // A socket the app replaced, or closed on the way out, isn't news
      if (eogSocket !== socket) return;
      eogSocket = null;

      // Nothing is left to report the match ending, so holding "in game" would
      // strand the indicator there until the next reconnect
      if (status === "ingame") setStatus("connected", win);

      handleSocketDrop(win);
    });

    // Read off the raw frames rather than through league-connect's subscribe(),
    // which matches the uri as an exact string in one spelling. The socket has
    // already asked for every event, so this only decides what to keep.
    socket.on("message", (content) => {
      let payload: any;
      try {
        [payload] = JSON.parse(String(content)).slice(2);
      } catch {
        // Includes the empty frame the client sends to acknowledge the request
        return;
      }

      try {
        handleFrame(win, payload);
      } catch (err) {
        console.log("Post-game capture failed:", err);
      }
    });

    eogSocket = socket;
    console.log("Listening for post-game results");
    void postGame.catchUp();

    // The socket only carries changes, so a client that was already in a match
    // when we attached needs the current phase read once.
    fetchGameflowPhase().then((phase) => {
      applyPhase(win, phase);
      // Mastery and challenges only move when the game ends, so a mid-game read is still "before"
      if (phase !== null && IN_GAME_PHASES.has(phase)) void postGame.onGameStart();
    });
  } finally {
    eogAttaching = false;
  }
}

// The client shutting down takes the socket with it, and that lands the moment
// it happens — the poll only finds out on its next tick, up to a minute later.
// The socket can also drop with the client still there, though, so the status
// isn't touched until a request confirms it: if one still answers, the poll
// tick puts the listener back and nothing else needs to change. A request that
// fails for some passing reason costs a reconnect the loop makes good within
// five seconds.
async function handleSocketDrop(win: BrowserWindow) {
  if ((await fetchGameflowPhase()) !== null) return;

  // Forces the loop to authenticate again, since a client that comes back comes
  // back on a different port
  forgetCredentials();
  restartConnectLoop(win);
}

export function stopEogListener() {
  if (eogSocket) {
    // Cleared first so the close handler, which checks identity, doesn't race
    // a listener attached by a later reconnect
    const socket = eogSocket;
    eogSocket = null;
    socket.close();
  }
  for (const timer of eogPending.values()) {
    if (timer) clearTimeout(timer);
  }
  eogPending.clear();
  postGame.stop();
  liveGame = null;
}
