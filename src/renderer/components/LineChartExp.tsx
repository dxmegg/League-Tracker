export function LineChartExp({
  values,
  format,
  color = "var(--theme-win)",
  min,
  max,
  baseline,
  xLabels,
  yFormat,
  yTicks,
  paddingLeft,
  height = 150,
}: {
  values: number[];
  format: (v: number) => string;
  color?: string;
  min?: number;
  max?: number;
  baseline?: number;
  xLabels?: string[];
  yFormat?: (v: number) => string;
  yTicks?: number[];
  paddingLeft?: number;
  height?: number;
}) {
  if (values.length === 0) {
    return <div className="text-sm text-lol-text">No data</div>;
  }

  const W = 600;
  const H = height;
  const P = 16;
  const hasYAxis = yTicks != null;
  const leftPadding = paddingLeft ?? 0;
  const plotLeft = P + (hasYAxis && leftPadding === 0 ? 44 : leftPadding);
  const plotRight = W - P;
  const lo = min ?? Math.min(...values) - 1;
  const hi = max ?? Math.max(...values) + 1;
  const range = hi - lo || 1;
  const plotTop = P + 8;
  const plotHeight = H - 2 * P - 16;

  const x = (i: number) => plotLeft + (i * (plotRight - plotLeft)) / (values.length - 1 || 1);
  const y = (v: number) => plotTop + (1 - (v - lo) / range) * plotHeight;

  const points = values.map((v, i) => `${x(i)},${y(v).toFixed(1)}`).join(" ");
  const xLabelIndices = xLabels?.length
    ? [...new Set([0, Math.floor((values.length - 1) / 2), values.length - 1])]
    : [];

  return (
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
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v).toFixed(1)} r="4" fill={color}>
          <title>{format(v)}</title>
        </circle>
      ))}
      {xLabelIndices.map((index) => {
        const label = xLabels?.[index];
        if (label == null) return null;
        const anchor = index === 0 ? "start" : index === values.length - 1 ? "end" : "middle";
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
  );
}
