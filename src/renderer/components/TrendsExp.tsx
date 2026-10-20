import { useMemo } from "react";
import type { TrendsData } from "../lib/types";
import { ActivityHeatmap } from "./ActivityHeatmap";
import ChampionIcon from "./ChampionIcon";
import { DonutChart } from "./DonutChart";
import { LineChartExp } from "./LineChartExp";
import { Panel } from "./Panel";
import { PatchBars } from "./PatchBars";
import { queueLabel } from "./QueueSelect";
import { SectionHeading } from "./SectionHeading";
import { clockPoint, TimeSeriesChart, type SeriesPoint } from "./TimeSeriesChart";
import { isArenaQueue } from "../../shared/queues";
import { formatDuration, formatPatch, formatTimeAgo } from "../lib/format";
import { getChampionName, useChampionData } from "../hooks/useChampions";
import { FilterChip } from "./FilterChip";
import { CrosshairIcon, StarIcon, SwordsIcon } from "./icons";

const PANEL_HOVER_CLASSES = "transition-colors hover:border-lol-crimson/50 hover:bg-white/[0.02]";
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type TimeRange = "4w" | "12w" | "6m" | "all";

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: "4w", label: "4 Weeks" },
  { value: "12w", label: "12 Weeks" },
  { value: "6m", label: "6 Months" },
  { value: "all", label: "All Time" },
];

