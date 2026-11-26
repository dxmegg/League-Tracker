import { useEffect } from "react";
import { TrendsView, type TimeRange } from "../components/TrendsView";
import { useActiveAccount } from "../hooks/useActiveAccount";
import { useIpc } from "../hooks/useIpc";
import { useViewState } from "../hooks/useViewState";
import { ALL_ACCOUNTS_SENTINEL } from "../lib/accountsEvent";
import { useHistoryScopeQueue } from "../lib/historyScope";
import type { TrendsData } from "../lib/types";

export default function Trends() {
  const [activeAccountRaw] = useActiveAccount();
  const account = activeAccountRaw === ALL_ACCOUNTS_SENTINEL ? "all" : activeAccountRaw;
  const [timeRange, setTimeRange] = useViewState<TimeRange>("trends.timeRange", "12w");
  const scopedQueue = useHistoryScopeQueue();
  const { data, error, refetch } = useIpc<TrendsData>(
    () => window.api.getTrends(scopedQueue, account, timeRange, undefined),
    [scopedQueue, account, timeRange],
  );

  useEffect(() => {
    const unsub = window.api.onGamesUpdated(() => refetch());
    return unsub;
  }, [refetch]);

  return (
    <div className="flex flex-col gap-4">
      <TrendsView
        data={data}
        error={error}
        onRetry={refetch}
        timeRange={timeRange}
        setTimeRange={setTimeRange}
      />
    </div>
  );
}
