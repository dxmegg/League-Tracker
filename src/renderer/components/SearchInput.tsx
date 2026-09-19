import type { InputHTMLAttributes } from "react";

export function SearchInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="text"
      {...props}
      className={`h-8 rounded-md border border-lol-border/50 bg-lol-card/40 px-2.5 text-xs font-bold tracking-wider text-lol-text placeholder:text-lol-text/60 transition-colors hover:border-lol-crimson/40 focus:border-lol-crimson/60 focus:bg-lol-crimson/10 focus:text-lol-text-bright focus:outline-none ${className}`}
    />
  );
}
