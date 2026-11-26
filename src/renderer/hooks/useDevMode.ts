import { useSyncExternalStore } from "react";
import { DEFAULT_THEME } from "../lib/themes";

// Developer mode shows the testing tools. sessionStorage on purpose: every launch starts with it off.
const KEY = "dev_mode";
const EVENT = "dev-mode-changed";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

const read = () => sessionStorage.getItem(KEY) === "true";

function setDevMode(on: boolean) {
  sessionStorage.setItem(KEY, String(on));
  if (!on) document.documentElement.setAttribute("data-theme", DEFAULT_THEME);
  window.dispatchEvent(new Event(EVENT));
}

export function useDevMode(): [boolean, (on: boolean) => void] {
  return [useSyncExternalStore(subscribe, read), setDevMode];
}
