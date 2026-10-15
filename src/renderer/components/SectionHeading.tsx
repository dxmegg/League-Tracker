import type { ReactNode } from "react";

export function SectionHeading({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-lol-gold">
        <span className="h-2 w-2 rotate-45 bg-lol-crimson" aria-hidden="true" />
        {title}
      </h2>
      {aside}
    </div>
  );
}
