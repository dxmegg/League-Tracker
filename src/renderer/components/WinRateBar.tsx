interface WinRateBarProps {
  wins: number;
  total: number;
  showPercent?: boolean;
  percentClassName?: (rate: number) => string;
}

export default function WinRateBar({
  wins,
  total,
  showPercent = true,
  percentClassName,
}: WinRateBarProps) {
  const rate = total > 0 ? (wins / total) * 100 : 0;

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2.5 bg-[#a51e1e]/20 rounded-full overflow-hidden min-w-16">
        <div
          className="h-full rounded-full transition-all bg-[#15803d] shadow-[0_0_10px_rgba(21,128,61,0.45)]"
          style={{ width: `${rate}%` }}
        />
      </div>
      {showPercent && (
        <span
          className={`text-sm font-semibold min-w-12 text-right ${
            percentClassName
              ? percentClassName(rate)
              : rate >= 60
                ? "text-[#15803d]"
                : rate >= 50
                  ? "text-sky-400"
                  : "text-[#a51e1e]"
          }`}
        >
          {rate.toFixed(1)}%
        </span>
      )}
    </div>
  );
}
