import { useEffect, useState } from "react";
import type {
  AccountListItem,
  HomeAccountFilter,
  HomeDashboardPayload,
  HomeTimePeriod,
} from "../../shared/api";
import { HomeDashboard } from "../components/HomeDashboard";
import { useActiveAccount } from "../hooks/useActiveAccount";
import { getAccountsWithData } from "../hooks/useChampions";
import { useLiveGame } from "../hooks/useLiveGame";
import { useViewState } from "../hooks/useViewState";
import { ALL_ACCOUNTS_SENTINEL } from "../lib/accountsEvent";
import { useScopedQueue } from "../lib/historyScope";

export default function Home() {
  const live = useLiveGame();
  const [activeAccountRaw] = useActiveAccount();
  const account: HomeAccountFilter =
    activeAccountRaw === ALL_ACCOUNTS_SENTINEL ? "all" : activeAccountRaw;
  const [timePeriod, setTimePeriod] = useViewState<HomeTimePeriod>("home.timePeriod", "30d");
  const [localQueue, setQueue] = useViewState<number | undefined>("home.queue", undefined);
  const queue = useScopedQueue(localQueue);
  const [dashboard, setDashboard] = useState<HomeDashboardPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<AccountListItem[]>([]);

  useEffect(() => {
    getAccountsWithData()
      .then(setSavedAccounts)
      .catch(() => setSavedAccounts([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    window.api
      .getHomeDashboard(account, timePeriod, queue)
      .then((data) => {
        if (!cancelled) setDashboard(data);
      })
      .catch(() => {
        if (!cancelled) setDashboard(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [account, timePeriod, queue]);

  return (
    <HomeDashboard
      account={account}
      queue={queue}
      onQueueChange={setQueue}
      timePeriod={timePeriod}
      onTimePeriodChange={setTimePeriod}
      dashboard={dashboard}
      loading={loading}
      liveGame={live.game}
      savedAccounts={savedAccounts}
    />
  );
}
