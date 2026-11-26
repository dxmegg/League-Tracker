import { BrowserWindow } from "electron";
import { setStatus, connect, fetchGameflowPhase } from "./connection";
import { backfillRunning, syncGames } from "./backfill";
import { eogSocket, attachEogListener, stopEogListener } from "./capture";
import { persistRecording, recordTick } from "./live";

let pollTimer: ReturnType<typeof setInterval> | null = null;

let connectTimer: ReturnType<typeof setInterval> | null = null;

let pollingStopped = false;

// Both timers are cleared before the connect loop starts again, so a restart
// can come from the poll or from a dropped socket without either one stacking a
// second interval on top of the one already running.
export function restartConnectLoop(win: BrowserWindow) {
  // A drop check can still be waiting on a request when the app shuts down, and
  // restarting the loop then would outlive the database it fetches into
  if (pollingStopped) return;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (connectTimer) {
    clearInterval(connectTimer);
    connectTimer = null;
  }
  startPolling(win, false);
}

const CONNECT_INTERVAL_MS = 5_000;

const POLL_INTERVAL_MS = 60_000;

// A sync can outlast the tick that scheduled the next one — the first one after
// a connect walks a whole history — and two of them racing would fetch and
// insert the same games twice over.
let syncing = false;

// Everything the poll does on a tick, also used for the first pass right after
// connecting. Errors are handled here rather than by the caller, so a failure
// costs a reconnect instead of the timers that drive the app.
export async function pollTick(win: BrowserWindow) {
  // A socket that dropped on its own doesn't fail the poll, so without this the
  // instant capture would stay down for the rest of the session
  if (!eogSocket) {
    attachEogListener(win).catch(() => {
      // Next tick tries again
    });
  }

  // A manual backfill is already covering everything this would fetch
  if (backfillRunning || syncing) return;

  syncing = true;
  try {
    await syncGames(win);
  } catch (err) {
    console.log("Poll fetch error:", err);
    // Only a client that stops answering is a lost connection; a failure in our own
    // code (e.g. a SQL error) must not flip the status to "disconnected" every tick
    if ((await fetchGameflowPhase()) === null) restartConnectLoop(win);
  } finally {
    syncing = false;
  }
}

export function startPolling(win: BrowserWindow, firstAttempt = true) {
  pollingStopped = false;
  if (!recorderTimer) recorderTimer = setInterval(() => void recordTick(), RECORD_INTERVAL_MS);

  // Show "connecting" only on the very first attempt after app launch
  setStatus(firstAttempt ? "connecting" : "disconnected", win);

  // authenticate() shells out to PowerShell, which can take longer than a tick
  // on a busy machine. Without this, the slow tick and the one behind it both
  // go on to install a poll timer, and whichever loses the race runs on with
  // nothing left holding a handle to cancel it.
  let connecting = false;

  connectTimer = setInterval(async () => {
    if (connecting) return;
    connecting = true;
    try {
      await connect();
    } catch {
      // Client not found yet — after first attempt, show disconnected
      if (firstAttempt) {
        firstAttempt = false;
        setStatus("disconnected", win);
      }
      return;
    } finally {
      connecting = false;
    }

    setStatus("connected", win);
    if (connectTimer) {
      clearInterval(connectTimer);
      connectTimer = null;
    }

    // Installed before the first sync runs, never after. The client answers
    // authenticate() from its command line the moment it starts, seconds before
    // its HTTP server is listening, so the first sync of a session is the one
    // most likely to fail — and a failure that happened before this line left
    // the app with no connect timer and no poll timer at all: still showing
    // "connected", never noticing another game, and never retrying the
    // post-game socket, until it was restarted by hand.
    pollTimer = setInterval(() => {
      void pollTick(win);
    }, POLL_INTERVAL_MS);

    // Subscribes to the post-game results and does the initial fetch
    void pollTick(win);
  }, CONNECT_INTERVAL_MS);
}

export function stopPolling() {
  pollingStopped = true;
  if (recorderTimer) {
    clearInterval(recorderTimer);
    recorderTimer = null;
  }
  // A game still being recorded when the app closes keeps what it has
  persistRecording();
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (connectTimer) {
    clearInterval(connectTimer);
    connectTimer = null;
  }
  stopEogListener();
}

// ---- Recording your champion's stats during a game ----
//
// Runs in the main process so it works with the Live tab closed. It samples the same snapshot the tab
// shows, keeps the highest value of every stat and writes them to the database, so records like "most AP
// on Karthus" can be answered later. Sampling is every few seconds, so a buff that lasts less than that
// can slip through.

const RECORD_INTERVAL_MS = 3_000;

let recorderTimer: ReturnType<typeof setInterval> | null = null;
