// Export and import bar. A null percent means the length is unknown, so the bar only sweeps.
export function TransferProgress({
  label,
  percent,
  detail,
  aside,
}: {
  label: string;
  percent: number | null;
  detail?: string;
  aside?: string;
}) {
  return (
    <div className="space-y-1.5 text-[12.5px] text-lol-text">
      <div className="flex justify-between gap-3">
        <span className="font-semibold text-lol-text-bright">{label}</span>
        {percent !== null && <span className="tabular-nums text-lol-text-bright">{percent}%</span>}
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={percent ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2.5 overflow-hidden rounded-full bg-white/10"
      >
        {percent === null ? (
          <div className="progress-sweep h-full w-1/3 rounded-full bg-lol-crimson" />
        ) : (
          <div
            className="relative h-full overflow-hidden rounded-full bg-lol-crimson transition-[width] duration-500 ease-out"
            style={{ width: `${percent}%` }}
          >
            <i className="progress-sweep absolute inset-y-0 left-0 block w-1/3 bg-gradient-to-r from-transparent via-white/45 to-transparent motion-reduce:hidden" />
          </div>
        )}
      </div>
      {(detail || aside) && (
        <div className="flex justify-between gap-3 tabular-nums">
          <p>{detail}</p>
          {aside && <p className="shrink-0">{aside}</p>}
        </div>
      )}
    </div>
  );
}
