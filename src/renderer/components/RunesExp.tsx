import { useMemo, useState, type ReactNode } from "react";
import type { RuneOverview } from "../lib/types";
import { useIpc } from "../hooks/useIpc";
import { useActiveAccount } from "../hooks/useActiveAccount";
import { useRuneData } from "../hooks/useChampions";
import { useHistoryScopeQueue } from "../lib/historyScope";
import { useViewState } from "../hooks/useViewState";
import { ALL_ACCOUNTS_SENTINEL } from "../lib/accountsEvent";
import RuneIcon from "./RuneIcon";
import { Tile } from "./Tile";
import { TileGrid } from "./TileGrid";
import QueueSelect from "./QueueSelect";
import PatchSelect from "./PatchSelect";
import { FilterChip } from "./FilterChip";
import { SearchInput } from "./SearchInput";
import { formatNumber } from "../lib/format";
import { isAugmentQueue } from "../../shared/queues";

const RUNE_TREE_COLORS: Record<string, string> = {
  Precision: "#D6A84F",
  Domination: "#E04F5F",
  Sorcery: "#4AA3F5",
  Resolve: "#52A675",
  Inspiration: "#A783E8",
};

const ACCENTS = [
  { color: "#E5483F", tint: "rgba(229,72,63,0.08)" },
  { color: "#C9A45C", tint: "rgba(201,164,92,0.08)" },
  { color: "#22C55E", tint: "rgba(34,197,94,0.08)" },
  { color: "#3B82F6", tint: "rgba(59,130,246,0.08)" },
];

type SortMode = "most-used" | "best-wr";

function getRuneTreeName(
  runeId: number,
  runeData: ReturnType<typeof useRuneData>,
): string | undefined {
  const iconPath = runeData[runeId]?.icon;
  return iconPath?.match(/(?:^|\/)Styles\/([^/]+)/i)?.[1];
}

function runeName(runeData: ReturnType<typeof useRuneData>, runeId: number): string {
  return runeData[runeId]?.name ?? `Rune ${runeId}`;
}

function runeWinRate(row: { wins: number; picks: number }): number {
  return row.picks > 0 ? (row.wins / row.picks) * 100 : 0;
}

type RuneRow = { rune_id: number; picks: number; wins: number };

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
  rune,
  runeData,
  value,
  caption,
  accent,
  emptyTitle,
  treeName,
}: {
  title: string;
  rune: RuneRow | null;
  runeData: ReturnType<typeof useRuneData>;
  value: string;
  caption: string;
  accent: (typeof ACCENTS)[number];
  emptyTitle?: string;
  treeName?: string;
}) {
  const iconId = rune?.rune_id ?? 0;
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
        {rune ? (
          <div
            className="shrink-0 rounded-lg border p-1 shadow-[0_0_14px_rgba(229,72,63,0.18)]"
            style={{ borderColor: accent.color }}
          >
            <RuneIcon runeId={iconId} path={runeData[iconId]?.icon} size={40} />
          </div>
        ) : (
          <div className="h-[50px] w-[50px] shrink-0 rounded-lg border border-lol-border bg-black/10" />
        )}
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-lol-text">
            {title}
          </div>
          <div className="mt-1 truncate text-sm font-bold text-lol-text-bright">
            {rune ? (treeName ?? runeName(runeData, rune.rune_id)) : "—"}
          </div>
          <div className="mt-1 text-xl font-bold leading-none text-lol-text-bright">{value}</div>
          <div className="mt-1 text-[11px] text-lol-text">{caption}</div>
        </div>
      </div>
    </div>
  );
}

