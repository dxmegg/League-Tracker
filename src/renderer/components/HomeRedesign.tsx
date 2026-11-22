import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type {
  HomeAccountFilter,
  HomeDashboardPayload,
  HomeTimePeriod,
  LiveGameData,
  MatchListItem,
} from "../../shared/api";
import {
  QUEUE_SCOPE_ARAM,
  QUEUE_SCOPE_ARENA,
  QUEUE_SCOPE_MAYHEM,
  QUEUE_SCOPE_NORMAL,
  QUEUE_SCOPE_RANKED,
} from "../../shared/queues";
import { getChampionName, useChampionData } from "../hooks/useChampions";
import { useLcuStatus } from "../hooks/useLcuStatus";
import { formatNumber } from "../lib/format";
import ChampionIcon from "./ChampionIcon";
import {
  ChevronRightIcon,
  MedalIcon,
  SwordsIcon,
  TrendingUpIcon,
  TrophyIcon,
  UsersIcon,
} from "./icons";

const TIME_PERIODS: HomeTimePeriod[] = ["24h", "7d", "30d", "full"];

// Each mode pairs the queue filter with the history route that lists the same games.
const MODES: Array<{ label: string; queue: number | undefined; to: string }> = [
  { label: "All", queue: undefined, to: "/history" },
  { label: "Ranked", queue: QUEUE_SCOPE_RANKED, to: "/history/ranked" },
  { label: "Normal", queue: QUEUE_SCOPE_NORMAL, to: "/history/normal" },
  { label: "Arena", queue: QUEUE_SCOPE_ARENA, to: "/history/arena" },
  { label: "ARAM", queue: QUEUE_SCOPE_ARAM, to: "/history/aram" },
  { label: "Mayhem", queue: QUEUE_SCOPE_MAYHEM, to: "/history/mayhem" },
];

const MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

const EXPLORE = [
  { to: "/records", title: "Records", text: "Your personal peaks", Icon: TrophyIcon },
  { to: "/history", title: "Match History", text: "Revisit every game", Icon: SwordsIcon },
  { to: "/champions", title: "Champions", text: "Per-champion results", Icon: MedalIcon },
  { to: "/trends", title: "Trends", text: "How your play shifts", Icon: TrendingUpIcon },
  { to: "/friends", title: "Friends", text: "Who you play with", Icon: UsersIcon },
];

const LIVE_MODE_LABEL: Record<string, string> = {
  KIWI: "ARAM Mayhem",
  ARAM: "ARAM",
  CLASSIC: "Classic",
};