function parseDay(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function mondayOf(date: Date): Date {
  const monday = new Date(date);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

function GroupedBarChart({ data }: { data: { label: string; wins: number; losses: number }[] }) {
  const width = 600;
  const height = 180;
  const padding = { top: 12, right: 8, bottom: 28, left: 8 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...data.flatMap((item) => [item.wins, item.losses]), 1);
  const groupWidth = chartWidth / data.length;
  const barWidth = Math.max(4, groupWidth * 0.24);
  const baseline = padding.top + chartHeight;
  const barHeight = (value: number) => (value / maxValue) * chartHeight;

  return (
    <div>
      <svg
        className="block h-auto w-full"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Weekly wins and losses"
      >
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={baseline}
          y2={baseline}
          stroke="var(--theme-border)"
        />
        {data.map((item, index) => {
          const center = padding.left + groupWidth * (index + 0.5);
          const winsHeight = barHeight(item.wins);
          const lossesHeight = barHeight(item.losses);
          return (
            <g key={item.label}>
              <rect
                x={center - barWidth - 1}
                y={baseline - winsHeight}
                width={barWidth}
                height={winsHeight}
                rx="2"
                fill="var(--theme-win)"
              >
                <title>{`${item.label}: ${item.wins} wins`}</title>
              </rect>
              <rect
                x={center + 1}
                y={baseline - lossesHeight}
                width={barWidth}
                height={lossesHeight}
                rx="2"
                fill="var(--theme-loss)"
              >
                <title>{`${item.label}: ${item.losses} losses`}</title>
              </rect>
              <text
                x={center}
                y={height - 8}
                textAnchor="middle"
                className="fill-lol-text text-[10px]"
              >
                {item.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-4 px-2 pt-1 text-xs text-lol-text">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[var(--theme-win)]" aria-hidden="true" />
          Wins
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[var(--theme-loss)]" aria-hidden="true" />
          Losses
        </span>
      </div>
    </div>
  );
}

function SimpleBar({ label, games, wins }: { label: string; games: number; wins: number }) {
  const winRate = games > 0 ? (wins / games) * 100 : 0;
  const barColor = winRate >= 50 ? "var(--theme-win)" : "var(--theme-assist)";

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2" title={label}>
      <div className="text-[10px] font-bold text-lol-text-bright">{winRate.toFixed(1)}%</div>
      <div className="flex h-40 w-full items-end justify-center">
        <div
          className="w-full max-w-12 rounded-t-md transition-[height] duration-200"
          style={{
            height: `${winRate === 0 ? 0 : Math.max(winRate, 4)}%`,
            backgroundColor: barColor,
          }}
        />
      </div>
      <div className="max-w-full truncate text-center text-[10px] font-semibold text-lol-text-bright">
        {label}
      </div>
      <div className="text-[10px] tabular-nums text-lol-text">{games} games</div>
    </div>
  );
}

const MATRIX_WEEKDAYS = [
  { weekday: 1, name: "Monday" },
  { weekday: 2, name: "Tuesday" },
  { weekday: 3, name: "Wednesday" },
  { weekday: 4, name: "Thursday" },
  { weekday: 5, name: "Friday" },
  { weekday: 6, name: "Saturday" },
  { weekday: 0, name: "Sunday" },
];

function matrixCellColor(games: number, winRate: number): string {
  if (games === 0) return "var(--theme-card-hover)";
  if (winRate < 45) return "color-mix(in srgb, var(--theme-loss) 45%, var(--theme-card))";
  if (winRate < 50) return "var(--theme-loss)";
  if (winRate < 55) return "var(--theme-gold)";
  if (winRate < 60) return "color-mix(in srgb, var(--theme-win) 55%, var(--theme-card))";
  return "var(--theme-win)";
}

function DayHourMatrix({ data }: { data: TrendsData["dayHourMatrix"] }) {
  const cells = new Map(data.map((cell) => [`${cell.weekday}:${cell.hour}`, cell]));
  const hours = Array.from({ length: 24 }, (_, hour) => hour);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="mb-2 grid grid-cols-[72px_repeat(24,minmax(20px,1fr))] gap-1 text-[10px] text-lol-text/70">
          <span />
          {hours.map((hour) => (
            <span key={hour} className="text-center">
              {hour % 3 === 0 ? `${hour}:00` : ""}
            </span>
          ))}
        </div>
        <div className="space-y-1">
          {MATRIX_WEEKDAYS.map((day) => (
            <div
              key={day.weekday}
              className="grid grid-cols-[72px_repeat(24,minmax(20px,1fr))] items-center gap-1"
            >
              <span className="text-xs text-lol-text">{day.name.slice(0, 3)}</span>
              {hours.map((hour) => {
                const cell = cells.get(`${day.weekday}:${hour}`);
                const games = cell?.games ?? 0;
                const winRate = games > 0 ? (cell!.wins / games) * 100 : 0;
                return (
                  <div
                    key={hour}
                    className="aspect-square rounded-[3px] border border-lol-border/30"
                    style={{ backgroundColor: matrixCellColor(games, winRate) }}
                    title={`${day.name} ${String(hour).padStart(2, "0")}:00 - ${games} games, ${Math.round(winRate)}% WR`}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-[72px_repeat(24,minmax(20px,1fr))] gap-1 text-[10px] text-lol-text/70">
          <span />
          {hours.map((hour) => (
            <span key={hour} className="text-center">
              {hour % 3 === 0 ? `${hour}:00` : ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

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
  const championData = useChampionData();
  const weekly = useMemo(() => {
    if (!data || data.daily.length === 0) return [];

    const daily = [...data.daily].sort((a, b) => a.day.localeCompare(b.day));
    const firstMonday = mondayOf(parseDay(daily[0].day));
    const lastMonday = mondayOf(parseDay(daily[daily.length - 1].day));
    const bucketCount =
      timeRange === "4w" ? 4 : timeRange === "12w" ? 12 : timeRange === "6m" ? 26 : 0;
    const startMonday =
      bucketCount > 0
        ? new Date(lastMonday.getTime() - (bucketCount - 1) * 7 * 24 * 60 * 60 * 1000)
        : firstMonday;
    const allBucketCount =
      Math.floor((lastMonday.getTime() - startMonday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
    const filteredDaily =
      bucketCount > 0
        ? daily.filter((row) => {
            const week = mondayOf(parseDay(row.day)).getTime();
            return week >= startMonday.getTime() && week <= lastMonday.getTime();
          })
        : daily;
    const buckets = Array.from({ length: bucketCount || allBucketCount }, (_, index) => {
      const week = new Date(startMonday);
      week.setDate(week.getDate() + index * 7);
      return {
        day: dayKey(week),
        games: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        scoreSum: 0,
        scoredGames: 0,
        duration: 0,
      };
    });
    const bucketByDay = new Map(buckets.map((bucket) => [bucket.day, bucket]));

    for (const row of filteredDaily) {
      const bucket = bucketByDay.get(dayKey(mondayOf(parseDay(row.day))));
      if (!bucket) continue;
      bucket.games += row.games;
      bucket.wins += row.wins;
      bucket.kills += row.kills;
      bucket.deaths += row.deaths;
      bucket.assists += row.assists;
      bucket.scoreSum += row.score_sum ?? 0;
      bucket.scoredGames += row.scored_games;
      bucket.duration += row.duration_sum;
    }

    return buckets;
  }, [data, timeRange]);

  const timeRangeLabel =
    TIME_RANGES.find((range) => range.value === timeRange)?.label ?? "12 Weeks";
  const hasQualifiedWrDay = data?.daily.some((row) => row.games >= 3) ?? false;
  const formatSigned = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(2)}`;

  const weeklyWinRates = weekly.map((week) =>
    week.games > 0 ? (week.wins / week.games) * 100 : null,
  );
  const weeklyKda = weekly.map((week) =>
    week.games > 0 ? (week.kills + week.assists) / Math.max(week.deaths, 1) : null,
  );
  const kdaDisplay = Array.from({ length: Math.ceil(weekly.length / 2) }, (_, index) => {
    const pair = weekly.slice(index * 2, index * 2 + 2);
    const games = pair.reduce((sum, week) => sum + week.games, 0);
    const wins = pair.reduce((sum, week) => sum + week.wins, 0);
    const average = (key: "kills" | "deaths" | "assists") => {
      const total = pair.reduce((sum, week) => sum + week[key], 0);
      return games > 0 ? total / games : 0;
    };
    const startDate = parseDay(pair[0].day);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 13);
    const kills = average("kills");
    const deaths = average("deaths");
    const assists = average("assists");
    return {
      day: pair[0].day,
      startDate,
      endDate,
      games,
      wins,
      kills,
      deaths,
      assists,
      kda: (kills + assists) / Math.max(deaths, 1),
      winRate: games > 0 ? (wins / games) * 100 : 0,
    };
  });
  const weekLabel = (day: string) =>
    parseDay(day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const shortDate = (date: Date) =>
    date.toLocaleDateString("pl-PL", { day: "numeric", month: "short" }).replace(".", "");
  const dateRangeLabel = (startDate: Date, endDate: Date) =>
    `${shortDate(startDate)}–${shortDate(endDate)}`;

  if (error) {
    return (
      <div className="rounded-xl border border-lol-border border-t-[3px] border-t-[var(--theme-crimson)] bg-[var(--theme-card)] p-12 text-center">
        <p className="text-sm font-semibold text-lol-text-bright">Failed to load trends.</p>
        <p className="mt-1 text-xs text-lol-text">{error}</p>
        <button
          type="button"
          onClick={() => void onRetry()}
          className="mt-4 rounded-md border border-lol-border px-3 py-1.5 text-xs font-semibold text-lol-text transition-colors hover:border-lol-gold/60 hover:text-lol-text-bright"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-lol-border border-t-[3px] border-t-[var(--theme-crimson)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-crimson)_10%,transparent),transparent_46%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] p-12 text-center before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-10 before:bg-[linear-gradient(180deg,color-mix(in_oklab,var(--theme-crimson)_5%,transparent),transparent)]">
        <p className="relative text-sm text-lol-text">Loading trends…</p>
      </div>
    );
  }

  if (data.daily.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-lol-border border-t-[3px] border-t-[var(--theme-crimson)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-crimson)_10%,transparent),transparent_46%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] p-12 text-center before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-10 before:bg-[linear-gradient(180deg,color-mix(in_oklab,var(--theme-crimson)_5%,transparent),transparent)]">
        <p className="relative text-sm font-semibold text-lol-text-bright">
          No trend data for this scope
        </p>
        <p className="relative mt-1 text-xs text-lol-text">
          Sync more matches to build your trends.
        </p>
      </div>
    );
  }

  const totalGames = data.daily.reduce((sum, row) => sum + row.games, 0);
  const totalWins = data.daily.reduce((sum, row) => sum + row.wins, 0);
  const totalKills = data.daily.reduce((sum, row) => sum + row.kills, 0);
  const totalDeaths = data.daily.reduce((sum, row) => sum + row.deaths, 0);
  const totalAssists = data.daily.reduce((sum, row) => sum + row.assists, 0);
  const totalScoredGames = data.daily.reduce((sum, row) => sum + row.scored_games, 0);
  const totalScore = data.daily.reduce((sum, row) => sum + (row.score_sum ?? 0), 0);
  const totalDuration = data.daily.reduce((sum, row) => sum + row.duration_sum, 0);
  const kdaSeries = [
    { values: kdaDisplay.map((week) => week.kills), color: "var(--theme-win)", label: "Kills" },
    { values: kdaDisplay.map((week) => week.deaths), color: "var(--theme-loss)", label: "Deaths" },
    {
      values: kdaDisplay.map((week) => week.assists),
      color: "var(--theme-assist)",
      label: "Assists",
    },
  ];
  const kdaMaxValue = Math.max(
    1,
    ...kdaSeries.flatMap((item) => item.values).filter((value): value is number => value != null),
  );
  const kdaTickStep = kdaMaxValue <= 10 ? 2 : 5;
  const kdaYAxisMax = Math.max(kdaTickStep, Math.ceil(kdaMaxValue / kdaTickStep) * kdaTickStep);
  const kdaYTicks = Array.from(
    { length: kdaYAxisMax / kdaTickStep + 1 },
    (_, index) => index * kdaTickStep,
  );
  const kdaTooltips = kdaDisplay.map(
    (week) =>
      `${dateRangeLabel(week.startDate, week.endDate)}\nK/D/A ${week.kills.toFixed(1)} / ${week.deaths.toFixed(1)} / ${week.assists.toFixed(1)}\nKDA ${week.kda.toFixed(2)}\nWin rate ${week.winRate.toFixed(1)}% (${week.wins}W - ${week.games - week.wins}L)\nGames ${week.games}`,
  );
  const averageKda = (totalKills + totalAssists) / Math.max(totalDeaths, 1);
  const populatedKdaPeriods = kdaDisplay.filter((period) => period.games > 0);
  const bestKdaPeriod = populatedKdaPeriods.reduce<(typeof kdaDisplay)[number] | null>(
    (best, period) => (best == null || period.kda > best.kda ? period : best),
    null,
  );
  const worstKdaPeriod = populatedKdaPeriods.reduce<(typeof kdaDisplay)[number] | null>(
    (worst, period) => (worst == null || period.kda < worst.kda ? period : worst),
    null,
  );
  const weeklyWinLoss = weekly.map((week) => ({
    label: weekLabel(week.day),
    wins: week.wins,
    losses: week.games - week.wins,
  }));
  const roleBreakdown = [...data.roleBreakdown].sort((a, b) => b.games - a.games);
  const queueBreakdown = (() => {
    const grouped = new Map<
      string,
      {
        label: string;
        queueId: number;
        games: number;
        wins: number;
        kills: number;
        deaths: number;
        assists: number;
        duration: number;
      }
    >();
    for (const queue of data.queueBreakdown) {
      const label = isArenaQueue(queue.queueId) ? "Arena" : queueLabel(queue.queueId);
      const current = grouped.get(label) ?? {
        label,
        queueId: queue.queueId,
        games: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        duration: 0,
      };
      current.games += queue.games;
      current.wins += queue.wins;
      current.kills += queue.kills;
      current.deaths += queue.deaths;
      current.assists += queue.assists;
      current.duration += queue.avgDuration * queue.games;
      grouped.set(label, current);
    }
    return [...grouped.values()].sort((a, b) => b.games - a.games);
  })();

  const currentWinRate =
    weeklyWinRates
      .slice()
      .reverse()
      .find((value) => value != null) ?? null;
  const currentKda =
    weeklyKda
      .slice()
      .reverse()
      .find((value) => value != null) ?? null;
  const last20Wins = data.streaks.last20Games.filter(Boolean).length;
  const last20Losses = data.streaks.last20Games.length - last20Wins;
  const streakBorderClass =
    data.streaks.currentStreak.type === "W"
      ? "border-t-[var(--theme-win)]"
      : data.streaks.currentStreak.type === "L"
        ? "border-t-[var(--theme-loss)]"
        : "border-t-[var(--theme-gold)]";
  const weekdayByDay = new Map(data.weekdays.map((weekday) => [weekday.weekday, weekday]));
  const weekdayPoints = WEEKDAY_ORDER.map((weekday) =>
    clockPoint(
      WEEKDAY_LABELS[weekday],
      WEEKDAY_FULL[weekday],
      weekdayByDay.get(weekday)?.games ?? 0,
      weekdayByDay.get(weekday)?.wins ?? 0,
    ),
  );
  const hourByHour = new Map(data.hours.map((hour) => [hour.hour, hour]));
  const hourPoints = Array.from({ length: 24 }, (_, hour) =>
    clockPoint(
      `${hour}:00`,
      `${String(hour).padStart(2, "0")}:00 – ${String((hour + 1) % 24).padStart(2, "0")}:00`,
      hourByHour.get(hour)?.games ?? 0,
      hourByHour.get(hour)?.wins ?? 0,
    ),
  );

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
      <div className="relative shrink-0 overflow-hidden rounded-xl border border-lol-border border-t-[3px] border-t-[var(--theme-crimson)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-crimson)_10%,transparent),transparent_46%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] px-5 py-4 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-10 before:bg-[linear-gradient(180deg,color-mix(in_oklab,var(--theme-crimson)_5%,transparent),transparent)]">
        <h1 className="relative pl-4 font-display text-[30px] font-bold leading-tight tracking-[0.2px] text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2.5 before:w-2.5 before:-translate-y-1/2 before:rotate-45 before:bg-[var(--theme-crimson)]">
          Trends
        </h1>
        <p className="relative mt-1.5 pl-4 text-lol-text">
          How your {timeRangeLabel.toLowerCase()} look
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2" aria-label="Time range">
        {TIME_RANGES.map((range) => (
          <FilterChip
            key={range.value}
            active={timeRange === range.value}
            onClick={() => setTimeRange(range.value)}
          >
            {range.label}
          </FilterChip>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          {
            label: "Matches Played",
            value: totalGames.toLocaleString(),
            className:
              "border-t-[3px] border-t-[var(--theme-crimson)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-crimson)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]",
          },
          {
            label: "Total Wins",
            value: totalWins.toLocaleString(),
            className:
              "border-t-[3px] border-t-[var(--theme-win)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-win)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]",
          },
          {
            label: "Win Rate",
            value: `${totalGames > 0 ? ((totalWins / totalGames) * 100).toFixed(1) : "0.0"}%`,
            className:
              "border-t-[3px] border-t-[var(--theme-win)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-win)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]",
          },
          {
            label: "Avg KDA",
            value: `${((totalKills + totalAssists) / Math.max(totalDeaths, 1)).toFixed(2)}`,
            className:
              "border-t-[3px] border-t-[var(--theme-assist)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-assist)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]",
          },
          {
            label: "Avg Score",
            value: `${totalScoredGames > 0 ? (totalScore / totalScoredGames).toFixed(1) : "—"}`,
            className:
              "border-t-[3px] border-t-[var(--theme-gold)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-gold)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]",
          },
          {
            label: "Total Playtime",
            value: `${Math.round(totalDuration / 3600)}h`,
            className:
              "border-t-[3px] border-t-[var(--theme-violet)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-violet)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]",
          },
        ].map(({ label, value, className }) => (
          <Panel key={label} className={`${PANEL_HOVER_CLASSES} ${className} px-4 py-3`}>
            <div className="text-2xl font-semibold tabular-nums text-lol-text-bright">{value}</div>
            <div className="mt-1 text-[10px] uppercase tracking-wider text-lol-text">{label}</div>
          </Panel>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {[
          {
            icon: "↗",
            label: "Biggest improvement",
            value:
              data.insights.winRateDiff === 0
                ? "0.0 pp Win Rate"
                : `${data.insights.winRateDiff >= 0 ? "+" : ""}${data.insights.winRateDiff.toFixed(1)} pp Win Rate`,
            color: "var(--theme-win)",
            className:
              "border-[color-mix(in_oklab,var(--theme-win)_25%,var(--theme-border))] bg-[color-mix(in_oklab,var(--theme-win)_5%,var(--theme-card))]",
          },
          {
            icon: "★",
            label: "Strongest day",
            value: data.insights.bestDay
              ? `${data.insights.bestDay.day} - ${data.insights.bestDay.wr.toFixed(1)}% WR`
              : "—",
            color: "var(--theme-gold)",
            className:
              "border-[color-mix(in_oklab,var(--theme-gold)_25%,var(--theme-border))] bg-[color-mix(in_oklab,var(--theme-gold)_5%,var(--theme-card))]",
          },
          {
            icon: "◷",
            label: "Peak window",
            value: data.insights.peakWindow
              ? `${data.insights.peakWindow.startHour}:00 - ${data.insights.peakWindow.endHour}:00 - ${data.insights.peakWindow.wr.toFixed(1)}% WR`
              : "—",
            color: "var(--theme-assist)",
            className:
              "border-[color-mix(in_oklab,var(--theme-assist)_25%,var(--theme-border))] bg-[color-mix(in_oklab,var(--theme-assist)_5%,var(--theme-card))]",
          },
        ].map((insight) => (
          <Panel
            key={insight.label}
            className={`${PANEL_HOVER_CLASSES} ${insight.className} flex items-center gap-3 px-4 py-3`}
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-lol-card"
              style={{ backgroundColor: insight.color }}
              aria-hidden="true"
            >
              {insight.icon}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-lol-text-bright">
                {insight.value}
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-wider text-lol-text">
                {insight.label}
              </div>
            </div>
          </Panel>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel className={`${PANEL_HOVER_CLASSES} border-t-[3px] ${streakBorderClass}`}>
          <h2 className="mb-4 font-display text-xl font-semibold text-lol-text-bright">
            Streaks &amp; Consistency
          </h2>
          <div className="grid grid-cols-4 gap-4 text-center">
            {[
              { label: "Max Win Streak", value: data.streaks.maxWinStreak },
              { label: "Max Loss Streak", value: data.streaks.maxLossStreak },
              {
                label: "Current Streak (Latest)",
                value: data.streaks.currentStreak.type
                  ? `${data.streaks.currentStreak.count}${data.streaks.currentStreak.type}`
                  : "—",
                valueClassName:
                  data.streaks.currentStreak.type === "W"
                    ? "text-[var(--theme-win)]"
                    : data.streaks.currentStreak.type === "L"
                      ? "text-[var(--theme-loss)]"
                      : "text-lol-text-bright",
              },
              {
                label: "Avg KDA",
                value: data.streaks.last20AvgKda.toFixed(2),
              },
            ].map(({ label, value, valueClassName = "text-lol-text-bright" }) => (
              <div key={label}>
                <div className="text-2xl font-semibold tabular-nums text-lol-text-bright">
                  <span className={valueClassName}>{value}</span>
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-wider text-lol-text">
                  {label}
                </div>
              </div>
            ))}
          </div>
          <div className="relative mt-5">
            <div
              className="absolute left-0 right-0 top-1/2 h-px bg-lol-border"
              aria-hidden="true"
            />
            <div
              className="relative flex h-12 items-center justify-between gap-1"
              aria-label="Last 20 games"
            >
              {data.streaks.last20Games.map((win, index) => (
                <div
                  key={`${index}-${win}`}
                  className="relative h-full min-w-0 flex-1"
                  title={`Game ${index + 1}: ${win ? "WIN" : "LOSS"}`}
                >
                  {win ? (
                    <span className="absolute bottom-1/2 left-1/2 h-6 w-full max-w-3 -translate-x-1/2 rounded-t-sm bg-[var(--theme-win)]" />
                  ) : (
                    <span className="absolute left-1/2 top-1/2 h-6 w-full max-w-3 -translate-x-1/2 rounded-b-sm bg-[var(--theme-loss)]" />
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 text-center text-[11px] text-lol-text">
            Last 20: <span className="font-semibold text-[var(--theme-win)]">{last20Wins} W</span>
            <span className="px-1">—</span>
            <span className="font-semibold text-[var(--theme-loss)]">{last20Losses} L</span>
          </div>
        </Panel>

        <Panel className={`${PANEL_HOVER_CLASSES} border-t-[3px] border-t-[var(--theme-gold)]`}>
          <h2 className="mb-4 font-display text-xl font-semibold text-lol-text-bright">
            Winning Conditions
          </h2>
          <div className="space-y-3">
            {[
              {
                label: "First blood",
                value: data.winningConditions.firstBloodWr,
                color: "var(--theme-crimson)",
                icon: SwordsIcon,
              },
              {
                label: "KDA > 3.0",
                value: data.winningConditions.kda3Wr,
                color: "var(--theme-assist)",
                icon: CrosshairIcon,
              },
              {
                label: "Score 7.0+",
                value: data.winningConditions.score7Wr,
                color: "var(--theme-gold)",
                icon: StarIcon,
              },
            ].map((condition) => {
              const percentage = typeof condition.value === "number" ? condition.value : null;
              const Icon = condition.icon;
              return (
                <div
                  key={condition.label}
                  className="flex items-center gap-4 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.02]"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base text-lol-card"
                    style={{ backgroundColor: condition.color }}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 text-sm text-lol-text">{condition.label}</div>
                    <div
                      className="h-2.5 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--theme-card-hover)_50%,transparent)]"
                      title={
                        percentage == null
                          ? "No Win Rate data"
                          : `${percentage.toFixed(1)}% Win Rate`
                      }
                    >
                      <div
                        className="h-full rounded-full bg-[var(--theme-win)] shadow-[0_0_8px_var(--theme-win)] transition-[width]"
                        style={{ width: `${Math.min(Math.max(percentage ?? 0, 0), 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-lg font-bold tabular-nums text-lol-text-bright">
                    {percentage == null ? "—" : `${percentage.toFixed(1)}%`}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <Panel
        className={`${PANEL_HOVER_CLASSES} rounded-xl border-t-[3px] border-t-[var(--theme-assist)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-assist)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]`}
      >
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="relative pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
              K/D/A over time
            </h2>
            <span className="text-xs text-lol-text">Average per game · {timeRangeLabel}</span>
            <span className="text-xs">
              <span className="text-[var(--theme-win)]">● Kills</span>{" "}
              <span className="text-[var(--theme-loss)]">● Deaths</span>{" "}
              <span className="text-[var(--theme-assist)]">● Assists</span>
            </span>
          </div>
          <div className="flex gap-2 text-[10px] font-semibold uppercase tracking-wider text-lol-text">
            <span>{timeRangeLabel.toUpperCase()}</span>
            <span>{totalGames.toLocaleString()} GAMES</span>
          </div>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-3 border-b border-lol-border/50 pb-3 sm:grid-cols-6">
          {[
            ["Avg Kills", data.summaryStats.avgKills.toFixed(1)],
            ["Avg Deaths", data.summaryStats.avgDeaths.toFixed(1)],
            ["Avg Assists", data.summaryStats.avgAssists.toFixed(1)],
            ["Avg KDA", averageKda.toFixed(2)],
            [
              "Best period",
              bestKdaPeriod
                ? `${dateRangeLabel(bestKdaPeriod.startDate, bestKdaPeriod.endDate)} · ${bestKdaPeriod.kda.toFixed(2)} KDA`
                : "—",
            ],
            [
              "Worst period",
              worstKdaPeriod
                ? `${dateRangeLabel(worstKdaPeriod.startDate, worstKdaPeriod.endDate)} · ${worstKdaPeriod.kda.toFixed(2)} KDA`
                : "—",
            ],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0 text-center">
              <div className="truncate text-sm font-semibold tabular-nums text-lol-text-bright">
                {value}
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-wider text-lol-text">{label}</div>
            </div>
          ))}
        </div>
        <LineChartExp
          values={kdaDisplay.map((week) => week.kills)}
          series={kdaSeries}
          format={(value) => value.toFixed(0)}
          xLabels={kdaDisplay.map((week) => weekLabel(week.day))}
          tooltips={kdaTooltips}
          yFormat={(value) => value.toString()}
          yTicks={kdaYTicks}
          min={0}
          max={kdaYAxisMax}
          showLegend={false}
        />
      </Panel>

      <div className="flex flex-col gap-5 lg:flex-row">
        <Panel
          className={`${PANEL_HOVER_CLASSES} min-w-0 flex-1 border-t-[3px] border-t-[var(--theme-crimson)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-crimson)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]`}
        >
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="relative pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
              Activity heatmap
            </h2>
            <span className="text-xs uppercase tracking-wider text-lol-text">{timeRangeLabel}</span>
          </div>
          <ActivityHeatmap daily={data.daily} timeRange={timeRange} />
        </Panel>
        <Panel className={`${PANEL_HOVER_CLASSES} w-full lg:w-1/3`}>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-lol-gold">
            Activity summary
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {[
              ["Total Games Played", data.summaryStats.totalGames.toLocaleString()],
              ["Most Active Day", data.summaryStats.mostActiveDay],
              ["Longest Daily Streak", `${data.summaryStats.longestActiveStreak} days`],
              [
                "Last Played",
                data.summaryStats.lastPlayed > 0
                  ? formatTimeAgo(data.summaryStats.lastPlayed)
                  : "—",
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="text-sm font-semibold text-lol-text-bright">{value}</div>
                <div className="mt-1 text-[10px] uppercase tracking-wider text-lol-text">
                  {label}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel
          className={`${PANEL_HOVER_CLASSES} border-t-[3px] border-t-[var(--theme-win)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-win)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]`}
        >
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="relative pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
              Win rate over time
            </h2>
            <span className="text-xs uppercase tracking-wider text-lol-text">
              Last played {currentWinRate != null ? `${currentWinRate.toFixed(1)}%` : "—"}
            </span>
          </div>
          <TimeSeriesChart
            points={weekly.map<SeriesPoint>((week) => ({
              label: weekLabel(week.day),
              games: week.games,
              value: week.games === 0 ? null : (week.wins / week.games) * 100,
              detail:
                week.games > 0
                  ? `${week.games} games · ${week.wins}W-${week.games - week.wins}L`
                  : "No games",
            }))}
            yMin={0}
            yMax={100}
            ticks={[0, 25, 50, 75, 100]}
            refValue={50}
            format={(value) => value.toFixed(0) + "%"}
          />
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-lol-border/50 pt-3 text-xs">
            <span>
              Peak WR{" "}
              <strong className="text-lol-text-bright">
                {hasQualifiedWrDay ? `${data.summaryStats.peakWr.toFixed(1)}%` : "—"}
              </strong>
            </span>
            <span>
              Lowest WR{" "}
              <strong className="text-lol-text-bright">
                {hasQualifiedWrDay ? `${data.summaryStats.lowestWr.toFixed(1)}%` : "—"}
              </strong>
            </span>
            <span>
              W/L Streak{" "}
              <strong className="text-lol-text-bright">{data.summaryStats.currentWlStreak}</strong>
            </span>
          </div>
        </Panel>

        <Panel
          className={`${PANEL_HOVER_CLASSES} border-t-[3px] border-t-[var(--theme-assist)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-assist)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]`}
        >
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="relative pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
              Average KDA
            </h2>
            <span className="text-xs uppercase tracking-wider text-lol-text">
              Last played {currentKda != null ? currentKda.toFixed(2) : "—"}
            </span>
          </div>
          <LineChartExp
            values={weeklyKda}
            format={(value) => value.toFixed(2)}
            color="var(--theme-assist)"
          />
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-lol-border/50 pt-3 text-xs">
            <span>
              Avg KDA (All){" "}
              <strong className="text-lol-text-bright">
                {data.summaryStats.avgKdaAll.toFixed(2)}
              </strong>
            </span>
            <span>
              KDA &gt; 3.0{" "}
              <strong className="text-lol-text-bright">
                {data.summaryStats.kdaOver3Percent.toFixed(1)}%
              </strong>
            </span>
            <span>
              Trend (All){" "}
              <strong className="text-lol-text-bright">
                {formatSigned(data.summaryStats.trendKdaAll)}
              </strong>
            </span>
          </div>
        </Panel>

        <Panel
          className={`${PANEL_HOVER_CLASSES} border-t-[3px] border-t-[var(--theme-gold)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-gold)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]`}
        >
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="relative pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
              Average score over time
            </h2>
            <span className="text-xs uppercase tracking-wider text-lol-text">out of 10</span>
          </div>
          <TimeSeriesChart
            points={weekly.map<SeriesPoint>((week) => ({
              label: weekLabel(week.day),
              games: week.scoredGames,
              value: week.scoredGames === 0 ? null : week.scoreSum / week.scoredGames,
              detail: week.scoredGames > 0 ? `${week.scoredGames} scored games` : "No scored games",
            }))}
            yMin={0}
            yMax={10}
            ticks={[0, 2.5, 5, 7.5, 10]}
            format={(value) => value.toFixed(1)}
          />
        </Panel>

        <Panel
          className={`${PANEL_HOVER_CLASSES} border-t-[3px] border-t-[var(--theme-win)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-win)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]`}
        >
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="relative pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
              Win / loss balance
            </h2>
            <span className="text-xs uppercase tracking-wider text-lol-text">{timeRangeLabel}</span>
          </div>
          <GroupedBarChart data={weeklyWinLoss} />
        </Panel>

        <div className="grid grid-cols-1 gap-5 lg:col-span-2 lg:grid-cols-2">
          <Panel
            className={`${PANEL_HOVER_CLASSES} border-t-[3px] border-t-[var(--theme-win)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-win)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]`}
          >
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="relative pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
                Win rate by role
              </h2>
              <span className="text-xs uppercase tracking-wider text-lol-text">
                Selected period
              </span>
            </div>
            {roleBreakdown.length > 0 ? (
              <div className="flex min-h-52 items-end gap-3 border-b border-lol-border/50 px-2 pt-2">
                {roleBreakdown.map((role) => (
                  <SimpleBar
                    key={role.role}
                    label={role.role}
                    games={role.games}
                    wins={role.wins}
                  />
                ))}
              </div>
            ) : (
              <p className="py-16 text-center text-sm text-lol-text">No role data</p>
            )}
          </Panel>

          <Panel
            className={`${PANEL_HOVER_CLASSES} border-t-[3px] border-t-[var(--theme-assist)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-assist)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]`}
          >
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="relative pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
                Win rate by queue
              </h2>
              <span className="text-xs uppercase tracking-wider text-lol-text">
                Selected period
              </span>
            </div>
            {queueBreakdown.length > 0 ? (
              <div className="flex min-h-52 items-end gap-3 border-b border-lol-border/50 px-2 pt-2">
                {queueBreakdown.map((queue) => (
                  <SimpleBar
                    key={queue.label}
                    label={queue.label}
                    games={queue.games}
                    wins={queue.wins}
                  />
                ))}
              </div>
            ) : (
              <p className="py-16 text-center text-sm text-lol-text">No queue data</p>
            )}
          </Panel>
        </div>

        <Panel
          className={`${PANEL_HOVER_CLASSES} border-t-[3px] border-t-[var(--theme-gold)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-gold)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] lg:col-span-2`}
        >
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="relative pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
              Performance by day &amp; hour
            </h2>
            <span className="text-xs uppercase tracking-wider text-lol-text">Selected period</span>
          </div>
          <DayHourMatrix data={data.dayHourMatrix} />
        </Panel>

        <div className="grid grid-cols-1 gap-5 lg:col-span-2">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div>
              <SectionHeading title="Champion performance" />
              <Panel className={PANEL_HOVER_CLASSES}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-left">
                    <thead className="border-b border-lol-border/50 text-[10px] uppercase tracking-wider text-lol-text">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-semibold">
                          Champion
                        </th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold">
                          Games
                        </th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold">
                          Win rate
                        </th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold">
                          KDA
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.championTop.map((champion) => (
                        <tr
                          key={champion.championId}
                          className="border-b border-lol-border/20 last:border-b-0"
                        >
                          <td className="px-3 py-2">
                            <span className="flex items-center gap-2 text-sm font-semibold text-lol-text-bright">
                              <ChampionIcon championId={champion.championId} size={26} />
                              {getChampionName(championData, champion.championId)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-lol-text">
                            {champion.games}
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-lol-text">
                            {((champion.wins / champion.games) * 100).toFixed(1)}%
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-lol-text">
                            {(
                              (champion.kills + champion.assists) /
                              Math.max(champion.deaths, 1)
                            ).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>

            <Panel
              className={`${PANEL_HOVER_CLASSES} border-t-[3px] border-t-[var(--theme-gold)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-gold)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]`}
            >
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="relative pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
                  Combat &amp; economy
                </h2>
                <span className="text-xs uppercase tracking-wider text-lol-text">
                  Selected period
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["DPM", data.combatEconomy?.dpm ?? 0],
                  ["GPM", data.combatEconomy?.gpm ?? 0],
                  ["CS/min", data.combatEconomy?.cspm ?? 0],
                  ["Vision Score", data.combatEconomy?.vision ?? 0],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-md border border-lol-border/40 bg-lol-card/30 p-3"
                  >
                    <div className="text-xl font-semibold tabular-nums text-lol-text-bright">
                      {Number(value).toFixed(1)}
                    </div>
                    <div className="mt-1 text-[10px] uppercase tracking-wider text-lol-text">
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div>
            <SectionHeading title="Performance by queue" />
            <Panel className={PANEL_HOVER_CLASSES}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left">
                  <thead className="border-b border-lol-border/50 text-[10px] uppercase tracking-wider text-lol-text">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-semibold">
                        Queue
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">
                        Games
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">
                        Win rate
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">
                        Avg KDA
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">
                        Avg duration
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {queueBreakdown.map((queue) => {
                      const winRate = (queue.wins / queue.games) * 100;
                      return (
                        <tr
                          key={queue.label}
                          className="border-b border-lol-border/20 last:border-b-0"
                        >
                          <td className="px-3 py-2 text-sm font-semibold text-lol-text-bright">
                            {queue.label}
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-lol-text">
                            {queue.games}
                          </td>
                          <td className="relative overflow-hidden px-3 py-2 text-right text-xs tabular-nums text-lol-text">
                            <div
                              className="absolute inset-y-0 left-0"
                              style={{
                                width: `${winRate}%`,
                                backgroundColor:
                                  winRate >= 50 ? "var(--theme-win)" : "var(--theme-loss)",
                                opacity: 0.25,
                              }}
                              aria-hidden="true"
                            />
                            <span className="relative z-10">{winRate.toFixed(1)}%</span>
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-lol-text">
                            {((queue.kills + queue.assists) / Math.max(queue.deaths, 1)).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-lol-text">
                            {formatDuration(Math.round(queue.duration / queue.games))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:col-span-2 lg:grid-cols-3">
          <Panel
            className={`${PANEL_HOVER_CLASSES} border-t-[3px] border-t-[var(--theme-crimson)]`}
          >
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-display text-xl font-semibold text-lol-text-bright">
                Damage split
              </h2>
              <span className="text-xs uppercase tracking-wider text-lol-text">
                Selected period
              </span>
            </div>
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
          </Panel>

          <Panel className={`${PANEL_HOVER_CLASSES} border-t-[3px] border-t-[var(--theme-assist)]`}>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-display text-xl font-semibold text-lol-text-bright">
                Objective control
              </h2>
              <span className="text-xs uppercase tracking-wider text-lol-text">Avg / game</span>
            </div>
            <div className="space-y-4">
              {[
                { label: "Dragons", values: data.objectiveControl.dragons },
                { label: "Barons", values: data.objectiveControl.barons },
                { label: "Towers", values: data.objectiveControl.towers },
              ].map(({ label, values }) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-lol-text">{label}</span>
                  <div className="flex items-center gap-3 text-xs tabular-nums">
                    <span className="text-[var(--theme-win)]">
                      W {Number(values.win).toFixed(2)}
                    </span>
                    <span className="text-[var(--theme-loss)]">
                      L {Number(values.loss).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className={`${PANEL_HOVER_CLASSES} border-t-[3px] border-t-[var(--theme-gold)]`}>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-display text-xl font-semibold text-lol-text-bright">
                Top duo partners
              </h2>
              <span className="text-xs uppercase tracking-wider text-lol-text">Top 3</span>
            </div>
            {data.topDuos.length > 0 ? (
              <div className="space-y-3">
                {data.topDuos.map((duo) => (
                  <div key={duo.puuid} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-lol-text-bright">
                        {duo.gameName}#{duo.tagLine}
                      </div>
                      <div className="text-xs text-lol-text">{duo.games} games</div>
                    </div>
                    <span
                      className={`shrink-0 font-semibold tabular-nums ${
                        duo.winRate > 50
                          ? "text-[var(--theme-win)]"
                          : duo.winRate < 50
                            ? "text-[var(--theme-loss)]"
                            : "text-lol-text"
                      }`}
                    >
                      {duo.winRate.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-lol-text">No duo data</p>
            )}
          </Panel>
        </div>

        <Panel
          className={`${PANEL_HOVER_CLASSES} border-t-[3px] border-t-[var(--theme-win)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-win)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] lg:col-span-2`}
        >
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="relative pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
              {patch ? `Win rate for ${formatPatch(patch)}` : "Win rate by patch"}
            </h2>
            <span className="text-xs uppercase tracking-wider text-lol-text">{timeRangeLabel}</span>
          </div>
          <PatchBars patches={data.patches} />
        </Panel>

        <Panel
          className={`${PANEL_HOVER_CLASSES} border-t-[3px] border-t-[var(--theme-violet)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-violet)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]`}
        >
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="relative pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
              By day of week
            </h2>
            <span className="text-xs uppercase tracking-wider text-lol-text">{timeRangeLabel}</span>
          </div>
          <TimeSeriesChart
            points={weekdayPoints}
            yMin={0}
            yMax={100}
            ticks={[]}
            format={(value) => `${value.toFixed(0)}%`}
          />
        </Panel>

        <Panel
          className={`${PANEL_HOVER_CLASSES} border-t-[3px] border-t-[var(--theme-assist)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-assist)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]`}
        >
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="relative pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
              By hour of day
            </h2>
            <span className="text-xs uppercase tracking-wider text-lol-text">{timeRangeLabel}</span>
          </div>
          <TimeSeriesChart
            points={hourPoints}
            yMin={0}
            yMax={100}
            ticks={[]}
            format={(value) => `${value.toFixed(0)}%`}
          />
        </Panel>

        <Panel
          className={`${PANEL_HOVER_CLASSES} border-t-[3px] border-t-[var(--theme-violet)] lg:col-span-2`}
        >
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="relative pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
              Recent sessions
            </h2>
            <span className="text-xs uppercase tracking-wider text-lol-text">Latest 5</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left">
              <thead className="border-b border-lol-border/50 text-[10px] uppercase tracking-wider text-lol-text">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Date
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Queue
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    Games
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    Record
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    Avg KDA
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.recentSessions.map((session) => (
                  <tr
                    key={`${session.date}-${session.queueName}`}
                    className="border-b border-lol-border/20 last:border-b-0"
                  >
                    <td className="px-3 py-2 text-sm text-lol-text-bright">
                      {new Date(session.date).toLocaleDateString(undefined, {
                        day: "2-digit",
                        month: "short",
                      })}
                    </td>
                    <td className="px-3 py-2 text-sm text-lol-text">{session.queueName}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums text-lol-text">
                      {session.games}
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums">
                      <span className="text-[var(--theme-win)]">{session.wins}W</span>
                      <span className="text-lol-text"> - </span>
                      <span className="text-[var(--theme-loss)]">
                        {session.games - session.wins}L
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums text-lol-text">
                      {session.avgKda.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
