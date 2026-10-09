import { useEffect, useMemo, useState } from "react";
import { useAugmentData } from "../hooks/useChampions";
import { CDRAGON_ASSET_URL } from "../lib/constants";
import HoverCard from "./HoverCard";
import RiotText from "./RiotText";

interface AugmentIconProps {
  augmentId: number;
  size?: number;
  showName?: boolean;
  patch?: string | null;
}

const rarityBorder: Record<string, string> = {
  kSilver: "ring-1 ring-lol-border/60",
  kGold: "ring-1 ring-yellow-500/70",
  kPrismatic: "ring-1 ring-fuchsia-400/80",
};

const rarityTextColor: Record<string, string> = {
  kSilver: "text-lol-text",
  kGold: "text-yellow-400",
  kPrismatic: "text-fuchsia-400",
};

const fallbackLookups = new Map<number, Promise<string | null>>();
const fallbackResults = new Map<number, string | null>();

function lookupFallbackIcon(augmentId: number, patch?: string | null): Promise<string | null> {
  let promise = fallbackLookups.get(augmentId);
  if (!promise) {
    promise = window.api.resolveAugmentIcon(augmentId, patch ?? undefined);
    fallbackLookups.set(augmentId, promise);
    promise.then(
      (url) => fallbackResults.set(augmentId, url),
      () => fallbackLookups.delete(augmentId),
    );
  }
  return promise;
}

export function getAugmentRarityLabel(rarity: string): string {
  if (rarity === "kSilver") return "Silver";
  if (rarity === "kGold") return "Gold";
  if (rarity === "kPrismatic") return "Prismatic";
  return "";
}

export default function AugmentIcon({
  augmentId,
  size = 28,
  showName = false,
  patch,
}: AugmentIconProps) {
  const augmentData = useAugmentData(patch);
  const aug = augmentData[augmentId];
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const sources = useMemo(() => {
    if (!aug?.iconPath) return [];
    // Paths are only valid against the branch they were read from, and the
    // data names the small art with the large variant beside it under the
    // same name.
    const branch = aug.branch || "latest";
    const large = CDRAGON_ASSET_URL(branch, aug.iconPath.replace("small", "large"));
    const small = CDRAGON_ASSET_URL(branch, aug.iconPath);
    return [...new Set([large, small])];
  }, [aug?.iconPath, aug?.branch]);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setLoading(sources.length > 0);

    void (async () => {
      for (const candidate of sources) {
        const cached = await window.api.cacheDragonAsset(candidate);
        if (cached) {
          if (!cancelled) setSrc(cached);
          if (!cancelled) setLoading(false);
          return;
        }
      }

      const fallbackUrl =
        fallbackResults.get(augmentId) ?? (await lookupFallbackIcon(augmentId, patch));
      if (fallbackUrl) {
        const cached = await window.api.cacheDragonAsset(fallbackUrl);
        if (cached && !cancelled) setSrc(cached);
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [augmentId, patch, sources]);

  const name = aug?.name || `Augment ${augmentId}`;
  const borderClass = rarityBorder[aug?.rarity ?? ""] || "";
  const nameColor = rarityTextColor[aug?.rarity ?? ""] || "text-lol-text-bright";

  const rarityLabel = getAugmentRarityLabel(aug?.rarity ?? "");

  return (
    <HoverCard
      content={
        aug ? (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className={`font-semibold ${nameColor}`}>{name}</span>
              {rarityLabel && (
                <span className={`shrink-0 text-[10px] uppercase tracking-wide ${nameColor}`}>
                  {rarityLabel}
                </span>
              )}
            </div>
            {aug.desc ? (
              <RiotText markup={aug.desc} />
            ) : (
              // Two Mayhem augments have no entry in the game data the
              // generator reads, and retired ones can outlive it.
              <span className="italic text-lol-text/50">No description available.</span>
            )}
          </>
        ) : null
      }
    >
      {/* The native tooltip stays for the moment before augment data lands. */}
      <div className="flex items-center gap-1.5 min-w-0" title={aug ? undefined : name}>
        {!loading && src ? (
          <img
            src={src}
            alt={name}
            width={size}
            height={size}
            className={`rounded shrink-0 ${borderClass}`}
          />
        ) : (
          // Keeps the rarity ring and the hover tooltip so an augment with no art
          // anywhere still reads as an augment rather than a gap in the row.
          <div
            className={`rounded shrink-0 bg-white/5 border border-white/10 ${borderClass}`}
            style={{ width: size, height: size }}
          />
        )}
        {showName && <span className={`text-xs truncate ${nameColor}`}>{name}</span>}
      </div>
    </HoverCard>
  );
}
