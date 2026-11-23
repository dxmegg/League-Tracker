import { useCallback, useEffect, useState } from "react";
import {
  ACTIVE_MODE_EVENT,
  ACTIVE_MODE_KEY,
  applyMode,
  broadcastActiveMode,
  getLastMode,
  parseMode,
  type DataMode,
} from "../lib/dataMode";

// Same shape as useActiveAccount: persisted setting + window event so every consumer stays in sync.
export function useActiveMode(): [DataMode, (mode: DataMode) => void] {
  const [mode, setMode] = useState<DataMode>(getLastMode);

  useEffect(() => {
    // `cancelled` doubles as an event latch so a slow initial read can't revert a fresher broadcast.
    let cancelled = false;

    const handler = (event: Event) => {
      cancelled = true;
      setMode(parseMode((event as CustomEvent<DataMode>).detail));
    };
    window.addEventListener(ACTIVE_MODE_EVENT, handler);

    window.api
      .getSetting(ACTIVE_MODE_KEY)
      .then((value) => {
        if (cancelled) return;
        const next = parseMode(value);
        applyMode(next);
        setMode(next);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      window.removeEventListener(ACTIVE_MODE_EVENT, handler);
    };
  }, []);

  const setActiveMode = useCallback((next: DataMode) => {
    void window.api.setSetting(ACTIVE_MODE_KEY, next);
    broadcastActiveMode(next);
  }, []);

  return [mode, setActiveMode];
}
