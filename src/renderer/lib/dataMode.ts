export type DataMode = "all" | "mayhem";

export const ACTIVE_MODE_KEY = "active_mode";
export const ACTIVE_MODE_EVENT = "active-mode-changed";

export function broadcastActiveMode(mode: DataMode): void {
  // CSS keys the Mayhem accent off this attribute (see global.css).
  document.documentElement.setAttribute("data-mode", mode);
  window.dispatchEvent(new CustomEvent(ACTIVE_MODE_EVENT, { detail: mode }));
}
