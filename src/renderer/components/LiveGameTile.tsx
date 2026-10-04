import type { LiveGameData } from "../../shared/api";
import { findChampionIdByName, useChampionData } from "../hooks/useChampions";
import ChampionIcon from "./ChampionIcon";

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

const GAME_MODE_LABEL: Record<string, string> = {
  KIWI: "ARAM Mayhem",
  CLASSIC: "Classic",
  ARAM: "ARAM",
  PRACTICETOOL: "Practice Tool",
  TUTORIAL: "Tutorial",
  URF: "URF",
  ONEFORALL: "One for All",
  NEXUSBLITZ: "Nexus Blitz",
};

export function LiveGameTile({ data }: { data: LiveGameData | null }) {
  const champData = useChampionData();
  const championId = data ? findChampionIdByName(champData, data.activePlayer.championName) : null;

  if (!data) {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 text-center">
        <div className="flex items-center gap-2 font-display text-[14px] font-semibold text-lol-text/60">
          <span className="h-2 w-2 shrink-0 rounded-full bg-lol-text/40" />
          <span>Live game</span>
        </div>
        <p className="text-[13px] text-lol-text/60">Not in a match</p>
      </div>
    );
  }

  const p = data.activePlayer;
  const kda = `${p.kills} / ${p.deaths} / ${p.assists}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 font-display text-[14px] font-semibold text-lol-win">
        <span className="h-2 w-2 shrink-0 rounded-full bg-lol-win" />
        <span>Live game</span>
      </div>
      <div className="flex items-center gap-3.5">
        <ChampionIcon championId={championId ?? 0} size={64} className="rounded-full" />
        <div className="min-w-0">
          <strong className="block font-display text-[22px] font-bold leading-tight text-lol-text-bright">
            {p.championName || "Unknown"}
          </strong>
          <small className="text-lol-text">
            {GAME_MODE_LABEL[data.gameMode] ?? data.gameMode ?? "Unknown mode"}
          </small>
        </div>
      </div>
      <div className="font-display text-[44px] font-bold leading-none text-lol-text-bright tabular-nums">
        {formatTimer(data.gameTimeSec)}
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <div className="rounded-[10px] border border-lol-border bg-black/[0.12] px-3 py-2.5">
          <b className="block whitespace-nowrap font-display text-[18px] font-bold text-lol-text-bright">
            {kda}
          </b>
          <span className="text-[12.5px] text-lol-text">K / D / A</span>
        </div>
        <div className="rounded-[10px] border border-lol-border bg-black/[0.12] px-3 py-2.5">
          <b className="block font-display text-[18px] font-bold text-lol-text-bright">
            Level {p.level}
          </b>
          <span className="text-[12.5px] text-lol-text">Champion</span>
        </div>
        <div className="rounded-[10px] border border-lol-border bg-black/[0.12] px-3 py-2.5">
          <b className="block font-display text-[18px] font-bold text-lol-text-bright">
            {p.creepScore}
          </b>
          <span className="text-[12.5px] text-lol-text">CS</span>
        </div>
      </div>
    </div>
  );
}
