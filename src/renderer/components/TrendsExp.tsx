import { useMemo } from "react";
import type { TrendsData } from "../lib/types";
import { ActivityHeatmap } from "./ActivityHeatmap";
import ChampionIcon from "./ChampionIcon";
import { LineChartExp } from "./LineChartExp";
import { Panel } from "./Panel";
import { HourChart } from "./HourChart";
import { PatchBars } from "./PatchBars";
import { queueLabel } from "./QueueSelect";
import { SectionHeading } from "./SectionHeading";
import { TimeSeriesChart, type SeriesPoint } from "./TimeSeriesChart";
import { WeekdayChart } from "./WeekdayChart";
import { isArenaQueue } from "../../shared/queues";
import { formatDuration, formatTimeAgo } from "../lib/format";
import { getChampionName, useChampionData } from "../hooks/useChampions";
import { FilterChip } from "./FilterChip";

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
      <div className="flex h-40 w-full items-end justify-center">
        <div
          className="w-full max-w-12 rounded-t-md transition-[height] duration-200"
          style={{
            height: `${Math.max(winRate, 4)}%`,
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
}: {
  data: TrendsData | null;
  error: string | null;
  onRetry: () => Promise<void>;
  timeRange: TimeRange;
  setTimeRange: (timeRange: TimeRange) => void;
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
  const weekLabel = (day: string) =>
    parseDay(day).toLocaleDateString(undefined, { month: "short", day: "numeric" });

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
    { values: weekly.map((week) => week.kills), color: "var(--theme-win)", label: "Kills" },
    { values: weekly.map((week) => week.deaths), color: "var(--theme-loss)", label: "Deaths" },
    { values: weekly.map((week) => week.assists), color: "var(--theme-assist)", label: "Assists" },
  ];
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

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
      <div className="shrink-0 overflow-hidden rounded-xl border border-lol-border border-t-[3px] border-t-[var(--theme-crimson)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-crimson)_10%,transparent),transparent_46%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] px-5 py-4 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-10 before:bg-[linear-gradient(180deg,color-mix(in_oklab,var(--theme-crimson)_5%,transparent),transparent)]">
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
          ["Matches Played", totalGames.toLocaleString()],
          ["Win Rate", `${totalGames > 0 ? ((totalWins / totalGames) * 100).toFixed(1) : "0.0"}%`],
          ["Avg KDA", `${((totalKills + totalAssists) / Math.max(totalDeaths, 1)).toFixed(2)}`],
          [
            "Avg Score",
            `${totalScoredGames > 0 ? (totalScore / totalScoredGames).toFixed(1) : "—"}`,
          ],
          ["Total Playtime", `${Math.round(totalDuration / 3600)}h`],
        ].map(([label, value]) => (
          <Panel key={label} className="border-t-2 border-t-[var(--theme-crimson)] px-4 py-3">
            <div className="text-2xl font-semibold tabular-nums text-lol-text-bright">{value}</div>
            <div className="mt-1 text-[10px] uppercase tracking-wider text-lol-text">{label}</div>
          </Panel>
        ))}
      </div>

      <Panel className="border-t-[3px] border-t-[var(--theme-assist)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-assist)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="relative pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
            K/D/A over time
          </h2>
          <span className="text-xs uppercase tracking-wider text-lol-text">{timeRangeLabel}</span>
        </div>
        <LineChartExp
          values={weekly.map((week) => week.kills)}
          series={kdaSeries}
          format={(value) => value.toFixed(0)}
          xLabels={weekly.map((week) => weekLabel(week.day))}
          min={0}
        />
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-lol-border/50 pt-3 sm:grid-cols-5">
          {[
            ["Avg Kills", data.summaryStats.avgKills.toFixed(1)],
            ["Avg Deaths", data.summaryStats.avgDeaths.toFixed(1)],
            ["Avg Assists", data.summaryStats.avgAssists.toFixed(1)],
            [
              "Peak KDA Game",
              data.summaryStats.peakKdaGame
                ? `${data.summaryStats.peakKdaGame.kills}/${data.summaryStats.peakKdaGame.deaths}/${data.summaryStats.peakKdaGame.assists}`
                : "—",
            ],
            ["Trend (30D)", formatSigned(data.summaryStats.trend30dKda)],
          ].map(([label, value]) => (
            <div key={label} className="text-center">
              <div className="text-sm font-semibold tabular-nums text-lol-text-bright">{value}</div>
              <div className="mt-1 text-[10px] uppercase tracking-wider text-lol-text">{label}</div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="flex flex-col gap-5 lg:flex-row">
        <Panel className="min-w-0 flex-1 border-t-[3px] border-t-[var(--theme-crimson)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-crimson)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="relative pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
              Activity heatmap
            </h2>
            <span className="text-xs uppercase tracking-wider text-lol-text">{timeRangeLabel}</span>
          </div>
          <ActivityHeatmap daily={data.daily} />
        </Panel>
        <Panel className="lg:w-72">
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
        <Panel className="border-t-[3px] border-t-[var(--theme-win)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-win)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]">
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

        <Panel className="border-t-[3px] border-t-[var(--theme-assist)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-assist)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]">
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

        <Panel className="border-t-[3px] border-t-[var(--theme-gold)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-gold)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]">
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

        <Panel className="border-t-[3px] border-t-[var(--theme-win)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-win)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="relative pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
              Win / loss balance
            </h2>
            <span className="text-xs uppercase tracking-wider text-lol-text">{timeRangeLabel}</span>
          </div>
          <GroupedBarChart data={weeklyWinLoss} />
        </Panel>

        <div className="grid grid-cols-1 gap-5 lg:col-span-2 lg:grid-cols-2">
          <Panel className="border-t-[3px] border-t-[var(--theme-win)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-win)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]">
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

          <Panel className="border-t-[3px] border-t-[var(--theme-assist)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-assist)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]">
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

        <Panel className="border-t-[3px] border-t-[var(--theme-gold)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-gold)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] lg:col-span-2">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="relative pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
              Performance by day &amp; hour
            </h2>
            <span className="text-xs uppercase tracking-wider text-lol-text">All games</span>
          </div>
          <DayHourMatrix data={data.dayHourMatrix} />
        </Panel>

        <div className="grid grid-cols-1 gap-5 lg:col-span-2 lg:grid-cols-2">
          <div>
            <SectionHeading title="Champion performance" />
            <Panel>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left">
                  <thead className="border-b border-lol-border/50 text-[10px] uppercase tracking-wider text-lol-text">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Champion</th>
                      <th className="px-3 py-2 text-right font-semibold">Games</th>
                      <th className="px-3 py-2 text-right font-semibold">Win rate</th>
                      <th className="px-3 py-2 text-right font-semibold">KDA</th>
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

          <Panel className="border-t-[3px] border-t-[var(--theme-gold)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-gold)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="relative pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
                Combat &amp; economy
              </h2>
              <span className="text-xs uppercase tracking-wider text-lol-text">All games</span>
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

          <div>
            <SectionHeading title="Performance by queue" />
            <Panel>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left">
                  <thead className="border-b border-lol-border/50 text-[10px] uppercase tracking-wider text-lol-text">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Queue</th>
                      <th className="px-3 py-2 text-right font-semibold">Games</th>
                      <th className="px-3 py-2 text-right font-semibold">Win rate</th>
                      <th className="px-3 py-2 text-right font-semibold">Avg KDA</th>
                      <th className="px-3 py-2 text-right font-semibold">Avg duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queueBreakdown.map((queue) => (
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
                        <td className="px-3 py-2 text-right text-xs tabular-nums text-lol-text">
                          {((queue.wins / queue.games) * 100).toFixed(1)}%
                        </td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums text-lol-text">
                          {((queue.kills + queue.assists) / Math.max(queue.deaths, 1)).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums text-lol-text">
                          {formatDuration(Math.round(queue.duration / queue.games))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        </div>

        <Panel className="border-t-[3px] border-t-[var(--theme-win)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-win)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] lg:col-span-2">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="relative pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
              Win rate by patch
            </h2>
            <span className="text-xs uppercase tracking-wider text-lol-text">{timeRangeLabel}</span>
          </div>
          <PatchBars patches={data.patches} />
        </Panel>

        <Panel className="border-t-[3px] border-t-[var(--theme-violet)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-violet)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="relative pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
              By day of week
            </h2>
            <span className="text-xs uppercase tracking-wider text-lol-text">{timeRangeLabel}</span>
          </div>
          <WeekdayChart weekdays={data.weekdays} />
        </Panel>

        <Panel className="border-t-[3px] border-t-[var(--theme-assist)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-assist)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="relative pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
              By hour of day
            </h2>
            <span className="text-xs uppercase tracking-wider text-lol-text">{timeRangeLabel}</span>
          </div>
          <HourChart hours={data.hours} />
        </Panel>
      </div>
    </div>
  );
}
