import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useIpc } from "../hooks/useIpc";
import { useHistoryScopeQueue } from "../lib/historyScope";
import type { TrendsData, TrendsDay } from "../lib/types";
import QueueSelect from "../components/QueueSelect";
import { FilterChip } from "../components/FilterChip";
import { useActiveTheme } from "../hooks/useActiveTheme";
import { useActiveAccount } from "../hooks/useActiveAccount";
import { TrendsExp, type TimeRange } from "../components/TrendsExp";
import { ALL_ACCOUNTS_SENTINEL } from "../lib/accountsEvent";
import { ActivityHeatmap } from "../components/ActivityHeatmap";
import { HourChart } from "../components/HourChart";
import { PatchBars } from "../components/PatchBars";
import { TimeSeriesChart } from "../components/TimeSeriesChart";
import { WeekdayChart } from "../components/WeekdayChart";

// ---- Time helpers ----

// Day strings are local-time YYYY-MM-DD from SQLite; construct the Date from
// parts so it stays the local day instead of shifting through UTC.
function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dayKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

// ---- Bucketing ----
//
// The main process hands over one row per played day; everything time-based on
// this page is derived from those rows here, so switching granularity never
// refetches.

type Granularity = "month" | "week";

interface Bucket {
  label: string;
  games: number;
  wins: number;
  scoreSum: number;
  scoredGames: number;
}

