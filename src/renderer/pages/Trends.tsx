import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useIpc } from "../hooks/useIpc";
import { useHistoryScopeQueue } from "../lib/historyScope";
import type { TrendsData, TrendsDay } from "../lib/types";
import { formatPatch } from "../lib/format";
import QueueSelect from "../components/QueueSelect";
import { FilterChip } from "../components/FilterChip";

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

function shortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
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

function useContainerWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function Card({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03] overflow-hidden p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-lol-gold mb-3">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

// Floating hover readout shared by every chart on the page: a bright label
// line, muted detail line(s), and the headline value in gold. Positioned at a
// chart-space x inside a relative parent, clamped so it never clips.
function HoverTooltip({
  x,
  width,
  label,
  detail,
  value,
}: {
  x: number;
  width: number;
  label: string;
  detail: React.ReactNode;
  value?: string | null;
}) {
  return (
    <div
      className="absolute top-1 pointer-events-none rounded-lg border border-[rgba(165,15,21,0.4)] bg-[#0c0e11] px-2.5 py-1.5 text-xs shadow-lg z-10 whitespace-nowrap"
      style={{
        left: Math.min(Math.max(x, 70), Math.max(width - 70, 70)),
        transform: "translateX(-50%)",
      }}
    >
      <div className="font-medium text-[#f5efe0]">{label}</div>
      <div className="text-[#f5efe0]">{detail}</div>
      {value != null && <div className="font-medium text-[#f5efe0]">{value}</div>}
    </div>
  );
}

// ---- Time series chart ----
//
// Faint bars carry the sample size (games per bucket) on their own hidden
// scale; the line carries the metric. Win rate over five games and fifty look
// identical on a bare line — the bars are what keep the chart honest.

interface SeriesPoint {
  label: string;
  // Tooltip title when the axis label is abbreviated ("Mon" → "Monday")
  long?: string;
  games: number;
  value: number | null;
  detail: string;
}

function TimeSeriesChart({
  points,
  yMin,
  yMax,
  ticks,
  refValue,
  format,
  height = 190,
}: {
  points: SeriesPoint[];
  yMin: number;
  yMax: number;
  ticks: number[];
  refValue?: number;
  format: (v: number) => string;
  height?: number;
}) {
  const { ref, width } = useContainerWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const M = { top: 8, right: 8, bottom: 20, left: 38 };
  const iw = Math.max(width - M.left - M.right, 0);
  const ih = height - M.top - M.bottom;
  const n = points.length;
  const step = n > 0 ? iw / n : 0;
  const x = (i: number) => M.left + step * (i + 0.5);
  const y = (v: number) => M.top + ih - ((v - yMin) / (yMax - yMin)) * ih;
  const maxGames = Math.max(...points.map((p) => p.games), 1);
  const barWidth = Math.max(Math.min(step * 0.6, 28), 2);
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(Math.floor(iw / 64), 1)));

  // Null values (empty buckets) break the line into segments instead of
  // interpolating across periods that were never played.
  const segments: [number, number][][] = [];
  let current: [number, number][] = [];
  points.forEach((p, i) => {
    if (p.value == null) {
      if (current.length > 0) segments.push(current);
      current = [];
    } else {
      current.push([x(i), y(p.value)]);
    }
  });
  if (current.length > 0) segments.push(current);

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (step === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - rect.left - M.left) / step);
    setHover(i >= 0 && i < n ? i : null);
  };

  const hovered = hover != null ? points[hover] : null;

  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={M.left}
                x2={width - M.right}
                y1={y(t)}
                y2={y(t)}
                stroke="rgba(255,255,255,0.06)"
              />
              <text x={M.left - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="#8a8f95">
                {format(t)}
              </text>
            </g>
          ))}
          {refValue != null && (
            <line
              x1={M.left}
              x2={width - M.right}
              y1={y(refValue)}
              y2={y(refValue)}
              stroke="rgba(255,255,255,0.08)"
              strokeDasharray="4 4"
            />
          )}
          {hover != null && (
            <rect
              x={x(hover) - step / 2}
              y={M.top}
              width={step}
              height={ih}
              fill="rgba(255,255,255,0.03)"
            />
          )}
          {points.map((p, i) =>
            p.games > 0 ? (
              <rect
                key={i}
                x={x(i) - barWidth / 2}
                y={M.top + ih - (p.games / maxGames) * ih * 0.45}
                width={barWidth}
                height={(p.games / maxGames) * ih * 0.45}
                rx={2}
                fill={hover === i ? "rgba(165,15,21,0.55)" : "rgba(165,15,21,0.35)"}
              />
            ) : null,
          )}
          {segments.map((seg, i) => (
            <polyline
              key={i}
              points={seg.map(([px, py]) => `${px},${py}`).join(" ")}
              fill="none"
              stroke="var(--theme-accent)"
              strokeWidth={2}
              strokeLinejoin="round"
            />
          ))}
          {points.map((p, i) =>
            p.value != null ? (
              <circle
                key={i}
                cx={x(i)}
                cy={y(p.value)}
                r={hover === i ? 4 : 2.5}
                fill="var(--theme-accent-bright)"
                stroke="var(--color-lol-card)"
                strokeWidth={1.5}
              />
            ) : null,
          )}
          {points.map((p, i) =>
            i % labelEvery === 0 ? (
              <text
                key={i}
                x={x(i)}
                y={height - 5}
                textAnchor="middle"
                fontSize={10}
                fill="#8a8f95"
              >
                {p.label}
              </text>
            ) : null,
          )}
        </svg>
      )}
      {hovered && hover != null && (
        <HoverTooltip
          x={x(hover)}
          width={width}
          label={hovered.long ?? hovered.label}
          detail={hovered.detail}
          value={hovered.value != null ? format(hovered.value) : null}
        />
      )}
    </div>
  );
}

