import type { ReactNode } from "react";

export function Panel({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <div
      className={`min-w-0 rounded-[14px] border border-lol-border bg-[linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] p-5 ${className}`}
    >
      {children}
    </div>
  );
}
