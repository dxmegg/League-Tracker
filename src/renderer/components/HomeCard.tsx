import type { ReactNode } from "react";

export function HomeCard({
  children,
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  return <div className={`relative glass-card rounded-2xl ${className}`}>{children}</div>;
}
