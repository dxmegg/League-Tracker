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

  const currentWinRate = weeklyWinRates[weeklyWinRates.length - 1];
  const currentKda = weeklyKda[weeklyKda.length - 1];

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
      <div className="shrink-0 overflow-hidden rounded-xl border border-lol-border border-t-[3px] border-t-[var(--theme-crimson)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-crimson)_10%,transparent),transparent_46%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] px-5 py-4 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-10 before:bg-[linear-gradient(180deg,color-mix(in_oklab,var(--theme-crimson)_5%,transparent),transparent)]">
        <h1 className="relative pl-4 font-display text-[30px] font-bold leading-tight tracking-[0.2px] text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2.5 before:w-2.5 before:-translate-y-1/2 before:rotate-45 before:bg-[var(--theme-crimson)]">
          Trends
        </h1>
        <p className="relative mt-1.5 pl-4 text-lol-text">How your last 12 weeks look</p>
      </div>

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
              Now {currentWinRate != null ? `${currentWinRate.toFixed(1)}%` : "—"}
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
              Now {currentKda != null ? currentKda.toFixed(2) : "—"}
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
