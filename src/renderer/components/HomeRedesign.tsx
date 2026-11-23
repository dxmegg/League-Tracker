import { useEffect, useState } from "react";
import type { ReactNode, SVGProps } from "react";
import { Link } from "react-router-dom";
import { useActiveMode } from "../hooks/useActiveMode";
import type {
  AccountListItem,
  AugmentStats,
  HomeAccountFilter,
  OwnedItemStats,
  HomeDashboardPayload,
  HomeTimePeriod,
  LiveGameData,
  LiveSessionData,
  MatchListItem,
  TeammateStats,
} from "../../shared/api";
import { scoreColor } from "../../shared/opScore";
import {
  QUEUE_SCOPE_ARAM,
  QUEUE_SCOPE_ARENA,
  QUEUE_SCOPE_MAYHEM,
  QUEUE_SCOPE_NORMAL,
  QUEUE_SCOPE_RANKED,
} from "../../shared/queues";
import {
  getChampionName,
  useAugmentData,
  useChampionData,
  useItemData,
} from "../hooks/useChampions";
import { useLcuStatus } from "../hooks/useLcuStatus";
import { useLiveGame } from "../hooks/useLiveGame";
import { CHAMPION_SPLASH_URL } from "../lib/constants";
import { formatNumber, formatTimeAgo } from "../lib/format";
import AugmentIcon from "./AugmentIcon";
import { parseAugmentIds } from "./AugmentGrid";
import ChampionIcon from "./ChampionIcon";
import ItemIcon from "./ItemIcon";
import SummonerIcon from "./SummonerIcon";
import {
  ChevronRightIcon,
  CoinsIcon,
  MedalIcon,
  SwordsIcon,
  TrendingUpIcon,
  TrophyIcon,
  UsersIcon,
  ZapIcon,
} from "./icons";

type IconComponent = (props: SVGProps<SVGSVGElement>) => ReactNode;

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

