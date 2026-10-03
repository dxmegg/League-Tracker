import { useEffect, useState } from "react";
import type {
  AccountListItem,
  HomeAccountFilter,
  HomeDashboardPayload,
  HomeTimePeriod,
  MatchListItem,
} from "../../shared/api";
import {
  QUEUE_SCOPE_RANKED,
  QUEUE_SCOPE_NORMAL,
  QUEUE_SCOPE_ARENA,
  QUEUE_SCOPE_ARAM,
  QUEUE_SCOPE_MAYHEM,
} from "../../shared/queues";
import ChampionIcon from "../components/ChampionIcon";
import { HomeHero } from "../components/HomeHero";
import { HomeCard } from "../components/HomeCard";
import { Panel } from "../components/Panel";
import { useActiveAccount } from "../hooks/useActiveAccount";
import { useChampionData } from "../hooks/useChampions";
import { ALL_ACCOUNTS_SENTINEL } from "../lib/accountsEvent";
import { NavLink } from "react-router-dom";
import { GameRow } from "./MatchHistory";

const TIME_PERIODS: HomeTimePeriod[] = ["24h", "7d", "30d", "full"];

const MATCH_HISTORY_LINKS = [
  { to: "/history/mayhem", label: "ARAM Mayhem History" },
  { to: "/history/aram", label: "ARAM History" },
  { to: "/history/arena", label: "Arena History" },
  { to: "/history/ranked", label: "Ranked History" },
  { to: "/history/normal", label: "Normal History" },
];

const QUEUE_FILTERS: Array<{ label: string; value: number | undefined }> = [
  { label: "All", value: undefined },
  { label: "Ranked", value: QUEUE_SCOPE_RANKED },
  { label: "Normal", value: QUEUE_SCOPE_NORMAL },
  { label: "Arena", value: QUEUE_SCOPE_ARENA },
  { label: "ARAM", value: QUEUE_SCOPE_ARAM },
  { label: "Mayhem", value: QUEUE_SCOPE_MAYHEM },
];

function timePeriodLabel(timePeriod: HomeTimePeriod): string {
  if (timePeriod === "24h") return "24 hours";
  if (timePeriod === "30d") return "30 days";
  if (timePeriod === "full") return "full history";
  return "7 days";
}

function formatShortDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function RecordTile({
  label,
  record,
}: {
  label: string;
  record: {
    value: number;
    championId: number;
    gameId: number;
    gameCreation: number;
    win: number;
  } | null;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-lol-border/40 bg-white/[0.02] p-3 transition-colors hover:border-lol-crimson/60 hover:bg-lol-crimson/[0.04]">
      <div className="text-[10px] font-bold uppercase tracking-wider text-lol-text">{label}</div>
      <div className="text-center text-2xl font-bold text-lol-text-bright">
        {record ? record.value.toLocaleString() : "—"}
      </div>
      {record && (
        <div className="mt-1 flex items-center gap-2">
          <ChampionIcon championId={record.championId} size={28} />
          <div className="min-w-0 flex-1">
            <div
              className={`text-[10px] font-bold uppercase tracking-wider ${
                record.win ? "text-lol-win" : "text-lol-loss"
              }`}
            >
              {record.win ? "WIN" : "LOSS"}
            </div>
            <div className="text-[10px] text-lol-text">{formatShortDate(record.gameCreation)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function RecordsCard({
  dashboard,
  loading,
}: {
  dashboard: HomeDashboardPayload | null;
  loading: boolean;
}) {
  const records = dashboard?.records;

  return (
    <HomeCard className="flex h-full flex-col p-5 xl:p-6 2xl:p-7">
      <div
        className={`flex h-full flex-col gap-3 transition-opacity ${loading ? "opacity-50" : ""}`}
      >
        <div className="text-center text-2xl font-bold text-lol-text-bright">Records</div>
        <div className="grid flex-1 grid-cols-3 gap-3">
          <RecordTile label="Most Kills" record={records?.mostKills ?? null} />
          <RecordTile label="Most Deaths" record={records?.mostDeaths ?? null} />
          <RecordTile label="Most Assists" record={records?.mostAssists ?? null} />
          <RecordTile label="Most Damage" record={records?.mostDamage ?? null} />
          <RecordTile label="Biggest Crit" record={records?.biggestCrit ?? null} />
          <RecordTile label="Most CS" record={records?.mostCs ?? null} />
        </div>
      </div>
    </HomeCard>
  );
}

function QueueFilterChips({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (queue: number | undefined) => void;
}) {
  return (
    <div className="ml-auto flex items-center gap-2">
      {QUEUE_FILTERS.map((filter) => {
        const isActive = JSON.stringify(value ?? []) === JSON.stringify(filter.value ?? []);
        return (
          <button
            key={filter.label}
            type="button"
            onClick={() => onChange(filter.value)}
            className={`rounded-md border px-3 py-1 text-xs font-bold uppercase tracking-wider transition-colors ${
              isActive
                ? "border-lol-crimson/60 bg-lol-crimson/20 text-lol-text-bright"
                : "border-lol-border/50 bg-lol-card/40 text-lol-text hover:border-lol-crimson/60 hover:bg-lol-crimson/10 hover:text-lol-text-bright"
            }`}
          >
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}

function MatchHistoryNav() {
  return (
    <HomeCard className="p-4">
      <nav className="flex flex-col gap-0.5">
        {MATCH_HISTORY_LINKS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `block rounded-md px-3 py-2 text-xs font-bold tracking-wider transition-colors ${
                isActive
                  ? "bg-lol-crimson/30 text-lol-text-bright"
                  : "text-lol-text hover:bg-white/[0.05] hover:text-lol-text-bright"
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </HomeCard>
  );
}

function MatchListPanel({
  account,
  queue,
  timePeriod,
}: {
  account: HomeAccountFilter;
  queue: number | undefined;
  timePeriod: HomeTimePeriod;
}) {
  const [matches, setMatches] = useState<MatchListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const champData = useChampionData();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    window.api
      .getHomeMatchList(account, queue, 20)
      .then((payload) => {
        if (!cancelled) setMatches(payload.matches);
      })
      .catch(() => {
        if (!cancelled) setMatches([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [account, queue]);

  return (
    <div
      className={`flex h-full min-h-0 flex-col gap-1 transition-opacity ${loading ? "opacity-50" : ""}`}
    >
      <div className="flex-1 min-h-[280px] overflow-y-auto pr-1">
        {matches.map((match) => (
          <GameRow
            key={match.game_id}
            match={match}
            champData={champData}
            expanded={false}
            detail={null}
            detailLoading={false}
            puuids={null}
            onToggle={() => undefined}
            onContextMenu={() => undefined}
            expandable={false}
            compact
          />
        ))}
        {!loading && matches.length === 0 && (
          <HomeCard className="flex flex-col items-center justify-center gap-2 p-6 text-center">
            <p className="text-sm font-semibold text-lol-text-bright">
              No games recorded in the last {timePeriodLabel(timePeriod)}
            </p>
            <p className="text-xs text-lol-text">Try a longer time period or a different filter.</p>
          </HomeCard>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [activeAccountRaw] = useActiveAccount();
  const account: HomeAccountFilter =
    activeAccountRaw === ALL_ACCOUNTS_SENTINEL ? "all" : activeAccountRaw;
  const [timePeriod, setTimePeriod] = useState<HomeTimePeriod>("7d");
  const [queue, setQueue] = useState<number | undefined>(undefined);
  const [dashboard, setDashboard] = useState<HomeDashboardPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<AccountListItem[]>([]);

  useEffect(() => {
    window.api
      .listAccountsWithData()
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
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[30px] font-bold leading-tight tracking-[0.2px] text-lol-text-bright">
            {account === "all" ? "All accounts" : "Account summary"}
          </h1>
          <p className="mt-1.5 text-lol-text">
            {account === "all"
              ? `Combined stats from your ${savedAccounts.length} saved accounts`
              : "Detailed stats for the selected account"}
          </p>
        </div>
        <div className="inline-flex rounded-[10px] border border-lol-border bg-lol-card p-[3px]">
          {TIME_PERIODS.map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => setTimePeriod(period)}
              className={`rounded-[7px] px-4 py-1.5 font-display text-[13px] font-semibold transition-colors ${
                period === timePeriod
                  ? "bg-lol-crimson text-white"
                  : "text-lol-text hover:text-lol-text-bright"
              }`}
            >
              {period === "full" ? "Full" : period}
            </button>
          ))}
        </div>
      </div>

      <Panel>
        <HomeHero dashboard={dashboard} loading={loading} timePeriod={timePeriod} />
      </Panel>

      <RecordsCard dashboard={dashboard} loading={loading} />

      <div className="grid flex-1 min-h-0 grid-cols-[220px_1fr] items-stretch gap-4">
        <div className="flex flex-col gap-3">
          <div className="text-center text-xl font-bold text-lol-text-bright">Match History</div>
          <MatchHistoryNav />
        </div>
        <div className="flex min-h-0 flex-col gap-3">
          <div className="flex items-center gap-4">
            <div className="text-xl font-bold text-lol-text-bright">Last 20 played games</div>
            <QueueFilterChips value={queue} onChange={setQueue} />
          </div>
          <MatchListPanel account={account} queue={queue} timePeriod={timePeriod} />
        </div>
      </div>
    </div>
  );
}
