import { useEffect, useMemo, useState } from "react";
import type { LivePlayer, StoredLiveGame } from "../../../shared/api";
import { cleanSkillLog } from "../../../shared/skills";
import { fmtClock } from "../../lib/live";
import ChampionIcon from "../ChampionIcon";
import ItemIcon from "../ItemIcon";
import { Panel } from "../Panel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { LiveEvents } from "./LiveEvents";
import { LivePulse } from "./LivePulse";
import { LiveTrends } from "./LiveTrends";
import { SIDE, Title } from "./shared";

const playerKey = (p: LivePlayer) => p.riotId || `${p.summonerName}|${p.championName}`;

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 font-display text-[10px] font-bold uppercase tracking-widest text-lol-text">
      {children}
    </div>
  );
}

function SkillOrder({ log: rawLog }: { log: NonNullable<StoredLiveGame["skillLog"]> }) {
  // Older recordings hold every flicker of the client's ability ranks, so clean them on the way in
  const log = useMemo(() => cleanSkillLog(rawLog), [rawLog]);
  return (
    <div>
      <Label>Skill order</Label>
      <p className="mb-2 text-[12px] text-lol-text">
        One box per skill point, in the order you took them, with the game time you took it.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {log.map((s, i) => (
          <span
            key={i}
            title={`${s.key} rank ${s.level} at ${fmtClock(s.t)}`}
            className="flex flex-col items-center rounded-md border border-lol-border/50 bg-black/30 px-2 py-1"
          >
            <b className="font-display text-[13px] text-lol-text-bright">{s.key}</b>
            <span className="text-[10px] tabular-nums text-lol-text">{fmtClock(s.t)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// Every item a player gained, in the order they got it, grouped by the moment it was first seen
function BuildOrder({ data, players }: { data: StoredLiveGame; players: LivePlayer[] }) {
  const me = players.find((p) => p.isMe);
  const [who, setWho] = useState(() => (me ? playerKey(me) : ""));
  const bought = (data.itemLog ?? []).filter((e) => e.p === who && e.d > 0);
  const groups = useMemo(() => {
    const out: Array<{ t: number; ids: number[] }> = [];
    for (const e of bought) {
      const last = out[out.length - 1];
      const ids = Array<number>(e.d).fill(e.id);
      if (last && last.t === e.t) last.ids.push(...ids);
      else out.push({ t: e.t, ids });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, who]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Label>Build order</Label>
        <Select value={who} onValueChange={setWho}>
          <SelectTrigger title="Whose build to show" className="h-8 px-3 text-[12.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {players.map((p) => (
              <SelectItem key={playerKey(p)} value={playerKey(p)}>
                {p.championName} · {p.gameName || p.summonerName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {groups.length === 0 ? (
        <p className="text-[12.5px] text-lol-text">No item changes recorded for this player.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {groups.map((g, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="flex gap-0.5">
                {g.ids.map((id, j) => (
                  <span
                    key={j}
                    className="inline-flex rounded-md border border-lol-border/50 bg-black/30 p-px"
                  >
                    <ItemIcon itemId={id} size={30} />
                  </span>
                ))}
              </div>
              <span className="text-[10.5px] tabular-nums text-lol-text">{fmtClock(g.t)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DraftInfo({ cs }: { cs: NonNullable<StoredLiveGame["champSelect"]> }) {
  const row = (label: string, ids: number[]) =>
    ids.length > 0 && (
      <div className="flex items-center gap-2">
        <span className="w-[72px] text-[12px] text-lol-text">{label}</span>
        <div className="flex flex-wrap gap-1">
          {ids.map((id, i) => (
            <ChampionIcon key={`${id}-${i}`} championId={id} size={28} className="rounded-md" />
          ))}
        </div>
      </div>
    );
  return (
    <div>
      <Label>Champion select</Label>
      <div className="flex flex-col gap-1.5">
        {row(
          "Your team",
          cs.myTeam.map((m) => m.championId).filter((id) => id > 0),
        )}
        {row(
          "Bench",
          cs.bench.map((b) => b.championId).filter((id) => id > 0),
        )}
        {row("Your bans", cs.bans.mine)}
        {row("Their bans", cs.bans.theirs)}
        {cs.rerollsRemaining != null && (
          <span className="text-[12px] text-lol-text">Rerolls left: {cs.rerollsRemaining}</span>
        )}
      </div>
    </div>
  );
}

// Everything the live tab recorded while a stored game was played. Renders nothing for games that were
// played without the app open.
export function LiveGameData({ gameId }: { gameId: number }) {
  const [data, setData] = useState<StoredLiveGame | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    // Wrapped so a missing method (stale preload) is a rejection instead of a render crash
    Promise.resolve()
      .then(() => window.api.getGameLiveData(gameId))
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  if (!data) return null;
  const players = data.snapshot.players;
  const allyTeam = players.find((p) => p.isMe)?.team === "CHAOS" ? "CHAOS" : "ORDER";
  const late = (data.firstSampleSec ?? 0) > 60;

  return (
    <div className="flex flex-col gap-5">
      <LivePulse
        events={data.snapshot.events}
        players={players}
        allyTeam={allyTeam}
        clockSec={data.durationSec}
        finished
      />
      <Panel variant="tile" accent={SIDE.ally.var}>
        <Title
          aside={
            <span className="text-[13px] text-lol-text">
              {late
                ? `Recorded from ${fmtClock(data.firstSampleSec ?? 0)}, earlier items are missing`
                : "Recorded live"}
            </span>
          }
        >
          Live game data
        </Title>
        <div className="flex flex-col gap-6">
          <LiveTrends history={data.series} allyTeam={allyTeam} />
          {data.skillLog && data.skillLog.length > 0 && <SkillOrder log={data.skillLog} />}
          {data.itemLog && <BuildOrder data={data} players={players} />}
          {data.champSelect && <DraftInfo cs={data.champSelect} />}
        </div>
      </Panel>
      <LiveEvents events={data.snapshot.events} players={players} allyTeam={allyTeam} />
    </div>
  );
}
