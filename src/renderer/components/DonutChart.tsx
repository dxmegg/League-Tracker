export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({
  segments,
  size = 140,
  thickness = 16,
  showLegend = true,
  centerLabel,
  centerSub,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  showLegend?: boolean;
  centerLabel?: string;
  centerSub?: string;
}) {
  const positiveSegments = segments.filter(
    (segment) => Number.isFinite(segment.value) && segment.value > 0,
  );
  const total = positiveSegments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = Math.max(0, (size - thickness) / 2);
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center justify-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={total > 0 ? "Donut chart" : "Donut chart with no data"}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={total > 0 ? "var(--theme-border)" : "var(--theme-foreground-muted)"}
            strokeWidth={thickness}
            className={total > 0 ? "opacity-30" : undefined}
          />
          {total > 0 &&
            positiveSegments.map((segment) => {
              const dashLength = (segment.value / total) * circumference;
              const dashOffset = -offset;
              offset += dashLength;
              return (
                <circle
                  key={segment.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth={thickness}
                  strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                  strokeDashoffset={dashOffset}
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
              );
            })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {total > 0 ? (
            <>
              {centerLabel && (
                <span className="font-display text-[22px] leading-none text-lol-text-bright">
                  {centerLabel}
                </span>
              )}
              {centerSub && <span className="mt-1 text-[11px] text-lol-text">{centerSub}</span>}
            </>
          ) : (
            <span className="text-xs text-lol-text">No data</span>
          )}
        </div>
      </div>
      {showLegend && positiveSegments.length > 0 && (
        <div className="flex min-w-[150px] flex-1 flex-col gap-2 text-xs">
          {positiveSegments.map((segment) => (
            <div key={segment.label} className="flex items-center gap-2 text-lol-text-bright">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: segment.color }}
                aria-hidden="true"
              />
              <span>{segment.label}</span>
              <span className="ml-auto text-lol-text">
                {((segment.value / total) * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
