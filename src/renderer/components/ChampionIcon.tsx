import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useAltPortraits } from "../hooks/useAltPortraits";
import { CHAMPION_ICON_URL } from "../lib/constants";
import { usesAltPortrait } from "../lib/portraits";
import altPortrait from "./ui/avatar-fallback.gif";

interface ChampionIconProps {
  championId: number;
  size?: number;
  className?: string;
}

export default function ChampionIcon({ championId, size = 32, className = "" }: ChampionIconProps) {
  const [alt] = useAltPortraits();

  return (
    <Avatar style={{ width: size, height: size }} className={cn("rounded-full", className)}>
      <AvatarImage
        src={usesAltPortrait(championId, alt) ? altPortrait : CHAMPION_ICON_URL(championId)}
        alt=""
      />
      {/* Empty on purpose: a missing icon keeps its slot instead of collapsing the row */}
      <AvatarFallback />
    </Avatar>
  );
}
