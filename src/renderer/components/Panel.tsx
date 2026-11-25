import type { ReactNode } from "react";

type PanelVariant = "default" | "accent" | "muted" | "tile" | "featured";

const PANEL_VARIANTS: Record<PanelVariant, string> = {
  default: "glass-card",
  accent:
    "glass-card border-t-[3px] border-t-[var(--theme-crimson)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-crimson)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]",
  muted: "border-lol-border/50 bg-black/25",
  // The shared tile style, defined once in global.css (.app-tile)
  tile: "app-tile",
  featured: "app-tile app-tile-featured",
};

export function Panel({
  children,
  className = "",
  variant = "default",
}: {
  children?: ReactNode;
  className?: string;
  variant?: PanelVariant;
  // Kept so existing call sites compile; tiles no longer have a coloured edge
  accent?: string;
}) {
  return (
    <div
      className={`min-w-0 border ${variant === "tile" || variant === "featured" ? "" : "rounded-[14px] p-5"} ${PANEL_VARIANTS[variant]} ${className}`}
    >
      {children}
    </div>
  );
}
