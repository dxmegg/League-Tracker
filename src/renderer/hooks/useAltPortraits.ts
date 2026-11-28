import { useSyncExternalStore } from "react";

const KEY = "alt_portraits";
const EVENT = "alt-portraits-changed";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

const read = () => localStorage.getItem(KEY) === "true";

function setAltPortraits(on: boolean) {
  localStorage.setItem(KEY, String(on));
  window.dispatchEvent(new Event(EVENT));
}

export function useAltPortraits(): [boolean, (on: boolean) => void] {
  return [useSyncExternalStore(subscribe, read), setAltPortraits];
}
