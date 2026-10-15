import { useState } from "react";
import { PROFILE_ICON_URL } from "../lib/constants";

interface SummonerIconProps {
  iconId: number | null;
  size?: number;
  className?: string;
  title?: string;
}

// Profile icons only exist for players we've seen a profileIcon for, and the
// CDN drops very old ones — fall back to a neutral placeholder either way so
// the column keeps its width.
export default function SummonerIcon({
  iconId,
  size = 28,
  className = "",
  title,
}: SummonerIconProps) {
  const [failed, setFailed] = useState(false);

  if (iconId == null || failed) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`rounded-full bg-lol-border/60 shrink-0 ${className}`}
        title={title}
      />
    );
  }

  return (
    <img
      src={PROFILE_ICON_URL(iconId)}
      alt=""
      width={size}
      height={size}
      className={`rounded-full shrink-0 ${className}`}
      title={title}
      onError={() => setFailed(true)}
    />
  );
}
