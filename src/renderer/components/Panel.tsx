import type { ReactNode } from "react";

type PanelVariant = "default" | "accent" | "muted" | "tile";

const PANEL_VARIANTS: Record<PanelVariant, string> = {
  default: "glass-card",
  accent:
    "glass-card border-t-[3px] border-t-[var(--theme-crimson)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-crimson)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]",
  muted: "border-lol-border/50 bg-black/25",
  // Same look as the stat tiles: colored top edge and a faint corner glow, on the page background
  tile: "rounded-2xl border-lol-border border-t-[3px]",
};

export function Panel({
  children,
  className = "",
  variant = "default",
  accent = "var(--color-lol-crimson)",
}: {
  children?: ReactNode;
  className?: string;
  variant?: PanelVariant;
  // Top-edge color of the tile variant, any CSS color
  accent?: string;
}) {
  return (
    <div
      className={`min-w-0 border p-5 ${variant === "tile" ? "" : "rounded-[14px]"} ${PANEL_VARIANTS[variant]} ${className}`}
      style={
        variant === "tile"
          ? {
              borderTopColor: accent,
              backgroundImage: `radial-gradient(circle at top right, color-mix(in srgb, ${accent} 9%, transparent), transparent 55%)`,
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
