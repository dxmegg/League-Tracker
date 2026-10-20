import { useEffect, useMemo, useState } from "react";
import type {
  AccountListItem,
  HomeAccountFilter,
  HomeDashboardPayload,
  MatchDetail,
  HomeTimePeriod,
  MatchListItem,
  RoleBreakdown,
} from "../../shared/api";
import {
  QUEUE_SCOPE_RANKED,
  QUEUE_SCOPE_NORMAL,
  QUEUE_SCOPE_ARENA,
  QUEUE_SCOPE_ARAM,
  QUEUE_SCOPE_MAYHEM,
} from "../../shared/queues";
import ChampionIcon from "../components/ChampionIcon";
import { ChampCard } from "../components/ChampCard";
import { EmptyState } from "../components/EmptyState";
import { HomeHero } from "../components/HomeHero";
import { HomeCard } from "../components/HomeCard";
import { LiveGameTile } from "../components/LiveGameTile";
import { MatchRowExperiment } from "../components/MatchRowExperiment";
import { Panel } from "../components/Panel";
import { RecordTile } from "../components/RecordTile";
import SummonerIcon from "../components/SummonerIcon";
import { useActiveAccount } from "../hooks/useActiveAccount";
import { useActiveTheme } from "../hooks/useActiveTheme";
import { getAccountsWithData, getChampionName, useChampionData } from "../hooks/useChampions";
import { useLiveGame } from "../hooks/useLiveGame";
import { useViewState } from "../hooks/useViewState";
import { ALL_ACCOUNTS_SENTINEL } from "../lib/accountsEvent";
import { NavLink } from "react-router-dom";
import { GameRow } from "./MatchHistory";

export const TIME_PERIODS: HomeTimePeriod[] = ["24h", "7d", "30d", "full"];

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

const periodLabel = (period: HomeTimePeriod): string => (period === "full" ? "FULL" : period);
const LIVE_GAME_MODE_LABEL: Record<string, string> = {
  KIWI: "ARAM Mayhem",
  ARAM: "ARAM",
  CLASSIC: "Classic",
};
const formatLiveGameTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
};
const ROLE_LABELS: Record<RoleBreakdown["role"], string> = {
  TOP: "Top",
  JUNGLE: "Jungle",
  MIDDLE: "Mid",
  BOTTOM: "ADC",
  UTILITY: "Support",
  NO_POSITION: "No position",
};
const ROLE_BADGES: Record<RoleBreakdown["role"], string> = {
  TOP: "TOP",
  JUNGLE: "JGL",
  MIDDLE: "MID",
  BOTTOM: "BOT",
  UTILITY: "SUP",
  NO_POSITION: "—",
};
const NEON_PANEL_CLASS =
  "border border-white/[0.08] shadow-[0_0_15px_rgba(255,255,255,0.02)] hover:border-lol-crimson/30 hover:shadow-[0_0_20px_rgba(220,38,38,0.1)] transition-all";