const HUB: Array<{ to: string; title: string; text: string; Icon: IconComponent }> = [
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

const LABEL = "font-display text-[10px] font-bold uppercase tracking-widest text-lol-text";
const LINK_BUTTON =
  "rounded-md border border-lol-border px-3 py-1 text-[12px] font-semibold text-lol-text-bright transition-colors hover:border-lol-crimson/50";

function compact(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}K` : `${Math.round(value)}`;
}

function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
}

// game_version looks like "16.5.123.4567"; the patch is the first two segments
function patchOf(version: string | null | undefined): string | null {
  if (!version) return null;
  const [major, minor] = version.split(".");
  return minor ? `${major}.${minor}` : major;
}

// What a hero tile's mini chart shows. Every chart carries a caption so it never reads as a bare line.
// `domain` is the fixed value range of the chart: without it every series would be stretched to fill
// the tile and a 40% and a 70% win rate would look identical.
type TileChart =
  | {
      kind: "line";
      values: Array<number | null>;
      domain: [number, number];
      reference?: number;
      caption: string;
    }
  | {
      kind: "bars";
      values: Array<number | null>;
      domain: [number, number];
      reference?: number;
      caption: string;
    }
  | { kind: "results"; results: boolean[]; caption: string }
  | {
      kind: "split";
      a: number;
      b: number;
      aLabel: string;
      bLabel: string;
      aBar: string;
      aText: string;
      bBar: string;
      bText: string;
      caption: string;
    };

const CHART_W = 120;
const CHART_H = 34;

function TileChartView({ chart, color }: { chart: TileChart; color: string }) {
  if (chart.kind === "results") {
    return (
      <div className="flex h-[34px] items-end gap-[3px]" aria-hidden="true">
        {chart.results.map((win, i) => (
          <i
            key={i}
            className={`block flex-1 rounded-[2px] ${win ? "h-full bg-lol-win" : "h-[55%] bg-lol-loss"}`}
          />
        ))}
      </div>
    );
  }
  if (chart.kind === "split") {
    const total = Math.max(1e-9, chart.a + chart.b);
    return (
      <div className="flex h-[34px] flex-col justify-end gap-1.5" aria-hidden="true">
        <div className="flex h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
          <i
            className={`block h-full ${chart.aBar}`}
            style={{ width: `${(chart.a / total) * 100}%` }}
          />
          <i
            className={`block h-full ${chart.bBar}`}
            style={{ width: `${(chart.b / total) * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] font-bold">
          <span className={chart.aText}>{chart.aLabel}</span>
          <span className={chart.bText}>{chart.bLabel}</span>
        </div>
      </div>
    );
  }

  const points = chart.values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v != null);
  if (points.length < 2) return <div className="h-[34px]" />;
  const [min, max] = chart.domain;
  const range = max - min || 1;
  const n = chart.values.length;
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * CHART_W : 0);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const y = (v: number) => CHART_H - 3 - ((clamp(v) - min) / range) * (CHART_H - 6);
  const refY = chart.reference != null ? y(chart.reference) : null;
  const refLine =
    refY != null ? (
      <line
        x1="0"
        x2={CHART_W}
        y1={refY}
        y2={refY}
        stroke="white"
        strokeOpacity="0.45"
        strokeDasharray="3 3"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    ) : null;

  if (chart.kind === "bars") {
    const barW = CHART_W / n;
    return (
      <svg
        aria-hidden="true"
        className="h-[34px] w-full"
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        preserveAspectRatio="none"
      >
        {points.map(({ v, i }) => {
          const above = chart.reference == null || v >= chart.reference;
          return (
            <rect
              key={i}
              x={i * barW + barW * 0.15}
              width={barW * 0.7}
              y={y(v)}
              height={Math.max(1.5, CHART_H - 1 - y(v))}
              rx="1"
              fill="currentColor"
              opacity={above ? 0.95 : 0.4}
              className={color}
            />
          );
        })}
        {refLine}
      </svg>
    );
  }

  const line = points.map((p) => `${x(p.i)},${y(p.v)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <svg
      aria-hidden="true"
      className={`h-[34px] w-full ${color}`}
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      preserveAspectRatio="none"
    >
      <polygon
        points={`0,${CHART_H} ${line} ${CHART_W},${CHART_H}`}
        fill="currentColor"
        opacity="0.13"
      />
      {refLine}
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={x(last.i)} cy={y(last.v)} r="2.6" fill="currentColor" />
    </svg>
  );
}
// Stat tile: big value, a labelled mini chart and a one-line caption that says what the chart is.
function HeroStat({
  label,
  value,
  chart,
  tone,
}: {
  label: string;
  value: string;
  chart: TileChart;
  tone?: "win" | "loss";
}) {
  const color =
    tone === "win" ? "text-lol-win" : tone === "loss" ? "text-lol-loss" : "text-lol-crimson";
  const valueColor =
    tone === "win" ? "text-lol-win" : tone === "loss" ? "text-lol-loss" : "text-lol-text-bright";
  return (
    <div className="glass-card relative flex flex-col overflow-hidden rounded-[14px] px-4 pb-3 pt-3.5">
      <div className="font-display text-[11px] font-bold uppercase tracking-widest text-lol-gold">
        {label}
      </div>
      <div className={`mt-1 font-display text-[30px] font-bold leading-none ${valueColor}`}>
        {value}
      </div>
      <div className="mt-2.5">
        <TileChartView chart={chart} color={color} />
      </div>
      <div className="mt-1.5 text-[10.5px] leading-tight text-lol-text/80">{chart.caption}</div>
    </div>
  );
}

const RARITIES: Array<{ key: string; label: string; text: string; dot: string; border: string }> = [
  {
    key: "kPrismatic",
    label: "Prismatic",
    text: "text-fuchsia-300",
    dot: "bg-fuchsia-400",
    border: "border-fuchsia-400/40",
  },
  {
    key: "kGold",
    label: "Gold",
    text: "text-yellow-300",
    dot: "bg-yellow-400",
    border: "border-yellow-400/40",
  },
  {
    key: "kSilver",
    label: "Silver",
    text: "text-slate-200",
    dot: "bg-slate-300",
    border: "border-slate-300/30",
  },
];

function winRateOf(row: { wins: number; picks: number }): number {
  return row.picks > 0 ? (row.wins / row.picks) * 100 : 0;
}

function winRateColor(rate: number): string {
  return rate >= 50 ? "text-lol-win" : "text-lol-loss";
}

// One row per rarity: the five most picked augments, plus the best win rate among those with enough picks.
function AugmentRarityRows({ stats }: { stats: AugmentStats[] }) {
  const augmentData = useAugmentData(undefined);
  return (
    <div className="flex flex-col gap-3">
      {RARITIES.map((rarity) => {
        const rows = stats.filter((s) => augmentData[s.augment_id]?.rarity === rarity.key);
        const top = [...rows].sort((a, b) => b.picks - a.picks).slice(0, 5);
        // A few lucky picks would top a raw win-rate list, so require a minimum sample.
        const best = rows
          .filter((r) => r.picks >= 5)
          .sort((a, b) => winRateOf(b) - winRateOf(a))[0];
        return (
          <div
            key={rarity.key}
            className={`grid grid-cols-1 items-stretch gap-3 rounded-2xl border bg-black/20 p-3 xl:grid-cols-[120px_minmax(0,1fr)_220px] ${rarity.border}`}
          >
            <div className="flex flex-row items-center gap-2 xl:flex-col xl:items-start xl:justify-center">
              <span
                className={`flex items-center gap-2 font-display text-[15px] font-bold ${rarity.text}`}
              >
                <i className={`block h-2.5 w-2.5 rounded-full ${rarity.dot}`} />
                {rarity.label}
              </span>
              <span className="text-[11px] text-lol-text">
                {rows.reduce((sum, r) => sum + r.picks, 0)} picks
              </span>
            </div>

            {top.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
                {top.map((aug) => {
                  const rate = winRateOf(aug);
                  return (
                    <div
                      key={aug.augment_id}
                      className="flex min-w-0 items-center gap-2.5 rounded-xl bg-white/[0.04] px-2.5 py-2"
                    >
                      <AugmentIcon augmentId={aug.augment_id} size={36} />
                      <div className="min-w-0">
                        <div className="line-clamp-2 text-[13px] font-semibold leading-tight text-lol-text-bright">
                          {augmentData[aug.augment_id]?.name ?? `Augment ${aug.augment_id}`}
                        </div>
                        <div className="text-[11.5px] text-lol-text">
                          {aug.picks}× ·{" "}
                          <b className={`font-display ${winRateColor(rate)}`}>{rate.toFixed(0)}%</b>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center text-[13px] text-lol-text">
                No augments of this rarity yet.
              </div>
            )}

            <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2">
              {best ? (
                <>
                  <AugmentIcon augmentId={best.augment_id} size={36} />
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-lol-gold">
                      Best win rate
                    </div>
                    <div className="truncate text-[13px] font-semibold text-lol-text-bright">
                      {augmentData[best.augment_id]?.name ?? `Augment ${best.augment_id}`}
                    </div>
                    <div className="text-[11.5px] text-lol-text">
                      <b className={`font-display text-[14px] ${winRateColor(winRateOf(best))}`}>
                        {winRateOf(best).toFixed(1)}%
                      </b>{" "}
                      · {best.picks} picks
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-[12px] text-lol-text">Needs 5+ picks for a win rate.</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Most built items with how often each was built and the win rate when it was.
function TopItemsList({ rows }: { rows: OwnedItemStats[] }) {
  const items = useItemData(undefined);
  if (rows.length === 0) return <div className="text-[13px] text-lol-text">No build data yet.</div>;
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => {
        const rate = winRateOf(row);
        return (
          <div key={row.item_id} className="flex items-center gap-2.5">
            <ItemIcon itemId={row.item_id} size={32} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold text-lol-text-bright">
                {items[row.item_id]?.name ?? `Item ${row.item_id}`}
              </div>
              <div className="text-[11.5px] text-lol-text">{row.picks} games</div>
            </div>
            <b className={`font-display text-[15px] ${winRateColor(rate)}`}>{rate.toFixed(0)}%</b>
          </div>
        );
      })}
    </div>
  );
}
type LiveTone = "off" | "idle" | "active" | "hot";

// Human label for what the player is doing, from the LCU gameflow phase. Unknown phases fall back to
// the raw phase name so a new client state is visible instead of silently hidden.
function describeLiveStatus(
  connected: boolean,
  session: LiveSessionData | null,
  game: LiveGameData | null,
): { title: string; detail: string; tone: LiveTone } {
  if (!connected) {
    return { title: "Offline", detail: "Start the League client to see live status.", tone: "off" };
  }
  if (game) {
    const minutes = Math.floor(game.gameTimeSec / 60);
    const seconds = String(Math.floor(game.gameTimeSec % 60)).padStart(2, "0");
    return {
      title: "In game",
      detail: `${game.activePlayer.championName} · ${LIVE_MODE_LABEL[game.gameMode] ?? game.gameMode} · ${minutes}:${seconds}`,
      tone: "hot",
    };
  }
  const queue = session?.queueLabel ?? "";
  switch (session?.phase) {
    case "Lobby": {
      const size =
        session.lobbySize != null
          ? `${session.lobbySize}/${session.lobbyMaxSize ?? "?"} players`
          : "";
      return {
        title: "In lobby",
        detail: [queue, size].filter(Boolean).join(" · ") || "Waiting in the lobby",
        tone: "active",
      };
    }
    case "Matchmaking":
      return { title: "In queue", detail: queue || "Searching for a match", tone: "active" };
    case "ReadyCheck":
      return { title: "Match found", detail: "Accept the match in the client", tone: "hot" };
    case "ChampSelect":
      return { title: "Champion select", detail: queue || "Picking a champion", tone: "hot" };
    case "GameStart":
    case "InProgress":
      return { title: "Loading into game", detail: queue || "Game is starting", tone: "hot" };
    case "WaitingForStats":
    case "PreEndOfGame":
    case "EndOfGame":
      return { title: "Post-game", detail: "Game finished, results screen", tone: "active" };
    case "Reconnect":
      return { title: "Reconnecting", detail: "Rejoining your game", tone: "hot" };
    case undefined:
    case "None":
      return { title: "In client", detail: "Idle, not in a lobby", tone: "idle" };
    default:
      return { title: session?.phase ?? "Unknown", detail: queue, tone: "idle" };
  }
}

const LIVE_TONE_STYLE: Record<LiveTone, { dot: string; text: string }> = {
  off: { dot: "bg-lol-text/40", text: "text-lol-text" },
  idle: { dot: "bg-lol-win", text: "text-lol-text-bright" },
  active: { dot: "bg-amber-400 animate-pulse", text: "text-amber-300" },
  hot: { dot: "bg-lol-crimson animate-pulse", text: "text-lol-crimson" },
};

function HubCard({
  title,
  to,
  linkLabel,
  className = "",
  children,
}: {
  title: string;
  to: string;
  linkLabel: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`glass-card flex min-w-0 flex-col rounded-[16px] p-5 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-display text-[12px] font-bold uppercase tracking-widest text-lol-gold">
          <i className="block h-3.5 w-[3px] rounded-full bg-lol-crimson" aria-hidden="true" />
          {title}
        </span>
        <Link
          to={to}
          className="text-[13px] font-semibold text-lol-text-bright/70 transition-colors hover:text-lol-crimson"
        >
          {linkLabel} →
        </Link>
      </div>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}

