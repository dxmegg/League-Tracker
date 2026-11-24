import { useMemo } from "react";
import type { ParsedParticipant } from "../../shared/api";
import { formatNumber } from "../lib/format";
import ChampionIcon from "./ChampionIcon";

type Row = { label: string; value: (p: ParsedParticipant) => number | null; fmt?: "k" };

const GROUPS: Array<{ title: string; rows: Row[] }> = [
  {
    title: "Combat",
    rows: [
      { label: "Largest killing spree", value: (p) => p.largestKillingSpree },
      {
        label: "Largest multikill",
        value: (p) =>
          p.pentaKills > 0
            ? 5
            : p.quadraKills > 0
              ? 4
              : p.tripleKills > 0
                ? 3
                : p.doubleKills > 0
                  ? 2
                  : 1,
      },
      { label: "Crowd control score", value: (p) => p.timeCcOthers ?? null },
    ],
  },
  {
    title: "Damage",
    rows: [
      { label: "Damage to champions", value: (p) => p.totalDamageDealtToChampions, fmt: "k" },
      { label: "Damage to objectives", value: (p) => p.damageToObjectives ?? null, fmt: "k" },
      { label: "Damage taken", value: (p) => p.totalDamageTaken, fmt: "k" },
      { label: "Damage healed", value: (p) => p.totalHeal, fmt: "k" },
      { label: "Ally healing", value: (p) => p.totalHealOnTeammates ?? null, fmt: "k" },
      { label: "Ally shielding", value: (p) => p.totalDamageShieldedOnTeammates ?? null, fmt: "k" },
    ],
  },
  {
    title: "Income & vision",
    rows: [
      { label: "Gold earned", value: (p) => p.goldEarned, fmt: "k" },
      { label: "Minions killed", value: (p) => p.cs },
      { label: "Vision score", value: (p) => p.visionScore ?? null },
    ],
  },
];

function show(v: number | null, fmt?: "k") {
  if (v == null) return "—";
  return fmt === "k" && v >= 1000 ? `${(v / 1000).toFixed(1)}k` : formatNumber(v);
}

// One column per player; the best value in each row is bright, the rest are dimmed
export function MatchCompareTable({ players }: { players: ParsedParticipant[] }) {
  const ordered = useMemo(
    () => [...players].sort((a, b) => a.teamId - b.teamId || a.participantId - b.participantId),
    [players],
  );

  return (
    <div className="overflow-x-auto rounded-2xl border border-lol-border bg-[linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]">
      <table className="w-full min-w-[820px] border-collapse text-[13px]">
        <thead>
          <tr>
            <th className="w-[200px] p-3 text-left font-display text-[12px] font-bold uppercase tracking-wider text-lol-text">
              Comparison
            </th>
            {ordered.map((p) => (
              <th key={p.participantId} className="p-2">
                <div
                  className={`mx-auto w-fit rounded-lg border-b-2 pb-1 ${
                    p.win ? "border-lol-win" : "border-lol-loss"
                  }`}
                >
                  <ChampionIcon
                    championId={p.championId}
                    size={34}
                    className="h-[34px] w-[34px] rounded-md"
                  />
                </div>
              </th>
            ))}
          </tr>
          <tr className="border-t border-lol-border/50">
            <td className="p-2 pl-3 text-lol-text">KDA</td>
            {ordered.map((p) => (
              <td
                key={p.participantId}
                className={`p-2 text-center tabular-nums ${p.isSelf ? "font-bold text-lol-gold" : "text-lol-text-bright"}`}
              >
                {p.kills}/{p.deaths}/{p.assists}
              </td>
            ))}
          </tr>
        </thead>
        {GROUPS.map((group) => (
          <tbody key={group.title}>
            <tr>
              <td
                colSpan={ordered.length + 1}
                className="border-t border-lol-border/60 bg-black/25 px-3 py-1.5 font-display text-[11.5px] font-bold uppercase tracking-wider text-lol-text-bright"
              >
                {group.title}
              </td>
            </tr>
            {group.rows.map((row) => {
              const values = ordered.map(row.value);
              const max = Math.max(...values.map((v) => v ?? -Infinity));
              return (
                <tr key={row.label} className="border-t border-lol-border/30 hover:bg-white/[0.03]">
                  <td className="p-2 pl-3 text-lol-text">{row.label}</td>
                  {ordered.map((p, i) => {
                    const v = values[i];
                    const best = v != null && v === max && max > 0;
                    return (
                      <td
                        key={p.participantId}
                        className={`p-2 text-center tabular-nums ${
                          p.isSelf
                            ? "font-bold text-lol-gold"
                            : best
                              ? "font-bold text-lol-text-bright"
                              : "text-lol-text/60"
                        }`}
                      >
                        {show(v, row.fmt)}
                      </td>
                    );
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
