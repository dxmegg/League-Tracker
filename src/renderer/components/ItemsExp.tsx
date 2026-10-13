import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { ItemData, OwnedItemStats, OwnedItemStatsResult } from "../lib/types";
import ItemIcon from "./ItemIcon";
import { TileGrid } from "./TileGrid";
import QueueSelect from "./QueueSelect";
import PatchSelect from "./PatchSelect";
import { useItemData, getItemName } from "../hooks/useChampions";
import { useActiveAccount } from "../hooks/useActiveAccount";
import { useHistoryScopeQueue } from "../lib/historyScope";
import { ALL_ACCOUNTS_SENTINEL } from "../lib/accountsEvent";
import { useViewState } from "../hooks/useViewState";
import { useIpc } from "../hooks/useIpc";
import { isAugmentQueue } from "../../shared/queues";
import { formatNumber } from "../lib/format";
import { FilterChip } from "./FilterChip";
import { SearchInput } from "./SearchInput";

type SortMode = "most-built" | "best-wr" | "vs-average" | "best-score" | "rising";
type ItemClass = "All" | "AD" | "AP" | "Tank" | "Boots" | "Other";
type ViewMode = "cards" | "table";
type Accent = { color: string; tint: string };

const ACCENTS: Accent[] = [
  { color: "#E5483F", tint: "rgba(229,72,63,0.08)" },
  { color: "#C9A45C", tint: "rgba(201,164,92,0.08)" },
  { color: "#3B82F6", tint: "rgba(59,130,246,0.08)" },
  { color: "#A855F7", tint: "rgba(168,85,247,0.08)" },
];

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

function ItemWinRateBar({ wins, picks }: { wins: number; picks: number }) {
  const rate = picks > 0 ? (wins / picks) * 100 : 0;
  return (
    <div className="relative h-2.5 overflow-visible rounded-full bg-[#a51e1e]/20">
      <div
        className="h-full rounded-full bg-[#15803d] shadow-[0_0_10px_rgba(21,128,61,0.45)]"
        style={{ width: `${Math.max(0, Math.min(100, rate))}%` }}
      />
      <span className="absolute left-1/2 top-[-2px] h-[14px] w-px bg-white/70" />
    </div>
  );
}

function KpiTile({
  label,
  value,
  caption,
  accent,
  title,
}: {
  label: string;
  value: string;
  caption: string;
  accent: Accent;
  title?: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-[12px] border border-lol-border p-4 before:absolute before:inset-x-0 before:top-0 before:h-[3px]"
      style={{ background: `radial-gradient(circle at 100% 0, ${accent.tint}, transparent 65%)` }}
      title={title}
    >
      <span
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ backgroundColor: accent.color }}
      />
      <div className="text-[10px] font-bold uppercase tracking-wider text-lol-text">{label}</div>
      <div className="mt-2 text-[26px] font-bold leading-none text-lol-text-bright">{value}</div>
      <div className="mt-1 text-xs text-lol-text">{caption}</div>
    </div>
  );
}

function HighlightCard({
  title,
  item,
  value,
  caption,
  itemData,
  accent,
  emptyTitle,
}: {
  title: string;
  item: OwnedItemStats | null;
  value: string;
  caption: string;
  itemData: ItemData;
  accent: Accent;
  emptyTitle?: string;
}) {
  return (
    <div
      className="relative min-h-[132px] overflow-hidden rounded-[12px] border border-lol-border p-4"
      style={{ background: `radial-gradient(circle at 100% 0, ${accent.tint}, transparent 65%)` }}
      title={emptyTitle}
    >
      <span
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ backgroundColor: accent.color }}
      />
      <div className="flex items-start gap-3">
        {item ? (
          <div
            className="shrink-0 rounded-lg border p-1 shadow-[0_0_14px_rgba(229,72,63,0.18)]"
            style={{ borderColor: accent.color }}
          >
            <ItemIcon itemId={item.item_id} size={40} />
          </div>
        ) : (
          <div className="h-[50px] w-[50px] shrink-0 rounded-lg border border-lol-border bg-black/10" />
        )}
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-lol-text">
            {title}
          </div>
          <div className="mt-1 truncate text-sm font-bold text-lol-text-bright">
            {item ? getItemName(itemData, item.item_id) : (emptyTitle ?? "—")}
          </div>
          <div className="mt-1 text-xl font-bold leading-none text-lol-text-bright">{value}</div>
          <div className="mt-1 text-[11px] text-lol-text">{caption}</div>
        </div>
      </div>
    </div>
  );
}

