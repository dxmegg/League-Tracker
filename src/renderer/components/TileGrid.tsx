import type { ReactNode } from "react";

export function TileGrid({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`tiles ${className}`}>{children}</div>;
}
