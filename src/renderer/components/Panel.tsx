import type { ReactNode } from "react";

type PanelVariant = "default" | "accent" | "muted";

const PANEL_VARIANTS: Record<PanelVariant, string> = {
  default: "border-lol-border bg-[var(--theme-card)]",
  accent:
    "border-t-[3px] border-t-[var(--theme-crimson)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-crimson)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]",
  muted: "border-lol-border/70 bg-[color-mix(in_oklab,var(--theme-card)_92%,black)]",
};

export function Panel({
  children,
  className = "",
  variant = "default",
}: {
  children?: ReactNode;
  className?: string;
  variant?: PanelVariant;
}) {
  return (
    <div className={`min-w-0 rounded-[14px] border p-5 ${PANEL_VARIANTS[variant]} ${className}`}>
      {children}
    </div>
  );
}
