import type { LivePlayer } from "../../../shared/api";
import { compact, kdaRatio, type TeamSummary } from "../../lib/live";
import ChampionIcon from "../ChampionIcon";
import ItemIcon from "../ItemIcon";
import { Panel } from "../Panel";
import { Pill, RuneChip, SIDE, SpellPair, Title, useLiveResolvers } from "./shared";

const POSITION_LABEL: Record<string, string> = {
  TOP: "Top",
  JUNGLE: "Jungle",
  MIDDLE: "Mid",
  BOTTOM: "Bot",
  UTILITY: "Support",
};

// ---- Team comparison strip ----------------------------------------------------------------------

type Metric = { label: string; ally: number; enemy: number; fmt?: (v: number) => string };

export function LiveTeamStrip({ ally, enemy }: { ally: TeamSummary; enemy: TeamSummary }) {
  const totalKills = ally.kills + enemy.kills;
  const allyShare = totalKills > 0 ? (ally.kills / totalKills) * 100 : 50;
  const all: Metric[] = [
    { label: "Item value", ally: ally.itemValue, enemy: enemy.itemValue, fmt: compact },
    { label: "Creep score", ally: ally.cs, enemy: enemy.cs },
    {
      label: "Average level",
      ally: ally.avgLevel,
      enemy: enemy.avgLevel,
      fmt: (v) => v.toFixed(1),
    },
    { label: "Assists", ally: ally.assists, enemy: enemy.assists },
    { label: "Turrets", ally: ally.turrets, enemy: enemy.turrets },
    { label: "Inhibitors", ally: ally.inhibitors, enemy: enemy.inhibitors },
    { label: "Dragons", ally: ally.dragons, enemy: enemy.dragons },
    { label: "Barons", ally: ally.barons, enemy: enemy.barons },
    { label: "Rift Heralds", ally: ally.heralds, enemy: enemy.heralds },
    { label: "Void Grubs", ally: ally.grubs, enemy: enemy.grubs },
  ];
  // Objectives a mode doesn't have stay out of the way until someone takes one
  const metrics = all.filter(
    (m) =>
      !["Dragons", "Barons", "Rift Heralds", "Void Grubs"].includes(m.label) ||
      m.ally + m.enemy > 0,
  );

  return (
    <Panel variant="tile" accent="var(--color-lol-gold)">
      <Title aside={<span className="text-[13px] text-lol-text">Team comparison</span>}>
        Scoreboard
      </Title>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-6">
        <div className="text-right">
          <div
            className={`font-display text-[11px] font-bold uppercase tracking-widest ${SIDE.ally.text}`}
          >
            Your team
          </div>
          <div className={`font-display text-[44px] font-bold leading-none ${SIDE.ally.text}`}>
            {ally.kills}
          </div>
        </div>
        <span className="font-display text-[12px] font-semibold uppercase tracking-widest text-lol-text/60">
          kills
        </span>
        <div>
          <div
            className={`font-display text-[11px] font-bold uppercase tracking-widest ${SIDE.enemy.text}`}
          >
            Enemy team
          </div>
          <div className={`font-display text-[44px] font-bold leading-none ${SIDE.enemy.text}`}>
            {enemy.kills}
          </div>
        </div>
      </div>
      <div className="mx-auto mt-3 flex h-2 max-w-[720px] overflow-hidden rounded-full bg-black/40">
        <i
          className={`h-full ${SIDE.ally.bg} transition-[width] duration-500`}
          style={{ width: `${allyShare}%` }}
        />
        <i className={`h-full flex-1 ${SIDE.enemy.bg}`} />
      </div>

      <div className="mx-auto mt-5 grid max-w-[720px] grid-cols-1 gap-x-10 sm:grid-cols-2">
        {metrics.map((m) => {
          const fmt = m.fmt ?? ((v: number) => String(Math.round(v)));
          const lead = m.ally === m.enemy ? 0 : m.ally > m.enemy ? 1 : -1;
          return (
            <div
              key={m.label}
              className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-3 border-b border-lol-border/30 py-1.5"
            >
              <b
                className={`text-right font-display text-[14px] tabular-nums ${
                  lead > 0 ? SIDE.ally.text : "text-lol-text-bright"
                }`}
              >
                {fmt(m.ally)}
              </b>
              <span className="min-w-[96px] text-center text-[11.5px] uppercase tracking-wider text-lol-text">
                {m.label}
              </span>
              <b
                className={`font-display text-[14px] tabular-nums ${
                  lead < 0 ? SIDE.enemy.text : "text-lol-text-bright"
                }`}
              >
                {fmt(m.enemy)}
              </b>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ---- Team tables --------------------------------------------------------------------------------

const COLS = "grid-cols-[minmax(190px,1.5fr)_56px_64px_140px_74px_52px_minmax(250px,2fr)]";

function PlayerRow({
  p,
  ally,
  clockSec,
  teamKills,
}: {
  p: LivePlayer;
  ally: boolean;
  clockSec: number;
  teamKills: number;
}) {
  const { championId } = useLiveResolvers();
  const id = championId(p);
  const minutes = Math.max(clockSec / 60, 1 / 60);
  const side = ally ? SIDE.ally : SIDE.enemy;

  return (
    <div
      className={`grid ${COLS} items-center gap-3 border-b border-lol-border/20 px-4 py-2.5 transition-colors last:border-b-0 hover:bg-white/[0.04] ${
        p.isMe
          ? "bg-[linear-gradient(90deg,color-mix(in_srgb,var(--color-lol-gold)_14%,transparent),transparent_55%)] shadow-[inset_3px_0_0_var(--color-lol-gold)]"
          : ""
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative shrink-0">
          {id != null ? (
            <ChampionIcon
              championId={id}
              size={40}
              className={`rounded-xl ring-2 ${side.ring} ${p.isDead ? "opacity-40 grayscale" : ""}`}
            />
          ) : (
            <div className="h-10 w-10 rounded-xl bg-white/5" />
          )}
          <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full border border-lol-border bg-lol-card px-1.5 font-display text-[10px] font-bold text-lol-text-bright">
            {p.level}
          </span>
          {p.isDead && (
            <span className="absolute inset-0 flex items-center justify-center font-display text-[13px] font-bold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
              {Math.ceil(p.respawnTimer)}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`truncate font-display text-[13.5px] font-semibold ${p.isMe ? "text-lol-gold" : "text-lol-text-bright"}`}
              title={p.riotId || p.summonerName}
            >
              {p.gameName || p.summonerName}
            </span>
            {p.tagLine && (
              <span className="shrink-0 text-[11px] text-lol-text/60">#{p.tagLine}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-lol-text">
            <span>{p.championName}</span>
            {POSITION_LABEL[p.position] && (
              <span className="rounded bg-white/[0.07] px-1.5 text-[10px] font-bold uppercase tracking-wider">
                {POSITION_LABEL[p.position]}
              </span>
            )}
            {p.isBot && (
              <span className="rounded bg-white/[0.07] px-1.5 text-[10px] font-bold uppercase tracking-wider">
                Bot
              </span>
            )}
            {p.skinName && p.skinId > 0 && <span className="text-lol-text/60">{p.skinName}</span>}
          </div>
        </div>
      </div>

      <SpellPair player={p} />

      <div
        className="flex items-center gap-1.5"
        title={[p.keystone?.name, p.secondaryTree?.name].filter(Boolean).join(" · ")}
      >
        <RuneChip rune={p.keystone} size={26} />
        <RuneChip rune={p.secondaryTree} size={18} />
      </div>

      <div className="text-center">
        <div className="whitespace-nowrap font-display text-[13px] font-semibold text-lol-text-bright">
          {p.kills} / <span className="text-lol-loss">{p.deaths}</span> / {p.assists}
        </div>
        <div
          className={`text-[11px] ${kdaRatio(p.kills, p.deaths, p.assists) >= 4 ? "text-lol-gold" : "text-lol-text"}`}
        >
          {kdaRatio(p.kills, p.deaths, p.assists).toFixed(2)} KDA
          {teamKills > 0 && (
            <span title="Kill participation">
              {" "}
              · {Math.round(((p.kills + p.assists) / teamKills) * 100)}% KP
            </span>
          )}
        </div>
      </div>

      <div className="text-right">
        <div className="font-display text-[13px] font-semibold text-lol-text-bright">
          {p.creepScore}
        </div>
        <div className="text-[11px] text-lol-text">{(p.creepScore / minutes).toFixed(1)}/min</div>
      </div>

      <div className="text-right font-display text-[13px] text-lol-text">
        {p.wardScore > 0 ? Math.round(p.wardScore) : "—"}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {p.items.map((it) => (
            <span
              key={`${it.slot}-${it.id}`}
              title={`${it.name} · ${it.price.toLocaleString()}g${it.count > 1 ? ` · x${it.count}` : ""}`}
              className="relative inline-flex rounded-md border border-lol-border/50 bg-black/30 p-px"
            >
              <ItemIcon itemId={it.id} size={26} />
              {it.count > 1 && (
                <span className="absolute -bottom-0.5 -right-0.5 rounded bg-black/80 px-0.5 text-[9px] font-bold text-lol-text-bright">
                  {it.count}
                </span>
              )}
            </span>
          ))}
        </div>
        <span className="shrink-0 text-right font-display text-[12px] font-semibold text-lol-gold">
          {compact(p.itemValue)}
          <span
            className="block text-[10.5px] font-normal text-lol-text"
            title="Item value per minute of game time"
          >
            {compact(p.itemValue / minutes)}/min
          </span>
        </span>
      </div>
    </div>
  );
}

export function LiveTeamTable({
  team,
  ally,
  clockSec,
}: {
  team: TeamSummary;
  ally: boolean;
  clockSec: number;
}) {
  const side = ally ? SIDE.ally : SIDE.enemy;
  return (
    <Panel variant="tile" accent={side.var} className="shrink-0 overflow-hidden !p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            className={`font-display text-[15px] font-bold uppercase tracking-wider ${side.text}`}
          >
            {ally ? "Your team" : "Enemy team"}
          </span>
          <Pill className="border-lol-border/60 bg-black/25 text-lol-text">
            {team.team === "ORDER" ? "Blue side" : "Red side"}
          </Pill>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-display text-[12.5px] text-lol-text">
          <span>
            KDA{" "}
            <b className="text-lol-text-bright">
              {team.kills} / {team.deaths} / {team.assists}
            </b>
          </span>
          <span>
            CS <b className="text-lol-text-bright">{team.cs}</b>
          </span>
          <span>
            Items <b className="text-lol-gold">{compact(team.itemValue)}</b>
          </span>
        </div>
      </div>
      <div
        className={`grid ${COLS} items-center gap-3 border-y border-lol-border/40 bg-white/[0.02] px-4 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-lol-text`}
      >
        <span>Player</span>
        <span>Spells</span>
        <span>Runes</span>
        <span className="text-center">K / D / A</span>
        <span className="text-right">CS</span>
        <span className="text-right">Wards</span>
        <span>Items</span>
      </div>
      {team.players.map((p) => (
        <PlayerRow
          key={p.riotId || p.summonerName}
          p={p}
          ally={ally}
          clockSec={clockSec}
          teamKills={team.kills}
        />
      ))}
      {team.players.length === 0 && (
        <p className="px-4 py-6 text-center text-sm text-lol-text">
          No players reported for this side.
        </p>
      )}
    </Panel>
  );
}
