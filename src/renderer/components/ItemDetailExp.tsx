import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ItemDetail as ItemDetailData } from "../lib/types";
import { useIpc } from "../hooks/useIpc";
import { useHistoryScopeQueue } from "../lib/historyScope";
import { getChampionName, getItemName, useChampionData, useItemData } from "../hooks/useChampions";
import ItemIcon from "./ItemIcon";
import ChampionIcon from "./ChampionIcon";
import WinRateBar from "./WinRateBar";
import RiotText from "./RiotText";

const KPI_CLASSES = {
  gold: "border-t-[#C9A45C] bg-[radial-gradient(circle_at_top_right,rgba(201,164,92,0.10),transparent_70%)]",
  green:
    "border-t-[#22C55E] bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.10),transparent_70%)]",
  blue: "border-t-[#3B82F6] bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.10),transparent_70%)]",
};

function KpiTile({
  label,
  value,
  caption,
  className,
}: {
  label: string;
  value: string;
  caption?: string;
  className: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[12px] border border-lol-border border-t-[3px] p-4 ${className}`}
    >
      <div className="text-[10px] font-bold uppercase tracking-wider text-lol-text">{label}</div>
      <div className="mt-2 text-[26px] font-bold leading-none text-lol-text-bright">{value}</div>
      {caption && <div className="mt-1 text-xs text-lol-text">{caption}</div>}
    </div>
  );
}

export function ItemDetailExp() {
  const { itemId, scope = "full" } = useParams<{ itemId: string; scope?: string }>();
  const id = Number(itemId);
  const queue = useHistoryScopeQueue(scope);
  const items = useItemData();
  const champions = useChampionData();
  const [expandedChampion, setExpandedChampion] = useState<number | null>(null);
  const { data, loading } = useIpc<ItemDetailData>(
    () => window.api.getOwnedItemDetail(id, undefined, queue),
    [id, queue],
  );

  if (loading || !data) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-[1320px] items-center justify-center rounded-[14px] border border-lol-border p-12 text-sm text-lol-text">
        Loading item details…
      </div>
    );
  }

  const item = items[id];
  const back = `/history/${scope}/items`;
  const winRate = data.picks ? (data.wins / data.picks) * 100 : 0;
  const buildRate = data.totalGames ? (data.picks / data.totalGames) * 100 : 0;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
      <Link
        to={back}
        className="w-fit text-xs font-semibold text-lol-text transition-colors duration-120 hover:text-lol-text-bright"
      >
        ← Items
      </Link>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[12rem_1fr_18rem]">
        <div className="min-w-0">
          <div className="relative overflow-hidden rounded-[12px] border border-lol-border border-l-[#C9A45C] bg-black/10 p-2 shadow-[0_0_14px_rgba(201,164,92,0.12)]">
            <ItemIcon itemId={id} size={176} />
          </div>
          {item?.from && item.from.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {item.from.map((component, index) => (
                <span
                  key={component}
                  className="flex items-center gap-1 rounded-lg border border-lol-border bg-black/10 p-1 transition-colors duration-120 hover:border-lol-crimson/40 hover:bg-white/[0.025]"
                >
                  {index > 0 && <span className="text-xs font-bold text-lol-gold">+</span>}
                  <ItemIcon itemId={component} size={28} />
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0 rounded-[12px] border border-lol-border border-t-[#E5483F] border-t-[3px] bg-[radial-gradient(circle_at_top_right,rgba(229,72,63,0.08),transparent_55%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-lol-text">
                Item detail
              </div>
              <h1 className="mt-1 font-display text-[28px] font-bold leading-tight text-lol-text-bright">
                {getItemName(items, id)}
              </h1>
            </div>
            <div className="rounded-lg border border-lol-border bg-black/10 px-3 py-2 text-right">
              <div className="text-[10px] font-bold uppercase tracking-wider text-lol-text">
                Built
              </div>
              <div className="mt-1 text-lg font-bold tabular-nums text-lol-text-bright">
                {data.picks.toLocaleString()}
              </div>
              <div className="text-[11px] text-lol-text">games</div>
            </div>
          </div>
          <div className="mt-5 text-sm leading-relaxed text-lol-text">
            <RiotText markup={item?.description ?? "No item description available."} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
          <KpiTile
            label="Price"
            value={item?.price != null ? item.price.toLocaleString() : "—"}
            className={KPI_CLASSES.gold}
          />
          <KpiTile
            label="Win rate"
            value={`${winRate.toFixed(1)}%`}
            caption={`${data.wins}W ${data.picks - data.wins}L`}
            className={KPI_CLASSES.green}
          />
          <KpiTile
            label="Build rate"
            value={`${buildRate.toFixed(1)}%`}
            caption={`${data.picks.toLocaleString()} of ${data.totalGames.toLocaleString()} games`}
            className={KPI_CLASSES.blue}
          />
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-[18px] font-semibold text-lol-text-bright">
              Champions
            </h2>
            <p className="mt-1 text-xs text-lol-text">
              Champion performance in games where this item was built.
            </p>
          </div>
          <span className="text-xs tabular-nums text-lol-text">
            {data.champions.length} champions
          </span>
        </div>
        <div className="overflow-hidden rounded-[12px] border border-lol-border bg-[radial-gradient(circle_at_100%_0,rgba(229,72,63,0.08),transparent_42%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]">
          {data.champions.map((row) => (
            <div key={row.champion_id}>
              <button
                type="button"
                onClick={() =>
                  setExpandedChampion((current) =>
                    current === row.champion_id ? null : row.champion_id,
                  )
                }
                className="group flex min-h-14 w-full items-center gap-3 border-b border-white/[0.04] px-4 py-2.5 text-left transition-colors duration-120 hover:bg-white/[0.025]"
              >
                <ChampionIcon
                  championId={row.champion_id}
                  size={34}
                  className="rounded-md border border-lol-border shadow-[0_0_10px_rgba(168,85,247,0.12)]"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-lol-text-bright">
                  {getChampionName(champions, row.champion_id)}
                </span>
                <span className="hidden w-28 shrink-0 text-right text-xs tabular-nums text-lol-text sm:block">
                  {row.games.toLocaleString()} / {row.championGames.toLocaleString()}
                </span>
                <div className="w-28 shrink-0">
                  <WinRateBar wins={row.wins} total={row.games} />
                </div>
                <span className="w-14 shrink-0 text-right text-xs tabular-nums text-lol-text-bright">
                  {row.games ? `${((row.wins / row.games) * 100).toFixed(1)}%` : "—"}
                </span>
              </button>
              {expandedChampion === row.champion_id && (
                <div className="border-b border-white/[0.04] bg-black/10 px-6 py-2">
                  {(row.matches ?? []).length > 0 ? (
                    row.matches.map((match) => (
                      <div
                        key={match.game_id}
                        className="flex items-center gap-3 border-b border-white/[0.04] py-2 text-xs text-lol-text last:border-0"
                      >
                        <span className={match.win ? "text-lol-win" : "text-lol-loss"}>
                          {match.win ? "WIN" : "LOSS"}
                        </span>
                        <span className="text-lol-text-bright">
                          {match.kills} / {match.deaths} / {match.assists}
                        </span>
                        <span>{Math.floor(match.game_duration / 60)}m</span>
                        <span className="ml-auto">
                          {new Date(match.game_creation).toLocaleDateString()}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="py-2 text-xs text-lol-text">No matching games found.</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
