import { useMemo, useState, type ReactNode } from "react";
import type { LiveEvent, LivePlayer } from "../../../shared/api";
import {
  DRAGON_LABELS,
  categoryOf,
  findPlayer,
  fmtClock,
  inhibLabel,
  streakLabel,
  turretLabel,
  type EventCategory,
} from "../../lib/live";
import { Panel } from "../Panel";
import { Title, Who } from "./shared";

const FILTERS: Array<{ id: EventCategory | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "kills", label: "Kills" },
  { id: "objectives", label: "Objectives" },
  { id: "structures", label: "Structures" },
  { id: "other", label: "Other" },
];

const DOT: Record<EventCategory, string> = {
  kills: "bg-lol-loss",
  objectives: "bg-lol-gold",
  structures: "bg-lol-assist",
  other: "bg-lol-text/50",
};

const OBJECTIVE_NAMES: Record<string, string> = {
  HeraldKill: "Rift Herald",
  BaronKill: "Baron Nashor",
  HordeKill: "Void Grubs",
  AtakhanKill: "Atakhan",
};

export function LiveEvents({
  events,
  players,
  allyTeam,
}: {
  events: LiveEvent[];
  players: LivePlayer[];
  allyTeam: string;
}) {
  const [filter, setFilter] = useState<EventCategory | "all">("all");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: events.length };
    for (const e of events) c[categoryOf(e)] = (c[categoryOf(e)] ?? 0) + 1;
    return c;
  }, [events]);

  const shown = useMemo(
    () => events.filter((e) => filter === "all" || categoryOf(e) === filter).reverse(),
    [events, filter],
  );

  // Who did it: a champion with a team colour, or plain text for minions, monsters and turrets
  const actor = (name: string | null): ReactNode => {
    if (!name) return null;
    const p = findPlayer(players, name);
    if (p) return <Who player={p} fallback={name} ally={p.team === allyTeam} />;
    return <span className="text-[13px] italic text-lol-text">{prettyNeutral(name)}</span>;
  };
  const sideOfBuilding = (raw: string | null): string => {
    const owner = raw?.match(/_T([12])_/)?.[1];
    if (!owner) return "";
    const team = owner === "1" ? "ORDER" : "CHAOS";
    return team === allyTeam ? "Your" : "Enemy";
  };

  const describe = (e: LiveEvent): ReactNode => {
    switch (e.name) {
      case "GameStart":
        return <span>The game has started</span>;
      case "MinionsSpawning":
        return <span>Minions have spawned</span>;
      case "ChampionKill":
        return (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {actor(e.killer)}
            <span className="text-lol-text/60">slew</span>
            {actor(e.victim)}
            {e.assisters.length > 0 && (
              <span className="flex flex-wrap items-center gap-x-2 text-[12px] text-lol-text">
                with{" "}
                {e.assisters.map((a) => (
                  <span key={a}>{actor(a)}</span>
                ))}
              </span>
            )}
          </span>
        );
      case "FirstBlood":
        return (
          <span className="flex items-center gap-2">
            <b className="font-display text-lol-loss">First Blood</b>{" "}
            {actor(e.recipient ?? e.killer)}
          </span>
        );
      case "Multikill":
        return (
          <span className="flex items-center gap-2">
            {actor(e.killer)}
            <b className="font-display text-lol-gold">{streakLabel(e.killStreak)}</b>
          </span>
        );
      case "Ace":
        return (
          <span className="flex items-center gap-2">
            <b className="font-display text-lol-gold">ACE</b>
            {actor(e.acer)}
            <span className="text-lol-text">
              wiped out the {e.acingTeam === allyTeam ? "enemy" : "your"} team
            </span>
          </span>
        );
      case "TurretKilled":
        return (
          <span className="flex flex-wrap items-center gap-x-2">
            {actor(e.killer)}
            <span className="text-lol-text/60">destroyed</span>
            <span className="text-[13px] text-lol-text-bright">
              {sideOfBuilding(e.turret)} {turretLabel(e.turret)}
            </span>
          </span>
        );
      case "InhibKilled":
        return (
          <span className="flex flex-wrap items-center gap-x-2">
            {actor(e.killer)}
            <span className="text-lol-text/60">destroyed</span>
            <span className="text-[13px] text-lol-text-bright">
              {sideOfBuilding(e.inhib)} {inhibLabel(e.inhib)}
            </span>
          </span>
        );
      case "InhibRespawningSoon":
      case "InhibRespawned":
        return (
          <span className="text-[13px] text-lol-text-bright">
            {sideOfBuilding(e.inhib)} {inhibLabel(e.inhib)}{" "}
            {e.name === "InhibRespawned" ? "has respawned" : "respawns soon"}
          </span>
        );
      case "FirstBrick":
        return (
          <span className="flex items-center gap-2">
            <b className="font-display text-lol-assist">First Tower</b> {actor(e.killer)}
          </span>
        );
      case "DragonKill":
        return (
          <span className="flex flex-wrap items-center gap-x-2">
            {actor(e.killer)}
            <span className="text-lol-text/60">slew</span>
            <b className="font-display text-[13px] text-lol-gold">
              {DRAGON_LABELS[e.dragonType ?? ""] ?? `${e.dragonType ?? ""} Dragon`}
            </b>
            {e.stolen && (
              <span className="rounded bg-lol-loss/20 px-1.5 text-[10px] font-bold uppercase text-lol-loss">
                Stolen
              </span>
            )}
          </span>
        );
      case "HeraldKill":
      case "BaronKill":
      case "HordeKill":
      case "AtakhanKill":
        return (
          <span className="flex flex-wrap items-center gap-x-2">
            {actor(e.killer)}
            <span className="text-lol-text/60">took</span>
            <b className="font-display text-[13px] text-lol-gold">{OBJECTIVE_NAMES[e.name]}</b>
            {e.stolen && (
              <span className="rounded bg-lol-loss/20 px-1.5 text-[10px] font-bold uppercase text-lol-loss">
                Stolen
              </span>
            )}
          </span>
        );
      default:
        return (
          <span className="text-[13px] text-lol-text">
            <b className="font-display text-lol-text-bright">{e.name}</b>
            {Object.keys(e.extra).length > 0 && (
              <span className="ml-2 text-[11.5px] text-lol-text/70">{JSON.stringify(e.extra)}</span>
            )}
          </span>
        );
    }
  };

  // Which side the event favours decides the edge colour: your own kills and objectives read blue
  const edgeOf = (e: LiveEvent): string => {
    const who = findPlayer(players, e.killer ?? e.acer ?? e.recipient);
    if (!who) return "border-lol-border/50";
    return who.team === allyTeam ? "border-lol-assist/70" : "border-lol-loss/70";
  };

  return (
    <Panel variant="tile" accent="var(--color-lol-loss)">
      <Title
        aside={<span className="text-[13px] text-lol-text">{events.length} events this game</span>}
      >
        Event feed
      </Title>
      <div className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-md border px-2.5 py-1 font-display text-[11.5px] font-semibold transition-colors ${
              filter === f.id
                ? "border-lol-crimson/60 bg-lol-crimson/20 text-lol-text-bright"
                : "border-lol-border/60 bg-lol-card/40 text-lol-text hover:text-lol-text-bright"
            }`}
          >
            {f.label}
            <span className="ml-1.5 text-lol-text/60">{counts[f.id] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="scroll-themed flex max-h-[520px] flex-col gap-1.5 overflow-y-auto pr-1">
        {shown.map((e, i) => (
          <div
            key={`${e.id}-${e.name}-${i}`}
            title={JSON.stringify(e, null, 2)}
            className={`flex items-center gap-3 rounded-lg border-l-[3px] bg-white/[0.03] px-3 py-2 transition-colors hover:bg-white/[0.07] ${edgeOf(e)}`}
          >
            <span className="w-12 shrink-0 font-display text-[12px] font-semibold tabular-nums text-lol-text">
              {fmtClock(e.time)}
            </span>
            <i className={`h-2 w-2 shrink-0 rounded-full ${DOT[categoryOf(e)]}`} />
            <div className="min-w-0 flex-1 text-[13px] text-lol-text-bright">{describe(e)}</div>
          </div>
        ))}
        {shown.length === 0 && (
          <p className="py-8 text-center text-sm text-lol-text">Nothing in this category yet.</p>
        )}
      </div>
      <p className="mt-3 text-[11px] text-lol-text/60">
        Blue edge = your side, red = the enemy. Hover a row for the raw event.
      </p>
    </Panel>
  );
}

// "Minion_T200L1S1_..." and "SRU_Dragon_Fire" style names, shortened to something readable
function prettyNeutral(name: string): string {
  if (/^Minion/i.test(name)) return "a minion";
  if (/^Turret/i.test(name)) return "a turret";
  if (/^SRU_|^Sru_/i.test(name))
    return name
      .replace(/^SRU_/i, "")
      .replace(/\d+$/, "")
      .replace(/([a-z])([A-Z])/g, "$1 $2");
  return name;
}