function compact(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}K` : `${Math.round(value)}`;
}

function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
}

function StatCard({
  label,
  value,
  sub,
  valueClass = "text-lol-text-bright",
}: {
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-[14px] border border-lol-border bg-[var(--theme-card)] p-5">
      <span className="mb-3 block h-0.5 w-6 rounded-full bg-lol-crimson" />
      <div className="font-display text-[11px] font-bold uppercase tracking-widest text-lol-text">
        {label}
      </div>
      <div className={`mt-1 font-display text-[40px] font-bold leading-tight ${valueClass}`}>
        {value}
      </div>
      <div className="text-[12px] text-lol-text">{sub}</div>
    </div>
  );
}

export function HomeRedesign({
  account,
  queue,
  onQueueChange,
  timePeriod,
  onTimePeriodChange,
  dashboard,
  loading,
  liveGame,
}: {
  account: HomeAccountFilter;
  queue: number | undefined;
  onQueueChange: (queue: number | undefined) => void;
  timePeriod: HomeTimePeriod;
  onTimePeriodChange: (period: HomeTimePeriod) => void;
  dashboard: HomeDashboardPayload | null;
  loading: boolean;
  liveGame: LiveGameData | null;
}) {
  const champData = useChampionData();
  const lcuStatus = useLcuStatus();
  const [lastMatch, setLastMatch] = useState<MatchListItem | null>(null);
  const [allTimeGames, setAllTimeGames] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const mode = MODES.find((m) => m.queue === queue) ?? MODES[0];
  const modeName = mode.queue === undefined ? "all modes" : mode.label;

  useEffect(() => {
    let cancelled = false;
    window.api
      .getHomeMatchList(account, queue, 1)
      .then((payload) => {
        if (!cancelled) setLastMatch(payload.matches[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setLastMatch(null);
      });
    return () => {
      cancelled = true;
    };
  }, [account, queue]);

  // The period toggle narrows the dashboard, but a milestone counts the whole library.
  useEffect(() => {
    let cancelled = false;
    window.api
      .getHomeDashboard(account, "full", queue)
      .then((data) => {
        if (!cancelled) setAllTimeGames(data.summary.totalGames);
      })
      .catch(() => {
        if (!cancelled) setAllTimeGames(0);
      });
    return () => {
      cancelled = true;
    };
  }, [account, queue]);

  const handleSync = () => {
    setSyncing(true);
    setSyncMessage(null);
    window.api
      .syncRiotHistory()
      .then((result) => {
        if ("added" in result && !result.error) {
          setSyncMessage(`${result.added} new games`);
        } else {
          setSyncMessage(result.error ?? "Sync failed");
        }
      })
      .catch(() => setSyncMessage("Sync failed"))
      .finally(() => setSyncing(false));
  };

  const summary = dashboard?.summary;
  const games = summary?.totalGames ?? 0;
  const wins = summary?.wins ?? 0;
  const losses = summary?.losses ?? 0;
  const winRate = games > 0 ? (wins / games) * 100 : 0;
  const avgKda = summary?.avgKda ?? 0;
  const avgDamage = summary?.statsEligibleGames ? compact(summary.avgDamageDealt) : "—";
  const periodText = timePeriod === "full" ? "all time" : `last ${timePeriod}`;
  const connected = lcuStatus === "connected" || lcuStatus === "ingame";

  const nextMilestone = MILESTONES.find((m) => m > allTimeGames) ?? null;
  const milestonePct = nextMilestone ? Math.min(100, (allTimeGames / nextMilestone) * 100) : 100;

  return (
    <div
      className={`mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5 transition-opacity ${loading ? "opacity-70" : ""}`}
    >
      {/* 1. Hero */}
      <section className="grid grid-cols-1 gap-6 rounded-[18px] border border-lol-border bg-[radial-gradient(900px_500px_at_85%_-8%,var(--theme-crimson-glow),transparent_70%),linear-gradient(to_bottom,var(--theme-bg-deep),var(--theme-bg-base))] p-8 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col justify-center">
          <div className="font-display text-[11px] font-bold uppercase tracking-widest text-lol-text">
            Your lab — {modeName}
          </div>
          <h1 className="mt-3 font-display text-[52px] font-bold leading-[1.05] tracking-tight text-lol-text-bright">
            Make every match
            <br />
            <span className="text-lol-gold">worth remembering.</span>
          </h1>
          <p className="mt-3 text-[14px] text-lol-text">
            Big damage. Strange augments. Even stranger personal records.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              className="rounded-lg bg-lol-crimson px-5 py-2 font-display text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {syncing ? "Syncing..." : "Sync matches"}
            </button>
            <Link
              to={mode.to}
              className="rounded-lg border border-lol-border bg-lol-card px-5 py-2 font-display text-[13px] font-semibold text-lol-text-bright transition-colors hover:border-lol-crimson/50"
            >
              Explore {modeName}
            </Link>
            {syncMessage && <span className="text-[12px] text-lol-text">{syncMessage}</span>}
          </div>
        </div>

        <div className="rounded-[14px] border border-lol-border bg-black/30 p-5 backdrop-blur">
          <div className="flex items-center gap-2 font-display text-[10px] font-bold uppercase tracking-widest text-lol-text">
            <span className="h-1.5 w-1.5 rounded-full bg-lol-win" />
            Current focus
            <span className="text-lol-text-bright">{mode.label}</span>
          </div>
          <div className="mt-3 font-display text-[44px] font-bold leading-none text-lol-text-bright">
            {formatNumber(games)}
          </div>
          <div className="mt-1 text-[12px] text-lol-text">tracked matches, {periodText}</div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-lol-border/50 pt-4">
            <div>
              <div className="font-display text-[10px] font-bold uppercase tracking-widest text-lol-text">
                Win rate
              </div>
              <div className="font-display text-[22px] font-bold text-lol-text-bright">
                {games > 0 ? `${winRate.toFixed(1)}%` : "—"}
              </div>
            </div>
            <div>
              <div className="font-display text-[10px] font-bold uppercase tracking-widest text-lol-text">
                Avg KDA
              </div>
              <div className="font-display text-[22px] font-bold text-lol-text-bright">
                {games > 0 ? avgKda.toFixed(2) : "—"}
              </div>
            </div>
          </div>
          <div className="mt-4 border-t border-lol-border/50 pt-3 text-[11px] text-lol-text">
            {liveGame
              ? `In match: ${LIVE_MODE_LABEL[liveGame.gameMode] ?? liveGame.gameMode} - ${liveGame.activePlayer.championName}`
              : connected
                ? "League client connected"
                : "Connect League to sync new games"}
          </div>
        </div>
      </section>

      {/* 2. Mode bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {MODES.map((m) => (
            <button
              key={m.label}
              type="button"
              onClick={() => onQueueChange(m.queue)}
              className={`rounded-lg border px-4 py-2 font-display text-[12px] font-semibold transition-colors ${
                m.queue === queue
                  ? "border-lol-crimson/60 bg-lol-crimson/20 text-lol-text-bright"
                  : "border-lol-border bg-lol-card text-lol-text hover:text-lol-text-bright"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-[10px] border border-lol-border bg-lol-card p-[3px]">
            {TIME_PERIODS.map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => onTimePeriodChange(period)}
                className={`rounded-[7px] px-3 py-1 font-display text-[12px] font-semibold transition-colors ${
                  period === timePeriod
                    ? "bg-lol-crimson text-white"
                    : "text-lol-text hover:text-lol-text-bright"
                }`}
              >
                {period === "full" ? "Full" : period}
              </button>
            ))}
          </div>
          <Link to="/settings" className="text-[12px] text-lol-text hover:text-lol-text-bright">
            Customize ↗
          </Link>
        </div>
      </div>

      {/* 3. Status banner: the app has no points system, so it summarises the record */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-lol-border bg-[var(--theme-card)] px-5 py-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-display text-[10px] font-bold uppercase tracking-widest text-lol-gold">
            Your record
          </span>
          <span className="font-display text-[15px] font-semibold text-lol-text-bright">
            {formatNumber(wins)}W – {formatNumber(losses)}L
          </span>
          <span className="text-[12px] text-lol-text">
            {formatNumber(games)} games, {periodText}
            {summary && summary.recentStreak !== 0
              ? ` · ${summary.recentStreak > 0 ? "W" : "L"}${Math.abs(summary.recentStreak)} streak`
              : ""}
          </span>
        </div>
        <Link
          to="/records"
          className="rounded-md border border-lol-border px-3 py-1 text-[12px] font-semibold text-lol-text-bright transition-colors hover:border-lol-crimson/50"
        >
          Open records →
        </Link>
      </div>

      {/* 4. Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={`${mode.label} games`} value={formatNumber(games)} sub="Tracked matches" />
        <StatCard
          label="Win rate"
          value={games > 0 ? `${winRate.toFixed(1)}%` : "—"}
          sub={`${wins}W • ${losses}L`}
          valueClass={winRate >= 50 ? "text-lol-win" : "text-lol-loss"}
        />
        <StatCard
          label="Your KDA"
          value={games > 0 ? avgKda.toFixed(2) : "—"}
          sub="Across this period"
        />
        <StatCard label="Avg damage" value={avgDamage} sub="Per tracked game" />
      </div>

      {/* 5. Last match + milestone */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-[14px] border border-lol-border bg-[var(--theme-card)] p-5">
          <div className="font-display text-[10px] font-bold uppercase tracking-widest text-lol-gold">
            Last match
          </div>
          {lastMatch ? (
            <div className="mt-3 flex items-center gap-4">
              <ChampionIcon championId={lastMatch.champion_id} size={52} className="rounded-lg" />
              <div className="min-w-0 flex-1">
                <div className="font-display text-[18px] font-bold text-lol-text-bright">
                  {getChampionName(champData, lastMatch.champion_id)}
                </div>
                <div className="text-[12px] text-lol-text">
                  <span className={lastMatch.win ? "text-lol-win" : "text-lol-loss"}>
                    {lastMatch.win ? "Victory" : "Defeat"}
                  </span>
                  {" · "}
                  {lastMatch.kills}/{lastMatch.deaths}/{lastMatch.assists}
                  {" · "}
                  {formatDuration(lastMatch.game_duration)}
                </div>
              </div>
              <Link
                to={`/match/${lastMatch.game_id}`}
                className="rounded-md border border-lol-border px-3 py-1 text-[12px] font-semibold text-lol-text-bright transition-colors hover:border-lol-crimson/50"
              >
                Review →
              </Link>
            </div>
          ) : (
            <div className="mt-3 text-[13px] text-lol-text">No matches recorded yet.</div>
          )}
        </div>

        <div className="rounded-[14px] border border-lol-border bg-[var(--theme-card)] p-5">
          <div className="font-display text-[10px] font-bold uppercase tracking-widest text-lol-gold">
            Next milestone
          </div>
          {nextMilestone ? (
            <>
              <div className="mt-3 font-display text-[18px] font-bold text-lol-text-bright">
                {formatNumber(nextMilestone)} tracked games
              </div>
              <div className="text-[12px] text-lol-text">
                Play {formatNumber(nextMilestone - allTimeGames)} more {modeName} games
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <i
                  className="block h-full rounded-full bg-lol-gold"
                  style={{ width: `${milestonePct}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[12px] text-lol-text">
                <span>
                  {formatNumber(allTimeGames)} / {formatNumber(nextMilestone)}
                </span>
                <Link to="/records" className="font-semibold text-lol-text-bright">
                  View records →
                </Link>
              </div>
            </>
          ) : (
            <div className="mt-3 text-[13px] text-lol-text">Every milestone reached.</div>
          )}
        </div>
      </div>

      {/* 6. Explore grid */}
      <section>
        <div className="font-display text-[10px] font-bold uppercase tracking-widest text-lol-gold">
          Keep exploring
        </div>
        <h2 className="mb-3 mt-1 font-display text-[22px] font-bold text-lol-text-bright">
          One click to the good stuff
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {EXPLORE.map(({ to, title, text, Icon }) => (
            <Link
              key={to}
              to={to}
              className="group relative rounded-[14px] border border-lol-border bg-[var(--theme-card)] p-4 transition-colors hover:border-lol-crimson/50"
            >
              <ChevronRightIcon className="absolute right-3 top-3 h-4 w-4 -rotate-45 text-lol-text group-hover:text-lol-text-bright" />
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-lol-crimson/15 text-lol-crimson">
                <Icon className="h-5 w-5" />
              </span>
              <div className="mt-3 font-display text-[14px] font-semibold text-lol-text-bright">
                {title}
              </div>
              <div className="text-[12px] text-lol-text">{text}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
