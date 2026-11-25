import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { ItemData, OwnedItemStats, OwnedItemStatsResult } from "../lib/types";
import ItemIcon from "./ItemIcon";
import QueueSelect from "./QueueSelect";
import PatchSelect from "./PatchSelect";
import { useItemData, getItemName } from "../hooks/useChampions";
import { useActiveAccount } from "../hooks/useActiveAccount";
import { useScopedQueue } from "../lib/historyScope";
import { ALL_ACCOUNTS_SENTINEL } from "../lib/accountsEvent";
import { useViewState } from "../hooks/useViewState";
import { useIpc } from "../hooks/useIpc";
import { isAugmentQueue } from "../../shared/queues";
import { formatNumber } from "../lib/format";
import { FilterChip } from "./FilterChip";
import { SearchInput } from "./SearchInput";
import { HeroTile, HighlightTile, PageHero } from "./SplashHero";
import { Title } from "./live/shared";

type SortMode = "most-built" | "best-wr" | "vs-average" | "best-score" | "rising";
type ItemClass = "All" | "AD" | "AP" | "Tank" | "Boots" | "Other";
type ViewMode = "cards" | "table";

function resultRows(result: (OwnedItemStatsResult & OwnedItemStats[]) | null): OwnedItemStats[] {
  return result?.rows ?? result ?? [];
}

function resultTotalBuilds(
  result: (OwnedItemStatsResult & OwnedItemStats[]) | null,
  rows: OwnedItemStats[],
): number {
  return (
    result?.totalBuilds ??
    rows[0]?.scopeTotalBuilds ??
    rows.reduce((sum, row) => sum + row.picks, 0)
  );
}

