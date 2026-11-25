import { useState } from "react";
import type { AchievementTotals } from "../../shared/api";
import { useIpc } from "../hooks/useIpc";
import { useActiveAccount } from "../hooks/useActiveAccount";
import { useScopedQueue } from "../lib/historyScope";
import { ALL_ACCOUNTS_SENTINEL } from "../lib/accountsEvent";
import { formatNumber } from "../lib/format";
import { FilterChip } from "../components/FilterChip";
import { ACHIEVEMENTS, TIERS, progressOf } from "../lib/achievements";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const CATEGORIES = ["All", ...new Set(ACHIEVEMENTS.map((a) => a.category))];

function Emblem({ tier, size = 52 }: { tier: number; size?: number }) {
  const color = tier < 0 ? "#3a4152" : TIERS[tier].color;
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" className="shrink-0">
      <path
        d="M24 2 43 13v22L24 46 5 35V13Z"
        fill={color}
        fillOpacity={0.18}
        stroke={color}
        strokeWidth="2.5"
      />
      <path d="M24 11 34 24 24 37 14 24Z" fill={color} fillOpacity={tier < 0 ? 0.35 : 0.9} />
    </svg>
  );
}

export default function Achievements() {
  const [accountRaw] = useActiveAccount();
  const account = accountRaw === ALL_ACCOUNTS_SENTINEL ? "all" : accountRaw;
  const queue = useScopedQueue(undefined);
  const { data, loading } = useIpc<AchievementTotals>(
    () => window.api.getAchievementTotals(queue, account),
    [queue, account],
  );
  const [category, setCategory] = useState("All");

  const graded = data ? ACHIEVEMENTS.map((a) => ({ ...a, ...progressOf(a, data) })) : [];
  const points = graded.reduce((sum, a) => sum + a.points, 0);
  const maxPoints = ACHIEVEMENTS.length * TIERS.reduce((sum, t) => sum + t.points, 0);
  // Overall rank follows the average number of tiers reached per achievement
  const reached = graded.reduce((sum, a) => sum + a.tier + 1, 0);
  const overall = graded.length ? Math.floor(reached / graded.length) - 1 : -1;
  const shown = graded.filter((a) => category === "All" || a.category === category);
  const closest = graded
    .filter((a) => a.next !== undefined)
    .sort((a, b) => b.fraction - a.fraction)
    .slice(0, 3);

  return (
    <div className="flex min-h-full w-full flex-col gap-4">
      <div className="app-tile app-tile-featured flex flex-wrap items-center gap-5">
        <Emblem tier={overall} size={92} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[28px] font-bold leading-none text-lol-text-bright">
            Achievements
          </h1>
          <p
            className="mt-2 font-display text-[18px] font-bold"
            style={{ color: overall < 0 ? undefined : TIERS[overall].color }}
          >
            {overall < 0 ? "Unranked" : TIERS[overall].name}
          </p>
          <p className="text-[13px] text-lol-text">
            {formatNumber(points)} of {formatNumber(maxPoints)} points · {formatNumber(reached)} of{" "}
            {ACHIEVEMENTS.length * TIERS.length} tiers unlocked
          </p>
        </div>
        <div className="flex w-full flex-wrap justify-between gap-3 border-t border-lol-border/50 pt-4">
          {TIERS.map((tier, index) => (
            <div key={tier.name} className="flex w-16 flex-col items-center" title={tier.name}>
              <Emblem tier={index} size={30} />
              <span className="font-display text-[15px] font-bold tabular-nums text-lol-text-bright">
                {graded.filter((a) => a.tier === index).length}
              </span>
              <span className="max-w-full truncate text-[9px] uppercase text-lol-text">
                {tier.name}
              </span>
            </div>
          ))}
        </div>
      </div>

      {closest.length > 0 && (
        <p className="text-[13px] text-lol-text">
          <span className="font-bold text-lol-gold">Almost there: </span>
          {closest
            .map(
              (a) =>
                `${a.name} ${TIERS[a.tier + 1].name} (${formatNumber(a.next! - a.value)} to go)`,
            )
            .join(" · ")}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((value) => (
          <FilterChip key={value} active={category === value} onClick={() => setCategory(value)}>
            {value}
          </FilterChip>
        ))}
      </div>

      {loading || !data ? (
        <div className="py-10 text-center text-sm text-lol-text">Loading…</div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
          {shown.map((a) => {
            const color = a.tier < 0 ? "#64748b" : TIERS[a.tier].color;
            return (
              <div key={a.key} className="app-tile flex min-w-0 gap-3 !p-4">
                <Emblem tier={a.tier} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-display text-[15px] font-bold text-lol-text-bright">
                      {a.name}
                    </span>
                    <span className="shrink-0 text-[11px] font-bold uppercase" style={{ color }}>
                      {a.tier < 0 ? "Locked" : TIERS[a.tier].name}
                    </span>
                  </div>
                  <div className="text-[12px] text-lol-text">{a.description}</div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, a.fraction * 100)}%`,
                        backgroundColor: a.next === undefined ? color : TIERS[a.tier + 1].color,
                      }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[11px] tabular-nums text-lol-text">
                    <span title={formatNumber(a.value)}>{compact.format(a.value)}</span>
                    <span>
                      {a.next === undefined
                        ? "Maxed"
                        : `${TIERS[a.tier + 1].name} at ${compact.format(a.next)}`}
                    </span>
                  </div>
                  <div className="mt-2 flex gap-1">
                    {a.steps.map((step, index) => (
                      <span
                        key={step}
                        title={`${TIERS[index].name}: ${formatNumber(step)}`}
                        className="h-1.5 flex-1 rounded-sm"
                        style={{
                          backgroundColor: TIERS[index].color,
                          opacity: index <= a.tier ? 1 : 0.18,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
