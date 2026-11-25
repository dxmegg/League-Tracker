import type { LiveActivePlayer, LivePlayer } from "../../../shared/api";
import { compact, kdaRatio, statGroups } from "../../lib/live";
import ChampionIcon from "../ChampionIcon";
import ItemIcon from "../ItemIcon";
import { Panel } from "../Panel";
import { Meter, RuneChip, SpellPair, StatIcon, Title, useLiveResolvers } from "./shared";

const RESOURCE_COLORS: Record<string, string> = {
  MANA: "bg-gradient-to-r from-sky-700 to-sky-400",
  ENERGY: "bg-gradient-to-r from-yellow-700 to-yellow-400",
  RAGE: "bg-gradient-to-r from-red-800 to-red-500",
  FURY: "bg-gradient-to-r from-red-800 to-red-500",
  FLOW: "bg-gradient-to-r from-cyan-700 to-cyan-400",
};

const MAX_RANK: Record<string, number> = { Q: 5, W: 5, E: 5, R: 3, Passive: 0 };

// The shard rows arrive as localisation keys ("perk_tooltip_StatModAdaptive"); this makes them readable.
function prettyShard(raw: string): string {
  const key = raw.replace(/^perk_tooltip_/i, "").replace(/^StatMod/i, "");
  const map: Record<string, string> = {
    Adaptive: "Adaptive Force",
    AttackSpeed: "Attack Speed",
    AbilityHaste: "Ability Haste",
    CDR: "Ability Haste",
    MagicResist: "Magic Resist",
    HealthScaling: "Scaling Health",
    HealthPlus: "Health",
    MovementSpeed: "Move Speed",
    Tenacity: "Tenacity and Slow Resist",
  };
  return map[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function AbilityTile({ ability }: { ability: LiveActivePlayer["abilities"][number] }) {
  const max = MAX_RANK[ability.key] ?? 5;
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-lol-border/60 bg-black/25 p-2.5">
      <div className="flex items-center gap-2">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-display text-[12px] font-bold ${
            ability.key === "R" ? "bg-lol-gold text-[#241705]" : "bg-white/10 text-lol-text-bright"
          }`}
        >
          {ability.key === "Passive" ? "P" : ability.key}
        </span>
        <span
          className="truncate text-[12px] font-semibold text-lol-text-bright"
          title={ability.name}
        >
          {ability.name || "—"}
        </span>
      </div>
      {max > 0 ? (
        <div className="flex gap-1" title={`Rank ${ability.level} of ${max}`}>
          {Array.from({ length: max }, (_, i) => (
            <i
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                i < ability.level
                  ? ability.key === "R"
                    ? "bg-lol-gold"
                    : "bg-lol-win"
                  : "bg-white/10"
              }`}
            />
          ))}
        </div>
      ) : (
        <span className="text-[10.5px] uppercase tracking-wider text-lol-text/60">Passive</span>
      )}
    </div>
  );
}

