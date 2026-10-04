import { useEffect, useState } from "react";
import type { AugmentStats, ItemStats, MatchListItem } from "../../shared/api";
import AugmentIcon from "./AugmentIcon";
import ItemIcon from "./ItemIcon";
import { useAugmentData } from "../hooks/useChampions";
import { formatKDA, formatDuration, formatTimeAgo } from "../lib/format";

export function ChampionExpandedExp({
  championId,
  patch,
  queue,
}: {
  championId: number;
  patch?: string;
  queue?: number;
}) {
  const augData = useAugmentData();
  const [augStats, setAugStats] = useState<AugmentStats[] | null>(null);
  const [itemStats, setItemStats] = useState<ItemStats[] | null>(null);
  const [matches, setMatches] = useState<MatchListItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.api.getAugmentStats(championId, patch, queue).then((d) => {
      if (!cancelled) setAugStats(d);
    });
    window.api.getChampionItemStats(championId, patch, queue).then((d) => {
      if (!cancelled) setItemStats(d);
    });
    window.api.getChampionMatchHistory(championId, 5, 0, patch, queue).then((r) => {
      if (!cancelled) setMatches(r.matches);
    });
    return () => {
      cancelled = true;
    };
  }, [championId, patch, queue]);

  if (!augStats || !itemStats || !matches) {
    return <div className="p-4 text-center text-sm text-lol-text">Loading…</div>;
  }

  const topAugments = augStats.slice(0, 6);
  const topItems = itemStats.slice(0, 6);

  return (
    <div className="grid grid-cols-1 gap-4 border-t border-lol-border/40 bg-black/20 p-4 md:grid-cols-3">
      <div className="min-w-0">
        <h3 className="mb-2 font-display text-[11px] font-semibold uppercase tracking-wider text-lol-text/60">
          Top Augments
        </h3>
        <div className="flex flex-col gap-1.5">
          {topAugments.length > 0 ? (
            topAugments.map((a) => {
              const wr = a.picks > 0 ? (a.wins / a.picks) * 100 : 0;
              return (
                <div key={a.augment_id} className="flex items-center gap-2">
                  <AugmentIcon augmentId={a.augment_id} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-lol-text-bright">
                    {augData[a.augment_id]?.name ?? `Augment ${a.augment_id}`}
                  </span>
                  <span className="shrink-0 text-[11px] text-lol-text">{a.picks}x</span>
                  <div className="h-[4px] w-[60px] shrink-0 overflow-hidden rounded-full bg-white/[0.05]">
                    <i
                      className={`block h-full rounded-full ${wr < 50 ? "bg-lol-loss" : "bg-lol-win"}`}
                      style={{ width: `${wr}%` }}
                    />
                  </div>
                  <span
                    className={`w-[44px] shrink-0 text-right text-[11px] tabular-nums ${wr >= 50 ? "text-lol-win" : "text-lol-loss"}`}
                  >
                    {wr.toFixed(1)}%
                  </span>
                </div>
              );
            })
          ) : (
            <span className="text-[12.5px] text-lol-text">No data</span>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <h3 className="mb-2 font-display text-[11px] font-semibold uppercase tracking-wider text-lol-text/60">
          Top Items
        </h3>
        <div className="flex flex-col gap-1.5">
          {topItems.length > 0 ? (
            topItems.map((item) => {
              const wr = item.picks > 0 ? (item.wins / item.picks) * 100 : 0;
              return (
                <div key={item.item_id} className="flex items-center gap-2">
                  <ItemIcon itemId={item.item_id} size={24} patch={patch} />
                  <span className="shrink-0 text-[11px] text-lol-text">{item.picks}x</span>
                  <div className="ml-auto h-[4px] w-[60px] shrink-0 overflow-hidden rounded-full bg-white/[0.05]">
                    <i
                      className={`block h-full rounded-full ${wr < 50 ? "bg-lol-loss" : "bg-lol-win"}`}
                      style={{ width: `${wr}%` }}
                    />
                  </div>
                  <span
                    className={`w-[44px] shrink-0 text-right text-[11px] tabular-nums ${wr >= 50 ? "text-lol-win" : "text-lol-loss"}`}
                  >
                    {wr.toFixed(1)}%
                  </span>
                </div>
              );
            })
          ) : (
            <span className="text-[12.5px] text-lol-text">No data</span>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <h3 className="mb-2 font-display text-[11px] font-semibold uppercase tracking-wider text-lol-text/60">
          Recent Games
        </h3>
        <div className="flex flex-col gap-1.5">
          {matches.length > 0 ? (
            matches.map((m) => (
              <div
                key={m.game_id}
                className={`flex items-center gap-2 rounded px-2 py-1 text-[12px] ${
                  m.is_remake
                    ? "bg-white/[0.03]"
                    : m.win
                      ? "bg-lol-win/[0.08]"
                      : "bg-lol-loss/[0.08]"
                }`}
              >
                <span
                  className={`w-4 shrink-0 text-center font-display font-bold ${
                    m.is_remake ? "text-lol-text/50" : m.win ? "text-lol-win" : "text-lol-loss"
                  }`}
                >
                  {m.is_remake ? "–" : m.win ? "W" : "L"}
                </span>
                <span className="shrink-0 font-display text-lol-text-bright">
                  {formatKDA(m.kills, m.deaths, m.assists)}
                </span>
                {m.score != null && !m.is_remake && (
                  <span className="shrink-0 font-display font-semibold text-lol-gold">
                    {m.score.toFixed(1)}
                  </span>
                )}
                <span className="ml-auto shrink-0 text-lol-text">
                  {formatDuration(m.game_duration)}
                </span>
                <span className="shrink-0 text-lol-text/70">{formatTimeAgo(m.game_creation)}</span>
              </div>
            ))
          ) : (
            <span className="text-[12.5px] text-lol-text">No games</span>
          )}
        </div>
      </div>
    </div>
  );
}
