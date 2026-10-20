import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

export function useContainerWidth<T extends HTMLElement>() {
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

export function HoverTooltip({
  x,
  width,
  label,
  detail,
  value,
}: {
  x: number;
  width: number;
  label: string;
  detail: ReactNode;
  value?: string | null;
}) {
  return (
    <div
      className="absolute top-1 z-50 pointer-events-none rounded border border-lol-border bg-[var(--theme-card)] p-2 text-xs shadow-xl whitespace-nowrap"
      style={{
        left: Math.min(Math.max(x, 70), Math.max(width - 70, 70)),
        transform: "translateX(-50%)",
      }}
    >
      <div className="font-medium text-lol-text-bright">{label}</div>
      {value != null && <div className="text-lol-text">Value: {value}</div>}
      <div className="text-lol-text">{detail}</div>
    </div>
  );
}

export interface SeriesPoint {
  label: string;
  // Tooltip title when the axis label is abbreviated ("Mon" → "Monday")
  long?: string;
  games: number;
  value: number | null;
  detail: string;
}

export const MIN_PLOTTED_GAMES = 3;

export function clockPoint(label: string, long: string, games: number, wins: number): SeriesPoint {
  return {
    label,
    long,
    games,
    value: games >= MIN_PLOTTED_GAMES ? (wins / games) * 100 : null,
    detail: games > 0 ? `${games} games · ${wins}W–${games - wins}L` : "No games",
  };
}

export function TimeSeriesChart({
  points,
  yMin,
  yMax,
  ticks,
  refValue,
  refLabel,
  format,
  height = 190,
}: {
  points: SeriesPoint[];
  yMin: number;
  yMax: number;
  ticks: number[];
  refValue?: number;
  refLabel?: string;
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
  const labelEvery = Math.max(1, Math.ceil(n / 8));

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

  const handleMove = (e: MouseEvent<SVGSVGElement>) => {
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
            <>
              <line
                x1={M.left}
                x2={width - M.right}
                y1={y(refValue)}
                y2={y(refValue)}
                stroke="#64748b"
                strokeDasharray="4 4"
              />
              {refLabel && (
                <text
                  x={width - M.right}
                  y={y(refValue) - 4}
                  textAnchor="end"
                  fontSize={9}
                  fill="#94a3b8"
                >
                  {refLabel}
                </text>
              )}
            </>
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