export function LiveMe({
  me,
  player,
  clockSec,
  teamKills,
  peaks,
}: {
  me: LiveActivePlayer;
  player: LivePlayer | undefined;
  clockSec: number;
  teamKills: number;
  peaks: Record<string, number>;
}) {
  const { championId, runeData } = useLiveResolvers();
  const stats = me.stats;
  const num = (k: string) => (typeof stats[k] === "number" ? (stats[k] as number) : 0);
  const resourceType = String(stats.resourceType ?? "");
  const champId = player ? championId(player) : null;
  const k = player?.kills ?? 0;
  const d = player?.deaths ?? 0;
  const a = player?.assists ?? 0;
  const cs = player?.creepScore ?? 0;
  const minutes = Math.max(clockSec / 60, 1 / 60);

  return (
    <Panel variant="tile" accent="var(--color-lol-assist)">
      <Title
        aside={
          <span className="text-[13px] text-lol-text">
            Your champion · {me.riotId || me.summonerName}
          </span>
        }
      >
        You
      </Title>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-5">
            <div className="relative shrink-0">
              {champId != null ? (
                <ChampionIcon
                  championId={champId}
                  size={84}
                  className="rounded-2xl ring-2 ring-lol-assist/60"
                />
              ) : (
                <div className="h-[84px] w-[84px] rounded-2xl bg-white/5" />
              )}
              <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-lol-border bg-lol-card px-2.5 py-0.5 font-display text-[11px] font-bold text-lol-text-bright">
                Lv {me.level}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-display text-[24px] font-bold leading-tight text-lol-text-bright">
                {player?.championName || "—"}
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-5 gap-y-1">
                <span className="font-display text-[30px] font-bold leading-none">
                  <span className="text-lol-gold">{k}</span>
                  <span className="mx-1 text-lol-text/60">/</span>
                  <span className="text-lol-loss">{d}</span>
                  <span className="mx-1 text-lol-text/60">/</span>
                  <span className="text-lol-assist">{a}</span>
                </span>
                <span className="font-display text-[13px] font-semibold text-lol-win">
                  {kdaRatio(k, d, a).toFixed(2)} KDA
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-lol-text">
                <span>
                  <b className="font-display text-[15px] text-lol-gold">
                    {Math.round(me.currentGold).toLocaleString()}
                  </b>{" "}
                  gold
                </span>
                <span>
                  <b className="font-display text-[15px] text-lol-text-bright">{cs}</b> CS ·{" "}
                  {(cs / minutes).toFixed(1)}/min
                </span>
                {teamKills > 0 && (
                  <span title="Share of your team's kills you took part in">
                    <b className="font-display text-[15px] text-lol-text-bright">
                      {Math.round(((k + a) / teamKills) * 100)}%
                    </b>{" "}
                    kill participation
                  </span>
                )}
                {player && player.itemValue > 0 && (
                  <span title="Items owned plus unspent gold, per minute of game time">
                    <b className="font-display text-[15px] text-lol-gold">
                      {Math.round((player.itemValue + me.currentGold) / minutes).toLocaleString()}
                    </b>{" "}
                    gold/min
                  </span>
                )}
                {player && player.wardScore > 0 && (
                  <span>
                    <b className="font-display text-[15px] text-lol-text-bright">
                      {Math.round(player.wardScore)}
                    </b>{" "}
                    ward score
                  </span>
                )}
              </div>
            </div>
            {player && <SpellPair player={player} />}
          </div>

          <div className="flex flex-col gap-2">
            <Meter
              value={num("currentHealth")}
              max={num("maxHealth")}
              className="bg-gradient-to-r from-emerald-700 to-emerald-400"
              label={`${Math.round(num("currentHealth"))} / ${Math.round(num("maxHealth"))}`}
            />
            {num("resourceMax") > 0 && (
              <Meter
                value={num("resourceValue")}
                max={num("resourceMax")}
                className={
                  RESOURCE_COLORS[resourceType] ?? "bg-gradient-to-r from-slate-600 to-slate-400"
                }
                label={`${Math.round(num("resourceValue"))} / ${Math.round(num("resourceMax"))}${
                  resourceType ? ` ${resourceType.toLowerCase()}` : ""
                }`}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            {me.abilities.map((ability) => (
              <AbilityTile key={ability.key} ability={ability} />
            ))}
          </div>

          {/* Some modes send no rune page at all; an empty box would only show a dash */}
          {(me.keystone || me.generalRunes.length > 0 || me.statRunes.length > 0) && (
            <div className="rounded-xl border border-lol-border/60 bg-black/25 p-3">
              <div className="mb-2 font-display text-[10px] font-bold uppercase tracking-widest text-lol-text">
                Runes
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
                <div className="flex items-center gap-2.5">
                  <RuneChip rune={me.keystone} size={44} />
                  <div className="leading-tight">
                    <div className="font-display text-[13px] font-semibold text-lol-text-bright">
                      {me.keystone?.name || "—"}
                    </div>
                    <div className="text-[11.5px] text-lol-text">
                      {[me.primaryTree?.name, me.secondaryTree?.name].filter(Boolean).join(" + ")}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {me.generalRunes
                    .filter((r) => r.id !== me.keystone?.id)
                    .map((r) => (
                      <RuneChip key={r.id} rune={r} size={28} />
                    ))}
                </div>
                {me.statRunes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {me.statRunes.map((r, i) => (
                      <span
                        key={`${r.id}-${i}`}
                        className="rounded-md border border-lol-border/60 bg-white/[0.05] px-2 py-0.5 text-[11px] text-lol-text-bright"
                      >
                        {runeData[r.id]?.name || prettyShard(r.name)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {player && (
            <div className="rounded-xl border border-lol-border/60 bg-black/25 p-3">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="font-display text-[10px] font-bold uppercase tracking-widest text-lol-text">
                  Inventory
                </span>
                <span className="text-[12px] text-lol-text">
                  value{" "}
                  <b className="font-display text-lol-gold">{compact(player.itemValue)} gold</b>
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {player.items.map((it) => (
                  <span
                    key={`${it.slot}-${it.id}`}
                    title={`${it.name} · ${it.price.toLocaleString()}g${it.count > 1 ? ` · x${it.count}` : ""}`}
                    className="relative inline-flex rounded-lg border border-lol-border/60 bg-black/30 p-0.5"
                  >
                    <ItemIcon itemId={it.id} size={36} />
                    {it.count > 1 && (
                      <span className="absolute -bottom-1 -right-1 rounded bg-black/80 px-1 text-[10px] font-bold text-lol-text-bright">
                        {it.count}
                      </span>
                    )}
                  </span>
                ))}
                {player.items.length === 0 && (
                  <span className="text-[12.5px] text-lol-text">No items yet.</span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          {statGroups(stats, peaks).map((group) => (
            <div
              key={group.title}
              className="rounded-xl border border-lol-border/60 bg-black/25 p-3"
            >
              <div className="mb-2 font-display text-[10px] font-bold uppercase tracking-widest text-lol-text">
                {group.title}
              </div>
              <div className="flex flex-col">
                {group.rows.map((row) => (
                  <div
                    key={row.label}
                    title={row.hint}
                    className="flex items-baseline justify-between gap-3 border-b border-lol-border/25 py-1 last:border-b-0"
                  >
                    <span className="flex items-center gap-2 text-[12px] text-lol-text">
                      <StatIcon iconKey={row.icon} label={row.label} />
                      {row.label}
                    </span>
                    <span className="flex items-baseline gap-2">
                      {row.peak && (
                        <span
                          className="text-[10.5px] text-lol-text/60"
                          title="Highest value in this game"
                        >
                          peak {row.peak}
                        </span>
                      )}
                      <b
                        className={`font-display text-[13px] font-semibold tabular-nums ${row.accent ?? "text-lol-text-bright"}`}
                      >
                        {row.value}
                      </b>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
