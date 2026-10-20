import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { TrendsDay } from "../lib/types";

interface ActivityHeatmapProps {
  days: Array<{ day: string; games: number }>;
  colorPrimary?: string;
  colorMuted?: string;
}

const CELL_COLORS = [
  "rgba(255,255,255,0.04)",
  "rgba(229,72,63,0.20)",
  "rgba(229,72,63,0.45)",
  "rgba(229,72,63,0.70)",
  "rgba(229,72,63,0.95)",
];

function formatDate(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

interface HighlightPeriod {
  games: number;
  start: string;
  end: string;
}

function dayDate(day: string): Date {
  return new Date(`${day}T00:00:00`);
}

function dayKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function weekStart(day: string): string {
  const date = dayDate(day);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return dayKey(date);
}

function monthEnd(day: string): string {
  const date = dayDate(day);
  date.setMonth(date.getMonth() + 1, 0);
  return dayKey(date);
}

function periodHighlights(
  periods: Map<string, { games: number; start: string; end: string }>,
): { best: HighlightPeriod; worst?: HighlightPeriod } | null {
  const nonZero = [...periods.values()].filter((period) => period.games > 0);
  if (nonZero.length === 0) return null;
  const best = nonZero.reduce((current, period) =>
    period.games > current.games ? period : current,
  );
  const worst =
    nonZero.length > 1
      ? nonZero.reduce((current, period) => (period.games < current.games ? period : current))
      : undefined;
  return { best, worst };
}

function getHighlights(days: ActivityHeatmapProps["days"]) {
  const weeks = new Map<string, HighlightPeriod>();
  const months = new Map<string, HighlightPeriod>();
  const dayPeriods = new Map<string, HighlightPeriod>();

  for (const day of days) {
    if (day.games <= 0) continue;
    const week = weekStart(day.day);
    const month = day.day.slice(0, 7);
    const weekPeriod = weeks.get(week) ?? { games: 0, start: week, end: day.day };
    weekPeriod.games += day.games;
    const weekEnd = dayDate(week);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekPeriod.end = dayKey(weekEnd);
    weeks.set(week, weekPeriod);

    const monthPeriod = months.get(month) ?? {
      games: 0,
      start: `${month}-01`,
      end: monthEnd(day.day),
    };
    monthPeriod.games += day.games;
    months.set(month, monthPeriod);
    dayPeriods.set(day.day, { games: day.games, start: day.day, end: day.day });
  }

  return {
    week: periodHighlights(weeks),
    day: periodHighlights(dayPeriods),
    month: periodHighlights(months),
  };
}

function HighlightColumn({
  label,
  highlight,
  colorPrimary,
}: {
  label: string;
  highlight: { best: HighlightPeriod; worst?: HighlightPeriod } | null;
  colorPrimary: string;
}) {
  if (!highlight) return null;
  const rows = [
    { label: "Best", period: highlight.best, accent: true },
    ...(highlight.worst ? [{ label: "Worst", period: highlight.worst, accent: false }] : []),
  ];
  return (
    <div>
      <div className="mb-2 text-[10px] uppercase tracking-wider text-lol-text/60">{label}</div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="text-[10px] uppercase tracking-wider text-lol-text/60">
              {row.label}{" "}
              <span
                className="text-[14px] font-semibold"
                style={{ color: row.accent ? colorPrimary : undefined }}
              >
                {row.period.games}
              </span>
            </div>
            <div className="text-[11px] text-lol-text/50">
              {formatDate(row.period.start)}
              {row.period.start !== row.period.end && ` – ${formatDate(row.period.end)}`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryActivityHeatmap({
  days,
  colorPrimary = "#E5483F",
  colorMuted = "rgba(255,255,255,0.04)",
}: ActivityHeatmapProps) {
  const total = days.reduce((sum, day) => sum + day.games, 0);
  const gamesByDay = new Map(days.map((day) => [day.day, day.games]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  monday.setDate(monday.getDate() - 25 * 7);
  const cells = Array.from({ length: 26 * 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const day = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
    return { day, games: gamesByDay.get(day) ?? 0 };
  });
  const cellColors = CELL_COLORS.map((color, index) => {
    if (index === 0) return colorMuted;
    return color.replace(
      "229,72,63",
      `${parseInt(colorPrimary.slice(1, 3), 16)},${parseInt(colorPrimary.slice(3, 5), 16)},${parseInt(colorPrimary.slice(5, 7), 16)}`,
    );
  });
  const highlights = getHighlights(days);

  if (total === 0) {
    return (
      <section className="rounded-lg border border-lol-border/60 bg-lol-card/40 p-4">
        <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-lol-text-bright">
          <span className="h-1.5 w-1.5 rotate-45 bg-lol-crimson" aria-hidden="true" />
          Weekly activity
        </h2>
        <p className="py-5 text-center text-[11px] text-lol-text/70">
          No activity in the last 26 weeks
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-lol-border/60 bg-lol-card/40 p-4">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-lol-text-bright">
        <span
          className="h-1.5 w-1.5 rotate-45"
          style={{ backgroundColor: colorPrimary }}
          aria-hidden="true"
        />
        Weekly activity
      </h2>
      <p className="mb-3 text-[11px] text-lol-text/70">{total} games in the last 26 weeks</p>
      <div className="grid grid-flow-col grid-cols-[repeat(26,12px)] grid-rows-[repeat(7,12px)] gap-[3px] overflow-x-auto">
        {cells.map((cell) => (
          <div
            key={cell.day}
            title={
              cell.games > 0
                ? `${cell.games} games on ${formatDate(cell.day)}`
                : `No games on ${formatDate(cell.day)}`
            }
            className="h-3 w-3 shrink-0 rounded-[3px] transition-[filter] duration-100 hover:brightness-[1.15]"
            style={{
              backgroundColor:
                cell.games === 0
                  ? colorMuted
                  : cellColors[
                      Math.min(
                        cell.games >= 7 ? 4 : cell.games >= 4 ? 3 : cell.games >= 2 ? 2 : 1,
                        4,
                      )
                    ],
            }}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-lol-text/70">
        <span>Less</span>
        {cellColors.map((color, index) => (
          <span
            key={index}
            className="h-3 w-3 rounded-[3px]"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
        ))}
        <span>More</span>
      </div>
      {(highlights.week || highlights.day || highlights.month) && (
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-lol-border/40 pt-4">
          <HighlightColumn label="Week" highlight={highlights.week} colorPrimary={colorPrimary} />
          <HighlightColumn label="Day" highlight={highlights.day} colorPrimary={colorPrimary} />
          <HighlightColumn label="Month" highlight={highlights.month} colorPrimary={colorPrimary} />
        </div>
      )}
    </section>
  );
}

const HEATMAP_CELL = 14;
const HEATMAP_GAP = 3;
const HEATMAP_COLORS = [
  "rgba(255,255,255,0.03)",
  "rgba(165,15,21,0.20)",
  "rgba(165,15,21,0.45)",
  "rgba(196,30,40,0.70)",
  "rgba(196,30,40,0.95)",
];

export function ActivityHeatmap({
  daily,
  timeRange,
}: {
  daily: TrendsDay[];
  timeRange: "4w" | "12w" | "6m" | "all";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const byDay = useMemo(() => new Map(daily.map((d) => [d.day, d])), [daily]);
  const heatmapWeeks =
    timeRange === "4w" ? 4 : timeRange === "12w" ? 12 : timeRange === "6m" ? 26 : 53;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Sunday-start columns, trailing 52 full weeks plus the current partial one
  const start = new Date(today);
  start.setDate(start.getDate() - start.getDay() - (heatmapWeeks - 1) * 7);

  let maxGames = 1;
  for (let i = 0; i < heatmapWeeks * 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    if (d > today) break;
    maxGames = Math.max(maxGames, byDay.get(dayKey(d))?.games ?? 0);
  }

  const left = 28;
  const top = 14;
  const cellSize =
    containerWidth > 0
      ? Math.max(1, (containerWidth - left) / heatmapWeeks - HEATMAP_GAP)
      : HEATMAP_CELL;
  const pitch = cellSize + HEATMAP_GAP;
  const width = left + heatmapWeeks * pitch;
  const height = top + 7 * pitch;

  const cells: ReactNode[] = [];
  const monthLabels: ReactNode[] = [];
  let prevMonth = -1;
  for (let w = 0; w < heatmapWeeks; w++) {
    const colDate = new Date(start);
    colDate.setDate(colDate.getDate() + w * 7);
    if (colDate.getMonth() !== prevMonth) {
      // Skip a first-column label that the next column would immediately repeat
      const next = new Date(colDate);
      next.setDate(next.getDate() + 7);
      if (!(w === 0 && next.getMonth() !== colDate.getMonth())) {
        monthLabels.push(
          <text key={w} x={left + w * pitch} y={9} fontSize={9} fill="#8a8f95">
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
      const date = dayKey(d);
      const wins = row?.wins ?? 0;
      const label = `Date: ${date} | ${games} game${games === 1 ? "" : "s"} (${wins}W - ${games - wins}L)`;
      cells.push(
        <rect
          key={dayKey(d)}
          x={left + w * pitch}
          y={top + dow * pitch}
          width={cellSize}
          height={cellSize}
          rx={2}
          fill={HEATMAP_COLORS[level]}
        >
          <title>{label}</title>
        </rect>,
      );
    }
  }

  return (
    <div ref={containerRef} className="w-full overflow-x-auto">
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="block">
        {monthLabels}
        {(["Mon", "Wed", "Fri"] as const).map((label, i) => (
          <text
            key={label}
            x={left - 5}
            y={top + (i * 2 + 1) * pitch + 9}
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

export default HistoryActivityHeatmap;
