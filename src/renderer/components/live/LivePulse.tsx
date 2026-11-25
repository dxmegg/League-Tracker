import { useMemo, type ReactNode } from "react";
import type { LiveEvent, LivePlayer } from "../../../shared/api";
import { findPlayer, fmtClock, streakLabel } from "../../lib/live";
import ChampionIcon from "../ChampionIcon";
import { Panel } from "../Panel";
import { SIDE, Title, Who, useLiveResolvers } from "./shared";

const WINDOW_SEC = 180;

type Pulse = {
  streaks: Array<{ player: LivePlayer; streak: number }>;
  recent: Record<string, number>;
  total: Record<string, number>;
  shutdowns: Record<string, number>;
  firstBlood: { player: LivePlayer; at: number; victim: LivePlayer | null } | null;
  aces: Record<string, number>;
  bestMulti: { player: LivePlayer; kills: number; at: number } | null;
  bestStreak: { player: LivePlayer; streak: number; at: number } | null;
  // Multikill events by size (2 = double ... 5 = penta)
  multis: Record<number, number>;
  // Kills of every champion, from the feed
  tally: Array<{ player: LivePlayer; kills: number; deaths: number }>;
  // The minute of the game with the most champion kills, both teams together
  busiest: { minute: number; kills: number } | null;
};

// Everything here is derived from the game's own event feed: who is on a run right now, who has been
// trading kills lately, and which moments stood out so far.
function computePulse(events: LiveEvent[], players: LivePlayer[], nowSec: number): Pulse {
  const key = (p: LivePlayer) => p.riotId || p.summonerName;
  const streak = new Map<string, number>();
  const kills = new Map<string, number>();
  const deaths = new Map<string, number>();
  const perMinute = new Map<number, number>();
  const pulse: Pulse = {
    streaks: [],
    recent: {},
    total: {},
    shutdowns: {},
    firstBlood: null,
    aces: {},
    bestMulti: null,
    bestStreak: null,
    multis: {},
    tally: [],
    busiest: null,
  };
  const sorted = [...events].sort((a, b) => a.time - b.time);

  for (const e of sorted) {
    if (e.name === "ChampionKill") {
      const killer = findPlayer(players, e.killer);
      const victim = findPlayer(players, e.victim);
      const minute = Math.floor(e.time / 60);
      perMinute.set(minute, (perMinute.get(minute) ?? 0) + 1);
      if (killer) {
        pulse.total[killer.team] = (pulse.total[killer.team] ?? 0) + 1;
        if (nowSec - e.time <= WINDOW_SEC)
          pulse.recent[killer.team] = (pulse.recent[killer.team] ?? 0) + 1;
        kills.set(key(killer), (kills.get(key(killer)) ?? 0) + 1);
        const run = (streak.get(key(killer)) ?? 0) + 1;
        streak.set(key(killer), run);
        if (!pulse.bestStreak || run > pulse.bestStreak.streak)
          pulse.bestStreak = { player: killer, streak: run, at: e.time };
      }
      if (victim) {
        deaths.set(key(victim), (deaths.get(key(victim)) ?? 0) + 1);
        // Ending a run of three or more is a shutdown for the killer's side
        if ((streak.get(key(victim)) ?? 0) >= 3 && killer)
          pulse.shutdowns[killer.team] = (pulse.shutdowns[killer.team] ?? 0) + 1;
        streak.set(key(victim), 0);
      }
    } else if (e.name === "FirstBlood") {
      const who = findPlayer(players, e.recipient ?? e.killer);
      if (who) {
        // The kill itself carries the victim, and is logged at the same moment
        const kill = sorted.find(
          (k) => k.name === "ChampionKill" && Math.abs(k.time - e.time) < 1.5,
        );
        pulse.firstBlood = {
          player: who,
          at: e.time,
          victim: kill ? (findPlayer(players, kill.victim) ?? null) : null,
        };
      }
    } else if (e.name === "Multikill") {
      const p = findPlayer(players, e.killer);
      if (e.killStreak) pulse.multis[e.killStreak] = (pulse.multis[e.killStreak] ?? 0) + 1;
      if (p && e.killStreak && (!pulse.bestMulti || e.killStreak > pulse.bestMulti.kills))
        pulse.bestMulti = { player: p, kills: e.killStreak, at: e.time };
    } else if (e.name === "Ace" && e.acingTeam) {
      pulse.aces[e.acingTeam] = (pulse.aces[e.acingTeam] ?? 0) + 1;
    }
  }

  pulse.streaks = players
    .map((player) => ({ player, streak: streak.get(key(player)) ?? 0 }))
    .filter((s) => s.streak >= 2)
    .sort((a, b) => b.streak - a.streak);
  pulse.tally = players
    .map((player) => ({
      player,
      kills: kills.get(key(player)) ?? 0,
      deaths: deaths.get(key(player)) ?? 0,
    }))
    .filter((t) => t.kills > 0)
    .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  for (const [minute, n] of perMinute)
    if (!pulse.busiest || n > pulse.busiest.kills) pulse.busiest = { minute, kills: n };
  return pulse;
}

