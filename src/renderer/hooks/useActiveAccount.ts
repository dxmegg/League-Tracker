import { useCallback, useEffect, useState } from "react";
import {
  ACTIVE_ACCOUNT_EVENT,
  ACTIVE_ACCOUNT_KEY,
  ALL_ACCOUNTS_SENTINEL,
  broadcastActiveAccount,
} from "../lib/accountsEvent";

export function useActiveAccount(): [string, (puuid: string) => void] {
  const [puuid, setPuuid] = useState<string>(ALL_ACCOUNTS_SENTINEL);

  useEffect(() => {
    // `cancelled` starts as a mount-race guard and doubles as an event latch:
    // once a broadcast arrives, it flips true so the in-flight getSetting
    // cannot resolve afterwards and revert the fresher value.
    let cancelled = false;

    const initialRead = window.api
      .getSetting(ACTIVE_ACCOUNT_KEY)
      .then((value) => (value ?? ALL_ACCOUNTS_SENTINEL) as string)
      .catch(() => ALL_ACCOUNTS_SENTINEL as string);

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      cancelled = true;
      setPuuid(typeof detail === "string" ? detail : ALL_ACCOUNTS_SENTINEL);
    };
    window.addEventListener(ACTIVE_ACCOUNT_EVENT, handler);

    initialRead.then((value) => {
      if (cancelled) return;
      setPuuid(value);
    });

    return () => {
      cancelled = true;
      window.removeEventListener(ACTIVE_ACCOUNT_EVENT, handler);
    };
  }, []);

  const setActiveAccount = useCallback((next: string) => {
    void window.api.setSetting(ACTIVE_ACCOUNT_KEY, next);
    broadcastActiveAccount(next);
  }, []);

  return [puuid, setActiveAccount];
}
