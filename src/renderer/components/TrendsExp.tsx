import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { TrendsData, TrendsDay } from "../lib/types";
import { getChampionName, useChampionData } from "../hooks/useChampions";
import { formatDuration, formatNumber, formatTimeAgo } from "../lib/format";
import { isArenaQueue } from "../../shared/queues";
import { ActivityHeatmap } from "./ActivityHeatmap";
import ChampionIcon from "./ChampionIcon";
import { DonutChart } from "./DonutChart";
import { LineChartExp } from "./LineChartExp";
import { PatchBars } from "./PatchBars";
import { queueLabel } from "./QueueSelect";
import { HeroTile, PageHero } from "./SplashHero";
import SummonerIcon from "./SummonerIcon";
import { clockPoint, TimeSeriesChart, type SeriesPoint } from "./TimeSeriesChart";
import WinRateBar from "./WinRateBar";
import { Title } from "./live/shared";

export type TimeRange = "4w" | "12w" | "6m" | "all";

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: "4w", label: "4 weeks" },
  { value: "12w", label: "12 weeks" },
  { value: "6m", label: "6 months" },
  { value: "all", label: "All time" },
];
const RANGE_WEEKS: Record<TimeRange, number> = { "4w": 4, "12w": 12, "6m": 26, all: 0 };
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ROLE_ORDER = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "SUPPORT"];
const SECTIONS = [
  { id: "form", title: "Form", color: "#3ddc97" },
  { id: "activity", title: "When you play", color: "#b07cff" },
  { id: "performance", title: "Performance", color: "#e0b65c" },
  { id: "history", title: "Queues, patches & sessions", color: "#4db8ff" },
];
const ROW = "rounded-xl border border-lol-border/40 bg-black/25";

// ---- Weekly buckets ----

type Week = {
  monday: Date;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  scoreSum: number;
  scored: number;
};

