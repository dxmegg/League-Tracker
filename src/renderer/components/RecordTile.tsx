import ChampionIcon from "./ChampionIcon";
import { formatNumber } from "../lib/format";

export function RecordTile({
  label,
  value,
  championId,
  win,
  gameCreation,
  formatValue,
  accentIndex = 0,
}: {
  label: string;
  value: number;
  championId: number;
  win: number;
  gameCreation: number;
  formatValue?: (value: number) => string;
  accentIndex?: number;
}) {
  const date = new Date(gameCreation).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const display = formatValue ? formatValue(value) : formatNumber(value);
  const accents = [
    "border-t-amber-400",
    "border-t-sky-400",
    "border-t-emerald-400",
    "border-t-rose-400",
  ];

  return (
    <div
      className={`flex flex-col rounded-xl border border-lol-border border-t-[3px] bg-black/10 px-3.5 py-3 transition-colors duration-[120ms] hover:bg-white/[0.02] ${accents[accentIndex % accents.length]}`}
    >
      <span className="text-[12.5px] uppercase tracking-wider text-lol-text">{label}</span>
      <b className="my-0.5 font-display text-[28px] font-bold leading-tight text-lol-text-bright">
        {display}
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
