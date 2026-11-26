import { useSyncExternalStore } from "react";

// Whether the rail offers "All" next to Mayhem. Read once before the first render, so the button
// does not flash in and out.
const KEY = "show_all_mode";
const EVENT = "show-all-mode-changed";

let shown = true;

export function initShowAllMode(stored: unknown) {
  shown = stored !== "false";
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

const read = () => shown;

function setShowAllMode(on: boolean) {
  shown = on;
  void window.api.setSetting(KEY, String(on));
  window.dispatchEvent(new Event(EVENT));
}

export function useShowAllMode(): [boolean, (on: boolean) => void] {
  return [useSyncExternalStore(subscribe, read), setShowAllMode];
}
