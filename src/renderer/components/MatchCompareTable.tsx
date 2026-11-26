import { useMemo } from "react";
import type { ParsedParticipant } from "../../shared/api";
import { formatNumber } from "../lib/format";
import ChampionIcon from "./ChampionIcon";

export type Row = {
  label: string;
  value: (p: ParsedParticipant) => number | null;
  fmt?: "k";
};

const multikill = (p: ParsedParticipant) =>
  p.pentaKills > 0 ? 5 : p.quadraKills > 0 ? 4 : p.tripleKills > 0 ? 3 : p.doubleKills > 0 ? 2 : 1;

// The match history service reports the same numbers as the end-of-game screen, for every game
const eog = (key: string) => (p: ParsedParticipant) => p.eog?.[key] ?? p.challenges?.[key] ?? null;
const extra = (key: string) => (p: ParsedParticipant) => p.challenges?.[key] ?? null;
const rows = (list: Array<[string, Row["value"]]>): Row[] =>
  list.map(([label, value]) => ({ label, value }));

export const GROUPS: Array<{ title: string; rows: Row[] }> = [
  {
    title: "Combat",
    rows: [
      { label: "Largest killing spree", value: (p) => p.largestKillingSpree },
      { label: "Largest multikill", value: multikill },
      { label: "Crowd control score", value: (p) => p.timeCcOthers ?? null },
      ...rows([
        ["Time controlling others", (p) => p.totalCcDealt ?? null],
        ["Double kills", (p) => p.doubleKills],
        ["Triple kills", (p) => p.tripleKills],
        ["Quadra kills", (p) => p.quadraKills],
        ["Penta kills", (p) => p.pentaKills],
        ["Unreal kills", eog("unrealKills")],
        ["Killing sprees", (p) => p.killingSprees ?? null],
        ["First blood", (p) => (p.firstBloodKill ? 1 : 0)],
        ["Champion level", (p) => p.champLevel ?? null],
        ["Champion experience", eog("champExperience")],
        ["Longest time alive (s)", (p) => p.longestAlive ?? null],
        ["Time spent dead (s)", eog("totalTimeSpentDead")],
      ]),
    ],
  },
  {
    title: "Damage dealt",
    rows: [
      {
        label: "Damage to champions",
        value: (p) => p.totalDamageDealtToChampions,
        fmt: "k",
      },
      {
        label: "Physical to champions",
        value: (p) => p.physicalDamageToChampions ?? null,
        fmt: "k",
      },
      {
        label: "Magic to champions",
        value: (p) => p.magicDamageToChampions ?? null,
        fmt: "k",
      },
      {
        label: "True to champions",
        value: (p) => p.trueDamageToChampions ?? null,
        fmt: "k",
      },
      {
        label: "Total damage",
        value: (p) => p.totalDamageDealtAll ?? null,
        fmt: "k",
      },
      {
        label: "Largest critical strike",
        value: (p) => p.largestCriticalStrike ?? null,
        fmt: "k",
      },
      {
        label: "Damage to objectives",
        value: (p) => p.damageToObjectives ?? null,
        fmt: "k",
      },
      {
        label: "Damage to turrets",
        value: (p) => p.damageToTurrets ?? null,
        fmt: "k",
      },
    ],
  },
  {
    title: "Damage taken and healed",
    rows: [
      { label: "Damage healed", value: (p) => p.totalHeal, fmt: "k" },
      {
        label: "Ally healing",
        value: (p) => p.totalHealOnTeammates ?? null,
        fmt: "k",
      },
      {
        label: "Ally shielding",
        value: (p) => p.totalDamageShieldedOnTeammates ?? null,
        fmt: "k",
      },
      { label: "Damage taken", value: (p) => p.totalDamageTaken, fmt: "k" },
      {
        label: "Physical taken",
        value: (p) => p.physicalDamageTaken ?? null,
        fmt: "k",
      },
      {
        label: "Magic taken",
        value: (p) => p.magicDamageTaken ?? null,
        fmt: "k",
      },
      {
        label: "True taken",
        value: (p) => p.trueDamageTaken ?? null,
        fmt: "k",
      },
      {
        label: "Self mitigated",
        value: (p) => p.damageSelfMitigated ?? null,
        fmt: "k",
      },
    ],
  },
  {
    title: "Vision",
    rows: [
      { label: "Vision score", value: (p) => p.visionScore ?? null },
      { label: "Wards placed", value: (p) => p.wardsPlaced ?? null },
      { label: "Wards destroyed", value: (p) => p.wardsKilled ?? null },
      {
        label: "Control wards purchased",
        value: (p) => p.visionWardsBought ?? null,
      },
    ],
  },
  {
    title: "Income",
    rows: [
      { label: "Gold earned", value: (p) => p.goldEarned, fmt: "k" },
      { label: "Gold spent", value: (p) => p.goldSpent ?? null, fmt: "k" },
      { label: "Minions killed", value: (p) => p.minionsKilled ?? p.cs },
      ...rows([
        ["Neutral in own jungle", (p) => p.neutralMinionsTeamJungle ?? null],
        ["Neutral in enemy jungle", (p) => p.neutralMinionsEnemyJungle ?? null],
        ["Items purchased", eog("itemsPurchased")],
        ["Consumables purchased", eog("consumablesPurchased")],
      ]),
      {
        label: "Neutral minions killed",
        value: (p) => p.neutralMinionsKilled ?? null,
      },
    ],
  },
  {
    title: "Objectives",
    rows: [
      { label: "Towers destroyed", value: (p) => p.turretKills ?? null },
      { label: "Inhibitors destroyed", value: (p) => p.inhibitorKills ?? null },
      ...rows([
        ["Damage to buildings", eog("damageDealtToBuildings")],
        ["Tower takedowns", eog("turretTakedowns")],
        ["Towers lost", eog("turretsLost")],
        ["Inhibitor takedowns", eog("inhibitorTakedowns")],
        ["Inhibitors lost", eog("inhibitorsLost")],
        ["Nexus kills", eog("nexusKills")],
        ["Nexus takedowns", eog("nexusTakedowns")],
        ["Nexus lost", eog("nexusLost")],
        ["Baron kills", eog("baronKills")],
        ["Dragon kills", eog("dragonKills")],
        ["Objectives stolen", (p) => p.objectivesStolen ?? null],
        ["Units healed", (p) => p.totalUnitsHealed ?? null],
      ]),
    ],
  },
  {
    title: "Howling Abyss",
    rows: rows([
      ["Snowballs hit", extra("Missions_SnowballsHit")],
      ["Poros fed", extra("Missions_PorosFed")],
      ["Hexgates used", extra("Missions_HexgatesUsed")],
      ["Healing from map objects", extra("Missions_HealingFromLevelObjects")],
      ["Ability uses", extra("abilityUses")],
      ["Skillshots hit", extra("skillshotsHit")],
      ["Skillshots dodged", extra("skillshotsDodged")],
      ["Effective healing and shielding", extra("effectiveHealAndShielding")],
    ]),
  },
  {
    title: "Casts",
    rows: rows([
      ["Q", (p) => p.spell1Casts ?? null],
      ["W", (p) => p.spell2Casts ?? null],
      ["E", (p) => p.spell3Casts ?? null],
      ["R", (p) => p.spell4Casts ?? null],
      ["Summoner spell 1", (p) => p.summoner1Casts ?? null],
      ["Summoner spell 2", (p) => p.summoner2Casts ?? null],
    ]),
  },
  {
    title: "Pings",
    rows: rows([
      ["Basic", (p) => p.basicPings ?? null],
      ["On my way", (p) => p.onMyWayPings ?? null],
      ["Assist me", (p) => p.assistMePings ?? null],
      ["Get back", (p) => p.getBackPings ?? null],
      ["Enemy missing", (p) => p.enemyMissingPings ?? null],
      ["Danger", (p) => p.dangerPings ?? null],
      ["Push", (p) => p.pushPings ?? null],
      ["All in", (p) => p.allInPings ?? null],
      ["Command", (p) => p.commandPings ?? null],
      ["Need vision", (p) => p.needVisionPings ?? null],
      ["Vision cleared", (p) => p.visionClearedPings ?? null],
    ]),
  },
  {
    title: "Player",
    rows: rows([
      ["Account level", eog("level")],
      ["Wins", eog("wins")],
      ["Losses", eog("losses")],
      ["Games left", eog("leaves")],
      ["Was AFK", eog("wasAfk")],
      ["Left the game", eog("leaver")],
      ["Severe behaviour flag", eog("severeTransgressor")],
      ["Game ended in surrender", eog("gameEndedInSurrender")],
      ["Caused early surrender", eog("causedEarlySurrender")],
    ]),
  },
];

