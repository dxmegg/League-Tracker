import type { ReactNode } from "react";
import { NoxianHerald } from "./NoxianHerald";

export function SectionChrome({
  title,
  scope,
  children,
}: {
  title: string;
  scope?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center gap-3">
        <NoxianHerald className="h-5 w-5 text-lol-gold shrink-0" />
        <h1 className="text-sm font-bold uppercase tracking-widest text-lol-text-bright">{title}</h1>
        {scope && (
          <span className="rounded-md border border-lol-border/50 bg-lol-card/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-lol-text">
            {scope}
          </span>
        )}
        <div className="flex-1 h-0.5 bg-gradient-to-r from-lol-gold/20 via-lol-gold/10 to-transparent" />
      </header>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}
