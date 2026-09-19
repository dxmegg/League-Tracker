import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import { useIpc } from "../hooks/useIpc";
import { useViewState } from "../hooks/useViewState";
import { readViewState, writeViewState } from "../lib/viewState";
import {
  useChampionData,
  getChampionName,
  useAugmentData,
  getAugmentName,
  useItemData,
} from "../hooks/useChampions";
import type { GlobalStats } from "../lib/types";
import ChampionIcon from "../components/ChampionIcon";
import AugmentIcon from "../components/AugmentIcon";
import ItemIcon from "../components/ItemIcon";
import WinRateBar from "../components/WinRateBar";
import { FilterChip } from "../components/FilterChip";
import { SearchInput } from "../components/SearchInput";
import PatchSelect from "../components/PatchSelect";
import QueueSelect from "../components/QueueSelect";
import { type Rarity } from "../components/RarityFilter";
import { useHistoryScopeQueue } from "../lib/historyScope";

type Tab = "champions" | "augments" | "items";
type ChampSortKey = "games" | "winRate" | "pickRate" | "name";
type AugSortKey = "picks" | "winRate" | "pickRate" | "name";
type ItemSortKey = "picks" | "winRate" | "name";
type SortDir = "asc" | "desc";

function SearchInputWithClear({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <SearchInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-56 pr-7"
      />
      {value && (
        <FilterChip
          onClick={() => onChange("")}
          title="Clear search"
          className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 !px-0"
          icon={
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
          }
        />
      )}
    </div>
  );
}