// Day strings are local YYYY-MM-DD; building from parts keeps them on the local day
function parseDay(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

function mondayOf(date: Date): Date {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

// Every week between the ends, played or not: a break reads as a gap
function buildWeeks(daily: TrendsDay[], range: TimeRange): Week[] {
  if (daily.length === 0) return [];
  const sorted = [...daily].sort((a, b) => a.day.localeCompare(b.day));
  const last = mondayOf(parseDay(sorted[sorted.length - 1].day));
  const wanted = RANGE_WEEKS[range];
  const first = wanted ? new Date(last) : mondayOf(parseDay(sorted[0].day));
  if (wanted) first.setDate(first.getDate() - (wanted - 1) * 7);
  const count = Math.round((last.getTime() - first.getTime()) / WEEK_MS) + 1;
  const weeks: Week[] = Array.from({ length: count }, (_, index) => {
    const monday = new Date(first);
    monday.setDate(monday.getDate() + index * 7);
    return {
      monday,
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      scoreSum: 0,
      scored: 0,
    };
  });
  const byMonday = new Map(weeks.map((week) => [week.monday.getTime(), week]));
  for (const row of sorted) {
    const week = byMonday.get(mondayOf(parseDay(row.day)).getTime());
    if (!week) continue;
    week.games += row.games;
    week.wins += row.wins;
    week.kills += row.kills;
    week.deaths += row.deaths;
    week.assists += row.assists;
    week.scoreSum += row.score_sum ?? 0;
    week.scored += row.scored_games;
  }
  return weeks;
}

const shortDate = (date: Date) =>
  date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const kdaOf = (kills: number, deaths: number, assists: number) =>
  (kills + assists) / Math.max(deaths, 1);
const rate = (wins: number, games: number) => (games > 0 ? (wins / games) * 100 : 0);
const tone = (value: number) => (value >= 50 ? "text-lol-win" : "text-lol-loss");

// ---- Building blocks ----

function Tile({
  title,
  note,
  className = "",
  children,
}: {
  title: string;
  note?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`app-tile min-w-0 ${className}`}>
      <Title aside={note && <span className="text-[12px] text-lol-text">{note}</span>}>
        {title}
      </Title>
      {children}
    </section>
  );
}

function Section({
  id,
  title,
  color,
  children,
}: {
  id: string;
  title: string;
  color: string;
  children: ReactNode;
}) {
  return (
    <div id={`trends-${id}`} className="flex flex-col gap-5">
      <h2 className="mt-2 flex items-center gap-3 font-display text-[18px] font-bold uppercase tracking-[0.18em] text-lol-text-bright">
        <i className="h-2.5 w-2.5 rotate-45" style={{ backgroundColor: color }} />
        {title}
        <span className="h-px flex-1 bg-gradient-to-r from-lol-border to-transparent" />
      </h2>
      {children}
    </div>
  );
}

function Fact({
  label,
  value,
  className = "text-lol-text-bright",
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 px-3 py-2.5 text-center ${ROW}`}>
      <div className={`truncate font-display text-[19px] font-bold tabular-nums ${className}`}>
        {value}
      </div>
      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-lol-text">
        {label}
      </div>
    </div>
  );
}

function Empty({ text = "Not enough data" }: { text?: string }) {
  return <p className="py-10 text-center text-sm text-lol-text/70">{text}</p>;
}

// ---- Form ----

type Metric = "winRate" | "score" | "kda" | "kills";
const METRICS: { value: Metric; label: string }[] = [
  { value: "winRate", label: "Win rate" },
  { value: "score", label: "Score" },
  { value: "kda", label: "KDA" },
  { value: "kills", label: "K / D / A" },
];

function OverTime({ weeks, data }: { weeks: Week[]; data: TrendsData }) {
  const [metric, setMetric] = useState<Metric>("winRate");
  const played = weeks.filter((w) => w.games > 0);
  const valueOf = (w: Week): number | null => {
    if (w.games === 0) return null;
    if (metric === "winRate") return rate(w.wins, w.games);
    if (metric === "score") return w.scored ? w.scoreSum / w.scored : null;
    return kdaOf(w.kills, w.deaths, w.assists);
  };
  const format = (v: number) =>
    metric === "winRate" ? `${v.toFixed(0)}%` : v.toFixed(metric === "score" ? 1 : 2);
  const points: SeriesPoint[] = weeks.map((w) => ({
    label: shortDate(w.monday),
    games: w.games,
    value: valueOf(w),
    detail: w.games ? `${w.games} games · ${w.wins}W-${w.games - w.wins}L` : "No games",
  }));
  const values = points.map((p) => p.value).filter((v): v is number => v != null);
  const max =
    metric === "winRate" ? 100 : metric === "score" ? 10 : Math.ceil(Math.max(1, ...values));
  const ticks = [0, max / 4, max / 2, (max * 3) / 4, max];

  const perGame = (pick: (w: Week) => number) =>
    weeks.map((w) => (w.games ? pick(w) / w.games : null));
  const kdaLines = [
    { label: "Kills", color: "var(--theme-win)", values: perGame((w) => w.kills) },
    { label: "Deaths", color: "var(--theme-loss)", values: perGame((w) => w.deaths) },
    { label: "Assists", color: "var(--theme-assist)", values: perGame((w) => w.assists) },
  ];
  const kdaMax = Math.max(
    5,
    Math.ceil(
      Math.max(0, ...kdaLines.flatMap((l) => l.values).filter((v): v is number => v != null)) / 5,
    ) * 5,
  );

  const extreme = (direction: 1 | -1) =>
    played.reduce<{ week: Week; value: number } | null>((found, week) => {
      const value = valueOf(week);
      if (value == null) return found;
      return !found || (value - found.value) * direction > 0 ? { week, value } : found;
    }, null);
  const best = extreme(1);
  const worst = extreme(-1);

  return (
    <Tile
      title="Over time"
      className="xl:col-span-2"
      note={
        <span className="flex flex-wrap gap-1">
          {METRICS.map((m) => (
            <button
              type="button"
              key={m.value}
              aria-pressed={metric === m.value}
              onClick={() => setMetric(m.value)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                metric === m.value
                  ? "bg-lol-crimson text-white"
                  : "text-lol-text hover:text-lol-text-bright"
              }`}
            >
              {m.label}
            </button>
          ))}
        </span>
      }
    >
      {played.length === 0 ? (
        <Empty />
      ) : metric === "kills" ? (
        <LineChartExp
          values={kdaLines[0].values}
          series={kdaLines}
          format={(v) => v.toFixed(1)}
          xLabels={weeks.map((w) => shortDate(w.monday))}
          yFormat={(v) => v.toFixed(0)}
          min={0}
          max={kdaMax}
          height={260}
        />
      ) : (
        <TimeSeriesChart
          points={points}
          yMin={0}
          yMax={max}
          ticks={ticks}
          refValue={metric === "winRate" ? 50 : undefined}
          format={format}
        />
      )}
      <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {metric === "kills" ? (
          <>
            <Fact label="Avg kills" value={data.summaryStats.avgKills.toFixed(1)} />
            <Fact label="Avg deaths" value={data.summaryStats.avgDeaths.toFixed(1)} />
            <Fact label="Avg assists" value={data.summaryStats.avgAssists.toFixed(1)} />
            <Fact label="Weeks played" value={`${played.length} / ${weeks.length}`} />
          </>
        ) : (
          <>
            <Fact
              label={best ? `Best week · ${shortDate(best.week.monday)}` : "Best week"}
              value={best ? format(best.value) : "—"}
              className="text-lol-win"
            />
            <Fact
              label={worst ? `Worst week · ${shortDate(worst.week.monday)}` : "Worst week"}
              value={worst ? format(worst.value) : "—"}
              className="text-lol-loss"
            />
            <Fact
              label="Latest week"
              value={values.length ? format(values[values.length - 1]) : "—"}
            />
            <Fact label="Weeks played" value={`${played.length} / ${weeks.length}`} />
          </>
        )}
      </div>
    </Tile>
  );
}

