import { formatNumber } from "../lib/format";

export function SessionHeaderExp({
  label,
  games,
  wins,
  losses,
  kda,
  score,
}: {
  label: string;
  games: number;
  wins: number;
  losses: number;
  kda: number;
  score: number;
}) {
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-4">
        <span className="h-1.5 w-1.5 rounded-full bg-lol-gold" aria-hidden="true" />
        <span className="font-display text-[14px] font-semibold text-lol-text-bright">{label}</span>
        <span className="text-[12.5px] text-lol-text">
          {formatNumber(games)} {games === 1 ? "game" : "games"}
        </span>
        <span className="text-[12.5px] text-lol-win">{formatNumber(wins)}W</span>
        <span className="text-[12.5px] text-lol-loss">{formatNumber(losses)}L</span>
        <span className="text-[12.5px] text-lol-gold">{kda.toFixed(2)} KDA</span>
        <span className="text-[12.5px] text-lol-gold">{score.toFixed(1)} score</span>
      </div>
      <div className="mt-2 h-[2px] bg-gradient-to-r from-lol-gold/25 via-lol-gold/10 to-transparent" />
    </div>
  );
}
