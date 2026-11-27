import { useSyncExternalStore } from "react";

// Developer mode shows the testing tools. Remembered between launches; until switched, it is on
// when run from source (npm run dev) and off in the installed app.
const KEY = "dev_mode";
const EVENT = "dev-mode-changed";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

const read = () => (localStorage.getItem(KEY) ?? String(import.meta.env.DEV)) === "true";

function setDevMode(on: boolean) {
  localStorage.setItem(KEY, String(on));
  window.dispatchEvent(new Event(EVENT));
}

export function useDevMode(): [boolean, (on: boolean) => void] {
  return [useSyncExternalStore(subscribe, read), setDevMode];
}
