import type { ReactNode } from "react";
import type { ClientProfile, LiveSessionData } from "../../../shared/api";
import { fmtClock, mapLabel, modeLabel } from "../../lib/live";
import ChampionIcon from "../ChampionIcon";
import { Panel } from "../Panel";
import SummonerIcon from "../SummonerIcon";
import { Pill, Title } from "./shared";

export type ClientTone = "idle" | "active" | "hot";

const TONE_COLOR: Record<ClientTone, string> = {
  idle: "var(--color-lol-win)",
  active: "#fbbf24",
  hot: "var(--color-lol-crimson)",
};

// What the player is doing, from the gameflow phase. An unknown phase keeps its raw name so a new client
// state shows up instead of being hidden.
export function describeClient(session: LiveSessionData): {
  title: string;
  detail: string;
  tone: ClientTone;
} {
  const queue = session.queueLabel ?? "";
  switch (session.phase) {
    case "Lobby": {
      const size =
        session.lobbySize != null
          ? `${session.lobbySize}/${session.lobbyMaxSize ?? "?"} players`
          : "";
      return {
        title: "In lobby",
        detail: [queue, size].filter(Boolean).join(" · ") || "Waiting in the lobby",
        tone: "active",
      };
    }
    case "Matchmaking":
      return { title: "In queue", detail: queue || "Searching for a match", tone: "active" };
    case "ReadyCheck":
      return { title: "Match found", detail: "Accept the match in the client", tone: "hot" };
    case "ChampSelect":
      return { title: "Champion select", detail: queue || "Picking a champion", tone: "hot" };
    case "GameStart":
    case "InProgress":
      return { title: "Loading into game", detail: queue || "Game is starting", tone: "hot" };
    case "WaitingForStats":
    case "PreEndOfGame":
    case "EndOfGame":
      return { title: "Post-game", detail: "Game finished, results screen", tone: "active" };
    case "Reconnect":
      return { title: "Reconnecting", detail: "Rejoining your game", tone: "hot" };
    case "None":
      return { title: "In client", detail: "Idle, not in a lobby", tone: "idle" };
    default:
      return { title: session.phase, detail: queue, tone: "idle" };
  }
}

export const PRESENCE_LABEL: Record<string, string> = {
  chat: "Online",
  away: "Away",
  dnd: "In game / busy",
  mobile: "On mobile",
  offline: "Appearing offline",
};

const TIMER_PHASE_LABEL: Record<string, string> = {
  PLANNING: "Planning",
  BAN_PICK: "Ban / pick",
  FINALIZATION: "Finalising",
  GAME_STARTING: "Game starting",
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-lol-border/25 py-1 last:border-b-0">
      <span className="text-[12px] text-lol-text">{label}</span>
      <b className="text-right font-display text-[13px] font-semibold text-lol-text-bright">
        {children}
      </b>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-lol-border/60 bg-black/25 p-3">
      <div className="mb-2 font-display text-[10px] font-bold uppercase tracking-widest text-lol-text">
        {title}
      </div>
      {children}
    </div>
  );
}

function ChampRow({ ids, size = 30 }: { ids: number[]; size?: number }) {
  if (ids.length === 0) return <span className="text-[12px] text-lol-text">none yet</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {ids.map((id, i) => (
        <ChampionIcon key={`${id}-${i}`} championId={id} size={size} className="rounded-lg" />
      ))}
    </div>
  );
}

