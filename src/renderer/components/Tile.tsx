import type { ReactNode } from "react";

export function Tile({
  icon,
  title,
  subtitle,
  tier,
  trackValue,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  tier?: "S" | "G" | "P";
  trackValue?: number;
  onClick?: () => void;
}) {
  const content = (
    <>
      {tier && (
        <span className={`tier ${tier}`}>
          {tier === "S" ? "SILVER" : tier === "G" ? "GOLD" : "PRISMATIC"}
        </span>
      )}
      {icon}
      <b>{title}</b>
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
        className="tile cursor-pointer text-left transition-colors hover:border-lol-crimson/40"
      >
        {content}
      </button>
    );
  }
  return <div className="tile">{content}</div>;
}
