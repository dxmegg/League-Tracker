import { useEffect, useState, type ReactNode } from "react";
import type { HomeAccountFilter, HomeDashboardPayload, HomeTimePeriod } from "../../shared/api";
import { YourRecord } from "../components/HomeDashboard";
import { LiveRecords } from "../components/live/LiveRecords";
import { LiveSavedGames } from "../components/live/LiveSavedGames";
import { useActiveAccount } from "../hooks/useActiveAccount";
import { useViewState } from "../hooks/useViewState";
import { ALL_ACCOUNTS_SENTINEL } from "../lib/accountsEvent";
import { useScopedQueue } from "../lib/historyScope";

function From({ origin, children }: { origin: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-lol-text/70">
        Was on: {origin}
      </h2>
      {children}
    </div>
  );
}

// Follows the account, mode and period chosen on Home
function HomeRecord() {
  const [activeAccount] = useActiveAccount();
  const account: HomeAccountFilter =
    activeAccount === ALL_ACCOUNTS_SENTINEL ? "all" : activeAccount;
  const [timePeriod] = useViewState<HomeTimePeriod>("home.timePeriod", "30d");
  const [localQueue] = useViewState<number | undefined>("home.queue", undefined);
  const queue = useScopedQueue(localQueue);
  const [dashboard, setDashboard] = useState<HomeDashboardPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.api
      .getHomeDashboard(account, timePeriod, queue)
      .then((data) => {
        if (!cancelled) setDashboard(data);
      })
      .catch(() => {
        if (!cancelled) setDashboard(null);
      });
    return () => {
      cancelled = true;
    };
  }, [account, timePeriod, queue]);

  const summary = dashboard?.summary;
  return (
    <YourRecord
      wins={summary?.wins ?? 0}
      losses={summary?.losses ?? 0}
      games={summary?.totalGames ?? 0}
      periodText={timePeriod === "full" ? "all time" : `last ${timePeriod}`}
    />
  );
}

export default function WipRandom() {
  return (
    <div className="flex min-h-full w-full flex-col gap-5">
      <From origin="Home, below the mode and period filters">
        <HomeRecord />
      </From>
      <From origin="Live Game">
        <LiveRecords />
      </From>
      <From origin="Live Game">
        <LiveSavedGames />
      </From>
    </div>
  );
}
