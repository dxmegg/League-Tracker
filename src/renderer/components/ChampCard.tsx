import ChampionIcon from "./ChampionIcon";
import { getChampionName } from "../hooks/useChampions";
import { formatNumber } from "../lib/format";

export function ChampCard({
  championId,
  games,
  wins,
  champData,
  accentIndex = 0,
}: {
  championId: number;
  games: number;
  wins: number;
  champData: ReturnType<typeof import("../hooks/useChampions").useChampionData>;
  accentIndex?: number;
}) {
  const losses = games - wins;
  const winRate = games > 0 ? Math.round((wins / games) * 100) : 0;
  const low = winRate < 50;
  const accents = [
    "border-amber-400/40 shadow-[0_0_14px_rgba(251,191,36,0.10)]",
    "border-sky-400/40 shadow-[0_0_14px_rgba(56,189,248,0.10)]",
    "border-emerald-400/40 shadow-[0_0_14px_rgba(52,211,153,0.10)]",
    "border-rose-400/40 shadow-[0_0_14px_rgba(251,113,133,0.10)]",
  ];

  return (
    <div
      className={`flex flex-col gap-1.5 rounded-xl border bg-black/10 p-3.5 ${accents[accentIndex % accents.length]}`}
    >
      <div className={`w-fit rounded-lg border p-1 ${accents[accentIndex % accents.length]}`}>
        <ChampionIcon championId={championId} size={32} className="rounded-md" />
      </div>
      <b className="font-display text-[15px] font-semibold text-lol-text-bright">
        {getChampionName(champData, championId)}
      </b>
      <span className="font-display text-[14px] font-semibold">
        <span className="text-lol-win">{formatNumber(wins)}W</span>{" "}
        <span className="text-lol-loss">{formatNumber(losses)}L</span>
      </span>
      <div className="h-[5px] overflow-hidden rounded-full bg-white/[0.05]">
        <i
          className={`block h-full rounded-full ${low ? "bg-lol-loss" : "bg-lol-win"}`}
          style={{ width: `${winRate}%` }}
        />
      </div>
      <small className="text-[12.5px] text-lol-text">
        {formatNumber(games)} games, {winRate}% win
      </small>
    </div>
  );
}
