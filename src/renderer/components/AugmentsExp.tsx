import { useMemo, useState, type ReactNode } from "react";
import type { AugmentStatsDetailed, AugmentStatsDetailedResult } from "../lib/types";
import { useIpc } from "../hooks/useIpc";
import { useActiveAccount } from "../hooks/useActiveAccount";
import { useAugmentData, getAugmentName } from "../hooks/useChampions";
import { useHistoryScopeQueue } from "../lib/historyScope";
import { useViewState } from "../hooks/useViewState";
import AugmentIcon from "./AugmentIcon";
import { Tile } from "./Tile";
import { TileGrid } from "./TileGrid";
import QueueSelect from "./QueueSelect";
import PatchSelect from "./PatchSelect";
import { FilterChip } from "./FilterChip";
import { SearchInput } from "./SearchInput";
import { formatNumber } from "../lib/format";
import { ALL_ACCOUNTS_SENTINEL } from "../lib/accountsEvent";
import { isAugmentQueue } from "../../shared/queues";

type RarityFilter = "all" | "kSilver" | "kGold" | "kPrismatic";
type SortMode = "most-built" | "best-wr";

const filters: { value: RarityFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "kSilver", label: "Silver" },
  { value: "kGold", label: "Gold" },
  { value: "kPrismatic", label: "Prismatic" },
];

const ACCENTS = [
  { color: "#E5483F", tint: "rgba(229,72,63,0.08)" },
  { color: "#C9A45C", tint: "rgba(201,164,92,0.08)" },
  { color: "#22C55E", tint: "rgba(34,197,94,0.08)" },
  { color: "#3B82F6", tint: "rgba(59,130,246,0.08)" },
];

function tierForRarity(rarity: string | undefined): "S" | "G" | "P" | undefined {
  if (rarity === "kSilver" || rarity?.toLowerCase() === "silver") return "S";
  if (rarity === "kGold" || rarity?.toLowerCase() === "gold") return "G";
  if (rarity === "kPrismatic" || rarity?.toLowerCase() === "prismatic") return "P";
  return undefined;
}

function winRate(row: AugmentStatsDetailed): number {
  return row.picks > 0 ? (row.wins / row.picks) * 100 : 0;
}

function KpiTile({
  label,
  value,
  caption,
  accent,
}: {
  label: string;
  value: ReactNode;
  caption: string;
  accent: (typeof ACCENTS)[number];
}) {
  return (
    <div
      className="relative overflow-hidden rounded-[12px] border border-lol-border p-4"
      style={{ background: `radial-gradient(circle at 100% 0, ${accent.tint}, transparent 65%)` }}
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
  augment,
  value,
  caption,
  accent,
  augmentData,
  emptyTitle,
}: {
  title: string;
  augment: AugmentStatsDetailed | null;
  value: string;
  caption: string;
  accent: (typeof ACCENTS)[number];
  augmentData: ReturnType<typeof useAugmentData>;
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
        {augment ? (
          <div
            className="shrink-0 rounded-lg border p-1 shadow-[0_0_14px_rgba(229,72,63,0.18)]"
            style={{ borderColor: accent.color }}
          >
            <AugmentIcon augmentId={augment.augment_id} size={40} />
          </div>
        ) : (
          <div className="h-[50px] w-[50px] shrink-0 rounded-lg border border-lol-border bg-black/10" />
        )}
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-lol-text">
            {title}
          </div>
          <div className="mt-1 truncate text-sm font-bold text-lol-text-bright">
            {augment ? getAugmentName(augmentData, augment.augment_id) : "—"}
          </div>
          <div className="mt-1 text-xl font-bold leading-none text-lol-text-bright">{value}</div>
          <div className="mt-1 text-[11px] text-lol-text">{caption}</div>
        </div>
      </div>
    </div>
  );
}

