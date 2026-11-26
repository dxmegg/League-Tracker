import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { ItemData, OwnedItemStats, OwnedItemStatsResult } from "../lib/types";
import ItemIcon from "../components/ItemIcon";
import QueueSelect from "../components/QueueSelect";
import PatchSelect from "../components/PatchSelect";
import { CatalogPage, patchTrend, type CatalogRow } from "../components/CatalogPage";
import { useItemData, getItemName } from "../hooks/useChampions";
import { useActiveAccount } from "../hooks/useActiveAccount";
import { useScopedQueue } from "../lib/historyScope";
import { ALL_ACCOUNTS_SENTINEL } from "../lib/accountsEvent";
import { useViewState } from "../hooks/useViewState";
import { useIpc } from "../hooks/useIpc";
import { isAugmentQueue } from "../../shared/queues";
import { formatNumber } from "../lib/format";

type ItemClass = "All" | "AD" | "AP" | "Tank" | "Boots" | "Other";

function resultRows(result: (OwnedItemStatsResult & OwnedItemStats[]) | null): OwnedItemStats[] {
  return result?.rows ?? result ?? [];
}

// Explicit classes for the 30 most common completed items; unfamiliar items use the tooltip heuristic below.
const COMMON_ITEM_CLASSES: Record<string, Exclude<ItemClass, "All">> = {
  "Berserker's Greaves": "Boots",
  "Boots of Swiftness": "Boots",
  "Ionian Boots of Lucidity": "Boots",
  "Mercury's Treads": "Boots",
  "Plated Steelcaps": "Boots",
  "Sorcerer's Shoes": "Boots",
  "Synchronized Souls": "Boots",
  "Abyssal Mask": "Tank",
  "Dead Man's Plate": "Tank",
  "Force of Nature": "Tank",
  Heartsteel: "Tank",
  "Jak'Sho, The Protean": "Tank",
  "Randuin's Omen": "Tank",
  "Spirit Visage": "Tank",
  "Sunfire Aegis": "Tank",
  Thornmail: "Tank",
  "Unending Despair": "Tank",
  Bloodthirster: "AD",
  Eclipse: "AD",
  "Essence Reaver": "AD",
  "Infinity Edge": "AD",
  "Kraken Slayer": "AD",
  "Navori Flickerblade": "AD",
  "Ravenous Hydra": "AD",
  "Sterak's Gage": "AD",
  "Trinity Force": "AD",
  "Nashor's Tooth": "AP",
  "Rabadon's Deathcap": "AP",
  Riftmaker: "AP",
  "Void Staff": "AP",
};

function itemBranch(item: ItemData[number] | undefined): { label: ItemClass; color: string } {
  const name = item?.name ?? "";
  const knownClass = COMMON_ITEM_CLASSES[name];
  if (knownClass) {
    return {
      label: knownClass,
      color:
        knownClass === "Boots"
          ? "#C9A45C"
          : knownClass === "AP"
            ? "#3B82F6"
            : knownClass === "AD"
              ? "#E5483F"
              : "#22C55E",
    };
  }
  const text = `${item?.name ?? ""} ${item?.description ?? ""}`.toLowerCase();
  if (text.includes("boots") || text.includes("movement speed")) {
    return { label: "Boots", color: "#C9A45C" };
  }
  if (text.includes("ability power") || text.includes("spell damage")) {
    return { label: "AP", color: "#3B82F6" };
  }
  if (text.includes("attack damage") || text.includes("critical strike")) {
    return { label: "AD", color: "#E5483F" };
  }
  if (
    text.includes("health") ||
    text.includes("armor") ||
    text.includes("magic resist") ||
    text.includes("tenacity")
  ) {
    return { label: "Tank", color: "#22C55E" };
  }
  return { label: "Other", color: "#64748B" };
}

function formatBuyTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function Items() {
  const navigate = useNavigate();
  const [queue, setQueue] = useViewState<number | undefined>("items.queue", undefined);
  const [patch, setPatch] = useViewState<string | undefined>("items.patch", undefined);
  const scopedQueue = useScopedQueue(queue);
  const [activeAccountRaw] = useActiveAccount();
  const account = activeAccountRaw === ALL_ACCOUNTS_SENTINEL ? "all" : activeAccountRaw;
  const itemData = useItemData(patch);
  const { data: patchOptions } = useIpc<{ patches: string[] }>(
    () => window.api.getMatchFilterOptions(),
    [],
  );
  const { data: statsResult, loading } = useIpc<OwnedItemStatsResult & OwnedItemStats[]>(
    () => window.api.getOwnedItemStats(patch, scopedQueue, account),
    [patch, scopedQueue, account],
  );
  const patches = patchOptions?.patches ?? [];
  const currentPatch = patch ?? patches[0];
  const previousPatch =
    currentPatch == null ? undefined : patches[patches.indexOf(currentPatch) + 1];
  const { data: previousResult } = useIpc<(OwnedItemStatsResult & OwnedItemStats[]) | null>(
    () =>
      previousPatch
        ? window.api.getOwnedItemStats(previousPatch, scopedQueue, account)
        : Promise.resolve(null),
    [previousPatch, scopedQueue, account],
  );

  // With all patches selected the table is all-time, but the trend still compares two patches
  const { data: newestResult } = useIpc<(OwnedItemStatsResult & OwnedItemStats[]) | null>(
    () =>
      !patch && currentPatch
        ? window.api.getOwnedItemStats(currentPatch, scopedQueue, account)
        : Promise.resolve(null),
    [patch, currentPatch, scopedQueue, account],
  );

  const rows = useMemo<CatalogRow[]>(() => {
    const previous = new Map(resultRows(previousResult).map((row) => [row.item_id, row]));
    const newest = new Map(
      resultRows(patch ? statsResult : newestResult).map((row) => [row.item_id, row]),
    );
    return resultRows(statsResult).map((row) => {
      const branch = itemBranch(itemData[row.item_id]);
      const price = itemData[row.item_id]?.price;
      return {
        id: row.item_id,
        name: getItemName(itemData, row.item_id),
        group: branch.label,
        color: branch.color,
        games: row.picks,
        wins: row.wins,
        minor: row.isTrinket,
        trend: patchTrend(newest.get(row.item_id), previous.get(row.item_id)),
        icon: (size) => <ItemIcon itemId={row.item_id} size={size} patch={patch} />,
        extra: (
          <span className="tabular-nums">
            {row.avgBuyTimeMs != null && `${formatBuyTime(row.avgBuyTimeMs)} · `}
            {price ? `${formatNumber(price)} g` : "—"}
          </span>
        ),
      };
    });
  }, [statsResult, previousResult, newestResult, itemData, patch]);

  return (
    <CatalogPage
      title="Items"
      subtitle="What you build and how it performs"
      noun="items"
      extraLabel="Bought at · price"
      groups={["All", "AD", "AP", "Tank", "Boots", "Other"].map((value) => ({ value }))}
      rows={rows}
      loading={loading || !statsResult}
      onOpen={(id) => navigate(`/items/${id}`)}
      filters={
        <>
          <QueueSelect value={queue} onChange={setQueue} filter={(id) => !isAugmentQueue(id)} />
          <PatchSelect value={patch} onChange={setPatch} />
        </>
      }
    />
  );
}
