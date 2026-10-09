import { useState, useEffect, useMemo } from "react";
import { useItemData } from "../hooks/useChampions";
import { CDRAGON_ASSET_URL } from "../lib/constants";
import HoverCard from "./HoverCard";
import RiotText from "./RiotText";

interface ItemIconProps {
  itemId: number;
  size?: number;
  patch?: string | null;
}

// Some Mayhem item icons carry a texture-variant suffix that CommunityDragon
// doesn't export (e.g. "3153_Blade_of_the_Ruined_King.project_jade.png" 404s
// while "3153_Blade_of_the_Ruined_King.png" exists), so keep the base path as
// a fallback.
function stripIconVariant(iconPath: string): string | null {
  const stripped = iconPath.replace(/\.[^./]+(\.\w+)$/, "$1");
  return stripped === iconPath ? null : stripped;
}

export default function ItemIcon({ itemId, size = 24, patch }: ItemIconProps) {
  const items = useItemData(patch);
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const item = items[itemId];
  const sources = useMemo(() => {
    const urls: string[] = [];
    if (item?.iconPath) {
      if (item.iconPath.startsWith("http://") || item.iconPath.startsWith("https://")) {
        urls.push(item.iconPath);
      } else {
        urls.push(CDRAGON_ASSET_URL(item.branch, item.iconPath));
        const base = stripIconVariant(item.iconPath);
        if (base) urls.push(CDRAGON_ASSET_URL(item.branch, base));
      }
    }
    return urls;
  }, [item?.iconPath, item?.branch]);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setLoading(itemId > 0);

    if (!itemId || itemId === 0) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const candidates = [...sources];
      const isAbsolute =
        item?.iconPath?.startsWith("http://") || item?.iconPath?.startsWith("https://");
      if (!isAbsolute) {
        const version = await window.api.getChampionDataVersion();
        if (!cancelled && version && version !== "none") {
          candidates.push(
            `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${itemId}.png`,
          );
        }
      }

      for (const candidate of candidates) {
        const cached = await window.api.cacheDragonAsset(candidate);
        if (cached) {
          if (!cancelled) setSrc(cached);
          break;
        }
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [item?.iconPath, itemId, sources]);

  if (loading || !src) {
    return (
      <div
        className="rounded bg-white/5 border border-white/10"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <HoverCard
      content={
        item?.name ? (
          <>
            <div className="mb-1 font-semibold text-lol-gold-light">{item.name}</div>
            <RiotText markup={item.description} />
          </>
        ) : null
      }
    >
      <img
        src={src}
        alt=""
        // No title= — the browser's own tooltip would surface a second later
        // and sit on top of the card showing the same name.
        width={size}
        height={size}
        className="rounded"
      />
    </HoverCard>
  );
}