export function RunesExp() {
  const runeData = useRuneData();
  const [patch, setPatch] = useViewState<string | undefined>("runes.patch", undefined);
  const [queue, setQueue] = useViewState<number | undefined>("runes.queue", undefined);
  const scopedQueue = queue ?? useHistoryScopeQueue();
  const [activeAccountRaw] = useActiveAccount();
  const account = activeAccountRaw === ALL_ACCOUNTS_SENTINEL ? "all" : activeAccountRaw;
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("most-used");
  const [minGames, setMinGames] = useState(0);
  const { data, loading } = useIpc<RuneOverview>(
    () => window.api.getOwnedRuneStats(scopedQueue, patch, account),
    [scopedQueue, patch, account],
  );

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.runes ?? [])
      .filter((rune) => runeData[rune.rune_id]?.category === "keystone")
      .filter(
        (rune) =>
          rune.picks >= minGames &&
          (!query || runeName(runeData, rune.rune_id).toLowerCase().includes(query)),
      );
  }, [data, minGames, runeData, search]);

  const sorted = useMemo(() => {
    const rows = [...filteredRows];
    rows.sort((a, b) =>
      sortMode === "most-used"
        ? b.picks - a.picks
        : runeWinRate(b) - runeWinRate(a) || b.picks - a.picks,
    );
    return rows;
  }, [filteredRows, sortMode]);

  const totalGames = useMemo(
    () => (data?.champions ?? []).reduce((sum, champion) => sum + champion.games, 0),
    [data],
  );
  const totalPicks = filteredRows.reduce((sum, rune) => sum + rune.picks, 0);
  const totalWins = filteredRows.reduce((sum, rune) => sum + rune.wins, 0);
  const mostUsed = filteredRows.reduce<RuneRow | null>(
    (best, rune) => (!best || rune.picks > best.picks ? rune : best),
    null,
  );
  const bestWinRate =
    filteredRows
      .filter((rune) => rune.picks >= 25)
      .sort((a, b) => runeWinRate(b) - runeWinRate(a) || b.picks - a.picks)[0] ?? null;
  const treeTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const rune of filteredRows) {
      const tree = getRuneTreeName(rune.rune_id, runeData);
      if (tree) totals.set(tree, (totals.get(tree) ?? 0) + rune.picks);
    }
    return totals;
  }, [filteredRows, runeData]);
  const mostUsedTree = [...treeTotals.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="relative pl-4 font-display text-[30px] font-bold leading-tight tracking-[0.2px] text-lol-text-bright before:absolute before:left-1 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson after:absolute after:bottom-[-8px] after:left-4 after:h-px after:w-28 after:bg-gradient-to-r after:from-lol-crimson/70 after:to-transparent">
            Runes
          </h1>
          <p className="mt-1.5 text-lol-text">Keystones and rune pages you actually play</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <QueueSelect value={queue} onChange={setQueue} filter={(id) => !isAugmentQueue(id)} />
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
              label="Runes shown"
              value={formatNumber(filteredRows.length)}
              caption={`of ${formatNumber(data.runes.length)} tracked`}
              accent={ACCENTS[0]}
            />
            <KpiTile
              label="Total selections"
              value={formatNumber(totalPicks)}
              caption="in the selected queue and patch"
              accent={ACCENTS[1]}
            />
            <KpiTile
              label="Average win rate"
              value={totalPicks > 0 ? `${((totalWins / totalPicks) * 100).toFixed(1)}%` : "—"}
              caption="across all runes"
              accent={ACCENTS[2]}
            />
            <KpiTile
              label="Games in scope"
              value={formatNumber(totalGames)}
              caption="sample across rune pages"
              accent={ACCENTS[3]}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <HighlightCard
              title="Most used keystone"
              rune={mostUsed}
              runeData={runeData}
              value={mostUsed ? `${formatNumber(mostUsed.picks)} picks` : "—"}
              caption={
                mostUsed && totalPicks > 0
                  ? `${((mostUsed.picks / totalPicks) * 100).toFixed(1)}% of all selections`
                  : "No rune data"
              }
              accent={ACCENTS[0]}
            />
            <HighlightCard
              title="Best win-rate keystone"
              rune={bestWinRate}
              runeData={runeData}
              value={bestWinRate ? `${runeWinRate(bestWinRate).toFixed(1)}%` : "—"}
              caption={
                bestWinRate
                  ? `minimum 25 picks · ${formatNumber(bestWinRate.picks)} picks`
                  : "No keystone meets the minimum"
              }
              accent={ACCENTS[1]}
              emptyTitle={bestWinRate ? undefined : "Not enough games"}
            />
            <HighlightCard
              title="Most used rune tree"
              rune={
                mostUsedTree
                  ? (filteredRows.find(
                      (rune) => getRuneTreeName(rune.rune_id, runeData) === mostUsedTree[0],
                    ) ?? null)
                  : null
              }
              runeData={runeData}
              treeName={mostUsedTree?.[0]}
              value={mostUsedTree ? `${formatNumber(mostUsedTree[1])} picks` : "—"}
              caption={
                mostUsedTree
                  ? `${formatNumber(mostUsedTree[1])} picks across the tree`
                  : "No rune tree data"
              }
              accent={ACCENTS[2]}
              emptyTitle={mostUsedTree ? undefined : "Not enough games"}
            />
          </div>

          <section>
            <div className="mb-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-lol-text">
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
                  placeholder="Search runes"
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
                    ["most-used", "Most used"],
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

            <div className="mb-5">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="relative pl-3 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-1.5 before:w-1.5 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson after:absolute after:bottom-[-6px] after:left-3 after:h-px after:w-20 after:bg-gradient-to-r after:from-lol-crimson/60 after:to-transparent">
                  Keystones
                </h2>
                <span className="text-xs uppercase tracking-wider text-lol-text">
                  {formatNumber(sorted.length)} shown
                </span>
              </div>
              {sorted.length === 0 ? (
                <div className="py-8 text-center text-sm text-lol-text">No runes played yet.</div>
              ) : (
                <TileGrid>
                  {sorted.map((rune) => {
                    const treeName = getRuneTreeName(rune.rune_id, runeData);
                    return (
                      <Tile
                        key={rune.rune_id}
                        icon={
                          <RuneIcon
                            runeId={rune.rune_id}
                            path={runeData[rune.rune_id]?.icon}
                            size={38}
                          />
                        }
                        title={runeName(runeData, rune.rune_id)}
                        subtitle={`${formatNumber(rune.picks)} games · ${runeWinRate(rune).toFixed(1)}% win`}
                        trackValue={runeWinRate(rune)}
                        accent={RUNE_TREE_COLORS[treeName ?? ""] ?? "#94A3B8"}
                      />
                    );
                  })}
                </TileGrid>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
