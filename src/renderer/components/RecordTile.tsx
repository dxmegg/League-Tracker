import ChampionIcon from "./ChampionIcon";
import { formatNumber } from "../lib/format";
import { useNavigate } from "react-router-dom";

export function RecordTile({
  label,
  value,
  championId,
  win,
  gameCreation,
  formatValue,
  accentIndex = 0,
  gameId,
  onClick,
}: {
  label: string;
  value: number;
  championId: number;
  win: number;
  gameCreation: number;
  formatValue?: (value: number) => string;
  accentIndex?: number;
  gameId?: string | null;
  onClick?: () => void;
}) {
  const navigate = useNavigate();
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
  const clickable = gameId != null;
  const handleClick = onClick ?? (clickable ? () => navigate(`/match/${gameId}`) : undefined);
  const className = `flex flex-col rounded-xl border border-lol-border border-t-[3px] bg-black/10 px-3.5 py-3 transition-colors duration-[120ms] ${accents[accentIndex % accents.length]} ${
    clickable
      ? "hover:border-lol-gold/60 hover:bg-[color-mix(in_oklab,var(--theme-card)_96%,var(--theme-gold)_4%)] cursor-pointer"
      : ""
  }`;
  const content = (
    <>
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
    </>
  );

  if (clickable) {
    return (
      <button type="button" onClick={handleClick} className={className} title="View match">
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}
