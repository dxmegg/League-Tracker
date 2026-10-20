import { useState, type MouseEvent } from "react";
import { formatPatch } from "../lib/format";
import type { TrendsData } from "../lib/types";
import { HoverTooltip, useContainerWidth } from "./TimeSeriesChart";

function patchBarColor(rate: number): string {
  if (rate >= 60) return "var(--color-lol-win)";
  if (rate >= 50) return "#38bdf8";
  return "var(--color-lol-loss)";
}

export function PatchBars({ patches }: { patches: TrendsData["patches"] }) {
  const { ref, width } = useContainerWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const barPitch = Math.max(56, patches.length > 0 ? width / patches.length : 56);
  const chartWidth = Math.max(width, patches.length * barPitch + 16);
  const top = 18;
  const plotHeight = 110;
  const height = top + plotHeight + 34;
  const y = (rate: number) => top + plotHeight - (rate / 100) * plotHeight;
  const barX = (i: number) => i * barPitch + barPitch / 2 + 8;

  const handleMove = (e: MouseEvent<SVGSVGElement>) => {
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
