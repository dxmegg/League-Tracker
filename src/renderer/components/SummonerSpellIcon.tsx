import { useState } from "react";
import { useSummonerSpellData } from "../hooks/useChampions";
import { CDRAGON_ASSET_URL } from "../lib/constants";

interface SummonerSpellIconProps {
  spellId: number | null;
  size?: number;
  className?: string;
}

export default function SummonerSpellIcon({ spellId, size = 16, className = "rounded" }: SummonerSpellIconProps) {
  const spells = useSummonerSpellData();
  const [broken, setBroken] = useState(false);
  const spell = spellId != null && spellId > 0 ? spells[spellId] : undefined;

  if (spellId && !spell?.iconPath) {
    console.log("[spell] unresolved id", spellId, "cache size", Object.keys(spells).length);
  }
  if (!spell?.iconPath) return null;
  if (broken) return null;

  return (
    <img
      src={CDRAGON_ASSET_URL("latest", spell.iconPath)}
      alt=""
      title={spell.name}
      width={size}
      height={size}
      className={className}
      onError={() => setBroken(true)}
    />
  );
}