export function AugmentsExp() {
  const [patch, setPatch] = useViewState<string | undefined>("augments.patch", undefined);
  const [queue, setQueue] = useViewState<number | undefined>("augments.queue", undefined);
  const scopedQueue = queue ?? useHistoryScopeQueue();
  const [activeAccountRaw] = useActiveAccount();
  const account = activeAccountRaw === ALL_ACCOUNTS_SENTINEL ? "all" : activeAccountRaw;
  const augmentData = useAugmentData(patch);
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("most-built");
  const [minGames, setMinGames] = useState(0);
  const [search, setSearch] = useState("");
  const { data, loading } = useIpc<AugmentStatsDetailedResult>(
    () => window.api.getAugmentStatsDetailed(patch, scopedQueue, account),
    [patch, scopedQueue, account],
  );

  const filteredRows = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();
    return data.augments.filter((row) => {
      const rarity = augmentData[row.augment_id]?.rarity;
      return (
        row.picks >= minGames &&
        (rarityFilter === "all" || rarity === rarityFilter) &&
        (!query || getAugmentName(augmentData, row.augment_id).toLowerCase().includes(query))
      );
    });
  }, [augmentData, data, minGames, rarityFilter, search]);

  const sorted = useMemo(() => {
    const rows = [...filteredRows];
    rows.sort((a, b) =>
      sortMode === "most-built" ? b.picks - a.picks : winRate(b) - winRate(a) || b.picks - a.picks,
    );
    return rows;
  }, [filteredRows, sortMode]);

  const totals = useMemo(() => {
    const totalPicks = filteredRows.reduce((sum, row) => sum + row.picks, 0);
    const totalWins = filteredRows.reduce((sum, row) => sum + row.wins, 0);
    return {
      totalPicks,
      averageWinRate: totalPicks > 0 ? (totalWins / totalPicks) * 100 : 0,
      mostBuilt: filteredRows.reduce<AugmentStatsDetailed | null>(
        (best, row) => (!best || row.picks > best.picks ? row : best),
        null,
      ),
      bestWinRate:
        filteredRows
          .filter((row) => row.picks >= 25)
          .sort((a, b) => winRate(b) - winRate(a) || b.picks - a.picks)[0] ?? null,
      hiddenGem:
        filteredRows
          .filter((row) => row.picks >= 25 && row.picks <= 100 && winRate(row) >= 55)
          .sort((a, b) => winRate(b) - winRate(a) || b.picks - a.picks)[0] ?? null,
    };
  }, [filteredRows]);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="relative pl-4 font-display text-[30px] font-bold leading-tight tracking-[0.2px] text-lol-text-bright before:absolute before:left-1 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson after:absolute after:bottom-[-8px] after:left-4 after:h-px after:w-28 after:bg-gradient-to-r after:from-lol-crimson/70 after:to-transparent">
            Augments
          </h1>
          <p className="mt-1.5 text-lol-text">Pick rate and win rate in ARAM Mayhem and Arena</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <QueueSelect value={queue} onChange={setQueue} filter={(id) => isAugmentQueue(id)} />
          <PatchSelect value={patch} onChange={setPatch} />
        </div>
      </div>

      {loading || !data ? (
        <div className="rounded-[14px] border border-lol-border p-8 text-center text-sm text-lol-text">
          Loading…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <KpiTile
              label="Augments shown"
              value={formatNumber(filteredRows.length)}
              caption={`of ${formatNumber(data.augments.length)} tracked`}
              accent={ACCENTS[0]}
            />
            <KpiTile
              label="Total picks"
              value={formatNumber(totals.totalPicks)}
              caption="in the selected queue and patch"
              accent={ACCENTS[1]}
            />
            <KpiTile
              label="Average win rate"
              value={totals.totalPicks > 0 ? `${totals.averageWinRate.toFixed(1)}%` : "—"}
              caption="across all augments"
              accent={ACCENTS[2]}
            />
            <KpiTile
              label="Top augment"
              value={
                totals.mostBuilt ? (
                  <span className="flex min-w-0 items-center gap-2 text-lg">
                    <AugmentIcon augmentId={totals.mostBuilt.augment_id} size={28} />
                    <span className="truncate">
                      {getAugmentName(augmentData, totals.mostBuilt.augment_id)}
                    </span>
                  </span>
                ) : (
                  "—"
                )
              }
              caption={
                totals.mostBuilt
                  ? `${formatNumber(totals.mostBuilt.picks)} picks`
                  : "No augment data"
              }
              accent={ACCENTS[3]}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <HighlightCard
              title="Most built"
              augment={totals.mostBuilt}
              value={totals.mostBuilt ? `${formatNumber(totals.mostBuilt.picks)} picks` : "—"}
              caption={
                totals.mostBuilt && totals.totalPicks > 0
                  ? `${((totals.mostBuilt.picks / totals.totalPicks) * 100).toFixed(1)}% of all picks`
                  : "No augment data"
              }
              accent={ACCENTS[0]}
              augmentData={augmentData}
            />
            <HighlightCard
              title="Best win rate"
              augment={totals.bestWinRate}
              value={totals.bestWinRate ? `${winRate(totals.bestWinRate).toFixed(1)}%` : "—"}
              caption={
                totals.bestWinRate
                  ? `minimum 25 games · ${formatNumber(totals.bestWinRate.picks)} picks`
                  : "No augment meets the minimum"
              }
              accent={ACCENTS[1]}
              augmentData={augmentData}
              emptyTitle={totals.bestWinRate ? undefined : "Not enough games"}
            />
            <HighlightCard
              title="Hidden gem"
              augment={totals.hiddenGem}
              value={totals.hiddenGem ? `${winRate(totals.hiddenGem).toFixed(1)}%` : "—"}
              caption={
                totals.hiddenGem
                  ? `only ${formatNumber(totals.hiddenGem.picks)} picks, but it wins`
                  : "No augment meets the threshold"
              }
              accent={ACCENTS[2]}
              augmentData={augmentData}
              emptyTitle={totals.hiddenGem ? undefined : "Not enough games"}
            />
          </div>

          <div className="min-w-0 rounded-[14px] border border-lol-border bg-[radial-gradient(circle_at_100%_0,rgba(229,72,63,0.08),transparent_42%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] p-5">
            <div className="mb-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {filters.map((filter) => (
                    <FilterChip
                      key={filter.value}
                      active={rarityFilter === filter.value}
                      onClick={() => setRarityFilter(filter.value)}
                      className="h-8 px-3 text-xs font-semibold"
                    >
                      {filter.label}
                    </FilterChip>
                  ))}
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
                  placeholder="Search augments"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-lol-text">
                  Sort
                </span>
                {(
                  [
                    ["most-built", "Most built"],
                    ["best-wr", "Best win rate"],
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
            </div>

            {sorted.length === 0 ? (
              <div className="py-8 text-center text-sm text-lol-text">No augments played yet.</div>
            ) : (
              <TileGrid>
                {sorted.map((row) => (
                  <Tile
                    key={row.augment_id}
                    icon={<AugmentIcon augmentId={row.augment_id} />}
                    title={getAugmentName(augmentData, row.augment_id)}
                    subtitle={`${formatNumber(row.picks)} picks · ${winRate(row).toFixed(1)}% win`}
                    trackValue={winRate(row)}
                    tier={tierForRarity(augmentData[row.augment_id]?.rarity)}
                  />
                ))}
              </TileGrid>
            )}
          </div>
        </>
      )}
    </div>
  );
}