export default function GlobalStats() {
  const champData = useChampionData();
  const augmentData = useAugmentData();
  const navigate = useNavigate();
  // Filters and tab live in the URL so returning from a champion page lands
  // back on the same view
  const [searchParams, setSearchParams] = useSearchParams();
  const patch = searchParams.get("patch") ?? undefined;
  const queueParam = searchParams.get("queue");
  const queue = queueParam ? Number(queueParam) : undefined;
  const scopedQueue = queue ?? useHistoryScopeQueue();
  const scopedHistory = useHistoryScopeQueue() !== undefined;
  const { scope } = useParams<{ scope?: string }>();
  const allowScopedAugments = true;
  const tabParam = searchParams.get("tab");
  const tab: Tab = tabParam === "augments" || tabParam === "items" ? tabParam : "champions";
  const visibleTab = tab;

  const setParam = (key: string, value: string | number | undefined) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value == null || value === "") next.delete(key);
        else next.set(key, String(value));
        return next;
      },
      { replace: true },
    );
  };
  const setPatch = (p: string | undefined) => setParam("patch", p);
  const setQueue = (q: number | undefined) => setParam("queue", q);
  const setTab = (t: Tab) => setParam("tab", t === "champions" ? undefined : t);

  // Those three live in the URL, so remembering them means putting the query
  // string back on the way in. Arriving with one already set — the back link
  // from a champion page — wins over whatever was stored.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    const saved = readViewState("global.params", "");
    if (saved && !searchParams.toString()) {
      setSearchParams(new URLSearchParams(saved), { replace: true });
    }
    setRestored(true);
    // Only ever on the way in, so the stored value can't clobber a live edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (restored) writeViewState("global.params", searchParams.toString());
  }, [restored, searchParams]);

  // Carried into the champion page so it opens with the same filters, and
  // comes back on its back link
  const filterQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (patch) params.set("patch", patch);
    if (queue != null) params.set("queue", String(queue));
    const query = params.toString();
    return query ? `?${query}` : "";
  }, [patch, queue]);

  const { data, refetch } = useIpc<GlobalStats>(
    () => window.api.getGlobalStats(patch, scopedQueue),
    [patch, scopedQueue],
  );

  // Champion tab state
  const [champSearch, setChampSearch] = useViewState("global.champSearch", "");
  const [champSortKey, setChampSortKey] = useViewState<ChampSortKey>(
    "global.champSortKey",
    "games",
  );
  const [champSortDir, setChampSortDir] = useViewState<SortDir>("global.champSortDir", "desc");

  // Augment tab state
  const [augSearch, setAugSearch] = useViewState("global.augSearch", "");
  const [augSortKey, setAugSortKey] = useViewState<AugSortKey>("global.augSortKey", "picks");
  const [augSortDir, setAugSortDir] = useViewState<SortDir>("global.augSortDir", "desc");
  const [rarityFilter, setRarityFilter] = useViewState<Rarity>("global.augRarity", "all");

  // Item tab state
  const itemData = useItemData(patch);
  const [itemSearch, setItemSearch] = useViewState("global.itemSearch", "");
  const [itemSortKey, setItemSortKey] = useViewState<ItemSortKey>("global.itemSortKey", "picks");
  const [itemSortDir, setItemSortDir] = useViewState<SortDir>("global.itemSortDir", "desc");

  useEffect(() => {
    const unsub = window.api.onGamesUpdated(() => refetch());
    return unsub;
  }, [refetch]);

  const totalGames = data ? data.totalGames : 0;

  const handleChampSort = (key: ChampSortKey) => {
    if (champSortKey === key) {
      setChampSortDir(champSortDir === "desc" ? "asc" : "desc");
    } else {
      setChampSortKey(key);
      setChampSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const handleAugSort = (key: AugSortKey) => {
    if (augSortKey === key) {
      setAugSortDir(augSortDir === "desc" ? "asc" : "desc");
    } else {
      setAugSortKey(key);
      setAugSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const handleItemSort = (key: ItemSortKey) => {
    if (itemSortKey === key) {
      setItemSortDir(itemSortDir === "desc" ? "asc" : "desc");
    } else {
      setItemSortKey(key);
      setItemSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const sortedChampions = useMemo(() => {
    if (!data) return [];
    let filtered = data.champions.filter((c) => {
      const name = getChampionName(champData, c.champion_id).toLowerCase();
      return name.includes(champSearch.toLowerCase());
    });

    filtered.sort((a, b) => {
      let av: number, bv: number;
      if (champSortKey === "name") {
        const nameA = getChampionName(champData, a.champion_id);
        const nameB = getChampionName(champData, b.champion_id);
        const cmp = nameA.localeCompare(nameB);
        return champSortDir === "asc" ? cmp : -cmp;
      } else if (champSortKey === "winRate") {
        av = a.games > 0 ? a.wins / a.games : 0;
        bv = b.games > 0 ? b.wins / b.games : 0;
      } else if (champSortKey === "pickRate") {
        av = data.totalParticipantSlots > 0 ? a.games / data.totalParticipantSlots : 0;
        bv = data.totalParticipantSlots > 0 ? b.games / data.totalParticipantSlots : 0;
      } else {
        av = a.games;
        bv = b.games;
      }
      return champSortDir === "desc" ? bv - av : av - bv;
    });

    return filtered;
  }, [data, champSearch, champSortKey, champSortDir, champData]);

  const sortedAugments = useMemo(() => {
    if (!data) return [];
    let filtered = data.augments.filter((a) => {
      const name = getAugmentName(augmentData, a.augment_id).toLowerCase();
      if (!name.includes(augSearch.toLowerCase())) return false;
      if (rarityFilter !== "all" && augmentData[a.augment_id]?.rarity !== rarityFilter)
        return false;
      return true;
    });

    filtered.sort((a, b) => {
      let av: number, bv: number;
      if (augSortKey === "name") {
        const nameA = getAugmentName(augmentData, a.augment_id);
        const nameB = getAugmentName(augmentData, b.augment_id);
        const cmp = nameA.localeCompare(nameB);
        return augSortDir === "asc" ? cmp : -cmp;
      } else if (augSortKey === "winRate") {
        av = a.picks > 0 ? a.wins / a.picks : 0;
        bv = b.picks > 0 ? b.wins / b.picks : 0;
      } else if (augSortKey === "pickRate") {
        av = data!.totalParticipantSlots > 0 ? a.picks / data!.totalParticipantSlots : 0;
        bv = data!.totalParticipantSlots > 0 ? b.picks / data!.totalParticipantSlots : 0;
      } else {
        av = a.picks;
        bv = b.picks;
      }
      return augSortDir === "desc" ? bv - av : av - bv;
    });

    return filtered;
  }, [data, augSearch, augSortKey, augSortDir, augmentData, rarityFilter]);

  const getItemName = useCallback((id: number) => itemData[id]?.name ?? `Item ${id}`, [itemData]);

  const sortedItems = useMemo(() => {
    if (!data) return [];
    const filtered = data.items.filter((it) =>
      getItemName(it.item_id).toLowerCase().includes(itemSearch.toLowerCase()),
    );

    filtered.sort((a, b) => {
      if (itemSortKey === "name") {
        const cmp = getItemName(a.item_id).localeCompare(getItemName(b.item_id));
        return itemSortDir === "asc" ? cmp : -cmp;
      }
      let av: number, bv: number;
      if (itemSortKey === "winRate") {
        av = a.picks > 0 ? a.wins / a.picks : 0;
        bv = b.picks > 0 ? b.wins / b.picks : 0;
      } else {
        av = a.picks;
        bv = b.picks;
      }
      return itemSortDir === "desc" ? bv - av : av - bv;
    });

    return filtered;
  }, [data, itemSearch, itemSortKey, itemSortDir, getItemName]);

  if (!data) {
    return <div className="text-lol-text text-center mt-20">Loading...</div>;
  }

  const ChampSortHeader = ({
    label,
    field,
    className,
  }: {
    label: string;
    field: ChampSortKey;
    className?: string;
  }) => (
    <th
      onClick={() => handleChampSort(field)}
      className={`px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none transition-colors hover:text-lol-text-bright focus-visible:outline-none focus-visible:text-lol-gold ${
        champSortKey === field ? "text-lol-gold" : "text-lol-text"
      } ${className ?? ""}`}
    >
      {label} {champSortKey === field ? (champSortDir === "desc" ? "\u25BC" : "\u25B2") : ""}
    </th>
  );

  const AugSortHeader = ({
    label,
    field,
    className,
  }: {
    label: string;
    field: AugSortKey;
    className?: string;
  }) => (
    <th
      onClick={() => handleAugSort(field)}
      className={`px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none transition-colors hover:text-lol-text-bright focus-visible:outline-none focus-visible:text-lol-gold ${
        augSortKey === field ? "text-lol-gold" : "text-lol-text"
      } ${className ?? ""}`}
    >
      {label} {augSortKey === field ? (augSortDir === "desc" ? "\u25BC" : "\u25B2") : ""}
    </th>
  );

  const ItemSortHeader = ({
    label,
    field,
    className,
  }: {
    label: string;
    field: ItemSortKey;
    className?: string;
  }) => (
    <th
      onClick={() => handleItemSort(field)}
      className={`px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none transition-colors hover:text-lol-text-bright focus-visible:outline-none focus-visible:text-lol-gold ${
        itemSortKey === field ? "text-lol-gold" : "text-lol-text"
      } ${className ?? ""}`}
    >
      {label} {itemSortKey === field ? (itemSortDir === "desc" ? "\u25BC" : "\u25B2") : ""}
    </th>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-lol-text">
            {totalGames} games &middot; {data.champions.length} champions &middot;{" "}
            {data.augments.length} augments &middot; {data.items.length} items
          </span>
          <div className="flex items-center gap-2 [&_select]:h-9 [&_select]:rounded-md [&_select]:border [&_select]:border-lol-border/60 [&_select]:bg-lol-card/40 [&_select]:px-3 [&_select]:text-xs [&_select]:text-lol-text-bright [&_select]:focus-visible:outline-none [&_select]:focus-visible:border-lol-gold/60 [&_select]:focus-visible:ring-1 [&_select]:focus-visible:ring-lol-gold/40 [&_select]:transition-colors">
            <QueueSelect value={queue} onChange={setQueue} />
            <PatchSelect value={patch} onChange={setPatch} />
          </div>
        </div>
      </div>

      <p className="text-xs font-bold uppercase tracking-wider text-lol-text">
        Statistics about game presence
      </p>

      {/* Tabs */}
      <div className="flex items-center">
        <div className="inline-flex items-center gap-2">
          <FilterChip
            onClick={() => setTab("champions")}
            active={tab === "champions"}
            className="h-8 px-3 text-xs font-semibold"
          >
            CHAMPIONS
          </FilterChip>
          {(!scopedHistory || allowScopedAugments) && (
            <FilterChip
              onClick={() => setTab("augments")}
              active={tab === "augments"}
              className="h-8 px-3 text-xs font-semibold"
            >
              AUGMENTS
            </FilterChip>
          )}
          <FilterChip
            onClick={() => setTab("items")}
            active={tab === "items"}
            className="h-8 px-3 text-xs font-semibold"
          >
            ITEMS
          </FilterChip>
        </div>
      </div>

      <p className="text-xs text-lol-text">
        {tab === "champions" && "How many times you've met each champion"}
        {tab === "augments" && "How many times each augment was picked"}
        {tab === "items" && "How many times each item was present in your games"}
      </p>

      {visibleTab === "champions" && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-xs text-lol-text">{sortedChampions.length} champions</span>
            <SearchInputWithClear
              value={champSearch}
              onChange={setChampSearch}
              placeholder="Search champion..."
            />
          </div>

          <div className="rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03] overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-lol-border/40 bg-lol-dark/50">
                <tr>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-lol-text w-12">
                    #
                  </th>
                  <ChampSortHeader label="Champion" field="name" />
                  <ChampSortHeader label="Games" field="games" />
                  <ChampSortHeader label="Pick Rate" field="pickRate" />
                  <ChampSortHeader label="Win Rate" field="winRate" className="w-32" />
                </tr>
              </thead>
              <tbody>
                {sortedChampions.map((c, i) => {
                  const pickRate =
                    data.totalParticipantSlots > 0
                      ? ((c.games / data.totalParticipantSlots) * 100).toFixed(1)
                      : "0.0";
                  return (
                    <tr
                      key={c.champion_id}
                      onClick={() =>
                        navigate(
                          scope
                            ? `/history/${scope}/total-stats/champion/${c.champion_id}${filterQuery}`
                            : `/global/champion/${c.champion_id}${filterQuery}`,
                        )
                      }
                      className="group border-b border-lol-border/20 transition-colors hover:bg-white/[0.03] cursor-pointer"
                    >
                      <td className="px-3 py-2 text-right text-xs text-lol-text tabular-nums">
                        {i + 1}
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-3 text-sm font-bold text-lol-text-bright">
                          <ChampionIcon championId={c.champion_id} size={28} />
                          {getChampionName(champData, c.champion_id)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-lol-text tabular-nums">
                        {c.games}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-lol-text tabular-nums">
                        {pickRate}%
                      </td>
                      <td className="px-3 py-2 w-32">
                        <WinRateBar wins={c.wins} total={c.games} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sortedChampions.length === 0 && (
              <div className="py-8 text-center text-sm text-lol-text">No champions found</div>
            )}
          </div>
        </>
      )}

      {visibleTab === "items" && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-xs text-lol-text">{sortedItems.length} items</span>
            <SearchInputWithClear
              value={itemSearch}
              onChange={setItemSearch}
              placeholder="Search item..."
            />
          </div>

          <div className="rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03] overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-lol-border/40 bg-lol-dark/50">
                <tr>
                  <ItemSortHeader label="Item" field="name" />
                  <ItemSortHeader label="Picks" field="picks" />
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-lol-text">
                    Pick Rate
                  </th>
                  <ItemSortHeader label="Win Rate" field="winRate" className="w-32" />
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item) => {
                  const pickRate =
                    data.totalParticipantSlots > 0
                      ? ((item.picks / data.totalParticipantSlots) * 100).toFixed(1)
                      : "0.0";
                  return (
                    <tr
                      key={item.item_id}
                      className="group border-b border-lol-border/20 transition-colors hover:bg-white/[0.03]"
                    >
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-3 text-sm font-bold text-lol-text-bright">
                          <ItemIcon itemId={item.item_id} size={28} patch={patch} />
                          {getItemName(item.item_id)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-lol-text tabular-nums">
                        {item.picks}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-lol-text tabular-nums">
                        {pickRate}%
                      </td>
                      <td className="px-3 py-2 w-32">
                        <WinRateBar wins={item.wins} total={item.picks} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sortedItems.length === 0 && (
              <div className="py-8 text-center text-sm text-lol-text">No items found</div>
            )}
          </div>
        </>
      )}

      {visibleTab === "augments" && (
        <>
          <div className="flex items-center gap-2">
            {(
              [
                ["all", "All"],
                ["kSilver", "Silver"],
                ["kGold", "Gold"],
                ["kPrismatic", "Prismatic"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setRarityFilter(value)}
                className={`inline-flex h-8 items-center rounded-md border px-3 text-xs font-semibold tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-deep)] ${
                  rarityFilter === value
                    ? "border-lol-gold/60 bg-lol-gold/15 text-lol-gold"
                    : "border-lol-border/60 bg-lol-card/40 text-lol-text hover:border-lol-gold/40 hover:text-lol-text-bright"
                }`}
              >
                {label}
              </button>
            ))}
            <span className="text-xs text-lol-text self-center ml-2">
              {sortedAugments.length} augments
            </span>
            <div className="ml-auto">
              <SearchInputWithClear
                value={augSearch}
                onChange={setAugSearch}
                placeholder="Search augment..."
              />
            </div>
          </div>

          <div className="rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03] overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-lol-border/40 bg-lol-dark/50">
                <tr>
                  <AugSortHeader label="Augment" field="name" />
                  <AugSortHeader label="Picks" field="picks" />
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-lol-text">
                    Pick Rate
                  </th>
                  <AugSortHeader label="Win Rate" field="winRate" className="w-32" />
                </tr>
              </thead>
              <tbody>
                {sortedAugments.map((a) => {
                  const pickRate =
                    data.totalParticipantSlots > 0
                      ? ((a.picks / data.totalParticipantSlots) * 100).toFixed(1)
                      : "0.0";
                  return (
                    <tr
                      key={a.augment_id}
                      className="group border-b border-lol-border/20 transition-colors hover:bg-white/[0.03]"
                    >
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-3 text-sm font-bold text-lol-text-bright">
                          <AugmentIcon augmentId={a.augment_id} />
                          {getAugmentName(augmentData, a.augment_id)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-lol-text tabular-nums">
                        {a.picks}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-lol-text tabular-nums">
                        {pickRate}%
                      </td>
                      <td className="px-3 py-2 w-32">
                        <WinRateBar wins={a.wins} total={a.picks} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sortedAugments.length === 0 && (
              <div className="py-8 text-center text-sm text-lol-text">No augments found</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
