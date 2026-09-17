import type { ReactNode } from "react";

export type StatAccent = "gold" | "win" | "sky" | "purple";

// A soft corner glow and a tinted icon chip, so a row of cards reads as
// distinct tiles rather than one flat block. Exported so the Records page can
// build its clickable cards out of the same palette.
export const ACCENTS: Record<StatAccent, { glow: string; chip: string }> = {
  gold: {
    glow: "bg-lol-gold/[0.07]",
    chip: "bg-lol-gold/10 text-lol-gold",
  },
  win: {
    glow: "bg-lol-win/[0.07]",
    chip: "bg-lol-win/10 text-lol-win",
  },
  sky: {
    glow: "bg-sky-400/[0.07]",
    chip: "bg-sky-400/10 text-sky-400",
  },
  purple: {
    glow: "bg-purple-400/[0.07]",
    chip: "bg-purple-400/10 text-purple-400",
  },
};

interface StatCardProps {
  label: string;
  value?: ReactNode;
  subtext?: ReactNode;
  icon?: ReactNode;
  accent?: StatAccent;
  className?: string;
  // Footer content — rendered below the main card content
  children?: ReactNode;
}

export default function StatCard({
  label,
  value,
  subtext,
  icon,
  accent,
  className = "",
  children,
}: StatCardProps) {
  const a = accent ? ACCENTS[accent] : null;

  return (
    <div className={`noxus-card flex flex-col p-5 xl:p-6 2xl:p-7 ${className}`}>
      <div className="flex flex-col h-full justify-center gap-2 min-h-0">
        <div className="relative flex items-center gap-1.5 mb-1">
          {icon && a && (
            <span className={`flex h-5 w-5 2xl:h-6 2xl:w-6 items-center justify-center rounded-md ${a.chip}`}>
              {icon}
            </span>
          )}
          <span className="text-[10px] xl:text-[11px] 2xl:text-xs font-bold tracking-wider text-lol-text uppercase">
            {label}
          </span>
        </div>
        {value !== undefined && (
          <div className="relative flex items-center min-w-0 mt-1 text-2xl xl:text-[26px] 2xl:text-3xl font-bold text-lol-text-bright leading-none">
            {value}
          </div>
        )}
        {subtext && (
          <div className="relative text-xs xl:text-[13px] 2xl:text-sm text-lol-text mt-0.5">
            {subtext}
          </div>
        )}
        {children && <div className="relative mt-0">{children}</div>}
      </div>
    </div>
  );
}
