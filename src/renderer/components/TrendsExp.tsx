import { useMemo } from "react";
import type { TrendsData } from "../lib/types";
import { LineChartExp } from "./LineChartExp";
import { Panel } from "./Panel";
import { WeekdayBarChart } from "./WeekdayBarChart";

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

export function TrendsExp({ data }: { data: TrendsData | null }) {
  const weekly = useMemo(() => {
    if (!data || data.daily.length === 0) return [];

    const daily = [...data.daily].sort((a, b) => a.day.localeCompare(b.day));
    const lastMonday = mondayOf(parseDay(daily[daily.length - 1].day));
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

  const weeklyWinRates = weekly.map((week) => (week.wins / Math.max(week.games, 1)) * 100);
  const weeklyKda = weekly.map((week) => (week.kills + week.assists) / Math.max(week.deaths, 1));
  const weeklyScores = weekly.map((week) => week.scoreSum / Math.max(week.scoredGames, 1));
  const weekdayCounts = data
    ? [1, 2, 3, 4, 5, 6, 0].map(
        (weekday) => data.weekdays.find((item) => item.weekday === weekday)?.games ?? 0,
      )
    : [];

  if (!data) {
    return <div className="py-12 text-center text-sm text-lol-text">Loading trends…</div>;
  }

  if (data.daily.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm font-semibold text-lol-text-bright">No trend data for this scope</p>
        <p className="mt-1 text-xs text-lol-text">Sync more matches to build your trends.</p>
      </div>
    );
  }

  const currentWinRate = weeklyWinRates[weeklyWinRates.length - 1] ?? 0;
  const currentKda = weeklyKda[weeklyKda.length - 1] ?? 0;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
      <div>
        <h1 className="font-display text-[30px] font-bold leading-tight tracking-[0.2px] text-lol-text-bright">
          Trends
        </h1>
        <p className="mt-1.5 text-lol-text">How your last 12 weeks look</p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-xl font-semibold text-lol-text-bright">Win rate</h2>
            <span className="text-xs uppercase tracking-wider text-lol-text">
              Now {currentWinRate.toFixed(1)}%
            </span>
          </div>
          <LineChartExp
            values={weeklyWinRates}
            format={(value) => value.toFixed(1) + "%"}
            color="var(--theme-win)"
            min={40}
            max={75}
          />
        </Panel>

        <Panel>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-xl font-semibold text-lol-text-bright">Average KDA</h2>
            <span className="text-xs uppercase tracking-wider text-lol-text">
              Now {currentKda.toFixed(2)}
            </span>
          </div>
          <LineChartExp
            values={weeklyKda}
            format={(value) => value.toFixed(2)}
            color="var(--theme-assist)"
            min={2}
            max={4.2}
          />
        </Panel>

        <Panel>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-xl font-semibold text-lol-text-bright">
              Average score
            </h2>
            <span className="text-xs uppercase tracking-wider text-lol-text">out of 10</span>
          </div>
          <LineChartExp
            values={weeklyScores}
            format={(value) => value.toFixed(1)}
            color="var(--theme-gold)"
            min={4}
            max={8}
          />
        </Panel>

        <Panel>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-xl font-semibold text-lol-text-bright">
              Games by weekday
            </h2>
            <span className="text-xs uppercase tracking-wider text-lol-text">Last 12 weeks</span>
          </div>
          <WeekdayBarChart
            days={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]}
            counts={weekdayCounts}
          />
        </Panel>
      </div>
    </div>
  );
}