// ---- Activity heatmap ----

const HEATMAP_CELL = 11;
const HEATMAP_GAP = 2;
const HEATMAP_PITCH = HEATMAP_CELL + HEATMAP_GAP;
const HEATMAP_WEEKS = 53;
const HEATMAP_COLORS = [
  "rgba(255,255,255,0.03)",
  "rgba(165,15,21,0.20)",
  "rgba(165,15,21,0.45)",
  "rgba(196,30,40,0.70)",
  "rgba(196,30,40,0.95)",
];

function ActivityHeatmap({ daily }: { daily: TrendsDay[] }) {
  const byDay = useMemo(() => new Map(daily.map((d) => [d.day, d])), [daily]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Sunday-start columns, trailing 52 full weeks plus the current partial one
  const start = new Date(today);
  start.setDate(start.getDate() - start.getDay() - 52 * 7);

  let maxGames = 1;
  for (let i = 0; i < HEATMAP_WEEKS * 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    if (d > today) break;
    maxGames = Math.max(maxGames, byDay.get(dayKey(d))?.games ?? 0);
  }

  const left = 28;
  const top = 14;
  const width = left + HEATMAP_WEEKS * HEATMAP_PITCH;
  const height = top + 7 * HEATMAP_PITCH;

  const cells: React.ReactNode[] = [];
  const monthLabels: React.ReactNode[] = [];
  let prevMonth = -1;
  for (let w = 0; w < HEATMAP_WEEKS; w++) {
    const colDate = new Date(start);
    colDate.setDate(colDate.getDate() + w * 7);
    if (colDate.getMonth() !== prevMonth) {
      // Skip a first-column label that the next column would immediately repeat
      const next = new Date(colDate);
      next.setDate(next.getDate() + 7);
      if (!(w === 0 && next.getMonth() !== colDate.getMonth())) {
        monthLabels.push(
          <text key={w} x={left + w * HEATMAP_PITCH} y={9} fontSize={9} fill="#8a8f95">
            {colDate.toLocaleDateString(undefined, { month: "short" })}
          </text>,
        );
      }
      prevMonth = colDate.getMonth();
    }
    for (let dow = 0; dow < 7; dow++) {
      const d = new Date(colDate);
      d.setDate(d.getDate() + dow);
      if (d > today) continue;
      const row = byDay.get(dayKey(d));
      const games = row?.games ?? 0;
      const level = games === 0 ? 0 : Math.min(Math.ceil((games / maxGames) * 4), 4);
      const date = shortDate(d);
      const label = row
        ? `${date} — ${games} game${games === 1 ? "" : "s"} (${row.wins}W–${games - row.wins}L)`
        : `${date} — no games`;
      cells.push(
        <rect
          key={dayKey(d)}
          x={left + w * HEATMAP_PITCH}
          y={top + dow * HEATMAP_PITCH}
          width={HEATMAP_CELL}
          height={HEATMAP_CELL}
          rx={2}
          fill={HEATMAP_COLORS[level]}
        >
          <title>{label}</title>
        </rect>,
      );
    }
  }

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} className="block">
        {monthLabels}
        {(["Mon", "Wed", "Fri"] as const).map((label, i) => (
          <text
            key={label}
            x={left - 5}
            y={top + (i * 2 + 1) * HEATMAP_PITCH + 9}
            textAnchor="end"
            fontSize={9}
            fill="#8a8f95"
          >
            {label}
          </text>
        ))}
        {cells}
      </svg>
      <div className="flex items-center justify-end gap-1 mt-2 text-[10px] text-lol-text">
        <span className="mr-1">Less</span>
        {HEATMAP_COLORS.map((color) => (
          <span key={color} className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: color }} />
        ))}
        <span className="ml-1">More</span>
      </div>
    </div>
  );
}