export function ItemsExp() {
  const navigate = useNavigate();
  const { scope } = useParams<{ scope?: string }>();
  const [queue, setQueue] = useViewState<number | undefined>("items.queue", undefined);
  const [patch, setPatch] = useViewState<string | undefined>("items.patch", undefined);
  const scopedQueue = queue ?? useHistoryScopeQueue();
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
    const mostBuilt = rows.reduce<OwnedItemStats | null>(
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

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="relative pl-4 font-display text-[30px] font-bold leading-tight tracking-[0.2px] text-lol-text-bright before:absolute before:left-1 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson after:absolute after:bottom-[-8px] after:left-4 after:h-px after:w-28 after:bg-gradient-to-r after:from-lol-crimson/70 after:to-transparent">
            Items
          </h1>
          <p className="mt-1.5 text-lol-text">What you build and how it performs</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <QueueSelect value={queue} onChange={setQueue} filter={(id) => !isAugmentQueue(id)} />
          <PatchSelect value={patch} onChange={setPatch} />
        </div>
      </div>

      {loading || !statsResult ? (
        <div className="rounded-[14px] border border-lol-border p-8 text-center text-sm text-lol-text">
          Loading…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <KpiTile
              label="Items shown"
              value={formatNumber(rows.length)}
              caption={`of ${formatNumber(rows.length)} tracked`}
              accent={ACCENTS[0]}
            />
            <KpiTile
              label="Total builds"
              value={formatNumber(totalBuilds)}
              caption="in the selected queue and patch"
              accent={ACCENTS[1]}
            />
            <KpiTile
              label="Average win rate"
              value={`${avgWinRate.toFixed(1)}%`}
              caption="across all items"
              accent={ACCENTS[2]}
            />
            <KpiTile
              label="Items per game"
              value={totalGames > 0 ? (totalBuilds / totalGames).toFixed(1) : "—"}
              caption="completed items"
              accent={ACCENTS[3]}
              title={totalGames > 0 ? undefined : "No games in scope"}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <HighlightCard
              title="Most built"
              item={highlights.mostBuilt}
              value={
                highlights.mostBuilt ? `${formatNumber(highlights.mostBuilt.picks)} builds` : "—"
              }
              caption={
                highlights.mostBuilt
                  ? `${((highlights.mostBuilt.picks / Math.max(totalBuilds, 1)) * 100).toFixed(1)}% of all builds`
                  : "No item data"
              }
              itemData={itemData}
              accent={ACCENTS[0]}
            />
            <HighlightCard
              title="Best win rate"
              item={highlights.bestWinRate}
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
              itemData={itemData}
              accent={ACCENTS[1]}
            />
            <HighlightCard
              title="Rising this patch"
              item={highlights.rising?.row ?? null}
              value={
                highlights.rising
                  ? `${highlights.rising.delta >= 0 ? "+" : ""}${highlights.rising.delta.toFixed(1)} pts`
                  : "—"
              }
              caption="win rate change since the previous patch"
              itemData={itemData}
              accent={ACCENTS[2]}
              emptyTitle={highlights.rising ? undefined : "Not enough prior-patch data"}
            />
            <HighlightCard
              title="Hidden gem"
              item={highlights.hiddenGem}
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
              itemData={itemData}
              accent={ACCENTS[3]}
            />
          </div>

          <div className="min-w-0 rounded-[14px] border border-lol-border bg-[radial-gradient(circle_at_100%_0,rgba(229,72,63,0.08),transparent_42%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] p-5">
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
                          className="cursor-pointer border-b border-white/[0.04] transition-colors duration-120 hover:bg-white/[0.025]"
                        >
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-lol-text">
                            {index + 1}
                          </td>
                          <td className="px-3 py-2">
                            <span className="flex items-center gap-3 text-sm font-bold text-lol-text-bright">
                              <ItemIcon itemId={row.item_id} size={28} patch={patch} />
                              {getItemName(itemData, row.item_id)}
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
              <TileGrid>
                {sorted.map((row, index) => {
                  const wr = row.picks > 0 ? (row.wins / row.picks) * 100 : 0;
                  const delta = wr - avgWinRate;
                  const branch = itemBranch(itemData[row.item_id]);
                  const item = itemData[row.item_id];
                  return (
                    <button
                      type="button"
                      key={row.item_id}
                      onClick={() => navigate(`/history/${scope ?? "full"}/items/${row.item_id}`)}
                      className="relative flex min-h-[190px] flex-col gap-2 rounded-[12px] border border-lol-border bg-black/10 p-4 text-left transition-[background-color,border-color,box-shadow] duration-120 hover:border-lol-crimson/40 hover:bg-white/[0.025]"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="shrink-0 rounded-lg border p-1 shadow-[0_0_14px_rgba(229,72,63,0.16)]"
                          style={{ borderColor: branch.color }}
                        >
                          <ItemIcon itemId={row.item_id} size={38} patch={patch} />
                        </div>
                        <span className="truncate text-sm font-bold text-lol-text-bright">
                          {getItemName(itemData, row.item_id)}
                        </span>
                      </div>
                      <div className="text-[11px] text-lol-text">
                        {item?.branch && item.price != null
                          ? `${branch.label} · ${formatNumber(item.price)} gold`
                          : "—"}
                      </div>
                      <div className="flex items-center justify-between text-xs text-lol-text">
                        <span>{formatNumber(row.picks)} games</span>
                        <span
                          className={
                            wr >= 55
                              ? "text-lol-win"
                              : wr <= 45
                                ? "text-lol-loss"
                                : "text-lol-text-bright"
                          }
                        >
                          {wr.toFixed(1)}% win
                        </span>
                      </div>
                      <ItemWinRateBar wins={row.wins} picks={row.picks} />
                      <div className="mt-auto flex items-center justify-between gap-2 text-[11px]">
                        <span className={delta >= 0 ? "text-lol-win" : "text-lol-loss"}>
                          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)} vs your average
                        </span>
                        {row.avgBuyTimeMs != null && (
                          <span className="shrink-0 text-lol-text">
                            Buy {formatBuyTime(row.avgBuyTimeMs)}
                          </span>
                        )}
                      </div>
                      <span className="sr-only">Item rank {index + 1}</span>
                    </button>
                  );
                })}
              </TileGrid>
            )}
          </div>
        </>
      )}
    </div>
  );
}