function StatValue({
  label,
  value,
  className,
}: {
  label: string;
  value: number | string;
  className: string;
}) {
  return (
    <div className="min-w-0">
      <div className={`text-2xl font-bold ${className}`}>{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-lol-text">{label}</div>
    </div>
  );
}

function PlayerSummaryCard({
  dashboard,
  loading,
  account,
  savedAccounts,
  onAccountChange,
  timePeriod,
  onTimePeriodChange,
}: {
  dashboard: HomeDashboardPayload | null;
  loading: boolean;
  account: HomeAccountFilter;
  savedAccounts: AccountListItem[];
  onAccountChange: (account: HomeAccountFilter) => void;
  timePeriod: HomeTimePeriod;
  onTimePeriodChange: (timePeriod: HomeTimePeriod) => void;
}) {
  const [currentPuuid, setCurrentPuuid] = useState<string | null>(null);

  useEffect(() => {
    window.api
      .getCurrentPuuid()
      .then(setCurrentPuuid)
      .catch(() => setCurrentPuuid(null));
  }, []);

  const selectedAccount = useMemo(
    () =>
      typeof account === "string" ? savedAccounts.find((item) => item.puuid === account) : null,
    [account, savedAccounts],
  );
  const isAllAccounts = account === undefined || account === "all";
  const winRate =
    dashboard && dashboard.summary.totalGames > 0
      ? `${((dashboard.summary.wins / dashboard.summary.totalGames) * 100).toFixed(0)}% WR`
      : "—";

  return (
    <HomeCard className="flex h-full p-5 xl:p-6 2xl:p-7">
      <div
        className={`grid h-full grid-cols-[180px_1fr] gap-4 transition-opacity ${loading ? "opacity-50" : ""}`}
      >
        <div className="flex flex-col gap-3">
          <div className="flex justify-center">
            {isAllAccounts ? (
              <div className="flex flex-col gap-2 rounded-lg border border-lol-crimson/40 bg-lol-card/40 p-3">
                <div className="text-center text-[10px] font-bold uppercase tracking-wider text-lol-text">
                  Saved Accounts
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {savedAccounts.slice(0, 9).map((acc) => (
                    <SummonerIcon
                      key={acc.puuid}
                      iconId={acc.profileIconId ?? null}
                      size={56}
                      className="rounded-lg border border-lol-border/40 bg-lol-dark object-cover"
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div
                className="shrink-0 rounded-lg border border-lol-crimson/40 p-[4px] shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)]"
                style={{
                  background: "linear-gradient(138deg, #7d1a1a 0%, #c73e3e 50%, #7d1a1a 100%)",
                }}
              >
                <SummonerIcon
                  iconId={selectedAccount?.profileIconId ?? null}
                  size={136}
                  className="rounded-md bg-lol-dark object-cover"
                />
              </div>
            )}
          </div>
          <div className="min-h-0">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-lol-text">
                Saved Accounts
              </div>
              <button
                type="button"
                onClick={() => onAccountChange("all")}
                className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  isAllAccounts
                    ? "border border-lol-crimson/60 bg-lol-crimson/20 text-lol-text-bright"
                    : "text-lol-text hover:bg-lol-crimson/10 hover:text-lol-text-bright"
                }`}
              >
                ALL ACCOUNTS
              </button>
            </div>
            <div className="flex max-h-[260px] flex-col gap-1 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {savedAccounts.map((savedAccount) => {
                const isActive = savedAccount.puuid === account;
                return (
                  <button
                    key={savedAccount.puuid}
                    type="button"
                    onClick={() => onAccountChange(savedAccount.puuid)}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                      isActive
                        ? "bg-lol-gold/15 text-lol-text-bright"
                        : "text-lol-text hover:bg-white/[0.04]"
                    }`}
                  >
                    <SummonerIcon
                      iconId={savedAccount.profileIconId}
                      size={24}
                      className="rounded-lg"
                    />
                    <span className="truncate text-xs">
                      {savedAccount.gameName ?? "Unknown"}
                      {savedAccount.tagLine ? `#${savedAccount.tagLine}` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {isAllAccounts ? (
                <div className="break-words text-2xl font-bold text-lol-text-bright">
                  All accounts summarised
                </div>
              ) : (
                <>
                  <div className="break-words text-2xl font-bold text-lol-text-bright">
                    {selectedAccount?.gameName ?? "Unknown"}
                  </div>
                  {selectedAccount?.tagLine && (
                    <div className="text-sm text-lol-text">#{selectedAccount.tagLine}</div>
                  )}
                </>
              )}
              {!isAllAccounts && (
                <div className="text-xs text-lol-text">
                  {currentPuuid === account ? "Connected" : "Unranked"}
                </div>
              )}
            </div>
            <div className="flex shrink-0 rounded-lg border border-lol-border/60 bg-lol-card/60 p-0.5">
              {TIME_PERIODS.map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => onTimePeriodChange(period)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-bold transition-colors ${
                    period === timePeriod
                      ? "border-lol-crimson/60 bg-lol-crimson/20 text-lol-text-bright"
                      : "border-transparent text-lol-text hover:border-lol-crimson/40 hover:bg-lol-crimson/10 hover:text-lol-text-bright"
                  }`}
                >
                  {periodLabel(period)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-baseline gap-3 text-xl">
            <span className="font-bold text-lol-text-bright">
              Last {timePeriodLabel(timePeriod)}
            </span>
            <span className="text-sm text-lol-text">
              {dashboard?.summary.totalGames ?? 0} games
            </span>
            <span className="text-lol-win">{dashboard?.summary.wins ?? 0}W</span>
            <span className="text-lol-loss/70">{dashboard?.summary.losses ?? 0}L</span>
            <span className="font-semibold text-lol-gold">{winRate}</span>
          </div>

          <div className="h-px bg-gradient-to-r from-lol-gold/20 via-lol-gold/10 to-transparent" />

          <div className="grid grid-cols-4 gap-3">
            <StatValue
              label="Kills"
              value={dashboard?.summary.totalKills ?? 0}
              className="text-amber-400"
            />
            <StatValue
              label="Deaths"
              value={dashboard?.summary.totalDeaths ?? 0}
              className="text-red-400"
            />
            <StatValue
              label="Assists"
              value={dashboard?.summary.totalAssists ?? 0}
              className="text-sky-400"
            />
            <StatValue
              label="Average K/D/A"
              value={(dashboard?.summary.avgKda ?? 0).toFixed(2)}
              className="text-lol-text-bright"
            />
          </div>

          <div className="h-px bg-gradient-to-r from-lol-gold/20 via-lol-gold/10 to-transparent" />

          <div>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-lol-text">
              Most played champions
            </div>
            <div className="grid grid-cols-5 gap-3">
              {(dashboard?.topChampions ?? []).slice(0, 10).map((champion) => (
                <div key={champion.championId} className="flex min-w-0 flex-col items-center gap-1">
                  <ChampionIcon championId={champion.championId} size={48} className="rounded-lg" />
                  <div className="text-xs font-semibold text-lol-win">{champion.wins}W</div>
                  <div className="text-xs text-lol-loss/70">{champion.games - champion.wins}L</div>
                  <div className="text-[10px] text-lol-text">{champion.games} games</div>
                  <div className="text-[10px] text-lol-text">
                    {Math.round(champion.winRate * 100)}% WR
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </HomeCard>
  );
}

function formatShortDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function LegacyRecordTile({
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
          <LegacyRecordTile label="Most Kills" record={records?.mostKills ?? null} />
          <LegacyRecordTile label="Most Deaths" record={records?.mostDeaths ?? null} />
          <LegacyRecordTile label="Most Assists" record={records?.mostAssists ?? null} />
          <LegacyRecordTile label="Most Damage" record={records?.mostDamage ?? null} />
          <LegacyRecordTile label="Biggest Crit" record={records?.biggestCrit ?? null} />
          <LegacyRecordTile label="Most CS" record={records?.mostCs ?? null} />
        </div>
      </div>
    </HomeCard>
  );
}

function EmptyPlaceholderCard() {
  return <HomeCard className="h-full" aria-hidden="true" />;
}

export function QueueFilterChips({
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
  experiment = false,
}: {
  account: HomeAccountFilter;
  queue: number | undefined;
  timePeriod: HomeTimePeriod;
  experiment?: boolean;
}) {
  const [matches, setMatches] = useState<MatchListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
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

  useEffect(() => {
    if (expandedId == null) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetail(null);
    window.api
      .getMatchDetail(expandedId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expandedId]);

  const handleToggle = (gameId: number) => {
    setExpandedId((prev) => (prev === gameId ? null : gameId));
  };

  if (experiment) {
    return (
      <div className={`transition-opacity ${loading ? "opacity-50" : ""}`}>
        <div className="match-list-exp overflow-y-auto">
          {matches.map((match) => (
            <MatchRowExperiment
              key={match.game_id}
              match={match}
              championName={getChampionName(champData, match.champion_id)}
              champData={champData}
              expanded={expandedId === match.game_id}
              detail={expandedId === match.game_id ? detail : null}
              detailLoading={expandedId === match.game_id && detailLoading}
              puuids={null}
              onToggle={() => handleToggle(match.game_id)}
            />
          ))}
          {!loading && matches.length === 0 && (
            <Panel className="py-6 text-center text-sm text-lol-text">
              No games recorded in the last {timePeriodLabel(timePeriod)}
            </Panel>
          )}
        </div>
      </div>
    );
  }

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
  const activeTheme = useActiveTheme();
  const isExperiment = activeTheme === "experiment";
  const live = useLiveGame();
  const [activeAccountRaw, setActiveAccountRaw] = useActiveAccount();
  const account: HomeAccountFilter =
    activeAccountRaw === ALL_ACCOUNTS_SENTINEL ? "all" : activeAccountRaw;
  const setAccount = (next: HomeAccountFilter) => {
    setActiveAccountRaw(next === "all" || next === undefined ? ALL_ACCOUNTS_SENTINEL : next);
  };
  const [timePeriod, setTimePeriod] = useViewState<HomeTimePeriod>("home.timePeriod", "7d");
  const [queue, setQueue] = useViewState<number | undefined>("home.queue", undefined);
  const [dashboard, setDashboard] = useState<HomeDashboardPayload | null>(null);
  const [roleBreakdown, setRoleBreakdown] = useState<RoleBreakdown[]>([]);
  const [loading, setLoading] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<AccountListItem[]>([]);
  const [championSort, setChampionSort] = useState<"games" | "winRate">("games");
  const [showAllChampions, setShowAllChampions] = useState(false);
  const champData = useChampionData();
  const hasLiveActivity = Boolean(live.game || (live.session && live.session.phase !== "None"));
  const sortedTopChampions = useMemo(
    () =>
      [...(dashboard?.topChampions ?? [])].sort((a, b) =>
        championSort === "winRate"
          ? b.winRate - a.winRate || b.games - a.games
          : b.games - a.games || b.winRate - a.winRate,
      ),
    [championSort, dashboard?.topChampions],
  );
  const visibleTopChampions = showAllChampions
    ? sortedTopChampions
    : sortedTopChampions.slice(0, 24);
  const visibleRoles = roleBreakdown.filter((role) => role.games > 0);

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

  useEffect(() => {
    let cancelled = false;
    window.api
      .getRoleBreakdown(account, queue, timePeriod)
      .then((roles) => {
        if (!cancelled) setRoleBreakdown(roles);
      })
      .catch(() => {
        if (!cancelled) setRoleBreakdown([]);
      });
    return () => {
      cancelled = true;
    };
  }, [account, timePeriod, queue]);

  if (isExperiment) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
        {/* Page head + time toggle */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[30px] font-bold uppercase leading-tight tracking-widest text-lol-text-bright">
              {account === "all" ? "ALL ACCOUNTS" : "Account summary"}
              {account === "all" && (
                <span className="ml-3 inline-flex rounded-full bg-purple-500/20 px-2.5 py-1 align-middle text-[11px] font-semibold uppercase tracking-wide text-purple-300">
                  AGGREGATED VIEW
                </span>
              )}
            </h1>
            <p className="mt-1.5 text-lol-text">
              {account === "all"
                ? "Combined statistics across your saved Summoner profiles."
                : "Detailed stats for the selected account"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-[10px] border border-lol-border bg-lol-card p-[3px]">
              {TIME_PERIODS.map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => setTimePeriod(period)}
                  className={`rounded-[7px] px-5 py-1.5 font-display text-[13px] font-semibold transition-colors ${
                    period === timePeriod
                      ? "bg-lol-crimson text-white"
                      : "text-lol-text hover:text-lol-text-bright"
                  }`}
                >
                  {period === "full" ? "Full" : period}
                </button>
              ))}
            </div>
            {live.game && (
              <div className="flex items-center gap-2 rounded-md border border-green-500/20 bg-green-900/30 px-3 py-1.5 text-xs text-green-200">
                <span className="h-2 w-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
                <span>
                  • In Match: {LIVE_GAME_MODE_LABEL[live.game.gameMode] ?? live.game.gameMode} -{" "}
                  {live.game.activePlayer.championName} {formatLiveGameTime(live.game.gameTimeSec)}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Panel
            className={`lg:col-span-2 border-t-[3px] border-t-lol-win bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.10),transparent_42%)] ${NEON_PANEL_CLASS}`}
          >
            <h2 className="mb-4 font-display text-[16px] font-bold uppercase tracking-widest text-lol-text-bright">
              Performance Summary
            </h2>
            <HomeHero
              dashboard={dashboard}
              loading={loading}
              timePeriod={timePeriod}
              champData={champData}
            />
          </Panel>

          <Panel className={`flex h-full flex-col lg:col-span-1 ${NEON_PANEL_CLASS}`}>
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <div>
                <h2 className="font-display text-[16px] font-bold uppercase tracking-widest text-lol-text-bright">
                  <span className="mr-2 inline-block h-1.5 w-1.5 rotate-45 bg-lol-crimson align-middle" />
                  Role Performance
                </h2>
                <p className="mt-1 text-[12px] text-lol-text">By position and queue type</p>
              </div>
              <span className="text-[13px] text-lol-text">
                {timePeriod === "full" ? "All time" : `Last ${timePeriod}`}
              </span>
            </div>
            {visibleRoles.length === 0 ? (
              <EmptyState
                variant="compact"
                showIcon
                text="No role data for this period. Roles require Ranked or Normal games with a stored position."
              />
            ) : (
              <div className="flex-1 divide-y divide-lol-border/50">
                {visibleRoles.map((stats) => {
                  const noPosition = stats.role === "NO_POSITION";
                  return (
                    <div
                      key={stats.role}
                      className="flex items-center gap-3 py-3 first:pt-1 last:pb-1"
                    >
                      <span
                        className={`flex h-7 min-w-10 items-center justify-center rounded-md px-1.5 font-display text-[10px] font-bold tracking-wide ${
                          noPosition
                            ? "bg-lol-text/10 text-lol-text"
                            : "bg-lol-crimson/15 text-lol-crimson"
                        }`}
                      >
                        [{ROLE_BADGES[stats.role]}]
                      </span>
                      <div className="min-w-[84px]">
                        <span className="block font-display text-sm font-semibold text-lol-text-bright">
                          {ROLE_LABELS[stats.role]}
                        </span>
                        <span className="block text-[11px] text-lol-text">
                          {stats.games} Games Played
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                          <i
                            className="block h-full rounded-full bg-lol-win"
                            style={{ width: `${Math.min(100, Math.max(0, stats.winRate))}%` }}
                          />
                        </div>
                        <span className="shrink-0 font-display text-xs font-semibold text-lol-text-bright">
                          {Math.round(stats.winRate)}% WR
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        {hasLiveActivity && (
          <Panel className="border-l-[3px] border-l-lol-win bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.08),transparent_55%)]">
            <LiveGameTile game={live.game} session={live.session} />
          </Panel>
        )}

        <div className="flex flex-col gap-6">
          <Panel className={`${NEON_PANEL_CLASS} w-full`}>
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 className="font-display text-[16px] font-bold uppercase tracking-widest text-lol-text-bright">
                <span className="mr-2 inline-block h-1.5 w-1.5 rotate-45 bg-lol-crimson align-middle" />
                Most Played Champions <span className="ml-1 text-[13px] text-lol-gold">👑</span>
              </h2>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="inline-flex rounded-md border border-lol-border/60 bg-lol-card/50 p-0.5">
                  {(["games", "winRate"] as const).map((sort) => (
                    <button
                      key={sort}
                      type="button"
                      onClick={() => {
                        setChampionSort(sort);
                        setShowAllChampions(false);
                      }}
                      className={`rounded px-2 py-1 text-[11px] font-semibold transition-colors ${
                        championSort === sort
                          ? "bg-lol-crimson/25 text-lol-text-bright"
                          : "text-lol-text hover:text-lol-text-bright"
                      }`}
                    >
                      {sort === "games" ? "Games" : "Win rate"}
                    </button>
                  ))}
                </div>
                <span className="text-[13px] text-lol-text">
                  {timePeriod === "full" ? "All time" : `Last ${timePeriod}`}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {visibleTopChampions.map((champion) => (
                <ChampCard
                  key={champion.championId}
                  championId={champion.championId}
                  games={champion.games}
                  wins={champion.wins}
                  champData={champData}
                  accentIndex={champion.championId}
                  layout="horizontal"
                />
              ))}
            </div>
            {sortedTopChampions.length > 24 && (
              <button
                type="button"
                onClick={() => setShowAllChampions((expanded) => !expanded)}
                className="mt-3 w-full rounded-md border border-lol-border px-3 py-2 text-xs font-semibold text-lol-text-bright transition-colors hover:border-lol-crimson/40 hover:bg-white/[0.025]"
                aria-expanded={showAllChampions}
              >
                {showAllChampions
                  ? "Show top 24"
                  : `Show all (${sortedTopChampions.length.toLocaleString()})`}
              </button>
            )}
          </Panel>

          <Panel className={`${NEON_PANEL_CLASS} w-full`}>
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <div>
                <h2 className="font-display text-[16px] font-bold uppercase tracking-widest text-lol-text-bright">
                  ⚡ PERSONAL RECORDS (7D)
                </h2>
                <span className="text-[11px] text-lol-text">All-time peaks</span>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {(
                [
                  { label: "MOST KILLS", record: dashboard?.records.mostKills },
                  { label: "MOST DEATHS", record: dashboard?.records.mostDeaths },
                  { label: "HIGHEST DAMAGE", record: dashboard?.records.mostDamage },
                  { label: "MOST ASSISTS", record: dashboard?.records.mostAssists },
                  { label: "BIGGEST CRIT", record: dashboard?.records.biggestCrit },
                  { label: "MOST CS", record: dashboard?.records.mostCs },
                  { label: "MOST GOLD", record: dashboard?.records.mostGold },
                  { label: "MOST WARDS PLACED", record: dashboard?.records.wardsPlaced },
                ] as const
              ).map(({ label, record }) =>
                record ? (
                  <RecordTile
                    key={label}
                    label={label}
                    value={record.value}
                    championId={record.championId}
                    win={record.win}
                    gameCreation={record.gameCreation}
                    accentIndex={record.championId}
                  />
                ) : (
                  <div
                    key={label}
                    className="rounded-xl border border-lol-border border-t-[3px] border-t-lol-crimson/50 bg-black/10 px-3.5 py-3 text-[12.5px] text-lol-text transition-colors duration-[120ms] hover:bg-white/[0.02]"
                  >
                    <span className="font-display uppercase tracking-wider">{label}</span>
                    <b className="my-0.5 block font-display text-[28px] font-bold leading-tight text-lol-text-bright/40">
                      —
                    </b>
                  </div>
                ),
              )}
            </div>
          </Panel>
        </div>

        {/* Last 20 played games: 12 columns */}
        <Panel className="col-span-12">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-[16px] font-semibold text-lol-text-bright">
              <span className="mr-2 inline-block h-1.5 w-1.5 rotate-45 bg-lol-crimson align-middle" />
              Last 20 played games
            </h2>
            <QueueFilterChips value={queue} onChange={setQueue} />
          </div>
          <MatchListPanel account={account} queue={queue} timePeriod={timePeriod} experiment />
        </Panel>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-4">
      <div className="grid grid-cols-[2fr_1.5fr_1fr] items-stretch gap-4">
        <PlayerSummaryCard
          dashboard={dashboard}
          loading={loading}
          account={account}
          savedAccounts={savedAccounts}
          onAccountChange={setAccount}
          timePeriod={timePeriod}
          onTimePeriodChange={setTimePeriod}
        />
        <RecordsCard dashboard={dashboard} loading={loading} />
        <EmptyPlaceholderCard />
      </div>
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
