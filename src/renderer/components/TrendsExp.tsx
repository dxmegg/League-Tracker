import { useMemo } from "react";
import type { TrendsData } from "../lib/types";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { LineChartExp } from "./LineChartExp";
import { Panel } from "./Panel";
import { HourChart } from "./HourChart";
import { PatchBars } from "./PatchBars";
import { TimeSeriesChart, type SeriesPoint } from "./TimeSeriesChart";
import { WeekdayChart } from "./WeekdayChart";

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

export function TrendsExp({
  data,
  error,
  onRetry,
}: {
  data: TrendsData | null;
  error: string | null;
  onRetry: () => Promise<void>;
}) {
  const weekly = useMemo(() => {
    if (!data || data.daily.length === 0) return [];

    const daily = [...data.daily].sort((a, b) => a.day.localeCompare(b.day));
    const lastMonday = mondayOf(new Date());
    const buckets = Array.from({ length: 12 }, (_, index) => {
      const week = new Date(lastMonday);
      week.setDate(week.getDate() - (11 - index) * 7);
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

    for (const row of daily) {
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
  }, [data]);

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
        <p className="relative mt-1.5 pl-4 text-lol-text">How your last 12 weeks look</p>
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
          <span className="text-xs uppercase tracking-wider text-lol-text">Last 12 weeks</span>
        </div>
        <LineChartExp
          values={weekly.map((week) => week.kills)}
          series={kdaSeries}
          format={(value) => value.toFixed(0)}
          xLabels={weekly.map((week) => weekLabel(week.day))}
          min={0}
        />
      </Panel>

      <Panel className="border-t-[3px] border-t-[var(--theme-crimson)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-crimson)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="relative pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
            Activity heatmap
          </h2>
          <span className="text-xs uppercase tracking-wider text-lol-text">Last 12 weeks</span>
        </div>
        <ActivityHeatmap daily={data.daily} />
      </Panel>

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
            <span className="text-xs uppercase tracking-wider text-lol-text">Last 12 weeks</span>
          </div>
          <GroupedBarChart data={weeklyWinLoss} />
        </Panel>

        <Panel className="border-t-[3px] border-t-[var(--theme-win)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-win)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] lg:col-span-2">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="relative pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
              Win rate by patch
            </h2>
            <span className="text-xs uppercase tracking-wider text-lol-text">Last 12 weeks</span>
          </div>
          <PatchBars patches={data.patches} />
        </Panel>

        <Panel className="border-t-[3px] border-t-[var(--theme-violet)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-violet)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="relative pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
              By day of week
            </h2>
            <span className="text-xs uppercase tracking-wider text-lol-text">Last 12 weeks</span>
          </div>
          <WeekdayChart weekdays={data.weekdays} />
        </Panel>

        <Panel className="border-t-[3px] border-t-[var(--theme-assist)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-assist)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="relative pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
              By hour of day
            </h2>
            <span className="text-xs uppercase tracking-wider text-lol-text">Last 12 weeks</span>
          </div>
          <HourChart hours={data.hours} />
        </Panel>
      </div>
    </div>
  );
}
