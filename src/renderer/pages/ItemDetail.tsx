import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { useIpc } from "../hooks/useIpc";
import { useHistoryScopeQueue } from "../lib/historyScope";
import { useItemData, getItemName, useChampionData, getChampionName } from "../hooks/useChampions";
import ItemIcon from "../components/ItemIcon";
import ChampionIcon from "../components/ChampionIcon";
import { HomeCard } from "../components/HomeCard";
import WinRateBar from "../components/WinRateBar";
import type { ItemDetail as ItemDetailData } from "../lib/types";
import RiotText from "../components/RiotText";

export default function ItemDetail() {
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
  if (loading || !data) return <div className="mt-20 text-center text-lol-text">Loading...</div>;
  const back = `/history/${scope}/items`;
  const item = items[id];
  const winRate = data.picks ? (data.wins / data.picks) * 100 : 0;
  const buildRate = data.totalGames ? (data.picks / data.totalGames) * 100 : 0;
  return (
    <div className="max-w-6xl space-y-5">
      <Link to={back} className="text-xs text-lol-text hover:text-lol-gold">
        ← Item Stats
      </Link>
      <div className="grid grid-cols-[12rem_1fr_18rem] gap-4">
        <div>
          <div className="relative overflow-hidden rounded-lg border border-lol-border/60 border-l-[3px] border-l-[#C9A45C] bg-[radial-gradient(circle_at_top_right,rgba(201,164,92,0.10),transparent_55%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_45%)] p-1">
            <ItemIcon itemId={id} size={176} />
          </div>
          {item?.from && item.from.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {item.from.map((component, index) => (
                <span
                  key={component}
                  className="flex items-center gap-1 rounded-md border-b border-white/[0.04] bg-white/[0.02] p-1 transition-colors duration-[120ms] hover:bg-white/[0.03]"
                >
                  {index > 0 && <span className="text-xs font-bold text-lol-gold">+</span>}
                  <ItemIcon itemId={component} size={28} />
                </span>
              ))}
            </div>
          )}
        </div>
        <HomeCard className="border-l-[3px] border-l-[#C9A45C] bg-[radial-gradient(circle_at_top_right,rgba(201,164,92,0.10),transparent_55%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_45%)] p-5">
          <h1 className="text-2xl font-bold text-lol-text-bright">{getItemName(items, id)}</h1>
          <p className="mt-3 text-sm text-lol-text">
            Built in {data.picks} games across saved history.
          </p>
          <p className="mt-4 text-sm text-lol-text">
            <RiotText markup={item?.description ?? "No item description available."} />
          </p>
        </HomeCard>
        <div className="space-y-3">
          <HomeCard className="relative border-t-[3px] border-t-[#C9A45C] bg-[radial-gradient(circle_at_top_right,rgba(201,164,92,0.08),transparent_70%)] p-4 transition-colors duration-[120ms] hover:bg-white/[0.02]">
            <span className="text-xs text-lol-text before:mr-2 before:inline-block before:h-1.5 before:w-1.5 before:rounded-full before:bg-[#C9A45C]">
              PRICE
            </span>
            <div className="text-2xl font-bold text-lol-gold">{item?.price ?? "—"}</div>
          </HomeCard>
          <HomeCard className="relative border-t-[3px] border-t-[#22C55E] bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.08),transparent_70%)] p-4 transition-colors duration-[120ms] hover:bg-white/[0.02]">
            <span className="text-xs text-lol-text before:mr-2 before:inline-block before:h-1.5 before:w-1.5 before:rounded-full before:bg-[#22C55E]">
              WIN RATE
            </span>
            <div className="text-2xl font-bold text-lol-text-bright">{winRate.toFixed(1)}%</div>
            <div className="text-sm">
              <span className="text-lol-win">{data.wins}W</span>{" "}
              <span className="text-lol-loss">{data.picks - data.wins}L</span>
            </div>
            <WinRateBar wins={data.wins} total={data.picks} />
          </HomeCard>
          <HomeCard className="relative border-t-[3px] border-t-[#3B82F6] bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.08),transparent_70%)] p-4 transition-colors duration-[120ms] hover:bg-white/[0.02]">
            <span className="text-xs text-lol-text before:mr-2 before:inline-block before:h-1.5 before:w-1.5 before:rounded-full before:bg-[#3B82F6]">
              BUILD RATE
            </span>
            <div className="text-2xl font-bold text-lol-text-bright">{buildRate.toFixed(1)}%</div>
            <div className="text-sm text-lol-text">
              {data.picks} of {data.totalGames} games
            </div>
          </HomeCard>
        </div>
      </div>
      <h2 className="relative flex items-center gap-3 pb-2 text-sm font-semibold uppercase text-lol-text-bright after:absolute after:bottom-0 after:left-0 after:h-px after:w-2/5 after:bg-gradient-to-r after:from-[#E5483F]/50 after:to-transparent before:h-2 before:w-2 before:rotate-45 before:bg-[#E5483F]">
        Champions
      </h2>
      <HomeCard>
        {data.champions.map((row) => (
          <div key={row.champion_id}>
            <button
              type="button"
              onClick={() =>
                setExpandedChampion((current) =>
                  current === row.champion_id ? null : row.champion_id,
                )
              }
              className="group flex min-h-12 w-full items-center gap-3 border-b border-white/[0.04] px-4 py-2 text-left transition-colors duration-[120ms] hover:bg-white/[0.03]"
            >
              <ChampionIcon
                championId={row.champion_id}
                size={30}
                className="rounded-md border-l-2 border-l-[#A855F7] shadow-[0_0_10px_rgba(168,85,247,0.12)]"
              />
              <span className="min-w-0 flex-1 text-sm text-lol-text-bright">
                {getChampionName(champions, row.champion_id)}
              </span>
              <span className="w-20 shrink-0 text-right text-xs text-lol-text">
                {row.games} of {row.championGames} games
              </span>
              <div className="w-28 shrink-0">
                <WinRateBar wins={row.wins} total={row.games} />
              </div>
            </button>
            {expandedChampion === row.champion_id && (
              <div className="border-b border-white/[0.04] bg-lol-dark/30 px-6 py-2">
                {(row.matches ?? []).length > 0 ? (
                  row.matches.map((match) => (
                    <div
                      key={match.game_id}
                      className="flex items-center gap-3 border-b border-white/[0.04] py-2 text-xs text-lol-text transition-colors duration-[120ms] hover:bg-white/[0.02] last:border-0"
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
      </HomeCard>
    </div>
  );
}
