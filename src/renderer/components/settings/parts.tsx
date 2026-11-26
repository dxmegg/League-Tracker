import SummonerIcon from "../SummonerIcon";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Title } from "../live/shared";
import { XIcon } from "../icons";

export function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1_000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "subtle" | "neutral" | "destructive";
  children: ReactNode;
};

export function Button({ variant = "primary", children, className = "", ...props }: ButtonProps) {
  const variantClasses = {
    primary: "border-lol-crimson/70 bg-lol-crimson/25 text-lol-text-bright hover:bg-lol-crimson/45",
    secondary:
      "border-lol-border/70 bg-lol-card/60 text-lol-text-bright hover:border-lol-crimson/60",
    subtle:
      "border-lol-border/50 bg-lol-card/40 text-lol-text hover:border-lol-crimson/50 hover:text-lol-text-bright",
    neutral:
      "border-lol-border/50 bg-lol-card/40 text-lol-text hover:border-lol-crimson/50 hover:text-lol-text-bright",
    destructive: "border-lol-loss/50 bg-lol-loss/10 text-lol-loss hover:bg-lol-loss/20",
  };

  return (
    <button
      {...props}
      className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-3.5 text-xs font-bold uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-crimson/60 ${variantClasses[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export const INPUT_CLASS =
  "h-9 rounded-lg border border-lol-border/60 bg-black/30 px-3 text-[13px] text-lol-text-bright outline-none transition-colors hover:border-lol-crimson/40 focus:border-lol-crimson/70";

// One account in either list: picture, name, a line under it and its controls
export function AccountCard({
  icon,
  name,
  detail,
  dimmed = false,
  children,
}: {
  icon: number | null;
  name: string;
  detail: ReactNode;
  dimmed?: boolean;
  children: ReactNode;
}) {
  const [game, tag] = name.split("#");
  return (
    <div className="group flex min-w-0 items-center gap-3 rounded-xl border border-lol-border/50 bg-black/25 px-3 py-2.5 transition-colors hover:border-lol-crimson/50 hover:bg-white/[0.04]">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-lol-crimson/50 bg-lol-card ${dimmed ? "opacity-40 grayscale" : ""}`}
      >
        {icon == null ? (
          <span className="font-display text-[13px] font-bold text-lol-text">
            {game.slice(0, 2).toUpperCase()}
          </span>
        ) : (
          <SummonerIcon iconId={icon} size={40} />
        )}
      </span>
      <div className={`min-w-0 flex-1 ${dimmed ? "opacity-50" : ""}`}>
        <p
          className="truncate font-display text-[14px] font-bold text-lol-text-bright"
          title={name}
        >
          {game}
          {tag && <span className="ml-1 text-[12px] font-medium text-lol-text">#{tag}</span>}
        </p>
        <p className="flex items-center gap-2 text-[11px] text-lol-text">{detail}</p>
      </div>
      {children}
    </div>
  );
}

export function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-lol-text/60 transition-colors hover:bg-lol-loss/15 hover:text-lol-loss focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-loss/60"
    >
      <XIcon className="h-3.5 w-3.5" />
    </button>
  );
}

export function Switch({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label?: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-crimson/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-deep)] ${
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"
      } ${checked ? "bg-lol-crimson shadow-[0_0_10px_var(--theme-crimson-glow)]" : "bg-white/10"}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full transform transition-transform duration-200 ${
          checked ? "bg-white shadow-sm" : "bg-lol-text shadow"
        } ${checked ? "translate-x-5" : "translate-x-0"}`}
      />
    </button>
  );
}

export function Section({
  title,
  children,
  className = "",
  action,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section className={`app-tile min-w-0 ${className}`}>
      <Title aside={action}>{title}</Title>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

// One thing you can run: what it does on the left, its button on the right
export function ActionRow({
  name,
  description,
  children,
}: {
  name: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-lol-border/50 bg-black/25 px-4 py-3 transition-colors hover:border-lol-crimson/40">
      <div className="min-w-0">
        <p className="font-display text-[14px] font-bold text-lol-text-bright">{name}</p>
        <p className="text-[12px] text-lol-text">{description}</p>
      </div>
      <div className="flex shrink-0 gap-2">{children}</div>
    </div>
  );
}
