interface StatBarsProps {
  damage: number;
  taken: number;
  heal: number;
  // Highest value any player in that game reached, so bars are comparable
  max: { dmg: number; taken: number; heal: number };
  className?: string;
}

// Damage dealt / taken / healed, each as a share of the game's best.
export default function StatBars({ damage, taken, heal, max, className = "" }: StatBarsProps) {
  return (
    <div className={`shrink-0 space-y-1 ${className}`}>
      <StatBar value={damage} max={max.dmg} color="bg-[#e0524f]" label="DMG" />
      <StatBar value={taken} max={max.taken} color="bg-[#3fc4c9]" label="TKN" />
      <StatBar value={heal} max={max.heal} color="bg-[#3fbf72]" label="HEAL" />
    </div>
  );
}

function StatBar({
  value,
  max,
  color,
  label,
}: {
  value: number;
  max: number;
  color: string;
  label: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const percentage = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="grid grid-cols-[32px_1fr_40px] items-center gap-1.5">
      <span className="text-[10px] text-lol-text">{label}</span>
      <div className="h-1 bg-white/5 rounded-sm overflow-hidden relative">
        <div className={`h-full rounded-sm ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-right text-[10px] text-lol-text/80">
        {value > 0 ? `${percentage.toFixed(1)}%` : ""}
      </span>
    </div>
  );
}
