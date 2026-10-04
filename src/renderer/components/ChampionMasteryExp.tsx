import ChampionIcon from "./ChampionIcon";
import { getChampionName } from "../hooks/useChampions";
import type { ChampionData, ProfileMasteryChampion } from "../../shared/api";

export function ChampionMasteryExp({
  rows,
  champData,
}: {
  rows: ProfileMasteryChampion[];
  champData: ChampionData;
}) {
  return (
    <div className="flex flex-col">
      {rows.map((row) => (
        <div
          key={row.championId}
          className="grid grid-cols-[38px_1fr_auto] items-center gap-3 border-t border-lol-border/40 py-2"
        >
          <ChampionIcon championId={row.championId} size={38} className="rounded-full" />
          <div>
            <b className="block font-display text-[14.5px] font-semibold text-lol-text-bright">
              {getChampionName(champData, row.championId)}
            </b>
            <small className="text-[12.5px] text-lol-text">
              {(row.championPoints / 1000).toFixed(1)}K points
            </small>
          </div>
          <span className="rounded-md border border-lol-gold/45 px-2 py-0.5 font-display text-[12px] font-semibold text-lol-gold">
            Level {row.championLevel}
          </span>
        </div>
      ))}
    </div>
  );
}
