import type { LiveGameData, LiveSessionData } from "../../shared/api";
import { findChampionIdByName, getChampionName, useChampionData } from "../hooks/useChampions";
import ChampionIcon from "./ChampionIcon";
import ItemIcon from "./ItemIcon";

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

const PHASE_LABEL: Record<string, string> = {
  Lobby: "In Lobby",
  Matchmaking: "In Queue",
  ReadyCheck: "Ready Check",
  ChampSelect: "Champion Select",
  EndOfGame: "Post Game",
  WaitingForStats: "Post Game",
  PreEndOfGame: "Post Game",
};

export function LiveGameTile({
  game,
  session,
}: {
  game: LiveGameData | null;
  session: LiveSessionData | null;
}) {
  const champData = useChampionData();
  const championId = game ? findChampionIdByName(champData, game.activePlayer.championName) : null;

  if (!game && session && session.phase !== "None") {
    const queueElapsed = session.queueStartedAt
      ? Math.floor((Date.now() - session.queueStartedAt) / 1000)
      : null;
    const formatElapsed = (sec: number) => {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    };

    return (
      <div className="flex h-full min-h-[280px] flex-col justify-center gap-4">
        <div className="flex items-center gap-2 font-display text-[14px] font-semibold text-lol-win">
          <span className="h-2 w-2 shrink-0 rounded-full bg-lol-win" />
          <span>Live game</span>
        </div>
        <div className="font-display text-[32px] font-bold leading-tight text-lol-text-bright">
          {PHASE_LABEL[session.phase] ?? session.phase}
        </div>
        {session.phase === "Matchmaking" && queueElapsed != null && (
          <div className="font-display text-[44px] font-bold leading-none text-lol-text-bright tabular-nums">
            {formatElapsed(queueElapsed)}
          </div>
        )}
        <div className="flex items-center gap-2 text-[13px] text-lol-text">
          <span>{session.queueLabel ?? "Unknown queue"}</span>
          {session.lobbySize != null && session.lobbyMaxSize != null && (
            <span>
              {session.lobbySize}/{session.lobbyMaxSize}
            </span>
          )}
        </div>
        {session.phase === "ChampSelect" && session.champSelect && (
          <div>
            {session.champSelect.myChampionId ? (
              <div className="flex items-center gap-3.5">
                <ChampionIcon
                  championId={session.champSelect.myChampionId}
                  size={56}
                  className="rounded-full"
                />
                <div className="min-w-0">
                  <strong className="block font-display text-[22px] font-bold leading-tight text-lol-text-bright">
                    {getChampionName(champData, session.champSelect.myChampionId)}
                  </strong>
                  <small className="text-lol-text">
                    {session.champSelect.isMyTurn ? "Your turn" : "Locked in"}
                  </small>
                </div>
              </div>
            ) : (
              <div className="text-[13px] text-lol-text/60">Pick a champion</div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (!game) {
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

  const p = game.activePlayer;
  const kda = `${p.kills} / ${p.deaths} / ${p.assists}`;
  const items = game.items ?? [];

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
            {GAME_MODE_LABEL[game.gameMode] ?? game.gameMode ?? "Unknown mode"}
          </small>
        </div>
      </div>
      <div className="font-display text-[44px] font-bold leading-none text-lol-text-bright tabular-nums">
        {formatTimer(game.gameTimeSec)}
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
      <div className="flex flex-wrap items-center gap-1">
        {[0, 1, 2, 3, 4, 5].map((slot) => {
          const item = items.find((it) => it.slot === slot + 1);
          return <ItemIcon key={slot} itemId={item?.itemId ?? 0} size={28} patch={null} />;
        })}
      </div>
    </div>
  );
}
