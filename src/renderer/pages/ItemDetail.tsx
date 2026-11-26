import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ItemDetail as ItemDetailData } from "../lib/types";
import { useIpc } from "../hooks/useIpc";
import { useScopedQueue } from "../lib/historyScope";
import { useActiveAccount } from "../hooks/useActiveAccount";
import { useViewState } from "../hooks/useViewState";
import { ALL_ACCOUNTS_SENTINEL } from "../lib/accountsEvent";
import { getItemName, useItemData } from "../hooks/useChampions";
import ItemIcon from "../components/ItemIcon";
import { ChampionBreakdown } from "../components/ChampionBreakdown";
import { EmptyState } from "../components/EmptyState";
import { ItemInsights } from "../components/ItemInsights";
import RiotText from "../components/RiotText";
import { Panel } from "../components/Panel";
import { HeroTile, SplashHero } from "../components/SplashHero";
import { Title } from "../components/live/shared";
import { formatDuration } from "../lib/format";
import { QUEUE_LABELS } from "../../shared/queues";

export default function ItemDetail() {
  const { itemId } = useParams<{ itemId: string }>();
  const id = Number(itemId);
  // The filters of the Items list, so the numbers here match the row that led here
  const [listQueue] = useViewState<number | undefined>("items.queue", undefined);
  const [patch] = useViewState<string | undefined>("items.patch", undefined);
  const queue = useScopedQueue(listQueue);
  const [activeAccountRaw] = useActiveAccount();
  const account = activeAccountRaw === ALL_ACCOUNTS_SENTINEL ? "all" : activeAccountRaw;
  const items = useItemData(patch);
  const [zoomOpen, setZoomOpen] = useState(false);
  // The page has no filter controls of its own, so it names the ones it took from the list
  const filters = [
    patch && `Patch ${patch}`,
    listQueue != null && queue === listQueue && (QUEUE_LABELS[listQueue] ?? "One queue"),
  ].filter(Boolean);
  // Every mode's id of this item, the one in the address first
  const name = items[id]?.name;
  const ids = [id, ...Object.keys(items).map(Number)].filter(
    (other, index) => index === 0 || (other !== id && name && items[other].name === name),
  );
  const { data, loading } = useIpc<ItemDetailData>(
    () => window.api.getOwnedItemDetail(ids, patch, queue, account),
    [ids.join(), patch, queue, account],
  );
  const averageGameDuration = useMemo(() => {
    const matches = data?.champions.flatMap((row) => row.matches) ?? [];
    return matches.length > 0
      ? matches.reduce((total, match) => total + match.game_duration, 0) / matches.length
      : null;
  }, [data]);

  const averageKda = useMemo(() => {
    const matches = data?.champions.flatMap((row) => row.matches) ?? [];
    if (matches.length === 0) return "—";

    const totals = matches.reduce(
      (total, match) => ({
        kills: total.kills + match.kills,
        deaths: total.deaths + match.deaths,
        assists: total.assists + match.assists,
      }),
      { kills: 0, deaths: 0, assists: 0 },
    );
    if (totals.deaths === 0 && totals.kills + totals.assists > 0) return "Perfect";
    return ((totals.kills + totals.assists) / Math.max(totals.deaths, 1)).toFixed(2);
  }, [data]);

  if (loading || !data) {
    return (
      <div className="flex min-h-full w-full items-center justify-center rounded-[14px] border border-lol-border p-12 text-sm text-lol-text">
        Loading item details…
      </div>
    );
  }

  const item = items[id];
  const back = "/items";
  const winRate = data.picks ? (data.wins / data.picks) * 100 : 0;
  const buildRate = data.totalGames ? (data.picks / data.totalGames) * 100 : 0;
  // Banner art: whoever builds this item the most
  const topBuilder = [...data.champions].sort((a, b) => b.games - a.games)[0]?.champion_id;

  return (
    <div className="flex min-h-full w-full flex-col gap-5">
      <Link
        to={back}
        className="w-fit rounded-lg border border-lol-border bg-[var(--theme-card)] px-3 py-1.5 text-sm font-medium text-lol-text-bright transition-colors hover:border-lol-crimson/70"
      >
        ← All items
      </Link>

      <SplashHero championId={topBuilder}>
        <div className="flex items-center gap-5">
          <button
            type="button"
            className="shrink-0 cursor-zoom-in overflow-hidden rounded-2xl border border-lol-crimson/50 bg-black/40 p-1.5 shadow-[0_0_28px_var(--theme-crimson-glow)]"
            onClick={() => setZoomOpen(true)}
            aria-label={`Enlarge ${getItemName(items, id)} icon`}
          >
            <ItemIcon itemId={id} size={84} patch={patch} />
          </button>
          <div className="min-w-0">
            <h1 className="font-display text-[34px] font-bold leading-tight text-lol-text-bright">
              {getItemName(items, id)}
            </h1>
            <p className="mt-2 text-[13px] text-lol-text">
              Built in {data.picks.toLocaleString()} games ·{" "}
              <span className="text-lol-win">{data.wins}W</span>{" "}
              <span className="text-lol-loss">{data.picks - data.wins}L</span>
              {filters.length > 0 && ` · ${filters.join(" · ")} only`}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          <HeroTile
            label="Win rate"
            value={`${winRate.toFixed(1)}%`}
            valueClass={winRate >= 50 ? "text-lol-win" : "text-lol-loss"}
          />
          <HeroTile
            label="Build rate"
            value={`${buildRate.toFixed(1)}%`}
            sub={`${data.picks.toLocaleString()} of ${data.totalGames.toLocaleString()} games`}
          />
          <HeroTile label="Avg KDA" value={averageKda} />
          <HeroTile
            label="Price"
            value={item?.price != null ? item.price.toLocaleString() : "—"}
            sub="gold"
            valueClass="text-lol-gold"
          />
          <HeroTile
            label="Avg purchase"
            value={
              data.avgBuyTimeMs != null ? formatDuration(Math.floor(data.avgBuyTimeMs / 1000)) : "—"
            }
          />
          <HeroTile
            label="Avg duration"
            value={
              averageGameDuration != null ? formatDuration(Math.round(averageGameDuration)) : "—"
            }
          />
        </div>
      </SplashHero>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Panel variant="tile">
          <Title>Description</Title>
          <div className="text-sm leading-relaxed text-lol-text">
            <RiotText markup={item?.description ?? "No item description available."} />
          </div>
          {item?.from && item.from.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[10px] font-bold uppercase tracking-widest text-lol-text">
                Components
              </span>
              {item.from.map((component, index) => (
                <span
                  key={component}
                  className="flex items-center gap-1 rounded-lg border border-lol-border/60 bg-black/25 p-1"
                >
                  {index > 0 && <span className="text-xs font-bold text-lol-gold">+</span>}
                  <ItemIcon itemId={component} size={40} />
                </span>
              ))}
            </div>
          )}
        </Panel>

        <Panel variant="tile">
          <Title>Top pairings</Title>
          {data.topPairings.length === 0 ? (
            <EmptyState variant="compact" text="No pairing data." />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {data.topPairings.map((pairing) => (
                <Link
                  key={pairing.item_id}
                  to={`/items/${pairing.item_id}`}
                  className="min-w-0 rounded-xl border border-lol-border/50 bg-black/25 transition-colors hover:border-lol-border-hover hover:bg-white/[0.04] p-3"
                >
                  <ItemIcon itemId={pairing.item_id} size={36} />
                  <div className="mt-2 truncate text-xs font-semibold text-lol-text-bright">
                    {getItemName(items, pairing.item_id)}
                  </div>
                  <div className="mt-1 text-[10px] text-lol-text">
                    {pairing.games} games,{" "}
                    {pairing.games ? ((pairing.wins / pairing.games) * 100).toFixed(1) : "—"}% win
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <ItemInsights data={data} />

      {zoomOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`${getItemName(items, id)} enlarged icon`}
          onClick={() => setZoomOpen(false)}
        >
          <div
            className="relative rounded-xl border border-lol-border bg-lol-card p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="absolute right-2 top-2 rounded px-2 py-1 text-xs text-lol-text hover:bg-white/10 hover:text-lol-text-bright"
              onClick={() => setZoomOpen(false)}
              aria-label="Close enlarged icon"
            >
              ×
            </button>
            <img
              src={`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/items/icons2d/${id}.png`}
              alt={getItemName(items, id)}
              className="h-64 w-64 object-contain"
            />
          </div>
        </div>
      )}

      <ChampionBreakdown data={data} noun="item" />
    </div>
  );
}
