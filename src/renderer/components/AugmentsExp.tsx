import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AugmentStatsDetailed, AugmentStatsDetailedResult } from "../lib/types";
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
import { FilterChip } from "./FilterChip";
import { SearchInput } from "./SearchInput";
import { HeroTile, HighlightTile, PageHero } from "./SplashHero";
import { Title } from "./live/shared";
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

const RARITIES = [
  { key: "kSilver", label: "Silver", color: "#B8B8C4" },
  { key: "kGold", label: "Gold", color: "#E0B65C" },
  { key: "kPrismatic", label: "Prismatic", color: "#B07CFF" },
] as const;

export function rarityOf(rarity: string | undefined) {
  return RARITIES.find((r) => r.key === rarity || r.label.toLowerCase() === rarity?.toLowerCase());
}

function winRate(row: AugmentStatsDetailed): number {
  return row.picks > 0 ? (row.wins / row.picks) * 100 : 0;
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

export function AugmentsExp() {
  const navigate = useNavigate();
  const [patch, setPatch] = useViewState<string | undefined>("augments.patch", undefined);
  const [queue, setQueue] = useViewState<number | undefined>("augments.queue", undefined);
  const scopedQueue = useScopedQueue(queue);
  const [dataMode] = useActiveMode();
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
        (rarityFilter === "all" || rarityOf(rarity)?.key === rarityFilter) &&
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

  const ready = !loading && !!data;
  // Silver, Gold and Prismatic side by side, over everything the filters above them allow
  const byRarity = RARITIES.map((rarity) => {
    const rows = (data?.augments ?? []).filter(
      (row) => rarityOf(augmentData[row.augment_id]?.rarity)?.key === rarity.key,
    );
    const picks = rows.reduce((sum, row) => sum + row.picks, 0);
    const wins = rows.reduce((sum, row) => sum + row.wins, 0);
    const best = rows
      .filter((row) => row.picks >= 10)
      .sort((a, b) => winRate(b) - winRate(a) || b.picks - a.picks)
      .slice(0, 3);
    return { ...rarity, count: rows.length, picks, wins, best };
  });
  const highlight = (row: AugmentStatsDetailed | null) => ({
    icon: row ? <AugmentIcon augmentId={row.augment_id} size={52} /> : null,
    name: row ? getAugmentName(augmentData, row.augment_id) : "—",
  });

  return (
    <div className="flex min-h-full w-full flex-col gap-5">
      <PageHero
        title="Augments"
        subtitle={
          dataMode === "mayhem"
            ? "Pick rate and win rate in ARAM Mayhem"
            : "Pick rate and win rate in ARAM Mayhem and Arena"
        }
      >
        <HeroTile
          label="Augments shown"
          value={ready ? formatNumber(filteredRows.length) : "—"}
          sub={data ? `of ${formatNumber(data.augments.length)} tracked` : undefined}
        />
        <HeroTile
          label="Total picks"
          value={ready ? formatNumber(totals.totalPicks) : "—"}
          sub="in the selected queue and patch"
        />
        <HeroTile
          label="Average win rate"
          value={totals.totalPicks > 0 ? `${totals.averageWinRate.toFixed(1)}%` : "—"}
          sub="across all augments"
          valueClass={totals.averageWinRate >= 50 ? "text-lol-win" : "text-lol-loss"}
        />
        <HeroTile
          label="Top augment"
          value={totals.mostBuilt ? getAugmentName(augmentData, totals.mostBuilt.augment_id) : "—"}
          sub={
            totals.mostBuilt ? `${formatNumber(totals.mostBuilt.picks)} picks` : "No augment data"
          }
          valueClass="!text-[20px] text-lol-text-bright"
        />
      </PageHero>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <QueueSelect value={queue} onChange={setQueue} filter={(id) => isAugmentQueue(id)} />
        <PatchSelect value={patch} onChange={setPatch} />
      </div>

      {loading || !data ? (
        <div className="rounded-[14px] border border-lol-border p-8 text-center text-sm text-lol-text">
          Loading…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 min-[94rem]:grid-cols-3">
            <HighlightTile
              title="Most picked"
              {...highlight(totals.mostBuilt)}
              value={totals.mostBuilt ? formatNumber(totals.mostBuilt.picks) : "—"}
              caption={
                totals.mostBuilt && totals.totalPicks > 0
                  ? `${((totals.mostBuilt.picks / totals.totalPicks) * 100).toFixed(1)}% of all picks`
                  : "No augment data"
              }
            />
            <HighlightTile
              title="Best win rate"
              {...highlight(totals.bestWinRate)}
              value={totals.bestWinRate ? `${winRate(totals.bestWinRate).toFixed(1)}%` : "—"}
              caption={
                totals.bestWinRate
                  ? `minimum 25 games · ${formatNumber(totals.bestWinRate.picks)} picks`
                  : "No augment meets the minimum"
              }
              hint={totals.bestWinRate ? undefined : "Not enough games"}
            />
            <HighlightTile
              title="Hidden gem"
              {...highlight(totals.hiddenGem)}
              value={totals.hiddenGem ? `${winRate(totals.hiddenGem).toFixed(1)}%` : "—"}
              caption={
                totals.hiddenGem
                  ? `only ${formatNumber(totals.hiddenGem.picks)} picks, but it wins`
                  : "No augment meets the threshold"
              }
              hint={totals.hiddenGem ? undefined : "Not enough games"}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {byRarity.map((rarity) => {
              const rate = rarity.picks ? (rarity.wins / rarity.picks) * 100 : 0;
              return (
                <div key={rarity.key} className="app-tile min-w-0">
                  <Title
                    aside={
                      <span className="text-[12px] text-lol-text">
                        {formatNumber(rarity.picks)} picks · {rarity.count} augments
                      </span>
                    }
                  >
                    <span style={{ color: rarity.color }}>{rarity.label}</span>
                  </Title>
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`font-display text-[30px] font-bold tabular-nums ${rate >= 50 ? "text-lol-win" : "text-lol-loss"}`}
                    >
                      {rarity.picks ? `${rate.toFixed(1)}%` : "—"}
                    </span>
                    <span className="text-[12px] text-lol-text">win rate</span>
                  </div>
                  <div className="mb-1.5 mt-2 text-[10px] font-bold uppercase tracking-widest text-lol-text">
                    Best, min 10 picks
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {rarity.best.map((row) => (
                      <button
                        type="button"
                        key={row.augment_id}
                        onClick={() => navigate(`/augments/${row.augment_id}`)}
                        className="flex items-center gap-2.5 rounded-xl border border-lol-border/40 bg-black/25 px-2.5 py-1.5 text-left transition-colors hover:border-lol-crimson/60"
                      >
                        <AugmentIcon augmentId={row.augment_id} size={30} patch={patch} />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-lol-text-bright">
                          {getAugmentName(augmentData, row.augment_id)}
                        </span>
                        <span className="text-[11px] tabular-nums text-lol-text">{row.picks}x</span>
                        <span className="w-14 text-right font-display text-[14px] font-bold tabular-nums text-lol-win">
                          {winRate(row).toFixed(1)}%
                        </span>
                      </button>
                    ))}
                    {rarity.best.length === 0 && (
                      <p className="py-3 text-center text-xs text-lol-text/70">Not enough picks</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="app-tile min-w-0">
            <Title
              aside={
                <span className="text-[13px] text-lol-text">Click an augment for details</span>
              }
            >
              All augments
            </Title>
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
                    ["most-built", "Most picked"],
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
              <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-3">
                {sorted.map((row, index) => {
                  const wr = winRate(row);
                  const delta = wr - totals.averageWinRate;
                  const rarity = rarityOf(augmentData[row.augment_id]?.rarity);
                  return (
                    <button
                      type="button"
                      key={row.augment_id}
                      onClick={() => navigate(`/augments/${row.augment_id}`)}
                      className="flex min-w-0 flex-col gap-3 rounded-2xl border border-lol-border/60 bg-black/25 p-4 text-left transition-colors hover:border-lol-crimson/60 hover:bg-white/[0.04]"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className="shrink-0 overflow-hidden rounded-xl border"
                          style={{ borderColor: rarity?.color }}
                        >
                          <AugmentIcon augmentId={row.augment_id} size={46} patch={patch} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-display text-[15px] font-bold text-lol-text-bright">
                            {getAugmentName(augmentData, row.augment_id)}
                          </div>
                          <div
                            className="mt-0.5 text-[11px] font-semibold"
                            style={{ color: rarity?.color }}
                          >
                            {rarity?.label ?? "Unknown rarity"}
                          </div>
                        </div>
                        <span className="self-start font-display text-[12px] font-bold tabular-nums text-lol-text/50">
                          #{index + 1}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <CardStat label="Picks" value={formatNumber(row.picks)} />
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
                      <div className="flex items-center gap-1.5">
                        <span className="mr-auto text-[10px] font-bold uppercase tracking-widest text-lol-text/80">
                          Mostly on
                        </span>
                        {row.champions.slice(0, 5).map((champion) => (
                          <ChampionIcon
                            key={champion.champion_id}
                            championId={champion.champion_id}
                            size={24}
                            className="rounded-md"
                          />
                        ))}
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