// ---- Patch bars ----

function patchBarColor(rate: number): string {
  if (rate >= 60) return "var(--color-lol-win)";
  if (rate >= 50) return "#38bdf8";
  return "var(--color-lol-loss)";
}

function PatchBars({ patches }: { patches: TrendsData["patches"] }) {
  const { ref, width } = useContainerWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const barPitch = 56;
  const chartWidth = Math.max(width, patches.length * barPitch + 16);
  const top = 18;
  const plotHeight = 110;
  const height = top + plotHeight + 34;
  const y = (rate: number) => top + plotHeight - (rate / 100) * plotHeight;
  const barX = (i: number) => i * barPitch + barPitch / 2 + 8;

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - rect.left - 8) / barPitch);
    setHover(i >= 0 && i < patches.length ? i : null);
  };

  const hovered = hover != null ? patches[hover] : null;

  return (
    <div ref={ref} className="overflow-x-auto">
      {width > 0 && (
        // The tooltip anchors inside the scrollable content, so it tracks its
        // bar when the chart is wider than the card and scrolled
        <div className="relative" style={{ width: chartWidth }}>
          <svg
            width={chartWidth}
            height={height}
            className="block"
            onMouseMove={handleMove}
            onMouseLeave={() => setHover(null)}
          >
            <line
              x1={0}
              x2={chartWidth}
              y1={y(50)}
              y2={y(50)}
              stroke="rgba(255,255,255,0.06)"
              strokeDasharray="4 4"
            />
            {patches.map((p, i) => {
              const rate = p.games > 0 ? (p.wins / p.games) * 100 : 0;
              const cx = barX(i);
              const barHeight = Math.max(top + plotHeight - y(rate), 2);
              return (
                <g key={p.patch}>
                  <rect
                    x={cx - 15}
                    y={top + plotHeight - barHeight}
                    width={30}
                    height={barHeight}
                    rx={3}
                    fill={patchBarColor(rate)}
                    fillOpacity={hover === i ? 1 : 0.8}
                  />
                  <text
                    x={cx}
                    y={top + plotHeight - barHeight - 5}
                    textAnchor="middle"
                    fontSize={10}
                    fill="var(--color-lol-text-bright)"
                  >
                    {rate.toFixed(0)}%
                  </text>
                  <text
                    x={cx}
                    y={top + plotHeight + 14}
                    textAnchor="middle"
                    fontSize={10}
                    fill="var(--color-lol-text-bright)"
                  >
                    {formatPatch(p.patch)}
                  </text>
                  <text
                    x={cx}
                    y={top + plotHeight + 27}
                    textAnchor="middle"
                    fontSize={9}
                    fill="#8a8f95"
                  >
                    {p.games} games
                  </text>
                </g>
              );
            })}
          </svg>
          {hovered && hover != null && (
            <HoverTooltip
              x={barX(hover)}
              width={chartWidth}
              label={`Patch ${formatPatch(hovered.patch)}`}
              detail={
                <>
                  <div>{`${hovered.games} games · ${hovered.wins}W–${hovered.games - hovered.wins}L`}</div>
                  {hovered.avg_score != null && <div>avg score {hovered.avg_score.toFixed(1)}</div>}
                </>
              }
              value={
                hovered.games > 0 ? `${((hovered.wins / hovered.games) * 100).toFixed(0)}%` : null
              }
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---- When-you-play breakdowns ----
//
// Same grammar as the charts above: faint bars for how much was played, gold
// line for how well it went. A line point needs a minimal sample — one game at
// 4 AM plotting as 0% or 100% would be pure noise — but the bar and tooltip
// still show for any bucket that was played at all.

const MIN_PLOTTED_GAMES = 3;

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function clockPoint(label: string, long: string, games: number, wins: number): SeriesPoint {
  return {
    label,
    long,
    games,
    value: games >= MIN_PLOTTED_GAMES ? (wins / games) * 100 : null,
    detail: games > 0 ? `${games} games · ${wins}W–${games - wins}L` : "No games",
  };
}

function WeekdayChart({ weekdays }: { weekdays: TrendsData["weekdays"] }) {
  const byDay = new Map(weekdays.map((w) => [w.weekday, w]));
  const points = WEEKDAY_ORDER.map((dow) =>
    clockPoint(
      WEEKDAY_LABELS[dow],
      WEEKDAY_FULL[dow],
      byDay.get(dow)?.games ?? 0,
      byDay.get(dow)?.wins ?? 0,
    ),
  );
  return (
    <TimeSeriesChart
      points={points}
      yMin={0}
      yMax={100}
      ticks={[0, 25, 50, 75, 100]}
      refValue={50}
      format={(v) => `${Math.round(v)}%`}
    />
  );
}

function HourChart({ hours }: { hours: TrendsData["hours"] }) {
  const byHour = new Map(hours.map((h) => [h.hour, h]));
  const points = Array.from({ length: 24 }, (_, hour) =>
    clockPoint(
      `${hour}:00`,
      `${String(hour).padStart(2, "0")}:00 – ${String((hour + 1) % 24).padStart(2, "0")}:00`,
      byHour.get(hour)?.games ?? 0,
      byHour.get(hour)?.wins ?? 0,
    ),
  );
  return (
    <TimeSeriesChart
      points={points}
      yMin={0}
      yMax={100}
      ticks={[0, 25, 50, 75, 100]}
      refValue={50}
      format={(v) => `${Math.round(v)}%`}
    />
  );
}

// ---- Page ----

export default function Trends() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queueParam = searchParams.get("queue");
  const queue = queueParam ? Number(queueParam) : undefined;
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
  const { data, refetch } = useIpc<TrendsData>(
    () => window.api.getTrends(scopedQueue),
    [scopedQueue],
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

  if (!data) {
    return (
      <div className="rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03] p-12 text-center">
        <p className="text-sm text-lol-text">Loading trends…</p>
      </div>
    );
  }

  if (data.daily.length === 0) {
    return (
      <div className="rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03] p-12 text-center">
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

      <Card title="Activity">
        <ActivityHeatmap daily={data.daily} />
      </Card>

      <Card title="Win Rate Over Time">
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
        <Card title="Average Score Over Time">
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
        <Card title="Win Rate by Patch">
          <PatchBars patches={data.patches} />
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="By Day of Week">
          <WeekdayChart weekdays={data.weekdays} />
        </Card>
        <Card title="By Hour of Day">
          <HourChart hours={data.hours} />
        </Card>
      </div>
    </div>
  );
}
