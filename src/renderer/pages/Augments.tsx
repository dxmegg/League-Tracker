import { useState, useMemo, useEffect } from "react";
import { useIpc } from "../hooks/useIpc";
import { useViewState } from "../hooks/useViewState";
import {
  useChampionData,
  getChampionName,
  useAugmentData,
  getAugmentName,
} from "../hooks/useChampions";
import type { AugmentStatsDetailedResult } from "../lib/types";
import AugmentIcon from "../components/AugmentIcon";
import ChampionIcon from "../components/ChampionIcon";
import WinRateBar from "../components/WinRateBar";
import PatchSelect from "../components/PatchSelect";
import QueueSelect from "../components/QueueSelect";
import { useHistoryScopeQueue } from "../lib/historyScope";
import { isAugmentQueue } from "../../shared/queues";

type SortKey = "picks" | "winRate" | "name";
type SortDir = "asc" | "desc";
type RarityFilter = "all" | "kSilver" | "kGold" | "kPrismatic";

const COLUMN_COUNT = 5;

const rarityFilters: { key: RarityFilter; label: string; color: string; activeColor: string }[] = [
  {
    key: "all",
    label: "All",
    color:
      "border-lol-border/60 bg-lol-card/40 text-lol-text hover:border-lol-gold/40 hover:text-lol-text-bright",
    activeColor: "border-lol-gold/60 bg-lol-gold/15 text-lol-gold",
  },
  {
    key: "kSilver",
    label: "Silver",
    color:
      "border-lol-border/60 bg-lol-card/40 text-lol-text hover:border-lol-gold/40 hover:text-lol-text-bright",
    activeColor: "border-lol-gold/60 bg-lol-gold/15 text-lol-gold",
  },
  {
    key: "kGold",
    label: "Gold",
    color:
      "border-lol-border/60 bg-lol-card/40 text-lol-text hover:border-lol-gold/40 hover:text-lol-text-bright",
    activeColor: "border-lol-gold/60 bg-lol-gold/15 text-lol-gold",
  },
  {
    key: "kPrismatic",
    label: "Prismatic",
    color:
      "border-lol-border/60 bg-lol-card/40 text-lol-text hover:border-lol-gold/40 hover:text-lol-text-bright",
    activeColor: "border-lol-gold/60 bg-lol-gold/15 text-lol-gold",
  },
];

