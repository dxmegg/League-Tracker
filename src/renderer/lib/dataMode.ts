export type DataMode = "all" | "mayhem";

export const ACTIVE_MODE_KEY = "active_mode";
export const ACTIVE_MODE_EVENT = "active-mode-changed";

// Mayhem is the app's primary mode; "all" is an explicit opt-in stored in settings.
export const DEFAULT_MODE: DataMode = "mayhem";

export function parseMode(value: unknown): DataMode {
  return value === "all" ? "all" : DEFAULT_MODE;
}

// Last mode seen in this window, so a consumer mounting later starts from the right value instead of flashing the default.
let lastMode: DataMode = DEFAULT_MODE;

export function getLastMode(): DataMode {
  return lastMode;
}

export function applyMode(mode: DataMode): void {
  lastMode = mode;
  // CSS keys the Mayhem accent off this attribute (see global.css).
  document.documentElement.setAttribute("data-mode", mode);
}

export function broadcastActiveMode(mode: DataMode): void {
  applyMode(mode);
  window.dispatchEvent(new CustomEvent(ACTIVE_MODE_EVENT, { detail: mode }));
}

if (typeof document !== "undefined") applyMode(DEFAULT_MODE);
