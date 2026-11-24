import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
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
  return (
    <Avatar
      style={{ width: size, height: size }}
      className={cn("rounded-full", className)}
      title={title}
    >
      {iconId != null && <AvatarImage src={PROFILE_ICON_URL(iconId)} alt="" />}
      <AvatarFallback className="bg-lol-border/60" />
    </Avatar>
  );
}
