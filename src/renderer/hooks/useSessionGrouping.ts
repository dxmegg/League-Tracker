import { useSyncExternalStore } from "react";
import type { SessionGrouping } from "../lib/matchSessions";

const KEY = "session_grouping";
const EVENT = "session-grouping-changed";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

const read = () => (localStorage.getItem(KEY) as SessionGrouping | null) ?? "day";

function setGrouping(value: SessionGrouping) {
  localStorage.setItem(KEY, value);
  window.dispatchEvent(new Event(EVENT));
}

export function useSessionGrouping(): [SessionGrouping, (value: SessionGrouping) => void] {
  return [useSyncExternalStore(subscribe, read), setGrouping];
}
