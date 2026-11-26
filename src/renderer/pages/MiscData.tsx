import { useEffect, useState, type ReactNode } from "react";
import type { OtherPlayersStats } from "../../shared/api";
import AugmentIcon from "../components/AugmentIcon";
import ChampionIcon from "../components/ChampionIcon";
import ItemIcon from "../components/ItemIcon";
import ScrollMore, { SCROLL_PAGE } from "../components/ScrollMore";
import { Title } from "../components/live/shared";
import {
  getAugmentName,
  getChampionName,
  getItemName,
  useAugmentData,
  useChampionData,
  useItemData,
} from "../hooks/useChampions";
import { useIpc } from "../hooks/useIpc";
import { useViewState } from "../hooks/useViewState";
import { formatNumber } from "../lib/format";
import { useScopedQueue } from "../lib/historyScope";
import { mergeItemsByName } from "../../shared/item-merge";

interface Row {
  id: number;
  count: number;
  wins: number;
  name: string;
  icon: ReactNode;
}

const GRID = "grid grid-cols-[minmax(0,1fr)_64px_72px] items-center gap-2 px-2.5";

function CountTable({ title, viewKey, rows }: { title: string; viewKey: string; rows: Row[] }) {
  const [sort, setSort] = useViewState<"count" | "winRate">(`misc.${viewKey}.sort`, "count");
  const rate = (r: Row) => r.wins / r.count;
  const [visible, setVisible] = useState(SCROLL_PAGE);
  useEffect(() => setVisible(SCROLL_PAGE), [sort]);
  const sorted = rows
    .slice()
    .sort((a, b) =>
      sort === "count" ? b.count - a.count : rate(b) - rate(a) || b.count - a.count,
    );

  const header = (key: "count" | "winRate", label: string) => (
    <button
      type="button"
      onClick={() => setSort(key)}
      aria-pressed={sort === key}
      className={`text-right uppercase ${sort === key ? "text-lol-text-bright" : "hover:text-lol-text-bright"}`}
    >
      {label}
      {sort === key ? " ▾" : ""}
    </button>
  );

  return (
    <section className="app-tile flex min-w-0 flex-col">
      <Title aside={<span className="text-[12px] text-lol-text">{rows.length} different</span>}>
        {title}
      </Title>
      <div
        className={`${GRID} pb-2 text-[11px] font-semibold tracking-wider text-lol-text/80 uppercase`}
      >
        <span>Name</span>
        {header("count", "Count")}
        {header("winRate", "Win rate")}
      </div>
      <div className="flex max-h-[65vh] flex-col gap-1.5 overflow-y-auto">
        {sorted.length === 0 && (
          <p className="py-4 text-center text-xs text-lol-text/70">No data</p>
        )}
        {sorted.slice(0, visible).map((r) => (
          <div
            key={r.id}
            className={`${GRID} min-h-10 shrink-0 rounded-lg border border-lol-border/40 bg-black/25 text-[13px] tabular-nums`}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="shrink-0">{r.icon}</span>
              <span className="truncate text-lol-text-bright">{r.name}</span>
            </span>
            <span className="text-right text-lol-text">{formatNumber(r.count)}</span>
            <span className={`text-right ${rate(r) >= 0.5 ? "text-lol-win" : "text-lol-loss"}`}>
              {(rate(r) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
        {sorted.length > visible && (
          <ScrollMore onMore={() => setVisible((n) => n + SCROLL_PAGE)} />
        )}
      </div>
    </section>
  );
}

export default function MiscData() {
  const queue = useScopedQueue(undefined);
  const champData = useChampionData();
  const augmentData = useAugmentData(undefined);
  const itemData = useItemData(undefined);
  const { data, refetch } = useIpc<OtherPlayersStats>(
    () => window.api.getOtherPlayersStats(queue),
    [queue],
  );

  useEffect(() => window.api.onGamesUpdated(() => refetch()), [refetch]);

  return (
    <div className="flex w-full flex-col gap-5">
      <div>
        <h1 className="font-display text-[34px] leading-none font-bold text-lol-text-bright">
          Misc. Data
        </h1>
        <p className="mt-2 text-[13px] text-lol-text">
          What the other players in your games picked and built. Your own accounts are left out.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <CountTable
          title="Champions"
          viewKey="champions"
          rows={(data?.champions ?? []).map((r) => ({
            ...r,
            name: getChampionName(champData, r.id),
            icon: <ChampionIcon championId={r.id} size={26} className="rounded-md" />,
          }))}
        />
        <CountTable
          title="Augments"
          viewKey="augments"
          rows={(data?.augments ?? []).map((r) => ({
            ...r,
            name: getAugmentName(augmentData, r.id),
            icon: <AugmentIcon augmentId={r.id} size={26} />,
          }))}
        />
        <CountTable
          title="Items"
          viewKey="items"
          rows={mergeItemsByName(
            (data?.items ?? []).map((r) => ({ item_id: r.id, picks: r.count, wins: r.wins })),
            (itemId) => getItemName(itemData, itemId),
          ).map((r) => ({
            id: r.item_id,
            count: r.picks,
            wins: r.wins,
            name: getItemName(itemData, r.item_id),
            icon: <ItemIcon itemId={r.item_id} size={26} />,
          }))}
        />
      </div>
    </div>
  );
}
