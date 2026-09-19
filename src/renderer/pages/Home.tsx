import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  AccountListItem,
  HomeAccountFilter,
  HomeDashboardPayload,
  HomeTimePeriod,
  MatchListItem,
} from "../../shared/api";
import { ARENA_QUEUE_IDS, MAYHEM_QUEUE_IDS } from "../../shared/queues";
import ChampionIcon from "../components/ChampionIcon";
import SummonerIcon from "../components/SummonerIcon";
import { useChampionData } from "../hooks/useChampions";
import { HISTORY_SECTIONS_FULL } from "../lib/historySections";
import { NavLink } from "react-router-dom";
import { GameRow } from "./MatchHistory";

const TIME_PERIODS: HomeTimePeriod[] = ["24h", "7d", "30d", "full"];

const QUEUE_FILTERS: Array<{ label: string; value: number[] | undefined }> = [
  { label: "All", value: undefined },
  { label: "Ranked", value: [420, 440] },
  { label: "Normal", value: [400, 430, 490] },
  { label: "Arena", value: [...ARENA_QUEUE_IDS] },
  { label: "ARAM", value: [450] },
  { label: "Mayhem", value: [...MAYHEM_QUEUE_IDS] },
];

function HomeCard({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <div
      className={`relative rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] shadow-[0_0_4px_rgba(150,30,30,0.35),0_0_12px_rgba(90,15,15,0.20)] ring-1 ring-inset ring-white/[0.03] ${className}`}
    >
      {children}
    </div>
  );
}

function timePeriodLabel(timePeriod: HomeTimePeriod): string {
  if (timePeriod === "24h") return "24 hours";
  if (timePeriod === "30d") return "30 days";
  if (timePeriod === "full") return "full history";
  return "7 days";
}

const periodLabel = (period: HomeTimePeriod): string => (period === "full" ? "FULL" : period);

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
  onAccountChange,
  timePeriod,
  onTimePeriodChange,
}: {
  dashboard: HomeDashboardPayload | null;
  loading: boolean;
  account: HomeAccountFilter;
  onAccountChange: (account: HomeAccountFilter) => void;
  timePeriod: HomeTimePeriod;
  onTimePeriodChange: (timePeriod: HomeTimePeriod) => void;
}) {
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);
  const [currentPuuid, setCurrentPuuid] = useState<string | null>(null);

  useEffect(() => {
    window.api
      .listAccountsWithData()
      .then(setAccounts)
      .catch(() => setAccounts([]));
    window.api
      .getCurrentPuuid()
      .then(setCurrentPuuid)
      .catch(() => setCurrentPuuid(null));
  }, []);

  const selectedAccount = useMemo(
    () => (typeof account === "string" ? accounts.find((item) => item.puuid === account) : null),
    [account, accounts],
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
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 border-lol-border bg-lol-card text-2xl text-lol-text-bright">
                ?
              </div>
            ) : (
              <SummonerIcon
                iconId={selectedAccount?.profileIconId ?? null}
                size={80}
                className="border-2 border-lol-border/60"
              />
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
                    : "text-lol-gold hover:text-lol-gold/80"
                }`}
              >
                ALL ACCOUNTS
              </button>
            </div>
            <div className="flex max-h-[260px] flex-col gap-1 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {accounts.map((savedAccount) => {
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
                    <SummonerIcon iconId={savedAccount.profileIconId} size={24} />
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
                  className={`rounded-md px-2.5 py-1 text-xs font-bold transition-colors ${
                    period === timePeriod
                      ? "bg-lol-gold/20 text-lol-gold"
                      : "text-lol-text hover:bg-white/[0.04] hover:text-lol-text-bright"
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
              {(dashboard?.topChampions ?? []).slice(0, 5).map((champion) => (
                <div key={champion.championId} className="flex min-w-0 flex-col items-center gap-1">
                  <ChampionIcon championId={champion.championId} size={48} />
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
    <div className="flex flex-col gap-1.5 rounded-md border border-lol-border/40 bg-white/[0.02] p-3">
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

function EmptyPlaceholderCard() {
  return <HomeCard className="h-full" aria-hidden="true" />;
}

function QueueFilterChips({
  value,
  onChange,
}: {
  value: number[] | undefined;
  onChange: (queue: number[] | undefined) => void;
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

function QuickNavPanel() {
  return (
    <HomeCard className="p-4">
      <nav className="flex flex-col gap-0.5">
        {HISTORY_SECTIONS_FULL.map(({ section, label }) => (
          <NavLink
            key={section}
            to={`/history/full/${section}`}
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
  queue: number[] | undefined;
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
    <div className={`flex flex-col gap-1 transition-opacity ${loading ? "opacity-50" : ""}`}>
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
  );
}

export default function Home() {
  const [account, setAccount] = useState<HomeAccountFilter>("all");
  const [timePeriod, setTimePeriod] = useState<HomeTimePeriod>("7d");
  const [queue, setQueue] = useState<number[] | undefined>(undefined);
  const [dashboard, setDashboard] = useState<HomeDashboardPayload | null>(null);
  const [loading, setLoading] = useState(false);

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
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[2fr_1.5fr_1fr] items-stretch gap-4">
        <PlayerSummaryCard
          dashboard={dashboard}
          loading={loading}
          account={account}
          onAccountChange={setAccount}
          timePeriod={timePeriod}
          onTimePeriodChange={setTimePeriod}
        />
        <RecordsCard dashboard={dashboard} loading={loading} />
        <EmptyPlaceholderCard />
      </div>
      <div className="grid grid-cols-[220px_1fr] items-start gap-4">
        <div className="flex flex-col gap-3">
          <div className="text-center text-xl font-bold text-lol-text-bright">Statistics</div>
          <QuickNavPanel />
        </div>
        <div className="flex flex-col gap-3">
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
