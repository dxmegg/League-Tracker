import { useSyncExternalStore } from "react";
import type { UpdateInfo, UpdateProgress } from "../../shared/api";

export type UpdaterState = {
  status: "idle" | "checking" | "updating";
  info: UpdateInfo | null;
  progress: UpdateProgress | null;
  error: string | null;
  checkedAt: number | null;
};

// Module-level, so a download keeps its progress while the user browses other pages
let state: UpdaterState = {
  status: "idle",
  info: null,
  progress: null,
  error: null,
  checkedAt: null,
};
const listeners = new Set<() => void>();

export function setUpdaterState(patch: Partial<UpdaterState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useUpdater(): UpdaterState {
  return useSyncExternalStore(subscribe, () => state);
}

export async function checkForUpdates() {
  if (state.status !== "idle") return;
  setUpdaterState({ status: "checking", error: null });
  try {
    const info = await window.api.checkForUpdate();
    // A failed check must not drop an update already found
    setUpdaterState({
      status: "idle",
      info: info.error && state.info ? state.info : info,
      error: info.error ?? null,
      checkedAt: Date.now(),
    });
  } catch {
    setUpdaterState({ status: "idle", error: "Failed to check for updates" });
  }
}

export async function installUpdate() {
  const assetUrl = state.info?.assetUrl;
  if (state.status !== "idle" || !assetUrl) return;
  setUpdaterState({ status: "updating", progress: null, error: null });
  const off = window.api.onUpdateProgress((progress) => setUpdaterState({ progress }));
  try {
    const result = await window.api.downloadUpdate(assetUrl);
    // On success the app is about to quit, so the "Installing" state stays up
    if (!result.success) {
      setUpdaterState({ status: "idle", error: result.error ?? "Update failed" });
    }
  } catch {
    setUpdaterState({ status: "idle", error: "Update failed" });
  } finally {
    off();
  }
}

// Gives the League client time to report a running game before anything restarts the app
const AUTO_INSTALL_DELAY_MS = 8_000;
// While the app stays open: only looks, the install still waits for a click or the next start
const RECHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
let started = false;

export async function startUpdater() {
  if (started) return;
  started = true;
  setInterval(() => void checkForUpdates(), RECHECK_INTERVAL_MS);
  await checkForUpdates();
  const { info } = state;
  if (!info?.hasUpdate || !info.canInstall || !info.latest) return;
  if ((await window.api.getSetting("auto_update")) === "false") return;
  // One automatic try per version: a mis-tagged release must not restart the app forever
  if ((await window.api.getSetting("update_attempted")) === info.latest) return;
  await new Promise((resolve) => setTimeout(resolve, AUTO_INSTALL_DELAY_MS));
  // Restarting mid-game would lose the live data being recorded
  if ((await window.api.getLcuStatus()) === "ingame") return;
  await window.api.setSetting("update_attempted", info.latest);
  await installUpdate();
}
