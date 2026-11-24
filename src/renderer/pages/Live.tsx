import { useEffect, useMemo, useState } from "react";
import type { LiveFull } from "../../shared/api";
import { LiveEvents } from "../components/live/LiveEvents";
import { LiveLastGame } from "../components/live/LiveLastGame";
import { LiveMe } from "../components/live/LiveMe";
import { LiveRecords } from "../components/live/LiveRecords";
import { LiveSavedGames } from "../components/live/LiveSavedGames";
import { LiveTeamStrip, LiveTeamTable } from "../components/live/LiveTeams";
import { LiveTrends } from "../components/live/LiveTrends";
import { Pill, Title } from "../components/live/shared";
import { Panel } from "../components/Panel";
import { useLiveFull } from "../hooks/useLiveFull";
import { useLiveGame } from "../hooks/useLiveGame";
import { ClientStatePanel } from "../components/live/ClientState";
import { fmtClock, mapLabel, modeLabel, summarizeTeams } from "../lib/live";

// Local interpolation between polls so the clock runs smoothly instead of ticking once a second late
function useGameClock(snapshot: LiveFull | null, frozen: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (frozen || snapshot?.state !== "in-game") return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [frozen, snapshot?.state, snapshot?.fetchedAt]);
  if (!snapshot?.game) return 0;
  return snapshot.game.timeSec + (frozen ? 0 : Math.max(0, now - snapshot.fetchedAt) / 1000);
}

const PHASE_LABEL: Record<string, string> = {
  None: "Idle",
  Lobby: "In lobby",
  Matchmaking: "In queue",
  ReadyCheck: "Match found",
  ChampSelect: "Champion select",
  GameStart: "Game starting",
  InProgress: "In game",
  WaitingForStats: "Waiting for stats",
  PreEndOfGame: "Game ended",
  EndOfGame: "Post-game",
  Reconnect: "Reconnecting",
};

function ToolButton({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 font-display text-[12px] font-semibold transition-colors ${
        active
          ? "border-lol-crimson/60 bg-lol-crimson/20 text-lol-text-bright"
          : "border-lol-border/60 bg-lol-card/50 text-lol-text hover:border-lol-crimson/40 hover:text-lol-text-bright"
      }`}
    >
      {children}
    </button>
  );
}

function RawPanel({ snapshot }: { snapshot: LiveFull }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // Serialising ~100KB every second would be wasteful while the panel is shut
  const json = useMemo(
    () => (open ? JSON.stringify(snapshot.raw, null, 2) : ""),
    [open, snapshot.raw],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard can be blocked; the text is still selectable */
    }
  };
  const save = () => {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `live-game-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Panel variant="tile" accent="var(--color-lol-text)">
      <Title
        aside={
          <div className="flex items-center gap-2">
            {open && (
              <>
                <ToolButton onClick={copy}>{copied ? "Copied" : "Copy"}</ToolButton>
                <ToolButton onClick={save}>Save .json</ToolButton>
              </>
            )}
            <ToolButton active={open} onClick={() => setOpen((v) => !v)}>
              {open ? "Hide" : "Show"}
            </ToolButton>
          </div>
        }
      >
        Raw API payload
      </Title>
      <p className="text-[12.5px] text-lol-text">
        The unmodified <code className="text-lol-text-bright">/liveclientdata/allgamedata</code>{" "}
        response every panel above is built from.
      </p>
      {open && (
        <pre className="scroll-themed mt-3 max-h-[460px] overflow-auto rounded-xl border border-lol-border/60 bg-black/40 p-4 font-mono text-[11.5px] leading-relaxed text-lol-text-bright">
          {json}
        </pre>
      )}
    </Panel>
  );
}