// Buckets are generated for every period between the first and last game, not
// just the played ones — a three-month break should read as a gap in the
// chart, not silently splice together.
function buildBuckets(daily: TrendsDay[], granularity: Granularity): Bucket[] {
  if (daily.length === 0) return [];
  const buckets = new Map<string, Bucket>();

  const monthLabel = (d: Date) =>
    `${d.toLocaleDateString(undefined, { month: "short" })} '${String(d.getFullYear() % 100).padStart(2, "0")}`;
  const weekLabel = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  const first = parseDay(daily[0].day);
  const last = parseDay(daily[daily.length - 1].day);

  if (granularity === "month") {
    const cursor = new Date(first.getFullYear(), first.getMonth(), 1);
    while (cursor <= last) {
      const key = dayKey(cursor).slice(0, 7);
      buckets.set(key, {
        label: monthLabel(cursor),
        games: 0,
        wins: 0,
        scoreSum: 0,
        scoredGames: 0,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else {
    // Weeks keyed by their Monday
    const cursor = new Date(first);
    cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
    while (cursor <= last) {
      buckets.set(dayKey(cursor), {
        label: weekLabel(cursor),
        games: 0,
        wins: 0,
        scoreSum: 0,
        scoredGames: 0,
      });
      cursor.setDate(cursor.getDate() + 7);
    }
  }

  for (const row of daily) {
    let key: string;
    if (granularity === "month") {
      key = row.day.slice(0, 7);
    } else {
      const d = parseDay(row.day);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      key = dayKey(d);
    }
    const b = buckets.get(key);
    if (!b) continue;
    b.games += row.games;
    b.wins += row.wins;
    b.scoreSum += row.score_sum ?? 0;
    b.scoredGames += row.scored_games;
  }

  return [...buckets.values()];
}

// ---- Shared chart bits ----

function Card({
  title,
  right,
  accent = "crimson",
  children,
}: {
  title: string;
  right?: React.ReactNode;
  accent?: "gold" | "win" | "crimson";
  children: React.ReactNode;
}) {
  const glow =
    accent === "gold"
      ? "border-t-[3px] border-t-lol-gold bg-[radial-gradient(circle_at_top_right,rgba(201,164,92,0.08),transparent_38%),linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)]"
      : accent === "win"
        ? "border-t-[3px] border-t-lol-win bg-[radial-gradient(circle_at_top_right,rgba(74,222,128,0.08),transparent_38%),linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)]"
        : "border-t-[3px] border-t-lol-crimson bg-[radial-gradient(circle_at_top_right,rgba(165,15,21,0.08),transparent_38%),linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)]";

  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-lol-crimson/40 ${glow} shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03] p-4`}
    >
      <div className="flex items-center justify-between">
        <h2 className="relative mb-3 pl-4 text-xs font-bold uppercase tracking-wider text-lol-gold after:absolute after:bottom-[-5px] after:left-4 after:h-px after:w-16 after:bg-gradient-to-r after:from-lol-crimson after:to-transparent before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
          {title}
        </h2>
        {right}
      </div>
      {children}
    </div>
  );
}

// ---- Page ----

export default function Trends() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTheme = useActiveTheme();
  const isExperiment = activeTheme === "experiment";
  const [activeAccountRaw] = useActiveAccount();
  const account = activeAccountRaw === ALL_ACCOUNTS_SENTINEL ? "all" : activeAccountRaw;
  const queueParam = searchParams.get("queue");
  const queue = queueParam ? Number(queueParam) : undefined;
  const [timeRange, setTimeRange] = useState<TimeRange>("12w");
  const setQueue = (q: number | undefined) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (q == null) next.delete("queue");
        else next.set("queue", String(q));
        return next;
      },
      { replace: true },
    );
  };

  const scopedQueue = queue ?? useHistoryScopeQueue();
  const accountForFetch = isExperiment ? account : undefined;
  const { data, error, refetch } = useIpc<TrendsData>(
    () => window.api.getTrends(scopedQueue, accountForFetch, timeRange),
    [scopedQueue, accountForFetch, timeRange],
  );

  useEffect(() => {
    const unsub = window.api.onGamesUpdated(() => refetch());
    return unsub;
  }, [refetch]);

  const spanDays = useMemo(() => {
    if (!data || data.daily.length === 0) return 0;
    const first = parseDay(data.daily[0].day);
    const last = parseDay(data.daily[data.daily.length - 1].day);
    return Math.round((last.getTime() - first.getTime()) / 86_400_000) + 1;
  }, [data]);

  // Weekly buckets by default for short histories, monthly once months exist
  // to compare
  const [granularity, setGranularity] = useState<Granularity | null>(null);
  const effectiveGranularity: Granularity = granularity ?? (spanDays > 120 ? "month" : "week");

  const buckets = useMemo(
    () => (data ? buildBuckets(data.daily, effectiveGranularity) : []),
    [data, effectiveGranularity],
  );

  const winRatePoints = useMemo(
    () =>
      buckets.map((b) => ({
        label: b.label,
        games: b.games,
        value: b.games > 0 ? (b.wins / b.games) * 100 : null,
        detail: b.games > 0 ? `${b.games} games · ${b.wins}W–${b.games - b.wins}L` : "No games",
      })),
    [buckets],
  );

  const scorePoints = useMemo(
    () =>
      buckets.map((b) => ({
        label: b.label,
        games: b.games,
        value: b.scoredGames > 0 ? b.scoreSum / b.scoredGames : null,
        detail: b.scoredGames > 0 ? `${b.scoredGames} scored games` : "No scored games",
      })),
    [buckets],
  );

  const scoreDomain = useMemo(() => {
    const values = scorePoints.map((p) => p.value).filter((v): v is number => v != null);
    if (values.length === 0) return null;
    const min = Math.floor(Math.min(...values) - 0.5);
    const max = Math.ceil(Math.max(...values) + 0.5);
    const ticks = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4);
    return { min, max, ticks };
  }, [scorePoints]);

  if (isExperiment) {
    return (
      <div className="flex flex-col gap-4">
        <div className="[&_select]:h-9 [&_select]:rounded-md [&_select]:border [&_select]:border-lol-border/60 [&_select]:bg-lol-card/40 [&_select]:px-3 [&_select]:text-xs [&_select]:text-lol-text-bright [&_select]:focus-visible:outline-none [&_select]:focus-visible:border-lol-gold/60 [&_select]:focus-visible:ring-1 [&_select]:focus-visible:ring-lol-gold/40 [&_select]:transition-colors">
          <QueueSelect value={queue} onChange={setQueue} />
        </div>
        <TrendsExp
          data={data}
          error={error}
          onRetry={refetch}
          timeRange={timeRange}
          setTimeRange={setTimeRange}
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-lol-crimson/40 border-t-[3px] border-t-lol-crimson bg-[radial-gradient(circle_at_top_right,rgba(165,15,21,0.08),transparent_42%),linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03] p-12 text-center">
        <p className="text-sm text-lol-text">Loading trends…</p>
      </div>
    );
  }

  if (data.daily.length === 0) {
    return (
      <div className="rounded-lg border border-lol-crimson/40 border-t-[3px] border-t-lol-crimson bg-[radial-gradient(circle_at_top_right,rgba(165,15,21,0.08),transparent_42%),linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03] p-12 text-center">
        <p className="text-sm font-semibold text-lol-text-bright">No trend data for this scope</p>
        <p className="text-xs text-lol-text mt-1">Try a different queue or sync more matches.</p>
      </div>
    );
  }

  const totalGames = data.daily.reduce((sum, d) => sum + d.games, 0);

  const granularityToggle = (
    <div className="flex items-center gap-0 rounded-md border border-lol-border/60 bg-lol-card/40 p-0.5">
      {(["month", "week"] as const).map((g) => (
        <FilterChip
          key={g}
          active={effectiveGranularity === g}
          onClick={() => setGranularity(g)}
          className="h-8 px-3 text-xs font-semibold"
        >
          {g === "month" ? "MONTHLY" : "WEEKLY"}
        </FilterChip>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-xs text-lol-text">
            {totalGames} games over {data.daily.length} days
          </span>
          <div className="[&_select]:h-9 [&_select]:rounded-md [&_select]:border [&_select]:border-lol-border/60 [&_select]:bg-lol-card/40 [&_select]:px-3 [&_select]:text-xs [&_select]:text-lol-text-bright [&_select]:focus-visible:outline-none [&_select]:focus-visible:border-lol-gold/60 [&_select]:focus-visible:ring-1 [&_select]:focus-visible:ring-lol-gold/40 [&_select]:transition-colors">
            <QueueSelect value={queue} onChange={setQueue} />
          </div>
        </div>
        {granularityToggle}
      </div>

      <Card title="Activity" accent="gold">
        <ActivityHeatmap daily={data.daily} />
      </Card>

      <Card title="Win Rate Over Time" accent="win">
        <TimeSeriesChart
          points={winRatePoints}
          yMin={0}
          yMax={100}
          ticks={[0, 25, 50, 75, 100]}
          refValue={50}
          format={(v) => `${Math.round(v)}%`}
        />
      </Card>

      {scoreDomain && (
        <Card title="Average Score Over Time" accent="crimson">
          <TimeSeriesChart
            points={scorePoints}
            yMin={scoreDomain.min}
            yMax={scoreDomain.max}
            ticks={scoreDomain.ticks}
            format={(v) => v.toFixed(1)}
          />
        </Card>
      )}

      {data.patches.length > 1 && (
        <Card title="Win Rate by Patch" accent="gold">
          <PatchBars patches={data.patches} />
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="By Day of Week" accent="win">
          <WeekdayChart weekdays={data.weekdays} />
        </Card>
        <Card title="By Hour of Day" accent="crimson">
          <HourChart hours={data.hours} />
        </Card>
      </div>
    </div>
  );
}
