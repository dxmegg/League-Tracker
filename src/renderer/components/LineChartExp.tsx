import { useId } from "react";

type ChartValue = number | null;

function isNumber(value: ChartValue): value is number {
  return value != null;
}

function lineSegments(values: ChartValue[]): string[] {
  const segments: string[] = [];
  let points: string[] = [];
  values.forEach((value, index) => {
    if (value == null) {
      if (points.length > 0) segments.push(points.join(" "));
      points = [];
      return;
    }
    points.push(`${index},${value}`);
  });
  if (points.length > 0) segments.push(points.join(" "));
  return segments;
}

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
  height = 150,
  secondaryValues,
  hollowIndices = [],
  showStats = false,
}: {
  values: ChartValue[];
  format: (v: number) => string;
  color?: string;
  series?: Array<{ values: ChartValue[]; color: string; label: string }>;
  min?: number;
  max?: number;
  baseline?: number;
  xLabels?: string[];
  tooltips?: string[];
  yFormat?: (v: number) => string;
  yTicks?: number[];
  height?: number;
  secondaryValues?: number[];
  hollowIndices?: number[];
  showStats?: boolean;
}) {
  const gradientIdPrefix = useId().replace(/:/g, "-");
  const chartValues = (series ? series.flatMap((item) => item.values) : values).filter(isNumber);
  const statValues = (series?.[0]?.values ?? values).filter(isNumber);
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
  const plotLeft = 0;
  const plotRight = W;
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
      <div className="flex gap-2">
        {hasYAxis && (
          <div className="relative min-w-[32px] text-right text-[10px] tabular-nums text-lol-text/50">
            {yTicks.map((tick) => (
              <span
                key={tick}
                className="absolute right-0 -translate-y-1/2 whitespace-nowrap"
                style={{ top: y(tick) }}
              >
                {yFormat ? yFormat(tick) : tick}
              </span>
            ))}
          </div>
        )}
        <div className="min-w-0 flex-1" style={{ aspectRatio: `${W} / ${H}` }}>
          <svg
            className="svgc block h-full w-full"
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            height="100%"
            preserveAspectRatio="none"
            role="img"
          >
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
                return (
                  <g key={item.label}>
                    {lineSegments(item.values).map((segment, segmentIndex) => {
                      const pointPairs = segment.split(" ").map((point) => {
                        const [indexText, valueText] = point.split(",");
                        return { index: Number(indexText), value: Number(valueText) };
                      });
                      const points = pointPairs
                        .map(
                          ({ index: pointIndex, value }) =>
                            `${x(pointIndex)},${y(value).toFixed(1)}`,
                        )
                        .join(" ");
                      const first = pointPairs[0];
                      const last = pointPairs[pointPairs.length - 1];
                      const areaPath = `${points} L ${x(last.index)},${H - P} L ${x(first.index)},${H - P} Z`;
                      return (
                        <g key={segmentIndex}>
                          <path
                            d={areaPath}
                            fill={`url(#${gradientIdPrefix}-line-gradient-${index})`}
                          />
                          <polyline
                            points={points}
                            fill="none"
                            stroke={item.color}
                            strokeWidth="2.5"
                            strokeLinejoin="round"
                          />
                        </g>
                      );
                    })}
                  </g>
                );
              })
            ) : (
              <>
                <path
                  d={lineSegments(values)
                    .map((segment) => {
                      const pointPairs = segment.split(" ").map((point) => {
                        const [indexText, valueText] = point.split(",");
                        return { index: Number(indexText), value: Number(valueText) };
                      });
                      const points = pointPairs
                        .map(
                          ({ index: pointIndex, value }) =>
                            `${x(pointIndex)},${y(value).toFixed(1)}`,
                        )
                        .join(" ");
                      const first = pointPairs[0];
                      const last = pointPairs[pointPairs.length - 1];
                      return `${points} L ${x(last.index)},${H - P} L ${x(first.index)},${H - P} Z`;
                    })
                    .join(" ")}
                  fill={`url(#${gradientIdPrefix}-line-gradient-primary)`}
                />
                {lineSegments(values).map((segment, segmentIndex) => (
                  <polyline
                    key={segmentIndex}
                    points={segment
                      .split(" ")
                      .map((point) => {
                        const [indexText, valueText] = point.split(",");
                        return `${x(Number(indexText))},${y(Number(valueText)).toFixed(1)}`;
                      })
                      .join(" ")}
                    fill="none"
                    stroke={color}
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                  />
                ))}
                {values.map((value, index) =>
                  value == null ? null : (
                    <circle
                      key={index}
                      cx={x(index)}
                      cy={y(value).toFixed(1)}
                      r="4"
                      fill={hollowIndices.includes(index) ? "var(--theme-card)" : color}
                      stroke={color}
                      strokeWidth={hollowIndices.includes(index) ? "1.5" : "0"}
                      opacity={hollowIndices.includes(index) ? "0.65" : "1"}
                    >
                      <title>{tooltips ? tooltips[index] : format(value)}</title>
                    </circle>
                  ),
                )}
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
        </div>
      </div>
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
