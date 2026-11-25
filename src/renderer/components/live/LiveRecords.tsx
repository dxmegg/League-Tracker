import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { LiveStatRecord } from "../../../shared/api";
import { getChampionName, useChampionData } from "../../hooks/useChampions";
import { PEAK_ROWS, formatPeak } from "../../lib/liveStats";
import { ChampionCombobox } from "../ChampionCombobox";
import ChampionIcon from "../ChampionIcon";
import { Panel } from "../Panel";
import { StatIcon, Title } from "./shared";

// Your best value of every stat the app has recorded while you played, over all champions or one of them
export function LiveRecords() {
  const champData = useChampionData();
  const [championId, setChampionId] = useState<number | null>(null);
  const [rows, setRows] = useState<LiveStatRecord[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    window.api
      .getStatRecords(championId != null ? { championId } : undefined)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [championId]);

  const byStat = useMemo(() => new Map((rows ?? []).map((r) => [r.stat, r])), [rows]);
  // Penetration multipliers have no meaningful "highest value", so they stay out of the records
  const shown = PEAK_ROWS.filter((r) => byStat.has(r.key) && !r.penetration);

  return (
    <Panel variant="tile" accent="var(--color-lol-gold)">
      <Title
        aside={
          <div className="w-[240px]">
            <ChampionCombobox
              value={championId}
              onChange={setChampionId}
              placeholder="All champions"
            />
          </div>
        }
      >
        Stat records
      </Title>
      {rows === null ? (
        <p className="text-[12.5px] text-lol-text">Loading...</p>
      ) : shown.length === 0 ? (
        <p className="text-[12.5px] text-lol-text">
          {championId != null
            ? "No recorded games on this champion yet."
            : "No records yet. Stats are saved while you play with the app open, and the best value of each one shows up here."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-2">
          {shown.map((r) => {
            const rec = byStat.get(r.key)!;
            const name = rec.championName || getChampionName(champData, rec.championId ?? 0);
            return (
              <div
                key={r.key}
                className="flex items-center justify-between gap-3 border-b border-lol-border/25 py-1.5"
              >
                <span className="flex items-center gap-2 text-[12.5px] text-lol-text">
                  <StatIcon iconKey={r.key} label={r.label} />
                  {r.label}
                </span>
                <span className="flex items-center gap-3">
                  {championId == null && rec.championId != null && (
                    <span
                      className="flex items-center gap-1.5 text-[11.5px] text-lol-text"
                      title={name}
                    >
                      <ChampionIcon championId={rec.championId} size={20} className="rounded" />
                      {name}
                    </span>
                  )}
                  <Link
                    to={`/match/${rec.gameId}`}
                    title={`Game ${rec.gameId}, ${new Date(rec.recordedAt).toLocaleDateString()}`}
                    className="font-display text-[14px] font-bold tabular-nums text-lol-gold hover:underline"
                  >
                    {formatPeak(rec.peak, r.fmt)}
                  </Link>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