function Tile({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-lol-border/60 bg-black/25 px-4 py-3" title={hint}>
      <div className="font-display text-[10px] font-bold uppercase tracking-widest text-lol-text">
        {label}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

// Two numbers, yours and theirs, in the side colours used everywhere on the tab
function Versus({ ally, enemy, suffix = "" }: { ally: number; enemy: number; suffix?: string }) {
  return (
    <div className="flex items-baseline gap-2 font-display text-[26px] font-bold tabular-nums">
      <span className={SIDE.ally.text}>
        {ally}
        {suffix}
      </span>
      <span className="text-[16px] text-lol-text/50">:</span>
      <span className={SIDE.enemy.text}>
        {enemy}
        {suffix}
      </span>
    </div>
  );
}

// Your share of a pair of numbers as a split line: blue for you, red for them, grey when both are zero
function ShareBar({ ally, enemy }: { ally: number; enemy: number }) {
  const total = ally + enemy;
  const share = total > 0 ? (ally / total) * 100 : 50;
  return (
    <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
      {total > 0 && (
        <>
          <i className={`block h-full ${SIDE.ally.bg}`} style={{ width: `${share}%` }} />
          <i className={`block h-full ${SIDE.enemy.bg}`} style={{ width: `${100 - share}%` }} />
        </>
      )}
    </div>
  );
}

// One side's champions in a row; the ones waiting to respawn are dimmed with their timer
function Roster({
  players,
  tone,
}: {
  players: LivePlayer[];
  tone: (typeof SIDE)["ally"] | (typeof SIDE)["enemy"];
}) {
  const { championId } = useLiveResolvers();
  return (
    <div className="flex items-center gap-1.5">
      {players.map((p) => {
        const id = championId(p);
        return (
          <span
            key={p.riotId || p.summonerName}
            title={`${p.championName}${p.isDead ? ` · back in ${Math.ceil(p.respawnTimer)}s` : ""}`}
            className={`relative inline-flex rounded-lg ring-1 ${tone.ring} ${p.isDead ? "opacity-40 grayscale" : ""}`}
          >
            {id != null && <ChampionIcon championId={id} size={30} className="rounded-lg" />}
            {p.isDead && p.respawnTimer > 0 && (
              <b className="absolute inset-0 flex items-center justify-center font-display text-[11px] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
                {Math.ceil(p.respawnTimer)}
              </b>
            )}
          </span>
        );
      })}
    </div>
  );
}

export function LivePulse({
  events,
  players,
  allyTeam,
  clockSec,
  finished = false,
}: {
  events: LiveEvent[];
  players: LivePlayer[];
  allyTeam: string;
  clockSec: number;
  // A stored game: "now" is the end of the game and the wording looks back instead of at the moment
  finished?: boolean;
}) {
  const enemyTeam = allyTeam === "ORDER" ? "CHAOS" : "ORDER";
  const pulse = useMemo(() => computePulse(events, players, clockSec), [events, players, clockSec]);
  const alive = (team: string) => players.filter((p) => p.team === team && !p.isDead).length;
  const teamPlayers = (team: string) => players.filter((p) => p.team === team);
  const longestRespawn = (team: string) =>
    Math.max(0, ...players.filter((p) => p.team === team && p.isDead).map((p) => p.respawnTimer));
  const minutes = Math.max(clockSec / 60, 1 / 60);
  const pace = (team: string) => Math.round(((pulse.total[team] ?? 0) / minutes) * 10) / 10;
  const side = (p: LivePlayer) => p.team === allyTeam;
  const kd = (a: number, b: number) => (
    <b className="font-display tabular-nums">
      <span className={SIDE.ally.text}>{a}</span>
      <span className="text-lol-text/50"> : </span>
      <span className={SIDE.enemy.text}>{b}</span>
    </b>
  );
  const multiParts = [
    [2, "double"],
    [3, "triple"],
    [4, "quadra"],
    [5, "penta"],
  ]
    .filter(([n]) => pulse.multis[n as number])
    .map(
      ([n, label]) =>
        `${pulse.multis[n as number]} ${label}${pulse.multis[n as number] > 1 ? "s" : ""}`,
    );

  return (
    <Panel variant="tile">
      <Title
        aside={
          <span className="text-[13px] text-lol-text">
            {finished ? "From the recorded event feed" : "From the event feed"}
          </span>
        }
      >
        Pulse
      </Title>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label={
            finished ? `Kills, final ${WINDOW_SEC / 60} min` : `Kills, last ${WINDOW_SEC / 60} min`
          }
          hint={`Champion kills by each team in the ${finished ? "last" : "most recent"} three minutes`}
        >
          <Versus ally={pulse.recent[allyTeam] ?? 0} enemy={pulse.recent[enemyTeam] ?? 0} />
          <ShareBar ally={pulse.recent[allyTeam] ?? 0} enemy={pulse.recent[enemyTeam] ?? 0} />
          <div className="mt-1.5 text-[12px] text-lol-text">
            {finished ? "Who won the last fights" : "Who is winning the current fights"}
          </div>
        </Tile>

        <Tile label="Kill pace" hint="Champion kills per minute over the whole game so far">
          <Versus ally={pace(allyTeam)} enemy={pace(enemyTeam)} suffix="/min" />
          <ShareBar ally={pulse.total[allyTeam] ?? 0} enemy={pulse.total[enemyTeam] ?? 0} />
          <div className="mt-1.5 text-[12px] text-lol-text">
            {pulse.total[allyTeam] ?? 0} vs {pulse.total[enemyTeam] ?? 0} kills
            {pulse.busiest && (
              <>
                {" · "}bloodiest minute {fmtClock(pulse.busiest.minute * 60)} with{" "}
                {pulse.busiest.kills} kills
              </>
            )}
          </div>
        </Tile>

        <Tile
          label={finished ? "Alive at the end" : "Alive now"}
          hint="Champions that are not waiting to respawn"
        >
          <Versus ally={alive(allyTeam)} enemy={alive(enemyTeam)} />
          <div className="mt-2 flex flex-col gap-1.5">
            <Roster players={teamPlayers(allyTeam)} tone={SIDE.ally} />
            <Roster players={teamPlayers(enemyTeam)} tone={SIDE.enemy} />
          </div>
          <div className="mt-1.5 text-[12px] text-lol-text">
            {longestRespawn(allyTeam) > 0 || longestRespawn(enemyTeam) > 0
              ? `Longest respawn: you ${Math.ceil(longestRespawn(allyTeam))}s, enemy ${Math.ceil(longestRespawn(enemyTeam))}s`
              : "Everyone is up"}
          </div>
        </Tile>

        <Tile label="Aces and shutdowns" hint="Team wipes, and kills that ended a three-kill run">
          <div className="flex flex-col gap-2.5">
            <div>
              <div className="flex items-baseline justify-between text-[20px]">
                <span className="text-[12px] text-lol-text">Aces</span>
                {kd(pulse.aces[allyTeam] ?? 0, pulse.aces[enemyTeam] ?? 0)}
              </div>
              <div className="text-[11.5px] text-lol-text/70">Whole team wiped out</div>
            </div>
            <div>
              <div className="flex items-baseline justify-between text-[20px]">
                <span className="text-[12px] text-lol-text">Shutdowns</span>
                {kd(pulse.shutdowns[allyTeam] ?? 0, pulse.shutdowns[enemyTeam] ?? 0)}
              </div>
              <div className="text-[11.5px] text-lol-text/70">A run of three kills cut short</div>
            </div>
          </div>
        </Tile>

        <Tile
          label={finished ? "On a run at the end" : "On a run"}
          hint="Champions with two or more kills since their last death"
        >
          {pulse.streaks.length === 0 ? (
            <div className="text-[12.5px] text-lol-text">
              {finished ? "Nobody was on a streak." : "Nobody is on a streak right now."}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {pulse.streaks.slice(0, 4).map(({ player, streak }) => (
                <div key={player.riotId || player.summonerName} className="flex items-center gap-2">
                  <Who player={player} fallback={player.championName} ally={side(player)} />
                  <b className="font-display text-[13px] text-lol-gold">{streak} in a row</b>
                </div>
              ))}
            </div>
          )}
          {pulse.tally.length > 0 && (
            <div className="mt-2.5 border-t border-lol-border/40 pt-2">
              <div className="mb-1 text-[10.5px] uppercase tracking-wider text-lol-text/70">
                Most kills
              </div>
              {pulse.tally.slice(0, 3).map(({ player, kills, deaths }) => (
                <div
                  key={player.riotId || player.summonerName}
                  className="flex items-center justify-between gap-2 py-0.5"
                >
                  <Who
                    player={player}
                    fallback={player.championName}
                    ally={side(player)}
                    size={20}
                  />
                  <span className="text-[12px] tabular-nums text-lol-text">
                    <b className="text-lol-text-bright">{kills}</b> kills · {deaths} deaths
                  </span>
                </div>
              ))}
            </div>
          )}
        </Tile>

        <Tile label="First blood">
          {pulse.firstBlood ? (
            <>
              <Who
                player={pulse.firstBlood.player}
                fallback={pulse.firstBlood.player.championName}
                ally={side(pulse.firstBlood.player)}
                size={24}
              />
              <div className="mt-2 text-[12px] text-lol-text">
                at <b className="text-lol-text-bright">{fmtClock(pulse.firstBlood.at)}</b>
                {pulse.firstBlood.victim && (
                  <>
                    {" · "}took out{" "}
                    <b className={side(pulse.firstBlood.victim) ? SIDE.ally.text : SIDE.enemy.text}>
                      {pulse.firstBlood.victim.championName}
                    </b>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="text-[12.5px] text-lol-text">Not drawn yet.</div>
          )}
        </Tile>

        <Tile
          label={finished ? "Best streak" : "Best streak so far"}
          hint="Longest run of kills without dying, this game"
        >
          {pulse.bestStreak && pulse.bestStreak.streak >= 2 ? (
            <>
              <div className="flex items-center gap-2">
                <Who
                  player={pulse.bestStreak.player}
                  fallback={pulse.bestStreak.player.championName}
                  ally={side(pulse.bestStreak.player)}
                />
                <b className="font-display text-[13px] text-lol-gold">
                  {pulse.bestStreak.streak} kills
                </b>
              </div>
              <div className="mt-2 text-[12px] text-lol-text">
                without dying, reached at{" "}
                <b className="text-lol-text-bright">{fmtClock(pulse.bestStreak.at)}</b>
              </div>
            </>
          ) : (
            <div className="text-[12.5px] text-lol-text">No run of two or more yet.</div>
          )}
        </Tile>

        <Tile label="Biggest multikill">
          {pulse.bestMulti ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Who
                  player={pulse.bestMulti.player}
                  fallback={pulse.bestMulti.player.championName}
                  ally={side(pulse.bestMulti.player)}
                />
                <b className="font-display text-[13px] text-lol-gold">
                  {streakLabel(pulse.bestMulti.kills)}
                </b>
                <span className="text-[11.5px] text-lol-text">
                  at {fmtClock(pulse.bestMulti.at)}
                </span>
              </div>
              <div className="mt-2 text-[12px] text-lol-text">
                All multikills this game:{" "}
                <b className="text-lol-text-bright">{multiParts.join(" · ")}</b>
              </div>
            </>
          ) : (
            <div className="text-[12.5px] text-lol-text">No multikills yet.</div>
          )}
        </Tile>
      </div>
    </Panel>
  );
}
