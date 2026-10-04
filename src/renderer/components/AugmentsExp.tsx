import { useMemo, useState } from "react";
import type { AugmentStatsDetailedResult } from "../lib/types";
import { useIpc } from "../hooks/useIpc";
import { useAugmentData, getAugmentName } from "../hooks/useChampions";
import AugmentIcon from "./AugmentIcon";
import { Tile } from "./Tile";
import { TileGrid } from "./TileGrid";
import { formatNumber } from "../lib/format";

type RarityFilter = "all" | "kSilver" | "kGold" | "kPrismatic";

const filters: { value: RarityFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "kSilver", label: "Silver" },
  { value: "kGold", label: "Gold" },
  { value: "kPrismatic", label: "Prismatic" },
];

function tierForRarity(rarity: string | undefined): "S" | "G" | "P" | undefined {
  if (rarity === "kSilver" || rarity?.toLowerCase() === "silver") return "S";
  if (rarity === "kGold" || rarity?.toLowerCase() === "gold") return "G";
  if (rarity === "kPrismatic" || rarity?.toLowerCase() === "prismatic") return "P";
  return undefined;
}

export function AugmentsExp() {
  const augmentData = useAugmentData();
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>("all");
  const { data, loading } = useIpc<AugmentStatsDetailedResult>(
    () => window.api.getAugmentStatsDetailed(),
    [],
  );

  const sorted = useMemo(() => {
    if (!data) return [];
    return data.augments
      .filter((row) => {
        const rarity = augmentData[row.augment_id]?.rarity;
        return rarityFilter === "all" || rarity === rarityFilter;
      })
      .sort((a, b) => b.picks - a.picks);
  }, [augmentData, data, rarityFilter]);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
      <div>
        <h1 className="font-display text-[30px] font-bold leading-tight tracking-[0.2px] text-lol-text-bright">
          Augments
        </h1>
        <p className="mt-1.5 text-lol-text">Pick rate and win rate in ARAM Mayhem and Arena</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {filters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setRarityFilter(filter.value)}
            className={`rounded-lg border px-4 py-2 text-[13px] font-semibold transition-colors ${
              rarityFilter === filter.value
                ? "border-lol-crimson/60 bg-lol-crimson/20 text-lol-text-bright"
                : "border-lol-border bg-lol-card text-lol-text hover:border-lol-crimson/40 hover:text-lol-text-bright"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="min-w-0 rounded-[14px] border border-lol-border bg-[linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] p-5">
        {loading || !data ? (
          <div className="py-8 text-center text-sm text-lol-text">Loading…</div>
        ) : sorted.length === 0 ? (
          <div className="py-8 text-center text-sm text-lol-text">No augments played yet.</div>
        ) : (
          <TileGrid>
            {sorted.map((row) => {
              const winRate = row.picks > 0 ? (row.wins / row.picks) * 100 : 0;
              const rarity = augmentData[row.augment_id]?.rarity;
              return (
                <Tile
                  key={row.augment_id}
                  icon={<AugmentIcon augmentId={row.augment_id} />}
                  title={getAugmentName(augmentData, row.augment_id)}
                  subtitle={`${formatNumber(row.picks)} picks · ${winRate.toFixed(1)}% win`}
                  trackValue={winRate}
                  tier={tierForRarity(rarity)}
                />
              );
            })}
          </TileGrid>
        )}
      </div>
    </div>
  );
}
