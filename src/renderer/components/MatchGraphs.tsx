import { useState } from "react";
import type { ParsedParticipant } from "../../shared/api";
import { formatNumber } from "../lib/format";
import ChampionIcon from "./ChampionIcon";
import { GROUPS } from "./MatchCompareTable";

const METRICS = GROUPS.flatMap((group) =>
  group.rows.map((row) => ({ ...row, key: `${group.title}: ${row.label}`, group: group.title })),
);

// One horizontal bar per player for any row of the comparison table
export function MatchGraphs({ players }: { players: ParsedParticipant[] }) {
  const [key, setKey] = useState("Damage dealt: Damage to champions");
  const metric = METRICS.find((m) => m.key === key) ?? METRICS[0];
  const ordered = [...players].sort(
    (a, b) => a.teamId - b.teamId || a.participantId - b.participantId,
  );
  const max = Math.max(1, ...ordered.map((p) => metric.value(p) ?? 0));

  return (
    <div className="app-tile shrink-0 p-4">
      <select
        aria-label="Graph statistic"
        value={metric.key}
        onChange={(e) => setKey(e.target.value)}
        className="mb-4 rounded-lg border border-lol-border/60 bg-lol-card px-3 py-2 text-[13px] text-lol-text-bright"
      >
        {GROUPS.map((group) => (
          <optgroup key={group.title} label={group.title}>
            {METRICS.filter((m) => m.group === group.title).map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {ordered.map((p) => {
        const value = metric.value(p);
        return (
          <div key={p.participantId} className="flex items-center gap-3 py-1">
            <ChampionIcon championId={p.championId} size={28} className="h-7 w-7 rounded-md" />
            <span className="w-[130px] truncate text-[12.5px] text-lol-text">{p.summonerName}</span>
            <div className="h-5 flex-1 rounded bg-black/25">
              <div
                className={`h-5 rounded ${p.isSelf ? "bg-lol-gold" : p.win ? "bg-lol-win" : "bg-lol-loss"}`}
                style={{ width: `${((value ?? 0) / max) * 100}%` }}
              />
            </div>
            <span className="w-[70px] text-right text-[12.5px] tabular-nums text-lol-text-bright">
              {value == null ? "—" : formatNumber(value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
