import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { ItemStats } from "../lib/types";
import ItemIcon from "./ItemIcon";
import { Tile } from "./Tile";
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

type SortMode = "most-built" | "best-wr";

export function ItemsExp() {
  const navigate = useNavigate();
  const { scope } = useParams<{ scope?: string }>();
  const itemData = useItemData();

  const [queue, setQueue] = useViewState<number | undefined>("items.queue", undefined);
  const [patch, setPatch] = useViewState<string | undefined>("items.patch", undefined);
  const scopedQueue = queue ?? useHistoryScopeQueue();
  const [activeAccountRaw] = useActiveAccount();
  const account = activeAccountRaw === ALL_ACCOUNTS_SENTINEL ? "all" : activeAccountRaw;

  const { data: stats, loading } = useIpc<ItemStats[]>(
    () => window.api.getOwnedItemStats(patch, scopedQueue, account),
    [patch, scopedQueue, account],
  );

  const [sortMode, setSortMode] = useState<SortMode>("most-built");

  const sorted = useMemo(() => {
    if (!stats) return [];
    const copy = [...stats];
    if (sortMode === "most-built") {
      copy.sort((a, b) => b.picks - a.picks);
    } else {
      copy.sort((a, b) => {
        const wrA = a.picks > 0 ? a.wins / a.picks : 0;
        const wrB = b.picks > 0 ? b.wins / b.picks : 0;
        return wrB - wrA;
      });
    }
    return copy;
  }, [stats, sortMode]);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[30px] font-bold leading-tight tracking-[0.2px] text-lol-text-bright">
            Items
          </h1>
          <p className="mt-1.5 text-lol-text">What you build and how it performs</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <QueueSelect value={queue} onChange={setQueue} filter={(id) => !isAugmentQueue(id)} />
          <PatchSelect value={patch} onChange={setPatch} />
          <div className="inline-flex rounded-[10px] border border-lol-border bg-lol-card p-[3px]">
            <button
              type="button"
              onClick={() => setSortMode("most-built")}
              className={`rounded-[7px] px-4 py-1.5 font-display text-[13px] font-semibold transition-colors ${
                sortMode === "most-built"
                  ? "bg-lol-crimson text-white"
                  : "text-lol-text hover:text-lol-text-bright"
              }`}
            >
              Most built
            </button>
            <button
              type="button"
              onClick={() => setSortMode("best-wr")}
              className={`rounded-[7px] px-4 py-1.5 font-display text-[13px] font-semibold transition-colors ${
                sortMode === "best-wr"
                  ? "bg-lol-crimson text-white"
                  : "text-lol-text hover:text-lol-text-bright"
              }`}
            >
              Best win rate
            </button>
          </div>
        </div>
      </div>

      <div className="min-w-0 rounded-[14px] border border-lol-border bg-[linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] p-5">
        {loading || !stats ? (
          <div className="py-8 text-center text-sm text-lol-text">Loading…</div>
        ) : sorted.length === 0 ? (
          <div className="py-8 text-center text-sm text-lol-text">No items played yet.</div>
        ) : (
          <TileGrid>
            {sorted.map((row) => {
              const wr = row.picks > 0 ? (row.wins / row.picks) * 100 : 0;
              return (
                <Tile
                  key={row.item_id}
                  icon={<ItemIcon itemId={row.item_id} size={38} patch={patch} />}
                  title={getItemName(itemData, row.item_id)}
                  subtitle={`${formatNumber(row.picks)} games · ${wr.toFixed(1)}% win`}
                  trackValue={wr}
                  onClick={() => navigate(`/history/${scope ?? "full"}/items/${row.item_id}`)}
                />
              );
            })}
          </TileGrid>
        )}
      </div>
    </div>
  );
}