export default function Augments() {
  const champData = useChampionData();
  const augmentData = useAugmentData();
  const [patch, setPatch] = useViewState<string | undefined>("augments.patch", undefined);
  const [queue, setQueue] = useViewState<number | undefined>("augments.queue", undefined);
  const scopedQueue = queue ?? useHistoryScopeQueue();
  const { data, refetch } = useIpc<AugmentStatsDetailedResult>(
    () => window.api.getAugmentStatsDetailed(patch, scopedQueue),
    [patch, scopedQueue],
  );
  const [search, setSearch] = useViewState("augments.search", "");
  const [sortKey, setSortKey] = useViewState<SortKey>("augments.sortKey", "picks");
  const [sortDir, setSortDir] = useViewState<SortDir>("augments.sortDir", "desc");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [rarityFilter, setRarityFilter] = useViewState<RarityFilter>("augments.rarity", "all");

  useEffect(() => {
    const unsub = window.api.onGamesUpdated(() => refetch());
    return unsub;
  }, [refetch]);

  const totalGames = data?.totalGames ?? 0;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const toggleExpand = (augmentId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(augmentId)) next.delete(augmentId);
      else next.add(augmentId);
      return next;
    });
  };

  const sorted = useMemo(() => {
    if (!data) return [];
    let filtered = data.augments.filter((a) => {
      const aug = augmentData[a.augment_id];
      const name = getAugmentName(augmentData, a.augment_id).toLowerCase();
      if (!name.includes(search.toLowerCase())) return false;
      if (rarityFilter !== "all" && aug?.rarity !== rarityFilter) return false;
      return true;
    });

    filtered.sort((a, b) => {
      let av: number, bv: number;
      if (sortKey === "name") {
        const nameA = getAugmentName(augmentData, a.augment_id);
        const nameB = getAugmentName(augmentData, b.augment_id);
        const cmp = nameA.localeCompare(nameB);
        return sortDir === "asc" ? cmp : -cmp;
      } else if (sortKey === "winRate") {
        av = a.picks > 0 ? a.wins / a.picks : 0;
        bv = b.picks > 0 ? b.wins / b.picks : 0;
      } else {
        av = a.picks;
        bv = b.picks;
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });

    return filtered;
  }, [data, search, sortKey, sortDir, augmentData, rarityFilter]);

  if (!data) {
    return (
      <div className="rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03] p-12 text-center">
        <p className="text-sm text-lol-text">Loading...</p>
      </div>
    );
  }

  const SortHeader = ({
    label,
    field,
    className,
  }: {
    label: string;
    field: SortKey;
    className?: string;
  }) => (
    <th
      onClick={() => handleSort(field)}
      className={`px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none transition-colors hover:text-lol-text-bright focus-visible:outline-none focus-visible:text-lol-gold ${
        sortKey === field ? "text-lol-gold" : "text-lol-text"
      } ${className ?? ""}`}
    >
      {label} {sortKey === field ? (sortDir === "desc" ? "▼" : "▲") : ""}
    </th>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Rarity Filter + Search */}
      <div className="flex flex-wrap items-center gap-3">
        {rarityFilters.map((f) => (
          <button
            key={f.key}
            onClick={() => setRarityFilter(f.key)}
            className={`inline-flex h-9 items-center rounded-md border px-3 text-xs font-semibold tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-deep)] ${
              rarityFilter === f.key ? f.activeColor : f.color
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="text-xs text-lol-text self-center ml-2">{sorted.length} augments</span>
        <div className="ml-auto flex items-center gap-2 [&_select]:h-9 [&_select]:rounded-md [&_select]:border [&_select]:border-lol-border/60 [&_select]:bg-lol-card/40 [&_select]:px-3 [&_select]:text-xs [&_select]:text-lol-text-bright [&_select]:focus-visible:outline-none [&_select]:focus-visible:border-lol-gold/60 [&_select]:focus-visible:ring-1 [&_select]:focus-visible:ring-lol-gold/40 [&_select]:transition-colors">
          <QueueSelect value={queue} onChange={setQueue} filter={(id) => isAugmentQueue(id)} />
          <PatchSelect value={patch} onChange={setPatch} />
        </div>
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search augment..."
            className="h-9 w-56 rounded-md border border-lol-border/60 bg-lol-card/40 px-3 text-xs text-lol-text-bright placeholder:text-lol-text/50 focus-visible:outline-none focus-visible:border-lol-gold/60 focus-visible:ring-1 focus-visible:ring-lol-gold/40 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-9 items-center rounded-md border border-lol-gold/30 bg-lol-gold/10 px-3 text-xs font-semibold tracking-wider text-lol-gold transition-colors hover:bg-lol-gold/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-deep)]"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                fill="currentColor"
                className="w-3.5 h-3.5"
              >
                <path
                  fillRule="evenodd"
                  d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm2.78-4.22a.75.75 0 0 1-1.06 0L8 9.06l-1.72 1.72a.75.75 0 1 1-1.06-1.06L6.94 8 5.22 6.28a.75.75 0 0 1 1.06-1.06L8 6.94l1.72-1.72a.75.75 0 1 1 1.06 1.06L9.06 8l1.72 1.72a.75.75 0 0 1 0 1.06Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03] overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-lol-border/40">
            <tr>
              <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-lol-text w-8"></th>
              <SortHeader label="Augment" field="name" />
              <SortHeader label="Picks" field="picks" />
              <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-lol-text">
                Pick Rate
              </th>
              <SortHeader label="Win Rate" field="winRate" className="w-32" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => {
              const isExpanded = expanded.has(a.augment_id);
              const pickRate = totalGames > 0 ? ((a.picks / totalGames) * 100).toFixed(1) : "0.0";
              return (
                <>
                  <tr
                    key={a.augment_id}
                    onClick={() => toggleExpand(a.augment_id)}
                    className="group border-b border-lol-border/20 transition-colors hover:bg-white/[0.03] cursor-pointer"
                  >
                    <td className="px-3 py-2 text-right text-xs text-lol-text tabular-nums">
                      <span
                        className={`inline-block transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      >
                        ▶
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-3 text-sm font-bold text-lol-text-bright">
                        <AugmentIcon augmentId={a.augment_id} showName />
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-lol-text tabular-nums">
                      {a.picks}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-lol-text tabular-nums">
                      {pickRate}%
                    </td>
                    <td className="min-w-0 px-3 py-2">
                      <WinRateBar wins={a.wins} total={a.picks} />
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-black/20">
                      <td colSpan={COLUMN_COUNT} className="px-3 py-4">
                        <div className="flex flex-col gap-3 rounded-md border border-lol-border/30 bg-white/[0.02] p-3">
                          <table className="w-full">
                            <thead>
                              <tr>
                                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-lol-text">
                                  CHAMPION
                                </th>
                                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-lol-text">
                                  GAMES
                                </th>
                                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-lol-text">
                                  WIN RATE
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {a.champions.map((c) => (
                                <tr
                                  key={`${a.augment_id}-${c.champion_id}`}
                                  className="group border-b border-lol-border/20 transition-colors hover:bg-white/[0.03]"
                                >
                                  <td className="px-3 py-2">
                                    <span className="flex items-center gap-3 text-sm font-bold text-lol-text-bright">
                                      <ChampionIcon championId={c.champion_id} size={22} />
                                      {getChampionName(champData, c.champion_id)}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-right text-xs text-lol-text tabular-nums">
                                    {c.picks}
                                  </td>
                                  <td className="min-w-0 px-3 py-2">
                                    <WinRateBar wins={c.wins} total={c.picks} />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03] p-12 text-center">
            <p className="text-sm text-lol-text">No augments found</p>
          </div>
        )}
      </div>
    </div>
  );
}
