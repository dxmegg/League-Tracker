interface SparklineProps {
  values: Array<number | null>;
  width?: number;
  height?: number;
  strokeClassName?: string;
}

export default function Sparkline({
  values,
  width = 60,
  height = 20,
  strokeClassName = "text-lol-text/60",
}: SparklineProps) {
  const points = values
    .map((value, index) => (value == null ? null : { index, value }))
    .filter((point): point is { index: number; value: number } => point !== null);
  if (points.length === 0) return null;

  const min = Math.min(...points.map((point) => point.value));
  const max = Math.max(...points.map((point) => point.value));
  const range = max - min || 1;
  const xStep = values.length > 1 ? width / (values.length - 1) : 0;
  const polyline = points
    .map(({ index, value }) => `${index * xStep},${height - ((value - min) / range) * height}`)
    .join(" ");

  return (
    <svg
      aria-hidden="true"
      className={`pointer-events-none ${strokeClassName}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
    >
      <polyline points={polyline} stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
