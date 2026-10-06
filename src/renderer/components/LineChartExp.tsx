export function LineChartExp({
  values,
  format,
  color = "var(--theme-win)",
  min,
  max,
  baseline,
}: {
  values: number[];
  format: (v: number) => string;
  color?: string;
  min?: number;
  max?: number;
  baseline?: number;
}) {
  if (values.length === 0) {
    return <div className="text-sm text-lol-text">No data</div>;
  }

  const W = 600;
  const H = 150;
  const P = 16;
  const lo = min ?? Math.min(...values) - 1;
  const hi = max ?? Math.max(...values) + 1;
  const range = hi - lo || 1;
  const plotTop = P + 8;
  const plotHeight = H - 2 * P - 16;

  const x = (i: number) => P + (i * (W - 2 * P)) / (values.length - 1 || 1);
  const y = (v: number) => plotTop + (1 - (v - lo) / range) * plotHeight;

  const points = values.map((v, i) => `${x(i)},${y(v).toFixed(1)}`).join(" ");

  return (
    <svg className="svgc" viewBox={`0 0 ${W} ${H}`} role="img">
      <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="var(--theme-border)" />
      {baseline != null && baseline >= lo && baseline <= hi && (
        <line
          x1={P}
          x2={W - P}
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
    </svg>
  );
}
