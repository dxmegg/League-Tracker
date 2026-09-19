import type { ReactNode } from "react";

export function HomeCard({
  children,
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] shadow-[0_0_4px_rgba(150,30,30,0.35),0_0_12px_rgba(90,15,15,0.20)] ring-1 ring-inset ring-white/[0.03] ${className}`}
    >
      {children}
    </div>
  );
}
