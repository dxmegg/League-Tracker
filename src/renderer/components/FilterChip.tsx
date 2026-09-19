import type { ReactNode } from "react";

export function FilterChip({
  active = false,
  onClick,
  children,
  icon,
  className = "",
  title,
  disabled = false,
}: {
  active?: boolean;
  onClick?: () => void;
  children?: ReactNode;
  icon?: ReactNode;
  className?: string;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-crimson/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-deep)] ${
        active
          ? "border-lol-crimson/60 bg-lol-crimson/20 text-lol-text-bright"
          : "border-lol-border/50 bg-lol-card/40 text-lol-text hover:border-lol-crimson/40 hover:text-lol-text-bright"
      } ${className}`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  );
}
