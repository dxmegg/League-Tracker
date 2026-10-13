import { useId } from "react";

export function LineChartExp({
  values,
  format,
  color = "var(--theme-win)",
  series,
  min,
  max,
  baseline,
  xLabels,
  tooltips,
  yFormat,
  yTicks,
  paddingLeft,
  height = 150,
  secondaryValues,
  hollowIndices = [],
  showStats = false,
}: {
  values: number[];
  format: (v: number) => string;
  color?: string;
  series?: Array<{ values: number[]; color: string; label: string }>;
  min?: number;
  max?: number;
  baseline?: number;
  xLabels?: string[];
  tooltips?: string[];
  yFormat?: (v: number) => string;
  yTicks?: number[];
  paddingLeft?: number;
  height?: number;
  secondaryValues?: number[];
  hollowIndices?: number[];
  showStats?: boolean;
}) {
  const gradientIdPrefix = useId().replace(/:/g, "-");
  const chartValues = series ? series.flatMap((item) => item.values) : values;
  const statValues = series?.[0]?.values ?? values;
  const pointCount = series?.[0]?.values.length ?? values.length;

  if (
    chartValues.length === 0 ||
    (series != null && series.some((item) => item.values.length === 0))
  ) {
    return <div className="text-sm text-lol-text">No data</div>;
  }

  const W = 600;
  const H = height;
  const P = 16;
  const hasYAxis = yTicks != null && yTicks.length > 0;
  const leftPadding = paddingLeft ?? 0;
  const axisWidth = hasYAxis ? 32 : 0;
  const plotLeft = P + (leftPadding === 0 ? axisWidth : leftPadding);
  const plotWidth = W - P - plotLeft;
  const plotRight = plotLeft + plotWidth;
  const lo = min ?? Math.min(...chartValues) - 1;
  const hi = max ?? Math.max(...chartValues) + 1;
  const range = hi - lo || 1;
  const plotTop = P + 8;
  const plotHeight = H - 2 * P - 16;

  const x = (i: number) => plotLeft + (i * (plotRight - plotLeft)) / (pointCount - 1 || 1);
  const y = (v: number) => plotTop + (1 - (v - lo) / range) * plotHeight;
  const maxSecondary = Math.max(...(secondaryValues ?? [0]), 1);

  const xLabelIndices = (() => {
    if (!xLabels?.length) return [];
    const step = pointCount <= 6 ? 1 : pointCount <= 12 ? 2 : pointCount <= 20 ? 3 : 4;
    const lastIndex = pointCount - 1;
    const candidates = new Set<number>([0, lastIndex]);
    for (let index = step; index < lastIndex; index += step) candidates.add(index);

    const sorted = [...candidates].sort((a, b) => a - b);
    const accepted = [sorted[0]];
    const unitsPerIndex = (plotRight - plotLeft) / (pointCount - 1 || 1);
    for (const index of sorted.slice(1)) {
      const spacing = unitsPerIndex * (index - accepted[accepted.length - 1]);
      if (spacing >= 55 || index === lastIndex) {
        if (index === lastIndex && spacing < 55 && accepted.length > 1) {
          accepted.pop();
        }
        accepted.push(index);
      }
    }
    return accepted;
  })();

  return (
    <div>
      <svg className="svgc" viewBox={`0 0 ${W} ${H}`} role="img">
        <defs>
          {series ? (
            series.map((item, index) => (
              <linearGradient
                key={item.label}
                id={`${gradientIdPrefix}-line-gradient-${index}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={item.color} stopOpacity="0.35" />
                <stop offset="100%" stopColor={item.color} stopOpacity="0" />
              </linearGradient>
            ))
          ) : (
            <linearGradient
              id={`${gradientIdPrefix}-line-gradient-primary`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          )}
        </defs>
        <line x1={plotLeft} x2={plotRight} y1={H - P} y2={H - P} stroke="var(--theme-border)" />
        {yTicks?.map((tick) => (
          <g key={tick}>
            <line
              x1={plotLeft}
              x2={plotRight}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--theme-border)"
              strokeDasharray="4 4"
              strokeWidth="1"
            />
            <text
              x={plotLeft - 4}
              y={y(tick) + 3}
              textAnchor="end"
              className="fill-lol-text text-[10px]"
            >
              {yFormat ? yFormat(tick) : String(tick)}
            </text>
          </g>
        ))}
        {baseline != null && baseline >= lo && baseline <= hi && (
          <line
            x1={plotLeft}
            x2={plotRight}
            y1={y(baseline)}
            y2={y(baseline)}
            stroke="var(--theme-border)"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
        )}
        {secondaryValues?.map((value, index) => {
          const barWidth = Math.max(4, (plotRight - plotLeft) / (pointCount * 2.5));
          const barHeight = ((H - P - plotTop) * value) / maxSecondary;
          return (
            <rect
              key={`secondary-${index}`}
              x={x(index) - barWidth / 2}
              y={H - P - barHeight}
              width={barWidth}
              height={barHeight}
              fill="var(--theme-text)"
              opacity="0.1"
              rx="2"
            />
          );
        })}
        {series ? (
          series.map((item, index) => {
            const points = item.values.map((v, i) => `${x(i)},${y(v).toFixed(1)}`).join(" ");
            const areaPath = `${points} L ${x(item.values.length - 1)},${H - P} L ${x(0)},${H - P} Z`;
            return (
              <g key={item.label}>
                <path d={areaPath} fill={`url(#${gradientIdPrefix}-line-gradient-${index})`} />
                <polyline
                  points={points}
                  fill="none"
                  stroke={item.color}
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                />
              </g>
            );
          })
        ) : (
          <>
            <path
              d={`${values.map((v, i) => `${x(i)},${y(v).toFixed(1)}`).join(" ")} L ${x(values.length - 1)},${H - P} L ${x(0)},${H - P} Z`}
              fill={`url(#${gradientIdPrefix}-line-gradient-primary)`}
            />
            <polyline
              points={values.map((v, i) => `${x(i)},${y(v).toFixed(1)}`).join(" ")}
              fill="none"
              stroke={color}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {values.map((v, i) => (
              <circle
                key={i}
                cx={x(i)}
                cy={y(v).toFixed(1)}
                r="4"
                fill={hollowIndices.includes(i) ? "var(--theme-card)" : color}
                stroke={color}
                strokeWidth={hollowIndices.includes(i) ? "1.5" : "0"}
                opacity={hollowIndices.includes(i) ? "0.65" : "1"}
              >
                <title>{tooltips ? tooltips[i] : format(v)}</title>
              </circle>
            ))}
          </>
        )}
        {xLabelIndices.map((index) => {
          const label = xLabels?.[index];
          if (label == null) return null;
          const anchor = index === 0 ? "start" : index === pointCount - 1 ? "end" : "middle";
          return (
            <text
              key={index}
              x={x(index)}
              y={H - 2}
              textAnchor={anchor}
              className="fill-lol-text text-[10px]"
            >
              {label}
            </text>
          );
        })}
      </svg>
      {showStats && statValues.length > 0 && (
        <div className="grid grid-cols-5 gap-2 border-t border-lol-border/40 px-2 pt-2 text-[10px] uppercase tracking-wider text-lol-text">
          {[
            ["Min", Math.min(...statValues), ""],
            ["Average", statValues.reduce((sum, item) => sum + item, 0) / statValues.length, ""],
            ["Max", Math.max(...statValues), ""],
            ["Latest", statValues[statValues.length - 1], ""],
            [
              "Change",
              statValues[statValues.length - 1] - statValues[0],
              statValues[statValues.length - 1] - statValues[0] >= 0
                ? "text-lol-win"
                : "text-lol-loss",
            ],
          ].map(([label, stat, className]) => (
            <div key={label} className="min-w-0">
              <div className="truncate">{label}</div>
              <div
                className={`mt-0.5 truncate text-xs font-semibold tabular-nums text-lol-text-bright ${className}`}
              >
                {label === "Change" && (stat as number) > 0 ? "+" : ""}
                {format(stat as number)}
              </div>
            </div>
          ))}
        </div>
      )}
      {series && (
        <div className="flex flex-wrap gap-4 px-2 pt-1 text-xs text-lol-text">
          {series.map((item) => (
            <span key={item.label} className="inline-flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: item.color }}
                aria-hidden="true"
              />
              {item.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