function WaitingState({
  phase,
  error,
  onDemo,
}: {
  phase: string | null;
  error: string | null;
  onDemo: () => void;
}) {
  const features = [
    ["Live scoreboard", "Kills, items, CS, levels and gold value for both teams"],
    ["Your champion", "Every stat, ability rank, rune and your inventory"],
    [
      "Game flow",
      "Kill, item value and CS lead over time, plus kill participation and gold per minute",
    ],
    ["Event feed", "Kills, multikills, towers, inhibitors and objectives as they happen"],
    ["Raw payload", "The complete API response, copyable and saveable"],
  ];
  return (
    <Panel variant="tile" accent="var(--color-lol-gold)" className="py-10">
      <div className="mx-auto flex max-w-[640px] flex-col items-center text-center">
        <span className="relative mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-lol-border bg-black/30">
          <i className="absolute inset-0 animate-ping rounded-full border border-lol-crimson/40" />
          <i className="h-3 w-3 rounded-full bg-lol-crimson" />
        </span>
        <h2 className="font-display text-[22px] font-bold text-lol-text-bright">
          Waiting for a game
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-lol-text">
          Start a match and this tab fills in by itself. It reads the League client&apos;s Live
          Client Data API on this computer, every couple of seconds, and nothing leaves your
          machine.
        </p>
        {phase && phase !== "None" && (
          <Pill className="mt-4 border-lol-gold/40 bg-lol-gold/10 text-lol-gold">
            Client: {PHASE_LABEL[phase] ?? phase}
          </Pill>
        )}
        {error && <p className="mt-3 text-[12.5px] text-lol-loss">Last poll failed: {error}</p>}
        <div className="mt-6 grid w-full grid-cols-1 gap-2.5 text-left sm:grid-cols-2">
          {features.map(([title, text]) => (
            <div
              key={title}
              className="rounded-xl border border-lol-border/60 bg-black/25 px-3.5 py-3"
            >
              <div className="font-display text-[13px] font-semibold text-lol-text-bright">
                {title}
              </div>
              <div className="mt-0.5 text-[12px] text-lol-text">{text}</div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={onDemo}
          className="mt-6 rounded-lg bg-lol-crimson px-5 py-2 font-display text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          Preview with sample data
        </button>
      </div>
    </Panel>
  );
}

export default function Live() {
  const [paused, setPaused] = useState(false);
  const [demo, setDemo] = useState(false);
  const { snapshot, error, history, peaks } = useLiveFull({ paused, demo });
  const { session } = useLiveGame();
  // The pause button is hidden in demo mode, so a leftover pause must not freeze the demo clock
  const clockSec = useGameClock(snapshot, paused && !demo);

  const inGame = snapshot?.state === "in-game" && snapshot.game != null;
  const teams = useMemo(
    () => (snapshot && inGame ? summarizeTeams(snapshot) : null),
    [snapshot, inGame],
  );
  const meRow = snapshot?.players.find((p) => p.isMe);
  // Your side is whichever the active player is on; before the list matches, default to blue
  const allyTeam = meRow?.team ?? "ORDER";
  const ally = teams?.find((t) => t.team === allyTeam);
  const enemy = teams?.find((t) => t.team !== allyTeam);

  const statusPill = demo ? (
    <Pill className="border-lol-gold/50 bg-lol-gold/10 text-lol-gold">Demo data</Pill>
  ) : paused ? (
    <Pill className="border-lol-border bg-white/5 text-lol-text">Paused</Pill>
  ) : inGame ? (
    <Pill className="border-lol-loss/50 bg-lol-loss/10 text-lol-loss">
      <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-lol-loss" />
      Live
    </Pill>
  ) : (
    <Pill className="border-lol-border bg-white/5 text-lol-text">Waiting</Pill>
  );

  return (
    <div className="flex min-h-full w-full flex-col gap-5">
      <Panel variant="tile" accent={inGame ? "var(--color-lol-loss)" : "var(--color-lol-text)"}>
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              {statusPill}
              <span className="font-display text-[11px] font-bold uppercase tracking-widest text-lol-text">
                Live game
              </span>
            </div>
            <h1 className="mt-2 font-display text-[28px] font-bold leading-tight text-lol-text-bright">
              {inGame && snapshot?.game ? modeLabel(snapshot.game.mode) : "No game in progress"}
            </h1>
            <p className="mt-1 text-[13px] text-lol-text">
              {inGame && snapshot?.game ? (
                <>
                  {mapLabel(snapshot.game.mapNumber, snapshot.game.mapName)}
                  {snapshot.game.mapTerrain && snapshot.game.mapTerrain !== "Default"
                    ? ` · ${snapshot.game.mapTerrain}`
                    : ""}
                  {snapshot.game.queueId ? ` · queue ${snapshot.game.queueId}` : ""}
                  {snapshot.game.gameId ? ` · game ${snapshot.game.gameId}` : ""}
                </>
              ) : (
                "Connect to a match and the data appears here automatically."
              )}
            </p>
          </div>

          {inGame && (
            <div className="text-center">
              <div className="font-display text-[11px] font-bold uppercase tracking-widest text-lol-text">
                Game time
              </div>
              <div className="font-display text-[54px] font-bold leading-none tabular-nums text-lol-text-bright">
                {fmtClock(clockSec)}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {!demo && (
              <ToolButton active={paused} onClick={() => setPaused((v) => !v)}>
                {paused ? "Resume updates" : "Pause updates"}
              </ToolButton>
            )}
            <ToolButton active={demo} onClick={() => setDemo((v) => !v)}>
              {demo ? "Exit sample data" : "Sample data"}
            </ToolButton>
          </div>
        </div>
      </Panel>

      {!inGame || !snapshot || !ally || !enemy ? (
        <>
          <ClientStatePanel session={session} />
          <LiveLastGame />
          <LiveRecords />
          <WaitingState
            phase={snapshot?.gameflowPhase ?? null}
            error={error}
            onDemo={() => setDemo(true)}
          />
          <LiveSavedGames />
        </>
      ) : (
        <>
          <LiveTeamStrip ally={ally} enemy={enemy} />
          {!demo && (
            <LiveTrends history={history} allyTeam={allyTeam === "CHAOS" ? "CHAOS" : "ORDER"} />
          )}
          {snapshot.me && (
            <LiveMe
              me={snapshot.me}
              player={meRow}
              clockSec={clockSec}
              teamKills={ally.kills}
              peaks={peaks}
            />
          )}
          <LiveTeamTable team={ally} ally clockSec={clockSec} />
          <LiveTeamTable team={enemy} ally={false} clockSec={clockSec} />
          <LiveEvents events={snapshot.events} players={snapshot.players} allyTeam={allyTeam} />
          <LiveRecords />
          <RawPanel snapshot={snapshot} />
          <LiveSavedGames />
          <p className="pb-2 text-center text-[11.5px] text-lol-text/60">
            Source: Live Client Data API (127.0.0.1:2999) and the client&apos;s gameflow session ·
            refreshed every few seconds, CS in steps of 2 · last update{" "}
            {new Date(snapshot.fetchedAt).toLocaleTimeString()}
          </p>
          {error && !demo && (
            <p className="-mt-3 pb-2 text-center text-[12px] text-lol-loss">
              Last poll failed, showing the previous data: {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