function show(v: number | null, fmt?: "k") {
  if (v == null) return "—";
  return fmt === "k" && v >= 1000 ? `${(v / 1000).toFixed(1)}k` : formatNumber(v);
}

// One column per player; the best value in each row is bright, the viewer's own column is gold,
// the rest are dimmed. Rows are grouped in their own boxed sections.
export function MatchCompareTable({ players }: { players: ParsedParticipant[] }) {
  const ordered = useMemo(
    () => [...players].sort((a, b) => a.teamId - b.teamId || a.participantId - b.participantId),
    [players],
  );
  const cols = ordered.length + 1;

  const cell = (p: ParsedParticipant, content: string, best: boolean) => (
    <td
      key={p.participantId}
      className={`px-2 py-1.5 text-center tabular-nums ${
        p.isSelf
          ? "font-bold text-lol-gold"
          : best
            ? "font-bold text-lol-text-bright"
            : "text-lol-text/60"
      }`}
    >
      {content}
    </td>
  );

  return (
    <div className="app-tile shrink-0 overflow-x-auto p-3">
      <table className="w-full min-w-[900px] border-separate border-spacing-y-2 text-[13px]">
        <thead>
          <tr>
            <th className="w-[210px] px-3 text-left font-display text-[12px] font-bold uppercase tracking-widest text-lol-gold">
              <span className="flex items-center gap-2">
                <i className="block h-3.5 w-[3px] rounded-full bg-lol-crimson" aria-hidden="true" />
                Comparison
              </span>
            </th>
            {ordered.map((p) => (
              <th key={p.participantId} className="px-2 pb-1">
                <div
                  className={`mx-auto w-fit rounded-lg border-b-2 pb-1 ${
                    p.win ? "border-lol-win" : "border-lol-loss"
                  }`}
                >
                  <ChampionIcon
                    championId={p.championId}
                    size={36}
                    className="h-9 w-9 rounded-md"
                  />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="bg-black/20">
            <td className="rounded-l-xl px-3 py-2 font-semibold text-lol-text-bright">KDA</td>
            {ordered.map((p, i) => (
              <td
                key={p.participantId}
                className={`px-2 py-2 text-center tabular-nums ${
                  i === ordered.length - 1 ? "rounded-r-xl" : ""
                } ${p.isSelf ? "font-bold text-lol-gold" : "text-lol-text-bright"}`}
              >
                {p.kills}/{p.deaths}/{p.assists}
              </td>
            ))}
          </tr>
        </tbody>
        {GROUPS.map((group) => ({
          title: group.title,
          rows: group.rows.filter((row) => ordered.some((p) => row.value(p) != null)),
        }))
          .filter((group) => group.rows.length > 0)
          .map((group) => (
            <tbody key={group.title}>
              <tr>
                <td
                  colSpan={cols}
                  className="rounded-t-xl border border-b-0 border-lol-border/50 bg-black/25 px-3 py-2 font-display text-[12px] font-bold uppercase tracking-widest text-lol-text-bright"
                >
                  {group.title}
                </td>
              </tr>
              {group.rows.map((row, ri) => {
                const values = ordered.map(row.value);
                const max = Math.max(...values.map((v) => v ?? -Infinity));
                const last = ri === group.rows.length - 1;
                return (
                  <tr key={row.label} className="bg-black/20 hover:bg-white/[0.04]">
                    <td
                      className={`px-3 py-1.5 text-lol-text ${last ? "rounded-bl-xl" : ""}`}
                      style={{
                        borderBottom: last ? undefined : "1px solid rgba(255,255,255,0.04)",
                      }}
                    >
                      {row.label}
                    </td>
                    {ordered.map((p, i) => {
                      const v = values[i];
                      return cell(p, show(v, row.fmt), v != null && v === max && max > 0);
                    })}
                  </tr>
                );
              })}
            </tbody>
          ))}
      </table>
    </div>
  );
}
