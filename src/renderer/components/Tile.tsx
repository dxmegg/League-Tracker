import type { CSSProperties, ReactNode } from "react";

export function Tile({
  icon,
  title,
  subtitle,
  tier,
  trackValue,
  onClick,
  accent,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  tier?: "S" | "G" | "P";
  trackValue?: number;
  onClick?: () => void;
  accent?: string;
}) {
  const tileAccent =
    accent ??
    (tier === "S" ? "#B8B8C4" : tier === "G" ? "#C9A45C" : tier === "P" ? "#A855F7" : "#E5483F");
  const content = (
    <>
      {tier && (
        <span className={`tier ${tier}`}>
          {tier === "S" ? "SILVER" : tier === "G" ? "GOLD" : "PRISMATIC"}
        </span>
      )}
      <span className="tile-icon">{icon}</span>
      <b>
        <span className="tile-dot" aria-hidden="true" />
        {title}
      </b>
      <small>{subtitle}</small>
      {trackValue != null && (
        <div className="h-[5px] overflow-hidden rounded-full bg-white/[0.05]">
          <i
            className={`block h-full rounded-full ${trackValue < 50 ? "bg-lol-loss" : "bg-lol-win"}`}
            style={{ width: `${Math.max(0, Math.min(100, trackValue))}%` }}
          />
        </div>
      )}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="tile cursor-pointer text-left transition-[background-color,border-color,box-shadow] duration-120 hover:border-lol-crimson/40"
        style={{ "--tile-accent": tileAccent } as CSSProperties}
      >
        {content}
      </button>
    );
  }
  return (
    <div
      className="tile transition-[background-color,border-color,box-shadow] duration-120 hover:border-lol-crimson/40"
      style={{ "--tile-accent": tileAccent } as CSSProperties}
    >
      {content}
    </div>
  );
}