function RecentForm({ data }: { data: TrendsData }) {
  const { streaks } = data;
  const wins = streaks.last20Games.filter(Boolean).length;
  const current = streaks.currentStreak;
  return (
    <Tile title="Recent form" note={`last ${streaks.last20Games.length} games`}>
      <div className="grid grid-cols-2 gap-2.5">
        <Fact
          label="Current streak"
          value={current.type ? `${current.count}${current.type}` : "—"}
          className={current.type === "L" ? "text-lol-loss" : "text-lol-win"}
        />
        <Fact label="KDA" value={streaks.last20AvgKda.toFixed(2)} />
        <Fact label="Longest win streak" value={streaks.maxWinStreak} className="text-lol-win" />
        <Fact label="Longest loss streak" value={streaks.maxLossStreak} className="text-lol-loss" />
      </div>
      <div className="mt-3 flex gap-1" aria-label="Results of the latest games, oldest first">
        {streaks.last20Games.map((win, index) => (
          <i
            key={index}
            title={`Game ${index + 1}: ${win ? "win" : "loss"}`}
            className={`h-8 min-w-0 flex-1 rounded ${win ? "bg-lol-win" : "bg-lol-loss"}`}
          />
        ))}
      </div>
      <div className="mt-2 text-center text-[12px] text-lol-text">
        <span className="font-semibold text-lol-win">{wins}W</span> ·{" "}
        <span className="font-semibold text-lol-loss">{streaks.last20Games.length - wins}L</span>
      </div>
    </Tile>
  );
}

function WinningConditions({ data }: { data: TrendsData }) {
  const rows = [
    ["With first blood", data.winningConditions.firstBloodWr],
    ["KDA above 3.0", data.winningConditions.kda3Wr],
    ["Score 7.0 or more", data.winningConditions.score7Wr],
  ] as const;
  return (
    <Tile title="Winning conditions" note="win rate when…">
      <div className="flex flex-col gap-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className={`px-3 py-2.5 ${ROW}`}>
            <div className="mb-1.5 flex justify-between text-[13px]">
              <span className="text-lol-text">{label}</span>
              <b className="font-display tabular-nums text-lol-text-bright">
                {value == null ? "—" : `${value.toFixed(1)}%`}
              </b>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-lol-win"
                style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Tile>
  );
}