function LobbyCard({ s }: { s: LiveSessionData }) {
  return (
    <Card title="Lobby">
      <Row label="Queue">{s.queueLabel ?? "—"}</Row>
      {s.gameMode && <Row label="Mode">{modeLabel(s.gameMode)}</Row>}
      {s.mapId != null && <Row label="Map">{mapLabel(s.mapId, "")}</Row>}
      {s.isCustom && <Row label="Type">Custom game</Row>}
      {s.canStart != null && <Row label="You can start">{s.canStart ? "Yes" : "No"}</Row>}
      {s.members.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {s.members.map((m, i) => (
            <div key={`${m.name}-${i}`} className="flex items-center gap-2 text-[12.5px]">
              <span className={m.isMe ? "text-lol-gold" : "text-lol-text-bright"}>{m.name}</span>
              {m.isLeader && (
                <Pill className="border-lol-gold/40 bg-lol-gold/10 text-lol-gold">Leader</Pill>
              )}
              {m.ready && (
                <Pill className="border-lol-win/40 bg-lol-win/10 text-lol-win">Ready</Pill>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function QueueCard({ s }: { s: LiveSessionData }) {
  const q = s.search;
  const pct =
    q?.elapsedSec != null && q.estimatedSec
      ? Math.min(100, (q.elapsedSec / q.estimatedSec) * 100)
      : 0;
  return (
    <Card title={s.phase === "ReadyCheck" ? "Match found" : "Queue"}>
      {q?.state && <Row label="State">{q.state}</Row>}
      {q?.elapsedSec != null && <Row label="Time in queue">{fmtClock(q.elapsedSec)}</Row>}
      {q?.estimatedSec != null && <Row label="Estimated wait">{fmtClock(q.estimatedSec)}</Row>}
      {q?.penaltySec != null && <Row label="Queue penalty">{fmtClock(q.penaltySec)}</Row>}
      {q?.dodgeWarning && <Row label="Dodge warning">{q.dodgeWarning}</Row>}
      {s.readyCheck && (
        <>
          <Row label="Your response">{s.readyCheck.response || "Pending"}</Row>
          {s.readyCheck.timerSec != null && (
            <Row label="Accept timer">{Math.ceil(s.readyCheck.timerSec)}s</Row>
          )}
        </>
      )}
      {q?.estimatedSec ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <i
            className="block h-full rounded-full bg-amber-400 transition-[width] duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
    </Card>
  );
}

function ChampSelectCard({ s }: { s: LiveSessionData }) {
  const cs = s.champSelect;
  if (!cs) return null;
  const mates = cs.myTeam.map((m) => m.championId).filter((id) => id > 0);
  return (
    <Card title="Champion select">
      {cs.timerPhase && (
        <Row label="Phase">{TIMER_PHASE_LABEL[cs.timerPhase] ?? cs.timerPhase}</Row>
      )}
      {cs.timeLeftMs != null && (
        <Row label="Time left">{Math.max(0, Math.ceil(cs.timeLeftMs / 1000))}s</Row>
      )}
      <Row label="Your turn">{cs.isMyTurn ? "Yes" : "No"}</Row>
      {cs.rerollsRemaining != null && <Row label="Rerolls left">{cs.rerollsRemaining}</Row>}
      <div className="mt-2 flex flex-col gap-2">
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wider text-lol-text">Your pick</div>
          <ChampRow ids={cs.myChampionId ? [cs.myChampionId] : []} size={40} />
        </div>
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wider text-lol-text">Your team</div>
          <ChampRow ids={mates} />
        </div>
        {cs.bench.length > 0 && (
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wider text-lol-text">Bench</div>
            <ChampRow ids={cs.bench.map((b) => b.championId).filter((id) => id > 0)} />
          </div>
        )}
        {(cs.bans.mine.length > 0 || cs.bans.theirs.length > 0) && (
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wider text-lol-text">Bans</div>
            <ChampRow ids={[...cs.bans.mine, ...cs.bans.theirs]} size={26} />
          </div>
        )}
      </div>
    </Card>
  );
}

function ProfileCard({ p }: { p: ClientProfile }) {
  return (
    <Card title="Signed in as">
      <div className="mb-2 flex items-center gap-3">
        <SummonerIcon iconId={p.profileIconId} size={44} className="rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[15px] font-semibold text-lol-text-bright">
            {p.gameName}
            {p.tagLine && <span className="text-lol-text/60">#{p.tagLine}</span>}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-[11.5px] text-lol-text">Lv {p.level}</span>
            <i className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <i
                className="absolute inset-y-0 left-0 rounded-full bg-lol-assist"
                style={{ width: `${p.xpPercent}%` }}
              />
            </i>
            <span className="text-[11.5px] text-lol-text">{p.xpPercent}%</span>
          </div>
        </div>
      </div>
      <Row label="Presence">{PRESENCE_LABEL[p.presence] ?? (p.presence || "—")}</Row>
      {p.statusMessage && <Row label="Status message">{p.statusMessage}</Row>}
      <Row label="Region">{p.region || "—"}</Row>
      <Row label="Client patch">{p.patch || "—"}</Row>
      {p.honorLevel != null && <Row label="Honor level">{p.honorLevel}</Row>}
      {p.blueEssence != null && <Row label="Blue Essence">{p.blueEssence.toLocaleString()}</Row>}
      {p.rp != null && <Row label="Riot Points">{p.rp.toLocaleString()}</Row>}
      {p.challengePoints != null && (
        <Row label="Challenge points">
          {p.challengePoints.toLocaleString()}
          {p.challengeLevel ? ` · ${p.challengeLevel.toLowerCase()}` : ""}
        </Row>
      )}
      {p.ranked.length === 0 ? (
        <Row label="Ranked">Unranked</Row>
      ) : (
        p.ranked.map((r) => (
          <Row key={r.queue} label={r.queue}>
            {r.tier} {r.division} · {r.lp} LP · {r.wins}W {r.losses}L
          </Row>
        ))
      )}
    </Card>
  );
}

// Everything the League client reports while no game is running: lobby, queue, ready check and champion
// select, plus who is signed in. Rendered on the Live tab in place of the live game.
export function ClientStatePanel({ session }: { session: LiveSessionData | null }) {
  if (!session) {
    return (
      <Panel variant="tile" accent="var(--color-lol-text)">
        <Title>League client</Title>
        <p className="text-[13px] text-lol-text">
          The League client is not open or not connected yet. Start it and its state shows up here.
        </p>
      </Panel>
    );
  }
  const info = describeClient(session);
  const showLobby = ["Lobby", "Matchmaking", "ReadyCheck"].includes(session.phase);
  const showQueue = session.phase === "Matchmaking" || session.phase === "ReadyCheck";
  const showSelect = session.phase === "ChampSelect" && session.champSelect != null;

  return (
    <Panel variant="tile" accent={TONE_COLOR[info.tone]}>
      <Title aside={<span className="text-[13px] text-lol-text">League client · live</span>}>
        Client state
      </Title>
      <div className="mb-4 flex items-center gap-3">
        <span
          className="h-3 w-3 shrink-0 animate-pulse rounded-full"
          style={{
            background: TONE_COLOR[info.tone],
            boxShadow: `0 0 10px ${TONE_COLOR[info.tone]}`,
          }}
        />
        <div className="min-w-0">
          <div className="font-display text-[26px] font-bold leading-tight text-lol-text-bright">
            {info.title}
          </div>
          <div className="text-[13px] text-lol-text">{info.detail}</div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {showLobby && <LobbyCard s={session} />}
        {showQueue && <QueueCard s={session} />}
        {showSelect && <ChampSelectCard s={session} />}
        {session.profile && <ProfileCard p={session.profile} />}
      </div>
    </Panel>
  );
}
