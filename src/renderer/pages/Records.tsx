import { readViewState, writeViewState } from "../lib/viewState";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useIpc } from "../hooks/useIpc";
import { useHistoryScopeQueue } from "../lib/historyScope";
import { getAccountsWithData, invalidateAccountsCache } from "../hooks/useChampions";
import type { AccountListItem, RecordsData } from "../lib/types";
import { RecordsView } from "../components/RecordsView";
import { ALL_ACCOUNTS_SENTINEL } from "../lib/accountsEvent";

export default function Records() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Both effects run on mount in this order: read the saved query before it is overwritten
  useEffect(() => {
    const saved = readViewState("records.params", "");
    if (saved && !searchParams.toString()) setSearchParams(saved, { replace: true });
    // Mount only: rerunning would bring back a filter the user just cleared
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => writeViewState("records.params", searchParams.toString()), [searchParams]);
  const queueParam = searchParams.get("queue");
  const q = queueParam == null ? undefined : Number(queueParam);
  const queue = q !== undefined && Number.isFinite(q) ? q : undefined;
  const accountParam = searchParams.get("account") || undefined;
  const urlAccount = accountParam || "all";
  const setQueue = useCallback(
    (q: number | undefined) => {
      setSearchParams(
        (prev) => {
          const current = prev.get("queue");
          const nextValue = q == null ? null : String(q);
          if (current === nextValue) return prev;
          const next = new URLSearchParams(prev);
          if (q == null) next.delete("queue");
          else next.set("queue", String(q));
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const setAccount = useCallback(
    (puuid: string | undefined) => {
      setSearchParams(
        (prev) => {
          const current = prev.get("account") ?? ALL_ACCOUNTS_SENTINEL;
          const nextValue = puuid ?? ALL_ACCOUNTS_SENTINEL;
          if (current === nextValue) return prev;
          const next = new URLSearchParams(prev);
          if (nextValue === ALL_ACCOUNTS_SENTINEL) next.delete("account");
          else next.set("account", nextValue);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const historyScopeQueue = useHistoryScopeQueue();
  const scopedQueue = queue ?? historyScopeQueue;
  const accountForFetch = urlAccount;
  const { data, error, refetch } = useIpc<RecordsData>(
    () => window.api.getRecords(scopedQueue, accountForFetch),
    [scopedQueue, accountForFetch],
  );
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);

  useEffect(() => {
    getAccountsWithData()
      .then(setAccounts)
      .catch((error: unknown) => {
        console.warn("Could not load accounts for records:", error);
      });
  }, []);

  useEffect(() => {
    const unsub = window.api.onGamesUpdated(() => {
      invalidateAccountsCache();
      void refetch();
    });
    return unsub;
  }, [refetch]);

  const activeAccount = accounts.find((item) => item.puuid === accountForFetch);
  const accountName = activeAccount
    ? `${activeAccount.gameName ?? "Unknown account"}${activeAccount.tagLine ? `#${activeAccount.tagLine}` : ""}`
    : undefined;
  const accountValue = accountForFetch === "all" ? undefined : accountForFetch;
  return (
    <RecordsView
      data={data}
      error={error}
      onRetry={refetch}
      accountName={accountName}
      queue={queue}
      onQueueChange={setQueue}
      account={accountValue}
      accounts={accounts}
      onAccountChange={setAccount}
    />
  );
}