function Balance({ weeks }: { weeks: Week[] }) {
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.wins, w.games - w.wins)));
  const labelEvery = Math.max(1, Math.ceil(weeks.length / 12));
  return (
    <Tile title="Wins and losses" note="per week">
      <div className="flex h-44 items-stretch gap-1">
        {weeks.map((w) => (
          <div
            key={w.monday.getTime()}
            className="flex min-w-0 flex-1 flex-col"
            title={`${shortDate(w.monday)}: ${w.wins}W ${w.games - w.wins}L`}
          >
            <div className="flex flex-1 items-end justify-center border-b border-lol-border">
              <i
                className="w-full max-w-5 rounded-t bg-lol-win"
                style={{ height: `${(w.wins / max) * 100}%` }}
              />
            </div>
            <div className="flex flex-1 items-start justify-center">
              <i
                className="w-full max-w-5 rounded-b bg-lol-loss"
                style={{ height: `${((w.games - w.wins) / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1 text-[10px] text-lol-text">
        {weeks.map((w, index) => (
          <span key={w.monday.getTime()} className="min-w-0 flex-1 whitespace-nowrap text-center">
            {index % labelEvery === 0 ? shortDate(w.monday) : ""}
          </span>
        ))}
      </div>
    </Tile>
  );
}

// ---- When you play ----

const MATRIX_COLS = "grid grid-cols-[40px_repeat(24,minmax(0,1fr))] items-center gap-1";

function DayHourMatrix({ data }: { data: TrendsData["dayHourMatrix"] }) {
  const cells = new Map(data.map((c) => [`${c.weekday}:${c.hour}`, c]));
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const most = Math.max(1, ...data.map((c) => c.games));
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[720px] flex-col gap-1">
        {WEEKDAY_ORDER.map((weekday) => (
          <div key={weekday} className={MATRIX_COLS}>
            <span className="text-[11px] text-lol-text">{WEEKDAY_LABELS[weekday]}</span>
            {hours.map((hour) => {
              const cell = cells.get(`${weekday}:${hour}`);
              const games = cell?.games ?? 0;
              const win = rate(cell?.wins ?? 0, games);
              return (
                <div
                  key={hour}
                  title={`${WEEKDAY_FULL[weekday]} ${String(hour).padStart(2, "0")}:00 · ${games} games · ${win.toFixed(0)}% win rate`}
                  className="flex h-8 items-center justify-center rounded text-[9px] font-semibold text-white"
                  style={{
                    // Colour says win or loss, strength says how many games stand behind it
                    background: games
                      ? `color-mix(in srgb, var(${win >= 50 ? "--theme-win" : "--theme-loss"}) ${25 + (games / most) * 55}%, black)`
                      : "rgba(0,0,0,0.35)",
                  }}
                >
                  {games ? win.toFixed(0) : ""}
                </div>
              );
            })}
          </div>
        ))}
        <div className={`${MATRIX_COLS} text-[10px] text-lol-text`}>
          <span />
          {hours.map((hour) => (
            <span key={hour} className="text-center">
              {hour % 3 === 0 ? hour : ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- Page ----

export function TrendsExp({
  data,
  error,
  onRetry,
  timeRange,
  setTimeRange,
  patch,
}: {
  data: TrendsData | null;
  error: string | null;
  onRetry: () => Promise<void>;
  timeRange: TimeRange;
  setTimeRange: (timeRange: TimeRange) => void;
  patch?: string;
}) {
  const champions = useChampionData();
  const rangeLabel = TIME_RANGES.find((r) => r.value === timeRange)!.label.toLowerCase();
  const ready = !!data && data.daily.length > 0 && !error;
  const total = (pick: (d: TrendsDay) => number) =>
    ready ? data.daily.reduce((sum, d) => sum + pick(d), 0) : 0;
  const games = total((d) => d.games);
  const wins = total((d) => d.wins);
  const scored = total((d) => d.scored_games);

  const header = (
    <PageHero title="Trends" subtitle={`How your ${rangeLabel} look`}>
      <HeroTile label="Matches" value={ready ? formatNumber(games) : "—"} />
      <HeroTile
        label="Win rate"
        value={ready ? `${rate(wins, games).toFixed(1)}%` : "—"}
        sub={ready ? `${formatNumber(wins)}W ${formatNumber(games - wins)}L` : undefined}
        valueClass={tone(rate(wins, games))}
      />
      <HeroTile
        label="KDA"
        value={
          ready
            ? kdaOf(
                total((d) => d.kills),
                total((d) => d.deaths),
                total((d) => d.assists),
              ).toFixed(2)
            : "—"
        }
        valueClass="text-lol-assist"
      />
      <HeroTile
        label="Score"
        value={scored ? (total((d) => d.score_sum ?? 0) / scored).toFixed(1) : "—"}
        valueClass="text-lol-gold"
      />
      <HeroTile
        label="Playtime"
        value={ready ? `${Math.round(total((d) => d.duration_sum) / 3600)}h` : "—"}
      />
      <HeroTile
        label="Win rate change"
        value={
          ready
            ? `${data.insights.winRateDiff > 0 ? "+" : ""}${data.insights.winRateDiff.toFixed(1)} pp`
            : "—"
        }
        valueClass={ready && data.insights.winRateDiff < 0 ? "text-lol-loss" : "text-lol-win"}
      />
    </PageHero>
  );

  const controls = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav className="flex flex-wrap gap-2" aria-label="Trend sections">
        {SECTIONS.map((section) => (
          <button
            type="button"
            key={section.id}
            onClick={() =>
              document
                .getElementById(`trends-${section.id}`)
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            className="flex items-center gap-2 rounded-lg border border-lol-border/60 bg-lol-card/40 px-3 py-1.5 text-xs font-semibold text-lol-text transition-colors hover:text-lol-text-bright"
          >
            <i className="h-2 w-2 rounded-full" style={{ backgroundColor: section.color }} />
            {section.title}
          </button>
        ))}
      </nav>
      <div
        className="ml-auto inline-flex rounded-lg border border-lol-border/60 bg-lol-card/40 p-[3px]"
        aria-label="Time range"
      >
        {TIME_RANGES.map((range) => (
          <button
            type="button"
            key={range.value}
            aria-pressed={timeRange === range.value}
            onClick={() => setTimeRange(range.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              timeRange === range.value
                ? "bg-lol-crimson text-white"
                : "text-lol-text hover:text-lol-text-bright"
            }`}
          >
            {range.label}
          </button>
        ))}
      </div>
    </div>
  );

  if (!ready) {
    return (
      <div className="flex min-h-full w-full flex-col gap-5">
        {header}
        {controls}
        <div className="app-tile text-center">
          <p className="text-sm font-semibold text-lol-text-bright">
            {error
              ? "Failed to load trends."
              : data
                ? "No trend data for this scope"
                : "Loading trends…"}
          </p>
          {error && (
            <>
              <p className="mt-1 text-xs text-lol-text">{error}</p>
              <button
                type="button"
                onClick={() => void onRetry()}
                className="mt-4 rounded-md border border-lol-border px-3 py-1.5 text-xs font-semibold text-lol-text transition-colors hover:border-lol-gold/60 hover:text-lol-text-bright"
              >
                Retry
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const weeks = buildWeeks(data.daily, timeRange);
  const { summaryStats: summary, insights, combatEconomy: combat } = data;

  const roleStats = new Map(
    data.roleBreakdown.map((r) => [r.role === "UTILITY" ? "SUPPORT" : r.role, r]),
  );
  const roles = ROLE_ORDER.map((role) => roleStats.get(role)).filter(
    (r): r is TrendsData["roleBreakdown"][number] => !!r && r.games > 0,
  );

  // Arena has several queue ids; they read as one row
  const queues = new Map<
    string,
    { games: number; wins: number; k: number; d: number; a: number; duration: number }
  >();
  for (const q of data.queueBreakdown) {
    const label = isArenaQueue(q.queueId) ? "Arena" : queueLabel(q.queueId);
    const row = queues.get(label) ?? { games: 0, wins: 0, k: 0, d: 0, a: 0, duration: 0 };
    row.games += q.games;
    row.wins += q.wins;
    row.k += q.kills;
    row.d += q.deaths;
    row.a += q.assists;
    row.duration += q.avgDuration * q.games;
    queues.set(label, row);
  }

  // A mode without an objective (no dragons in ARAM) shows no row for it
  const objectives = (
    [
      ["Dragons", data.objectiveControl.dragons],
      ["Barons", data.objectiveControl.barons],
      ["Towers", data.objectiveControl.towers],
    ] as const
  ).filter(([, v]) => Number(v.win) + Number(v.loss) > 0);

  const combatRows = combat
    ? [
        ["Damage / min", combat.dpm.toFixed(0)],
        ["Gold / min", combat.gpm.toFixed(0)],
        ["CS / min", combat.cspm.toFixed(1)],
        ["Kill participation", `${combat.killParticipation.toFixed(1)}%`],
        ["Damage taken", formatNumber(Math.round(combat.damageTaken))],
        ...(combat.vision >= 0.05 ? [["Vision score", combat.vision.toFixed(1)]] : []),
      ]
    : [];

  const highlights = [
    {
      label: "Strongest day",
      value: insights.bestDay?.day ?? "—",
      detail: insights.bestDay ? `${insights.bestDay.wr.toFixed(1)}% win rate` : "Not enough games",
    },
    {
      label: "Peak hours",
      value: insights.peakWindow
        ? `${insights.peakWindow.startHour}:00–${insights.peakWindow.endHour}:00`
        : "—",
      detail: insights.peakWindow
        ? `${insights.peakWindow.wr.toFixed(1)}% win rate`
        : "Not enough games",
    },
    {
      label: "Most active day",
      value: summary.mostActiveDay || "—",
      detail: `longest daily streak ${summary.longestActiveStreak} days`,
    },
    {
      label: "Last played",
      value: summary.lastPlayed > 0 ? formatTimeAgo(summary.lastPlayed) : "—",
      detail: `${formatNumber(summary.totalGames)} games in this period`,
    },
  ];

  return (
    <div className="flex min-h-full w-full flex-col gap-5">
      {header}
      {controls}

      <Section {...SECTIONS[0]}>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <OverTime weeks={weeks} data={data} />
          <RecentForm data={data} />
        </div>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <div className="min-w-0 xl:col-span-2">
            <Balance weeks={weeks} />
          </div>
          <WinningConditions data={data} />
        </div>
      </Section>

      <Section {...SECTIONS[1]}>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {highlights.map((h) => (
            <div key={h.label} className="app-tile min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-widest text-lol-gold">
                {h.label}
              </div>
              <div className="mt-1 truncate font-display text-[26px] font-bold text-lol-text-bright">
                {h.value}
              </div>
              <div className="text-[12px] text-lol-text">{h.detail}</div>
            </div>
          ))}
        </div>
        <Tile title="Activity" note="games per day">
          <div className="flex w-full justify-center">
            <ActivityHeatmap daily={data.daily} />
          </div>
        </Tile>
        <Tile title="Day and hour" note="number = win rate · stronger colour = more games">
          <DayHourMatrix data={data.dayHourMatrix} />
        </Tile>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Tile title="By day of week" note="line = win rate · bars = games">
            <TimeSeriesChart
              points={WEEKDAY_ORDER.map((weekday) => {
                const row = data.weekdays.find((w) => w.weekday === weekday);
                return clockPoint(
                  WEEKDAY_LABELS[weekday],
                  WEEKDAY_FULL[weekday],
                  row?.games ?? 0,
                  row?.wins ?? 0,
                );
              })}
              yMin={0}
              yMax={100}
              ticks={[0, 50, 100]}
              refValue={50}
              format={(v) => `${v.toFixed(0)}%`}
            />
          </Tile>
          <Tile title="By hour of day" note="line = win rate · bars = games">
            <TimeSeriesChart
              points={Array.from({ length: 24 }, (_, hour) => {
                const row = data.hours.find((h) => h.hour === hour);
                return clockPoint(
                  `${hour}:00`,
                  `${String(hour).padStart(2, "0")}:00`,
                  row?.games ?? 0,
                  row?.wins ?? 0,
                );
              })}
              yMin={0}
              yMax={100}
              ticks={[0, 50, 100]}
              refValue={50}
              format={(v) => `${v.toFixed(0)}%`}
            />
          </Tile>
        </div>
      </Section>

      <Section {...SECTIONS[2]}>
        {combatRows.length > 0 && (
          <div
            className={`grid grid-cols-2 gap-3 md:grid-cols-3 ${combatRows.length > 5 ? "xl:grid-cols-6" : "xl:grid-cols-5"}`}
          >
            {combatRows.map(([label, value]) => (
              <div key={label} className="app-tile min-w-0 text-center">
                <div className="font-display text-[28px] font-bold tabular-nums text-lol-text-bright">
                  {value}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-lol-text">
                  {label}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <Tile title="Champions" note="best this period">
            {data.championTop.length === 0 ? (
              <Empty />
            ) : (
              <div className="flex flex-col gap-1.5">
                {data.championTop.map((c) => (
                  <Link
                    key={c.championId}
                    to={`/champions/${c.championId}`}
                    className={`flex items-center gap-3 px-3 py-2 transition-colors hover:bg-white/[0.04] ${ROW}`}
                  >
                    <ChampionIcon championId={c.championId} size={36} className="rounded-lg" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-[14px] font-bold text-lol-text-bright">
                        {getChampionName(champions, c.championId)}
                      </div>
                      <div className="text-[11px] text-lol-text">
                        {c.games} games · {kdaOf(c.kills, c.deaths, c.assists).toFixed(2)} KDA
                        {c.games < 5 ? " · low sample" : ""}
                      </div>
                    </div>
                    <span
                      className={`font-display text-[17px] font-bold tabular-nums ${tone(rate(c.wins, c.games))}`}
                    >
                      {rate(c.wins, c.games).toFixed(0)}%
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Tile>
          <Tile title="Duo partners" note="most played with">
            {data.topDuos.length === 0 ? (
              <Empty text="No duo data" />
            ) : (
              <div className="flex flex-col gap-1.5">
                {data.topDuos.map((duo) => (
                  <div key={duo.puuid} className={`flex items-center gap-3 px-3 py-2 ${ROW}`}>
                    <SummonerIcon iconId={duo.profileIcon} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-[14px] font-bold text-lol-text-bright">
                        {duo.gameName}#{duo.tagLine}
                      </div>
                      <div className="text-[11px] text-lol-text">{duo.games} games</div>
                    </div>
                    <span
                      className={`font-display text-[17px] font-bold tabular-nums ${tone(duo.winRate)}`}
                    >
                      {duo.winRate.toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Tile>
          <div className="flex min-w-0 flex-col gap-5">
            <Tile title="Damage split" className={objectives.length > 0 ? "" : "flex-1"}>
              <div className="flex justify-center">
                <DonutChart
                  segments={[
                    { label: "Physical", value: data.damageSplit.physical, color: "#FF8C00" },
                    { label: "Magic", value: data.damageSplit.magic, color: "#00D9FF" },
                    { label: "True", value: data.damageSplit.true, color: "#FFFFFF" },
                  ]}
                  showLegend
                  centerLabel="Damage"
                  centerSub="Total"
                />
              </div>
            </Tile>
            {objectives.length > 0 && (
              <Tile title="Objectives" note="average in wins vs losses" className="flex-1">
                <div className="flex flex-col gap-1.5">
                  {objectives.map(([label, values]) => {
                    const won = Number(values.win);
                    const lost = Number(values.loss);
                    return (
                      <div key={label} className={`px-3 py-2.5 ${ROW}`}>
                        <div className="mb-1.5 flex justify-between text-[12.5px]">
                          <span className="text-lol-text">{label}</span>
                          <span className="tabular-nums">
                            <b className="text-lol-win">{won.toFixed(2)}</b>
                            <span className="text-lol-text"> / </span>
                            <b className="text-lol-loss">{lost.toFixed(2)}</b>
                          </span>
                        </div>
                        <div className="flex h-1.5 overflow-hidden rounded-full bg-lol-loss">
                          <div
                            className="h-full bg-lol-win"
                            style={{ width: `${(won / (won + lost)) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Tile>
            )}
          </div>
        </div>
        {roles.length > 0 && (
          <Tile title="Roles" note="games with an assigned position">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {roles.map((r) => (
                <div key={r.role} className={`p-3 text-center ${ROW}`}>
                  <div
                    className={`font-display text-[26px] font-bold tabular-nums ${tone(rate(r.wins, r.games))}`}
                  >
                    {rate(r.wins, r.games).toFixed(1)}%
                  </div>
                  <div className="text-[11px] font-bold uppercase tracking-widest text-lol-text-bright">
                    {r.role === "UTILITY" ? "SUPPORT" : r.role}
                  </div>
                  <div className="text-[11px] text-lol-text">{r.games} games</div>
                </div>
              ))}
            </div>
          </Tile>
        )}
      </Section>

      <Section {...SECTIONS[3]}>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Tile title="Queues">
            <div className="flex flex-col gap-1.5">
              {[...queues.entries()]
                .sort((a, b) => b[1].games - a[1].games)
                .map(([label, q]) => (
                  <div key={label} className={`flex items-center gap-3 px-3 py-2.5 ${ROW}`}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-[14px] font-bold text-lol-text-bright">
                        {label}
                      </div>
                      <div className="text-[11px] text-lol-text">
                        {q.games} games · {kdaOf(q.k, q.d, q.a).toFixed(2)} KDA ·{" "}
                        {formatDuration(Math.round(q.duration / q.games))} avg
                      </div>
                    </div>
                    <div className="w-40 shrink-0">
                      <WinRateBar wins={q.wins} total={q.games} />
                    </div>
                  </div>
                ))}
            </div>
          </Tile>
          <Tile title="Recent sessions" note="latest first">
            <div className="flex flex-col gap-1.5">
              {data.recentSessions.map((s) => (
                <div
                  key={`${s.date}-${s.queueName}`}
                  className={`flex items-center gap-3 px-3 py-2.5 ${ROW} ${
                    s.wins * 2 >= s.games
                      ? "shadow-[inset_4px_0_0_var(--theme-win)]"
                      : "shadow-[inset_4px_0_0_var(--theme-loss)]"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-[14px] font-bold text-lol-text-bright">
                      {shortDate(new Date(s.date))}
                    </div>
                    <div className="truncate text-[11px] text-lol-text">{s.queueName}</div>
                  </div>
                  <span className="text-[12.5px] tabular-nums">
                    <b className="text-lol-win">{s.wins}W</b>{" "}
                    <b className="text-lol-loss">{s.games - s.wins}L</b>
                  </span>
                  <span className="w-20 text-right text-[12px] tabular-nums text-lol-text">
                    {s.avgKda.toFixed(2)} KDA
                  </span>
                </div>
              ))}
            </div>
          </Tile>
        </div>
        <Tile title={patch ? "Win rate for this patch" : "Win rate by patch"} note={rangeLabel}>
          <PatchBars patches={data.patches} />
        </Tile>
      </Section>
    </div>
  );
}