function resultWinRate(
  result: (OwnedItemStatsResult & OwnedItemStats[]) | null,
  rows: OwnedItemStats[],
): number {
  return (
    result?.avgWinRate ??
    rows[0]?.scopeAvgWinRate ??
    (() => {
      const builds = rows.reduce((sum, row) => sum + row.picks, 0);
      return builds > 0 ? (rows.reduce((sum, row) => sum + row.wins, 0) / builds) * 100 : 0;
    })()
  );
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

function CardStat({
  label,
  value,
  className = "text-lol-text-bright",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="rounded-lg bg-black/30 px-1 py-1.5">
      <div className="text-[9.5px] font-bold uppercase tracking-widest text-lol-text/80">
        {label}
      </div>
      <div className={`font-display text-[16px] font-bold tabular-nums ${className}`}>{value}</div>
    </div>
  );
}

export function ItemsExp() {
  const navigate = useNavigate();
  const { scope } = useParams<{ scope?: string }>();
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
  const rows = resultRows(statsResult);
  const totalBuilds = resultTotalBuilds(statsResult, rows);
  const avgWinRate = resultWinRate(statsResult, rows);
  const totalGames = statsResult?.totalGames ?? rows[0]?.scopeTotalGames ?? 0;
  const patches = patchOptions?.patches ?? [];
  const currentPatch = patch ?? patches[0];
  const previousPatch =
    currentPatch == null ? undefined : patches[patches.indexOf(currentPatch) + 1];
  const [loadRisingData, setLoadRisingData] = useState(false);
  useEffect(() => {
    if (statsResult) setLoadRisingData(true);
  }, [statsResult]);
  const { data: previousPatchResult } = useIpc<(OwnedItemStatsResult & OwnedItemStats[]) | null>(
    () =>
      loadRisingData && previousPatch
        ? window.api.getOwnedItemStats(previousPatch, scopedQueue, account)
        : Promise.resolve(null),
    [loadRisingData, previousPatch, scopedQueue, account],
  );
  const [sortMode, setSortMode] = useState<SortMode>("most-built");
  const [itemClass, setItemClass] = useState<ItemClass>("All");
  const [minGames, setMinGames] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [search, setSearch] = useState("");

  const risingDeltaByItem = useMemo(() => {
    const previousByItem = new Map(
      resultRows(previousPatchResult).map((row) => [row.item_id, row]),
    );
    return new Map(
      rows
        .map((row) => {
          const previous = previousByItem.get(row.item_id);
          return previous
            ? [
                row.item_id,
                (row.wins / Math.max(row.picks, 1) - previous.wins / Math.max(previous.picks, 1)) *
                  100,
              ]
            : null;
        })
        .filter((entry): entry is [number, number] => entry !== null),
    );
  }, [previousPatchResult, rows]);

  const visibleRows = useMemo(
    () =>
      rows.filter((row) => {
        const branch = itemBranch(itemData[row.item_id]);
        return (
          (itemClass === "All" || branch.label === itemClass) &&
          row.picks >= minGames &&
          getItemName(itemData, row.item_id).toLowerCase().includes(search.toLowerCase())
        );
      }),
    [itemClass, itemData, minGames, rows, search],
  );

  const sorted = useMemo(() => {
    const copy = [...visibleRows];
    copy.sort((a, b) => {
      if (a.isTrinket !== b.isTrinket) {
        return a.isTrinket ? 1 : -1;
      }
      const wrA = a.picks > 0 ? (a.wins / a.picks) * 100 : 0;
      const wrB = b.picks > 0 ? (b.wins / b.picks) * 100 : 0;
      const deltaA = wrA - avgWinRate;
      const deltaB = wrB - avgWinRate;
      const scoreA = deltaA * Math.log10(Math.max(a.picks, 1));
      const scoreB = deltaB * Math.log10(Math.max(b.picks, 1));
      const risingA = risingDeltaByItem.get(a.item_id);
      const risingB = risingDeltaByItem.get(b.item_id);
      const result =
        sortMode === "most-built"
          ? b.picks - a.picks
          : sortMode === "best-wr"
            ? wrB - wrA
            : sortMode === "vs-average"
              ? deltaB - deltaA
              : sortMode === "best-score"
                ? scoreB - scoreA
                : (risingB == null ? -Infinity : risingB) - (risingA == null ? -Infinity : risingA);
      return result || b.picks - a.picks;
    });
    return copy;
  }, [avgWinRate, risingDeltaByItem, sortMode, visibleRows]);

  const highlights = useMemo(() => {
    const mostBuilt = rows
      .filter((row) => !row.isTrinket)
      .reduce<OwnedItemStats | null>(
        (best, row) => (!best || row.picks > best.picks ? row : best),
        null,
      );
    const bestWinRate =
      rows
        .filter((row) => row.picks >= 25)
        .sort((a, b) => b.wins / b.picks - a.wins / a.picks || b.picks - a.picks)[0] ?? null;
    const hiddenGem =
      rows
        .filter((row) => row.picks >= 25 && row.picks <= 100 && row.wins / row.picks >= 0.7)
        .sort((a, b) => b.wins / b.picks - a.wins / a.picks)[0] ?? null;
    const currentRows = rows;
    const previousRows = resultRows(previousPatchResult);
    const previousByItem = new Map(previousRows.map((row) => [row.item_id, row]));
    const comparable = currentRows
      .map((row) => {
        const previous = previousByItem.get(row.item_id);
        return previous
          ? {
              row,
              delta:
                (row.wins / Math.max(row.picks, 1) - previous.wins / Math.max(previous.picks, 1)) *
                100,
            }
          : null;
      })
      .filter((entry): entry is { row: OwnedItemStats; delta: number } => entry !== null);
    const rising =
      comparable.length >= 5 ? (comparable.sort((a, b) => b.delta - a.delta)[0] ?? null) : null;
    return { mostBuilt, bestWinRate, hiddenGem, rising, comparableCount: comparable.length };
  }, [previousPatchResult, rows]);

  const ready = !loading && !!statsResult;
  const highlight = (row: OwnedItemStats | null) => ({
    icon: row ? <ItemIcon itemId={row.item_id} size={60} patch={patch} /> : null,
    name: row ? getItemName(itemData, row.item_id) : "—",
  });

  return (
    <div className="flex min-h-full w-full flex-col gap-5">
      <PageHero title="Items" subtitle="What you build and how it performs">
        <HeroTile
          label="Items shown"
          value={ready ? formatNumber(visibleRows.length) : "—"}
          sub={ready ? `of ${formatNumber(rows.length)} tracked` : undefined}
        />
        <HeroTile
          label="Total builds"
          value={ready ? formatNumber(totalBuilds) : "—"}
          sub="in the selected queue and patch"
        />
        <HeroTile
          label="Average win rate"
          value={ready ? `${avgWinRate.toFixed(1)}%` : "—"}
          sub="across all items"
          valueClass={avgWinRate >= 50 ? "text-lol-win" : "text-lol-loss"}
        />
        <HeroTile
          label="Items per game"
          value={ready && totalGames > 0 ? (totalBuilds / totalGames).toFixed(1) : "—"}
          sub="completed items"
        />
      </PageHero>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        <QueueSelect value={queue} onChange={setQueue} filter={(id) => !isAugmentQueue(id)} />
        <PatchSelect value={patch} onChange={setPatch} />
      </div>

      {loading || !statsResult ? (
        <div className="rounded-[14px] border border-lol-border p-8 text-center text-sm text-lol-text">
          Loading…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 min-[106rem]:grid-cols-4">
            <HighlightTile
              title="Most built"
              {...highlight(highlights.mostBuilt)}
              value={highlights.mostBuilt ? formatNumber(highlights.mostBuilt.picks) : "—"}
              caption={
                highlights.mostBuilt
                  ? `${((highlights.mostBuilt.picks / Math.max(totalBuilds, 1)) * 100).toFixed(1)}% of all builds`
                  : "No item data"
              }
            />
            <HighlightTile
              title="Best win rate"
              {...highlight(highlights.bestWinRate)}
              value={
                highlights.bestWinRate
                  ? `${((highlights.bestWinRate.wins / highlights.bestWinRate.picks) * 100).toFixed(1)}%`
                  : "—"
              }
              caption={
                highlights.bestWinRate
                  ? `minimum 25 games · ${formatNumber(highlights.bestWinRate.picks)} builds`
                  : "No item meets the minimum"
              }
            />
            <HighlightTile
              title="Rising this patch"
              {...highlight(highlights.rising?.row ?? null)}
              value={
                highlights.rising
                  ? `${highlights.rising.delta >= 0 ? "+" : ""}${highlights.rising.delta.toFixed(1)} pts`
                  : "—"
              }
              caption={
                highlights.rising
                  ? "win rate change since the previous patch"
                  : "Not enough prior-patch data"
              }
            />
            <HighlightTile
              title="Hidden gem"
              {...highlight(highlights.hiddenGem)}
              value={
                highlights.hiddenGem
                  ? `${((highlights.hiddenGem.wins / highlights.hiddenGem.picks) * 100).toFixed(1)}%`
                  : "—"
              }
              caption={
                highlights.hiddenGem
                  ? `only ${formatNumber(highlights.hiddenGem.picks)} builds, but it wins`
                  : "No hidden gem found"
              }
            />
          </div>

          <div className="app-tile min-w-0">
            <Title
              aside={<span className="text-[13px] text-lol-text">Click an item for details</span>}
            >
              All items
            </Title>
            <div className="mb-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-lol-text">
                    Class
                  </span>
                  {(["All", "AD", "AP", "Tank", "Boots", "Other"] as const).map((value) => {
                    const count =
                      value === "All"
                        ? rows.length
                        : rows.filter((row) => itemBranch(itemData[row.item_id]).label === value)
                            .length;
                    return (
                      <FilterChip
                        key={value}
                        active={itemClass === value}
                        disabled={count === 0 && value !== "All"}
                        title={
                          count === 0 && value !== "All" ? "No items in this category" : undefined
                        }
                        onClick={() => setItemClass(value)}
                        className="h-8 px-3 text-xs font-semibold"
                      >
                        {value}
                      </FilterChip>
                    );
                  })}
                  <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-lol-text">
                    Min games
                  </span>
                  {(
                    [
                      [0, "Any"],
                      [10, "10+"],
                      [25, "25+"],
                      [50, "50+"],
                    ] as const
                  ).map(([value, label]) => (
                    <FilterChip
                      key={label}
                      active={minGames === value}
                      onClick={() => setMinGames(value)}
                      className="h-8 px-3 text-xs font-semibold"
                    >
                      {label}
                    </FilterChip>
                  ))}
                </div>
                <SearchInput
                  className="w-56"
                  placeholder="Search items"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-lol-text">
                    Sort
                  </span>
                  {(
                    [
                      ["most-built", "Most built"],
                      ["best-wr", "Best win rate"],
                      ["vs-average", "Vs average"],
                      ["best-score", "Best score"],
                      ["rising", "Rising"],
                    ] as const
                  ).map(([value, label]) => (
                    <FilterChip
                      key={value}
                      active={sortMode === value}
                      onClick={() => setSortMode(value)}
                      className="h-8 px-3 text-xs font-semibold"
                    >
                      {label}
                    </FilterChip>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-lol-text">
                    View
                  </span>
                  {(
                    [
                      ["cards", "Cards"],
                      ["table", "Table"],
                    ] as const
                  ).map(([value, label]) => (
                    <FilterChip
                      key={value}
                      active={viewMode === value}
                      onClick={() => setViewMode(value)}
                      className="h-8 px-3 text-xs font-semibold"
                    >
                      {label}
                    </FilterChip>
                  ))}
                </div>
              </div>
            </div>
            {sorted.length === 0 ? (
              <div className="py-8 text-center text-sm text-lol-text">No items played yet.</div>
            ) : viewMode === "table" ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-lol-border/40">
                    <tr>
                      {[
                        "#",
                        "Item",
                        "Category",
                        "Games",
                        "Pick rate",
                        "Win rate",
                        "Vs avg",
                        "Buy time",
                        "Slot",
                      ].map((heading, index) => (
                        <th
                          key={heading}
                          className={`px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-lol-text ${
                            index === 0 || index >= 3 ? "text-right" : "text-left"
                          }`}
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((row, index) => {
                      const wr = row.picks > 0 ? (row.wins / row.picks) * 100 : 0;
                      const branch = itemBranch(itemData[row.item_id]);
                      return (
                        <tr
                          key={row.item_id}
                          onClick={() =>
                            navigate(`/history/${scope ?? "full"}/items/${row.item_id}`)
                          }
                          className="cursor-pointer border-b border-lol-border/40 transition-colors hover:bg-white/[0.04]"
                        >
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-lol-text">
                            {index + 1}
                          </td>
                          <td className="px-3 py-2">
                            <span className="flex items-center gap-3 text-sm font-bold text-lol-text-bright">
                              <ItemIcon itemId={row.item_id} size={28} patch={patch} />
                              {getItemName(itemData, row.item_id)}
                              {row.isTrinket && (
                                <span className="rounded border border-lol-border/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-lol-text">
                                  Trinket
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-left text-xs text-lol-text">
                            {branch.label}
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-lol-text">
                            {formatNumber(row.picks)}
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-lol-text">
                            {totalGames
                              ? `${((row.picks / totalGames) * 100).toFixed(1)}%`
                              : "0.0%"}
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-lol-text">
                            {wr.toFixed(1)}%
                          </td>
                          <td
                            className={`px-3 py-2 text-right text-xs tabular-nums ${
                              wr >= avgWinRate ? "text-lol-win" : "text-lol-loss"
                            }`}
                          >
                            {`${wr - avgWinRate >= 0 ? "+" : ""}${(wr - avgWinRate).toFixed(1)} pts`}
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-lol-text">
                            {row.avgBuyTimeMs != null ? formatBuyTime(row.avgBuyTimeMs) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-lol-text">
                            {row.commonPurchaseSlot != null ? row.commonPurchaseSlot : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-3">
                {sorted.map((row, index) => {
                  const wr = row.picks > 0 ? (row.wins / row.picks) * 100 : 0;
                  const delta = wr - avgWinRate;
                  const branch = itemBranch(itemData[row.item_id]);
                  const price = itemData[row.item_id]?.price;
                  return (
                    <button
                      type="button"
                      key={row.item_id}
                      onClick={() => navigate(`/history/${scope ?? "full"}/items/${row.item_id}`)}
                      className="flex min-w-0 flex-col gap-3 rounded-2xl border border-lol-border/60 bg-black/25 p-4 text-left transition-colors hover:border-lol-crimson/60 hover:bg-white/[0.04]"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="shrink-0 overflow-hidden rounded-xl border border-lol-border-hover">
                          <ItemIcon itemId={row.item_id} size={46} patch={patch} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-display text-[15px] font-bold text-lol-text-bright">
                            {getItemName(itemData, row.item_id)}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-lol-text">
                            <i
                              className="block h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: branch.color }}
                            />
                            {row.isTrinket ? "Trinket" : branch.label}
                            {price ? <span>· {formatNumber(price)} gold</span> : null}
                          </div>
                        </div>
                        <span className="self-start font-display text-[12px] font-bold tabular-nums text-lol-text/50">
                          #{index + 1}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <CardStat label="Games" value={formatNumber(row.picks)} />
                        <CardStat
                          label="Win rate"
                          value={`${wr.toFixed(1)}%`}
                          className={wr >= 50 ? "text-lol-win" : "text-lol-loss"}
                        />
                        <CardStat
                          label="Vs avg"
                          value={`${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`}
                          className={delta >= 0 ? "text-lol-win" : "text-lol-loss"}
                        />
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                        <div
                          className={`h-full rounded-full ${wr >= 50 ? "bg-lol-win" : "bg-lol-loss"}`}
                          style={{ width: `${Math.max(0, Math.min(100, wr))}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