function StatRow({
  label,
  value,
  championId,
}: {
  label: string;
  value: string;
  championId?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-lol-border/40 py-1.5 last:border-b-0">
      <span className="flex items-center gap-2 text-[13.5px] text-lol-text">
        {championId ? <ChampionIcon championId={championId} size={22} className="rounded" /> : null}
        {label}
      </span>
      <b className="font-display text-[17px] font-bold text-lol-gold-light">{value}</b>
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
  savedAccounts,
}: {
  account: HomeAccountFilter;
  queue: number | undefined;
  onQueueChange: (queue: number | undefined) => void;
  timePeriod: HomeTimePeriod;
  onTimePeriodChange: (period: HomeTimePeriod) => void;
  dashboard: HomeDashboardPayload | null;
  loading: boolean;
  liveGame: LiveGameData | null;
  savedAccounts: AccountListItem[];
}) {
  const champData = useChampionData();
  const lcuStatus = useLcuStatus();
  const live = useLiveGame();
  const [dataMode] = useActiveMode();
  const isMayhem = dataMode === "mayhem";
  const [lastMatch, setLastMatch] = useState<MatchListItem | null>(null);
  const [allTimeGames, setAllTimeGames] = useState(0);
  const [friends, setFriends] = useState<TeammateStats[]>([]);
  const [augmentStats, setAugmentStats] = useState<AugmentStats[]>([]);
  const [itemRows, setItemRows] = useState<OwnedItemStats[]>([]);

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

  useEffect(() => {
    let cancelled = false;
    window.api
      .getTeammateStats(queue, "friends")
      .then((rows) => {
        if (!cancelled) setFriends([...rows].sort((a, b) => b.games - a.games).slice(0, 4));
      })
      .catch(() => {
        if (!cancelled) setFriends([]);
      });
    return () => {
      cancelled = true;
    };
  }, [queue]);

  // Augment and item leaderboards follow the account and mode; the period only narrows augments,
  // because the item query has no time filter.
  const accountArg = typeof account === "string" ? account : undefined;
  useEffect(() => {
    let cancelled = false;
    window.api
      .getAugmentStats(undefined, undefined, queue, accountArg, timePeriod)
      .then((rows) => {
        if (!cancelled) setAugmentStats(rows);
      })
      .catch(() => {
        if (!cancelled) setAugmentStats([]);
      });
    return () => {
      cancelled = true;
    };
  }, [queue, accountArg, timePeriod]);

  useEffect(() => {
    let cancelled = false;
    window.api
      .getOwnedItemStats(undefined, queue, accountArg)
      .then((result) => {
        if (cancelled) return;
        const rows = result.rows ?? result;
        setItemRows(
          [...rows]
            .filter((row) => !row.isTrinket)
            .sort((a, b) => b.picks - a.picks)
            .slice(0, 5),
        );
      })
      .catch(() => {
        if (!cancelled) setItemRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [queue, accountArg]);
  // account is a puuid, "all" or undefined; only a puuid we actually know counts as a specific pick
  const selectedAccount =
    typeof account === "string" && account !== "all"
      ? (savedAccounts.find((item) => item.puuid === account) ?? null)
      : null;

  const summary = dashboard?.summary;
  const records = dashboard?.records;
  const games = summary?.totalGames ?? 0;
  const wins = summary?.wins ?? 0;
  const losses = summary?.losses ?? 0;
  const winRate = games > 0 ? (wins / games) * 100 : 0;
  const avgKda = summary?.avgKda ?? 0;
  const avgDamage = summary?.statsEligibleGames ? compact(summary.avgDamageDealt) : "—";
  const periodText = timePeriod === "full" ? "all time" : `last ${timePeriod}`;
  const connected = lcuStatus === "connected" || lcuStatus === "ingame";
  const liveStatus = describeLiveStatus(connected, live.session, live.game ?? liveGame);
  const liveStyle = LIVE_TONE_STYLE[liveStatus.tone];
  const lastMatchLink = lastMatch ? `/match/${lastMatch.game_id}` : "/history";
  const lastMatchAugments = lastMatch ? parseAugmentIds(lastMatch.augment_ids) : [];
  const recentForm = [...(summary?.recentForm ?? [])].slice(0, 20).reverse();
  const topChampions = (dashboard?.topChampions ?? []).slice(0, 5);
  const heroChampionId = topChampions[0]?.championId ?? lastMatch?.champion_id ?? null;
  const heroSplashKey = heroChampionId != null ? champData[heroChampionId]?.key : undefined;
  const scoredForm = recentForm.filter((g): g is typeof g & { score: number } => g.score != null);
  const avgOp = scoredForm.length
    ? scoredForm.reduce((sum, g) => sum + g.score, 0) / scoredForm.length
    : null;
  const lastFive = (summary?.recentForm ?? []).slice(0, 5);
  // Per-game series for the hero tiles, oldest to newest.
  const kdaSeries = recentForm.map((g) => (g.kills + g.assists) / Math.max(1, g.deaths));
  const runningWinRate = (() => {
    let won = 0;
    return recentForm.map((g, i) => {
      won += g.win ? 1 : 0;
      return (won / (i + 1)) * 100;
    });
  })();
  const scoreSeries = recentForm.map((g) => g.score);
  const n = recentForm.length;
  const WIN_SPLIT = {
    aBar: "bg-lol-win",
    aText: "text-lol-win",
    bBar: "bg-lol-loss",
    bText: "text-lol-loss",
  };
  const heroStats: Array<{
    label: string;
    value: string;
    chart: TileChart;
    tone?: "win" | "loss";
  }> = [
    {
      label: "Matches",
      value: formatNumber(games),
      chart: {
        kind: "results",
        results: recentForm.map((g) => Boolean(g.win)),
        caption: `Last ${n} results, newest right`,
      },
    },
    {
      label: "Win rate",
      value: games > 0 ? `${winRate.toFixed(1)}%` : "—",
      tone: winRate >= 50 ? "win" : "loss",
      chart: {
        kind: "line",
        values: runningWinRate,
        domain: [30, 70],
        reference: 50,
        caption: `Running win rate, last ${n} games · dashed = 50%`,
      },
    },
    {
      label: "Avg KDA",
      value: games > 0 ? avgKda.toFixed(2) : "—",
      chart: {
        kind: "bars",
        values: kdaSeries,
        domain: [0, Math.max(8, ...kdaSeries)],
        reference: avgKda || undefined,
        caption: `KDA per game, last ${n} · dashed = period avg`,
      },
    },
    {
      label: "OP score",
      value: avgOp != null ? avgOp.toFixed(1) : "—",
      chart: {
        kind: "bars",
        values: scoreSeries,
        domain: [0, 10],
        reference: avgOp ?? undefined,
        caption: `OP score per game (0–10), last ${n} · dashed = avg`,
      },
    },
    {
      label: "Damage / game",
      value: avgDamage,
      chart: {
        kind: "split",
        a: summary?.avgDamageDealt ?? 0,
        b: summary?.avgDamageTaken ?? 0,
        aLabel: `${compact(summary?.avgDamageDealt ?? 0)} dealt`,
        bLabel: `${compact(summary?.avgDamageTaken ?? 0)} taken`,
        aBar: "bg-lol-crimson",
        aText: "text-lol-crimson",
        bBar: "bg-sky-400",
        bText: "text-sky-400",
        caption: "Average per game · dealt vs taken",
      },
    },
    {
      label: "Record",
      value: `${formatNumber(wins)}W ${formatNumber(losses)}L`,
      tone: wins >= losses ? "win" : "loss",
      chart: {
        kind: "split",
        a: wins,
        b: losses,
        aLabel: `${wins} W`,
        bLabel: `${losses} L`,
        ...WIN_SPLIT,
        caption: `Wins vs losses, ${periodText}`,
      },
    },
  ];
  const nextMilestone = MILESTONES.find((m) => m > allTimeGames) ?? null;
  const milestonePct = nextMilestone ? Math.min(100, (allTimeGames / nextMilestone) * 100) : 100;

  const quickLaunch: Array<{ to: string; label: string; Icon: IconComponent }> = [
    { to: lastMatchLink, label: "Last Match", Icon: SwordsIcon },
    { to: "/champions", label: "Champions", Icon: MedalIcon },
    { to: "/items", label: "Items", Icon: CoinsIcon },
    { to: "/runes", label: "Runes", Icon: ZapIcon },
    { to: "/records", label: "Records", Icon: TrophyIcon },
    { to: "/trends", label: "Trends", Icon: TrendingUpIcon },
  ].filter((tile) => !(isMayhem && tile.to === "/runes"));

  return (
    <div
      className={`mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5 transition-opacity [&>*]:shrink-0 ${loading ? "opacity-70" : ""}`}
    >
      {/* 1. Hero: splash-art banner with identity, quick launch and stat tiles */}
      <section className="relative overflow-hidden rounded-[22px] border border-lol-border/70 shadow-[0_24px_60px_-28px_var(--theme-crimson-glow)]">
        {heroSplashKey && (
          <img
            src={CHAMPION_SPLASH_URL(heroSplashKey)}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-[50%_22%] opacity-75"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--theme-bg-deep)_4%,rgba(0,0,0,0.1)_48%,rgba(0,0,0,0.45)_100%),linear-gradient(to_top,var(--theme-bg-base),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(720px_380px_at_92%_-12%,var(--theme-crimson-glow),transparent_70%)]" />

        <div className="relative grid grid-cols-1 gap-6 p-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          <div className="flex flex-col justify-between gap-6">
            <div className="flex items-center gap-4">
              {selectedAccount ? (
                <SummonerIcon
                  iconId={selectedAccount.profileIconId ?? null}
                  size={92}
                  className="rounded-2xl border border-lol-crimson/50 bg-lol-dark object-cover shadow-[0_0_28px_var(--theme-crimson-glow)]"
                />
              ) : (
                <div className="grid shrink-0 grid-cols-3 gap-1 rounded-2xl border border-lol-border/70 bg-black/40 p-1.5 backdrop-blur">
                  {savedAccounts.slice(0, 9).map((saved) => (
                    <SummonerIcon
                      key={saved.puuid}
                      iconId={saved.profileIconId ?? null}
                      size={28}
                      className="rounded-md bg-lol-dark object-cover"
                    />
                  ))}
                </div>
              )}
              <div className="min-w-0">
                <div className="font-display text-[34px] font-bold leading-none text-lol-text-bright">
                  {selectedAccount ? (selectedAccount.gameName ?? "Unknown") : "All Accounts"}
                </div>
                <div className="mt-1.5 text-[13px] text-lol-text">
                  {selectedAccount
                    ? selectedAccount.tagLine
                      ? `#${selectedAccount.tagLine}`
                      : ""
                    : `${savedAccounts.length} ${savedAccounts.length === 1 ? "account" : "accounts"} tracked`}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-lol-crimson/50 bg-lol-crimson/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-lol-text-bright">
                    {isMayhem ? "ARAM Mayhem" : mode.label}
                  </span>
                  <span className="rounded-full border border-lol-border/70 bg-black/30 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-lol-text">
                    {periodText}
                  </span>
                  <span className="flex items-center gap-1.5 rounded-full border border-lol-border/70 bg-black/30 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-lol-text">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-lol-win" : "bg-lol-text/40"}`}
                    />
                    {connected ? "Live" : "Offline"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {quickLaunch.map(({ to, label, Icon }) => (
                <Link
                  key={label}
                  to={to}
                  className="inline-flex items-center gap-2 rounded-xl border border-lol-border/70 bg-black/35 px-3.5 py-2 font-display text-[12px] font-semibold text-lol-text-bright backdrop-blur transition-all hover:-translate-y-0.5 hover:border-lol-crimson/60 hover:bg-lol-crimson/15"
                >
                  <Icon className="h-4 w-4 text-lol-crimson" />
                  {label}
                </Link>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {heroStats.map((stat) => (
              <HeroStat key={stat.label} {...stat} />
            ))}
          </div>
        </div>
        {heroChampionId != null && (
          <div className="absolute bottom-3 right-5 text-[10px] font-semibold uppercase tracking-[0.2em] text-lol-text/60">
            Spotlight · {getChampionName(champData, heroChampionId)}
          </div>
        )}
      </section>
      {/* 2. Mode and period filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Mayhem mode pins the queue globally, so the per-queue buttons are hidden */}
        <div className="flex flex-wrap items-center gap-2">
          {(isMayhem ? [] : MODES).map((m) => (
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
      </div>

      {/* 3. Win record banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] glass-card px-5 py-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-display text-[10px] font-bold uppercase tracking-widest text-lol-gold">
            Your record
          </span>
          <span className="font-display text-[15px] font-semibold text-lol-text-bright">
            {formatNumber(wins)}W – {formatNumber(losses)}L
            {games > 0 ? `, ${Math.round(winRate)}% winrate` : ""}
          </span>
          <span className="text-[12px] text-lol-text">
            {formatNumber(games)} games, {periodText}
          </span>
        </div>
        <Link to="/data" className={LINK_BUTTON}>
          Open stats →
        </Link>
      </div>

      {/* 4. Four-column stats and quick access grid; Trends spans both rows in column 4 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 lg:grid-rows-[auto_auto]">
        <HubCard title="Latest match" to={lastMatchLink} linkLabel="Detailed analysis">
          {lastMatch ? (
            <div className="flex flex-1 flex-col gap-3">
              <div className="flex items-center gap-3.5">
                <div className="relative shrink-0">
                  <ChampionIcon
                    championId={lastMatch.champion_id}
                    size={64}
                    className={`rounded-2xl border-2 ${lastMatch.win ? "border-lol-win/70 shadow-[0_0_18px_rgba(56,214,162,0.25)]" : "border-lol-loss/70 shadow-[0_0_18px_rgba(240,86,110,0.25)]"}`}
                  />
                  {lastMatch.score_badge && (
                    <span
                      className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full px-2 py-px text-[9px] font-extrabold tracking-wider ${
                        lastMatch.score_badge === "MVP"
                          ? "bg-lol-gold text-[#241705]"
                          : "bg-[var(--theme-violet)] text-[#150c33]"
                      }`}
                    >
                      {lastMatch.score_badge}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-display text-[19px] font-bold leading-tight text-lol-text-bright">
                    {getChampionName(champData, lastMatch.champion_id)}
                  </div>
                  <div
                    className={`font-display text-[12px] font-bold uppercase tracking-wider ${lastMatch.win ? "text-lol-win" : "text-lol-loss"}`}
                  >
                    {lastMatch.win ? "Victory" : "Defeat"}
                  </div>
                  <div className="text-[11.5px] text-lol-text">
                    {formatDuration(lastMatch.game_duration)} ·{" "}
                    {formatTimeAgo(lastMatch.game_creation)}
                  </div>
                </div>
              </div>
              <div className="flex items-end justify-between gap-2 border-t border-lol-border/40 pt-3">
                <div>
                  <div className="font-display text-[22px] font-bold leading-none text-lol-text-bright">
                    {lastMatch.kills}
                    <span className="text-lol-text/50"> / </span>
                    <span className="text-lol-loss">{lastMatch.deaths}</span>
                    <span className="text-lol-text/50"> / </span>
                    {lastMatch.assists}
                  </div>
                  <div className="mt-1 text-[11px] text-lol-text">
                    {(
                      (lastMatch.kills + lastMatch.assists) /
                      Math.max(1, lastMatch.deaths)
                    ).toFixed(2)}{" "}
                    KDA
                  </div>
                </div>
                {lastMatchAugments.length > 0 && (
                  <div className="flex gap-1">
                    {lastMatchAugments.slice(0, 4).map((augmentId) => (
                      <AugmentIcon
                        key={augmentId}
                        augmentId={augmentId}
                        size={24}
                        patch={lastMatch.game_version}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-auto grid grid-cols-3 gap-2 border-t border-lol-border/40 pt-3">
                <div>
                  <div className={LABEL}>Damage</div>
                  <div className="font-display text-[16px] font-bold text-lol-text-bright">
                    {compact(lastMatch.total_damage_dealt)}
                  </div>
                </div>
                <div>
                  <div className={LABEL}>Gold</div>
                  <div className="font-display text-[16px] font-bold text-lol-gold-light">
                    {compact(lastMatch.gold_earned)}
                  </div>
                </div>
                <div>
                  <div className={LABEL}>OP score</div>
                  <div className="font-display text-[16px] font-bold text-lol-text-bright">
                    {lastMatch.score != null ? lastMatch.score.toFixed(1) : "—"}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[13px] text-lol-text">No matches recorded yet.</div>
          )}
        </HubCard>
        <HubCard title="Champions" to="/champions" linkLabel="Open champions">
          {topChampions.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {topChampions.map((champion) => (
                <div key={champion.championId} className="flex items-center gap-2.5">
                  <ChampionIcon championId={champion.championId} size={34} className="rounded-lg" />
                  <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-lol-text-bright">
                    {getChampionName(champData, champion.championId)}
                  </span>
                  <span className="text-[12px] text-lol-text">{champion.games}g</span>
                  <b
                    className={`w-10 text-right font-display text-[15px] ${winRateColor(champion.winRate * 100)}`}
                  >
                    {Math.round(champion.winRate * 100)}%
                  </b>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[13px] text-lol-text">No champions in this period.</div>
          )}
        </HubCard>

        <HubCard title="Items" to="/items" linkLabel="Open items">
          <TopItemsList rows={itemRows} />
        </HubCard>
        <HubCard
          title="Trends & progress"
          to="/trends"
          linkLabel="Open trends"
          className="md:col-span-2 lg:col-span-1 lg:row-span-2"
        >
          <div className="text-[12.5px] leading-snug text-lol-text">
            Each bar is one game: height = OP score (0–10), green = win, red = loss. Newest on the
            right.
          </div>
          <div className="relative mt-3 min-h-[170px] flex-1">
            {[10, 5, 0].map((tick) => (
              <div
                key={tick}
                className="absolute inset-x-0 flex items-center gap-2"
                style={{ bottom: `${tick * 10}%` }}
              >
                <span className="w-4 text-right text-[9px] font-bold text-lol-text/50">{tick}</span>
                <i className="block h-px flex-1 bg-white/[0.07]" />
              </div>
            ))}
            <div className="absolute inset-y-0 left-6 right-0 flex items-end gap-[3px]">
              {recentForm.map((game) => {
                const height =
                  game.score != null ? Math.max(6, Math.min(100, game.score * 10)) : 30;
                return (
                  <i
                    key={game.game_id}
                    title={`${getChampionName(champData, game.champion_id)} · ${game.win ? "Win" : "Loss"} · score ${game.score != null ? game.score.toFixed(1) : "n/a"}`}
                    className={`block flex-1 rounded-t-[5px] ${
                      game.win
                        ? "bg-[linear-gradient(to_top,color-mix(in_oklab,var(--theme-win)_62%,black),var(--theme-win))] shadow-[0_0_14px_color-mix(in_oklab,var(--theme-win)_60%,transparent)]"
                        : "bg-[linear-gradient(to_top,color-mix(in_oklab,var(--theme-loss)_62%,black),var(--theme-loss))] shadow-[0_0_14px_color-mix(in_oklab,var(--theme-loss)_60%,transparent)]"
                    }`}
                    style={{ height: `${height}%` }}
                  />
                );
              })}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-[12.5px] text-lol-text">
            <span>Last {recentForm.length} games</span>
            {summary && summary.recentStreak !== 0 && (
              <span
                className={`rounded-full border px-2.5 py-0.5 font-display text-[12px] font-bold ${
                  summary.recentStreak > 0
                    ? "border-lol-win/50 bg-lol-win/15 text-lol-win"
                    : "border-lol-loss/50 bg-lol-loss/15 text-lol-loss"
                }`}
              >
                {summary.recentStreak > 0 ? "W" : "L"}
                {Math.abs(summary.recentStreak)} streak
              </span>
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-lol-border/50 pt-4">
            <BigStatMini
              label="Win rate"
              value={games > 0 ? `${winRate.toFixed(1)}%` : "—"}
              tone={winRate >= 50 ? "win" : "loss"}
            />
            <BigStatMini label="Avg KDA" value={games > 0 ? avgKda.toFixed(2) : "—"} />
            <BigStatMini label="Avg score" value={avgOp != null ? avgOp.toFixed(1) : "—"} />
            <BigStatMini label="Avg damage" value={avgDamage} />
          </div>
        </HubCard>
        <HubCard title="Last 5 games" to="/history" linkLabel="Full history">
          {lastFive.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {lastFive.map((game) => {
                return (
                  <Link
                    key={game.game_id}
                    to={`/match/${game.game_id}`}
                    className={`flex items-center gap-2.5 rounded-lg border-l-[3px] bg-white/[0.03] px-2 py-1.5 transition-colors hover:bg-white/[0.07] ${game.win ? "border-lol-win" : "border-lol-loss"}`}
                  >
                    <ChampionIcon championId={game.champion_id} size={30} className="rounded-md" />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-lol-text-bright">
                      {getChampionName(champData, game.champion_id)}
                    </span>
                    <span className="font-display text-[13px] text-lol-text-bright">
                      {game.kills}/<span className="text-lol-loss">{game.deaths}</span>/
                      {game.assists}
                    </span>
                    <b
                      title="Game score"
                      className={`w-9 text-right font-display text-[13px] ${game.score != null ? scoreColor(game.score) : "text-lol-text"}`}
                    >
                      {game.score != null ? game.score.toFixed(1) : "—"}
                    </b>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-[13px] text-lol-text">No games in this period.</div>
          )}
        </HubCard>
        <HubCard title="Peaks" to="/records" linkLabel="Open records">
          <StatRow
            label="Most kills"
            value={records?.mostKills ? String(records.mostKills.value) : "—"}
            championId={records?.mostKills?.championId}
          />
          <StatRow
            label="Highest damage"
            value={records?.mostDamage ? formatNumber(records.mostDamage.value) : "—"}
            championId={records?.mostDamage?.championId}
          />
          <StatRow
            label="Most assists"
            value={records?.mostAssists ? String(records.mostAssists.value) : "—"}
            championId={records?.mostAssists?.championId}
          />
          <StatRow
            label="Biggest crit"
            value={records?.biggestCrit ? formatNumber(records.biggestCrit.value) : "—"}
            championId={records?.biggestCrit?.championId}
          />
          <StatRow
            label="Most CS"
            value={records?.mostCs ? formatNumber(records.mostCs.value) : "—"}
            championId={records?.mostCs?.championId}
          />
          <StatRow
            label="Most deaths"
            value={records?.mostDeaths ? String(records.mostDeaths.value) : "—"}
            championId={records?.mostDeaths?.championId}
          />
        </HubCard>
        <HubCard title="Best milestone" to="/records" linkLabel="Open records">
          {nextMilestone ? (
            <>
              <div className="font-display text-[19px] font-bold text-lol-gold-light">
                {formatNumber(nextMilestone)} tracked games
              </div>
              <div className="text-[13px] text-lol-text">
                {formatNumber(nextMilestone - allTimeGames)} to go in {modeName}
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <i
                  className="block h-full rounded-full bg-lol-gold"
                  style={{ width: `${milestonePct}%` }}
                />
              </div>
              <div className="mt-2 text-[12px] text-lol-text">
                {formatNumber(allTimeGames)} / {formatNumber(nextMilestone)}
              </div>
            </>
          ) : (
            <div className="text-[13px] text-lol-text">Every milestone reached.</div>
          )}
        </HubCard>
      </div>

      {/* 5. Augments by rarity */}
      <HubCard title="Augments" to="/augments" linkLabel="All augments">
        <AugmentRarityRows stats={augmentStats} />
      </HubCard>

      {!isMayhem && (
        <section>
          <div className="font-display text-[11px] font-bold uppercase tracking-widest text-lol-gold">
            Keep exploring
          </div>
          <h2 className="mb-3 mt-1 font-display text-[22px] font-bold text-lol-text-bright">
            Navigation & Insights Hub
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {HUB.map(({ to, title, text, Icon }) => (
              <Link
                key={to}
                to={to}
                className="group relative rounded-[14px] glass-card p-4 transition-colors hover:border-lol-crimson/50"
              >
                <ChevronRightIcon className="absolute right-3 top-3 h-4 w-4 -rotate-45 text-lol-text group-hover:text-lol-text-bright" />
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-lol-crimson/15 text-lol-crimson">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="mt-3 font-display text-[15px] font-semibold text-lol-text-bright">
                  {title}
                </div>
                <div className="text-[12.5px] text-lol-text">{text}</div>
              </Link>
            ))}
          </div>
        </section>
      )}
      {/* 6. Bottom row: friends and live data */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <HubCard title="Friends & foes" to="/friends" linkLabel="Open friends">
          {friends.length > 0 ? (
            <div className="flex flex-col gap-2">
              {friends.map((friend) => {
                const rate = (friend.wins / Math.max(1, friend.games)) * 100;
                return (
                  <Link
                    key={friend.key}
                    to={`/friends/${encodeURIComponent(friend.key)}`}
                    className="flex items-center gap-3 rounded-lg px-1.5 py-1 transition-colors hover:bg-white/[0.05]"
                  >
                    <SummonerIcon iconId={friend.profileIcon} size={34} className="rounded-lg" />
                    <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-lol-text-bright">
                      {friend.name}
                    </span>
                    <span className="text-[12px] text-lol-text">{friend.games}g</span>
                    <b className={`w-10 text-right font-display text-[15px] ${winRateColor(rate)}`}>
                      {Math.round(rate)}%
                    </b>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-[13px] text-lol-text">No frequent teammates yet.</div>
          )}
        </HubCard>

        <HubCard title="Live status" to="/data" linkLabel="Open data">
          <div className="flex items-center gap-3">
            <span
              className={`h-3 w-3 shrink-0 rounded-full shadow-[0_0_10px_currentColor] ${liveStyle.dot}`}
            />
            <div className="min-w-0">
              <div className={`font-display text-[22px] font-bold leading-tight ${liveStyle.text}`}>
                {liveStatus.title}
              </div>
              <div className="truncate text-[13.5px] text-lol-text">{liveStatus.detail}</div>
            </div>
          </div>
          <div className="mt-4 rounded-xl bg-white/[0.04] px-3 py-2.5 text-[12.5px] leading-snug text-lol-text">
            Reads your League client: lobby, queue, champion select and the match you are in.
            Updates every second while the client is open.
          </div>
          <div className="mt-auto flex items-center justify-between pt-4 text-[12.5px] text-lol-text">
            <span>
              {patchOf(lastMatch?.game_version)
                ? `Latest tracked patch ${patchOf(lastMatch?.game_version)}`
                : "No patch data yet"}
            </span>
            {!isMayhem && (
              <Link
                to="/runes"
                className="font-semibold text-lol-text-bright/70 hover:text-lol-crimson"
              >
                Rune statistics →
              </Link>
            )}
          </div>
        </HubCard>
      </div>
    </div>
  );
}
function BigStatMini({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "win" | "loss";
}) {
  const color =
    tone === "win" ? "text-lol-win" : tone === "loss" ? "text-lol-loss" : "text-lol-text-bright";
  return (
    <div>
      <div className={LABEL}>{label}</div>
      <div className={`font-display text-[24px] font-bold leading-tight ${color}`}>{value}</div>
    </div>
  );
}
