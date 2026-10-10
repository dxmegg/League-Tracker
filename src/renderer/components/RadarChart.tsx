export interface RadarAxis {
  label: string;
  value: number;
}

export interface RadarSeries {
  values: number[];
  color: string;
  label?: string;
}

export function RadarChart({
  axes,
  series,
  size = 220,
  max = 100,
  showLegend = true,
}: {
  axes: string[];
  series: RadarSeries[];
  size?: number;
  max?: number;
  showLegend?: boolean;
}) {
  const axisCount = axes.length;
  const center = size / 2;
  const radius = Math.max(0, size / 2 - 30);
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  const angleFor = (index: number) => -Math.PI / 2 + (index * 2 * Math.PI) / axisCount;
  const pointFor = (index: number, distance: number) => {
    const angle = angleFor(index);
    return `${(center + Math.cos(angle) * distance).toFixed(1)},${(
      center +
      Math.sin(angle) * distance
    ).toFixed(1)}`;
  };
  const polygonPoints = (fraction: number) =>
    axes.map((_, index) => pointFor(index, radius * fraction)).join(" ");

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="Radar chart"
      >
        {axisCount >= 3 &&
          [0.25, 0.5, 0.75, 1].map((fraction) => (
            <polygon
              key={fraction}
              points={polygonPoints(fraction)}
              fill="none"
              stroke="var(--theme-border)"
              strokeWidth="1"
            />
          ))}
        {axes.map((label, index) => {
          const angle = angleFor(index);
          const labelRadius = radius + 15;
          const x = center + Math.cos(angle) * labelRadius;
          const y = center + Math.sin(angle) * labelRadius;
          const horizontal = Math.cos(angle);
          const textAnchor =
            Math.abs(horizontal) < 0.15 ? "middle" : horizontal > 0 ? "start" : "end";
          return (
            <g key={label}>
              <line
                x1={center}
                y1={center}
                x2={center + Math.cos(angle) * radius}
                y2={center + Math.sin(angle) * radius}
                stroke="var(--theme-border)"
                strokeWidth="1"
              />
              <text
                x={x}
                y={y}
                textAnchor={textAnchor}
                dominantBaseline="middle"
                className="fill-lol-text text-[9px]"
              >
                {label}
              </text>
            </g>
          );
        })}
        {series.map((item, seriesIndex) => (
          <polygon
            key={item.label ?? seriesIndex}
            points={axes
              .map((_, index) => {
                const value = item.values[index] ?? 0;
                const normalized = Math.max(0, Math.min(safeMax, value)) / safeMax;
                return pointFor(index, radius * normalized);
              })
              .join(" ")}
            fill={item.color}
            fillOpacity="0.22"
            stroke={item.color}
            strokeWidth="2"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      {showLegend && series.some((item) => item.label) && (
        <div className="flex flex-wrap justify-center gap-4 text-xs text-lol-text">
          {series.map(
            (item, index) =>
              item.label && (
                <span key={item.label ?? index} className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: item.color }}
                    aria-hidden="true"
                  />
                  {item.label}
                </span>
              ),
          )}
        </div>
      )}
    </div>
  );
}
