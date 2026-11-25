import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { AugmentStatsDetailedResult } from "../lib/types";
import { useIpc } from "../hooks/useIpc";
import { useActiveAccount } from "../hooks/useActiveAccount";
import { useAugmentData, getAugmentName } from "../hooks/useChampions";
import { useScopedQueue } from "../lib/historyScope";
import { useActiveMode } from "../hooks/useActiveMode";
import { useViewState } from "../hooks/useViewState";
import AugmentIcon from "./AugmentIcon";
import ChampionIcon from "./ChampionIcon";
import QueueSelect from "./QueueSelect";
import PatchSelect from "./PatchSelect";
import { CatalogPage, patchTrend, type CatalogRow } from "./CatalogPage";
import { ALL_ACCOUNTS_SENTINEL } from "../lib/accountsEvent";
import { isAugmentQueue } from "../../shared/queues";

const RARITIES = [
  { key: "kSilver", label: "Silver", color: "#B8B8C4" },
  { key: "kGold", label: "Gold", color: "#E0B65C" },
  { key: "kPrismatic", label: "Prismatic", color: "#B07CFF" },
] as const;

export function rarityOf(rarity: string | undefined) {
  return RARITIES.find((r) => r.key === rarity || r.label.toLowerCase() === rarity?.toLowerCase());
}

export function AugmentsExp() {
  const navigate = useNavigate();
  const [patch, setPatch] = useViewState<string | undefined>("augments.patch", undefined);
  const [queue, setQueue] = useViewState<number | undefined>("augments.queue", undefined);
  const scopedQueue = useScopedQueue(queue);
  const [dataMode] = useActiveMode();
  const [activeAccountRaw] = useActiveAccount();
  const account = activeAccountRaw === ALL_ACCOUNTS_SENTINEL ? "all" : activeAccountRaw;
  const augmentData = useAugmentData(patch);
  const { data, loading } = useIpc<AugmentStatsDetailedResult>(
    () => window.api.getAugmentStatsDetailed(patch, scopedQueue, account),
    [patch, scopedQueue, account],
  );
  const { data: patchOptions } = useIpc<{ patches: string[] }>(
    () => window.api.getMatchFilterOptions(),
    [],
  );
  const patches = patchOptions?.patches ?? [];
  const currentPatch = patch ?? patches[0];
  const previousPatch =
    currentPatch == null ? undefined : patches[patches.indexOf(currentPatch) + 1];
  const { data: previousData } = useIpc<AugmentStatsDetailedResult | null>(
    () =>
      previousPatch
        ? window.api.getAugmentStatsDetailed(previousPatch, scopedQueue, account)
        : Promise.resolve(null),
    [previousPatch, scopedQueue, account],
  );

  // With all patches selected the table is all-time, but the trend still compares two patches
  const { data: newestData } = useIpc<AugmentStatsDetailedResult | null>(
    () =>
      !patch && currentPatch
        ? window.api.getAugmentStatsDetailed(currentPatch, scopedQueue, account)
        : Promise.resolve(null),
    [patch, currentPatch, scopedQueue, account],
  );

  const rows = useMemo<CatalogRow[]>(() => {
    const previous = new Map(previousData?.augments.map((row) => [row.augment_id, row]));
    const newest = new Map(
      (patch ? data : newestData)?.augments.map((row) => [row.augment_id, row]),
    );
    return (data?.augments ?? []).map((row) => {
      const rarity = rarityOf(augmentData[row.augment_id]?.rarity);
      return {
        id: row.augment_id,
        name: getAugmentName(augmentData, row.augment_id),
        group: rarity?.label ?? "Unknown",
        color: rarity?.color ?? "#64748B",
        games: row.picks,
        wins: row.wins,
        trend: patchTrend(newest.get(row.augment_id), previous.get(row.augment_id)),
        icon: (size) => <AugmentIcon augmentId={row.augment_id} size={size} patch={patch} />,
        extra: row.champions
          .slice(0, 5)
          .map((champion) => (
            <ChampionIcon
              key={champion.champion_id}
              championId={champion.champion_id}
              size={24}
              className="rounded-md"
            />
          )),
      };
    });
  }, [data, previousData, newestData, augmentData, patch]);

  return (
    <CatalogPage
      title="Augments"
      subtitle={dataMode === "mayhem" ? "ARAM Mayhem" : "ARAM Mayhem and Arena"}
      noun="augments"
      extraLabel="Mostly on"
      groups={[{ value: "All" }, ...RARITIES.map((r) => ({ value: r.label, color: r.color }))]}
      rows={rows}
      loading={loading || !data}
      onOpen={(id) => navigate(`/augments/${id}`)}
      filters={
        <>
          <QueueSelect value={queue} onChange={setQueue} filter={(id) => isAugmentQueue(id)} />
          <PatchSelect value={patch} onChange={setPatch} />
        </>
      }
    />
  );
}
