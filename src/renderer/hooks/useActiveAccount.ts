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
    let cancelled = false;
    window.api
      .getSetting(ACTIVE_ACCOUNT_KEY)
      .then((value) => {
        if (!cancelled) setPuuid(value ?? ALL_ACCOUNTS_SENTINEL);
      })
      .catch(() => {
        if (!cancelled) setPuuid(ALL_ACCOUNTS_SENTINEL);
      });

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      setPuuid(typeof detail === "string" ? detail : ALL_ACCOUNTS_SENTINEL);
    };
    window.addEventListener(ACTIVE_ACCOUNT_EVENT, handler);
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
