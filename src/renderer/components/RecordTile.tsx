import ChampionIcon from "./ChampionIcon";
import { formatNumber } from "../lib/format";

export function RecordTile({
  label,
  value,
  championId,
  win,
  gameCreation,
}: {
  label: string;
  value: number;
  championId: number;
  win: number;
  gameCreation: number;
}) {
  const date = new Date(gameCreation).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="flex flex-col rounded-xl border border-lol-border bg-black/10 px-3.5 py-3">
      <span className="text-[12.5px] uppercase tracking-wider text-lol-text">{label}</span>
      <b className="my-0.5 font-display text-[28px] font-bold leading-tight text-lol-text-bright">
        {formatNumber(value)}
      </b>
      <div className="flex items-center gap-2 text-[12.5px] text-lol-text">
        <ChampionIcon championId={championId} size={26} className="rounded-full" />
        <i className={`font-semibold not-italic ${win ? "text-lol-win" : "text-lol-loss"}`}>
          {win ? "WIN" : "LOSS"}
        </i>
        <span>{date}</span>
      </div>
    </div>
  );
}
