import { useMemo, useState } from "react";
import { useHistoryScopeQueue } from "../lib/historyScope";
import { useIpc } from "../hooks/useIpc";
import { useViewState } from "../hooks/useViewState";
import { useItemData, getItemName } from "../hooks/useChampions";
import type { ItemStats } from "../lib/types";
import ItemIcon from "../components/ItemIcon";
import WinRateBar from "../components/WinRateBar";
import QueueSelect from "../components/QueueSelect";
import PatchSelect from "../components/PatchSelect";
import { isAugmentQueue } from "../../shared/queues";
import { useNavigate } from "react-router-dom";
import { useParams } from "react-router-dom";

export default function Items() {
  const [queue, setQueue] = useViewState<number | undefined>("items.queue", undefined);
  const [patch, setPatch] = useViewState<string | undefined>("items.patch", undefined);
  const scopedQueue = queue ?? useHistoryScopeQueue();
  const navigate = useNavigate();
  const { scope } = useParams<{ scope?: string }>();
  const data = useItemData();
  const { data: stats, loading } = useIpc<ItemStats[]>(
    () => window.api.getOwnedItemStats(patch, scopedQueue),
    [patch, scopedQueue],
  );
  const [sortDesc, setSortDesc] = useState(true);
  const [sortKey, setSortKey] = useState<"index" | "name" | "games" | "pickRate" | "winRate">(
    "games",
  );
  const [search, setSearch] = useState("");
  const items = useMemo(() => {
    if (!stats) return [];
    const sorted = stats.filter((item) =>
      getItemName(data, item.item_id).toLowerCase().includes(search.toLowerCase()),
    );
    sorted.sort((a, b) => {
      const aName = getItemName(data, a.item_id);
      const bName = getItemName(data, b.item_id);
      let result =
        sortKey === "name"
          ? aName.localeCompare(bName)
          : sortKey === "winRate"
            ? a.wins / Math.max(a.picks, 1) - b.wins / Math.max(b.picks, 1)
            : sortKey === "pickRate" || sortKey === "games"
              ? a.picks - b.picks
              : a.item_id - b.item_id;
      if (sortDesc) result *= -1;
      return result || aName.localeCompare(bName);
    });
    return sorted;
  }, [data, search, sortDesc, sortKey, stats]);
  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDesc((value) => !value);
    else {
      setSortKey(key);
      setSortDesc(key !== "name");
    }
  };
  if (loading || !stats)
    return (
      <div className="flex items-center justify-center rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] p-12">
        <p className="text-sm text-lol-text">Loading...</p>
      </div>
    );
  const total = stats.reduce((sum, item) => sum + item.picks, 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 [&_select]:h-9 [&_select]:rounded-md [&_select]:border [&_select]:border-lol-border/60 [&_select]:bg-lol-card/40 [&_select]:px-3 [&_select]:text-xs [&_select]:text-lol-text-bright [&_select]:focus-visible:outline-none [&_select]:focus-visible:border-lol-gold/60 [&_select]:focus-visible:ring-1 [&_select]:focus-visible:ring-lol-gold/40 [&_select]:transition-colors">
          <QueueSelect value={queue} onChange={setQueue} filter={(id) => !isAugmentQueue(id)} />
          <PatchSelect value={patch} onChange={setPatch} />
          <input
            className="h-9 w-56 rounded-md border border-lol-border/60 bg-lol-card/40 px-3 text-xs text-lol-text-bright placeholder:text-lol-text/50 focus-visible:outline-none focus-visible:border-lol-gold/60 focus-visible:ring-1 focus-visible:ring-lol-gold/40 transition-colors"
            placeholder="Search item name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03] overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-lol-border/40">
            <tr>
              <th
                className={`px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none transition-colors hover:text-lol-text-bright focus-visible:outline-none focus-visible:text-lol-gold ${
                  sortKey === "index" ? "text-lol-gold" : "text-lol-text"
                }`}
                onClick={() => toggleSort("index")}
              >
                # {sortKey === "index" ? (sortDesc ? "▼" : "▲") : ""}
              </th>
              <th
                className={`px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none transition-colors hover:text-lol-text-bright focus-visible:outline-none focus-visible:text-lol-gold ${
                  sortKey === "name" ? "text-lol-gold" : "text-lol-text"
                }`}
                onClick={() => toggleSort("name")}
              >
                ITEM {sortKey === "name" ? (sortDesc ? "▼" : "▲") : ""}
              </th>
              <th
                className={`px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none transition-colors hover:text-lol-text-bright focus-visible:outline-none focus-visible:text-lol-gold ${
                  sortKey === "games" ? "text-lol-gold" : "text-lol-text"
                }`}
                onClick={() => toggleSort("games")}
              >
                GAMES {sortKey === "games" ? (sortDesc ? "▼" : "▲") : ""}
              </th>
              <th
                className={`px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none transition-colors hover:text-lol-text-bright focus-visible:outline-none focus-visible:text-lol-gold ${
                  sortKey === "pickRate" ? "text-lol-gold" : "text-lol-text"
                }`}
                onClick={() => toggleSort("pickRate")}
              >
                PICK RATE {sortKey === "pickRate" ? (sortDesc ? "▼" : "▲") : ""}
              </th>
              <th
                className={`px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none transition-colors hover:text-lol-text-bright focus-visible:outline-none focus-visible:text-lol-gold ${
                  sortKey === "winRate" ? "text-lol-gold" : "text-lol-text"
                }`}
                onClick={() => toggleSort("winRate")}
              >
                WIN RATE {sortKey === "winRate" ? (sortDesc ? "▼" : "▲") : ""}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const name = getItemName(data, item.item_id);
              return (
                <tr
                  key={item.item_id}
                  onClick={() => navigate(`/history/${scope ?? "full"}/items/${item.item_id}`)}
                  className="group border-b border-lol-border/20 transition-colors hover:bg-white/[0.03] cursor-pointer"
                >
                  <td className="px-3 py-2 text-right text-xs text-lol-text tabular-nums">
                    {index + 1}
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-3 text-sm font-bold text-lol-text-bright">
                      <ItemIcon itemId={item.item_id} size={28} />
                      {name}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-lol-text tabular-nums">
                    {item.picks}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-lol-text tabular-nums">
                    {total ? `${((item.picks / total) * 100).toFixed(1)}%` : "0.0%"}
                  </td>
                  <td className="min-w-0 px-3 py-2">
                    <WinRateBar wins={item.wins} total={item.picks} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
