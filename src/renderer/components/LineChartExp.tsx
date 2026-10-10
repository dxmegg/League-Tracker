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
}) {
  const chartValues = series ? series.flatMap((item) => item.values) : values;
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
  const hasYAxis = yTicks != null;
  const leftPadding = paddingLeft ?? 0;
  const plotLeft = P + (hasYAxis && leftPadding === 0 ? 44 : leftPadding);
  const plotRight = W - P;
  const lo = min ?? Math.min(...chartValues) - 1;
  const hi = max ?? Math.max(...chartValues) + 1;
  const range = hi - lo || 1;
  const plotTop = P + 8;
  const plotHeight = H - 2 * P - 16;

  const x = (i: number) => plotLeft + (i * (plotRight - plotLeft)) / (pointCount - 1 || 1);
  const y = (v: number) => plotTop + (1 - (v - lo) / range) * plotHeight;

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
        {series ? (
          series.map((item) => (
            <polyline
              key={item.label}
              points={item.values.map((v, i) => `${x(i)},${y(v).toFixed(1)}`).join(" ")}
              fill="none"
              stroke={item.color}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
          ))
        ) : (
          <>
            <polyline
              points={values.map((v, i) => `${x(i)},${y(v).toFixed(1)}`).join(" ")}
              fill="none"
              stroke={color}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v).toFixed(1)} r="4" fill={color}>
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
