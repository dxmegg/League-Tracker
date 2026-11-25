import { useEffect, useState } from "react";
import type { LiveStatRecord } from "../../../shared/api";
import { PEAK_GROUPS, PEAK_ROWS, formatPeak, penetrationPercent } from "../../lib/liveStats";
import { StatIcon } from "./shared";

// Your highest value of each stat in one game, as recorded while it was played, next to your best on
// that champion so a new record stands out.
export function PeakStats({ gameId, championId }: { gameId: number; championId: number }) {
  const [peaks, setPeaks] = useState<Array<{ stat: string; peak: number; final: number }>>([]);
  const [records, setRecords] = useState<Map<string, LiveStatRecord>>(new Map());

  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    let timer: number | undefined;
    // The stats are written a few seconds after the game ends, so an empty answer is retried for a while
    const load = async () => {
      const rows = await window.api.getGameStatPeaks(gameId).catch(() => []);
      if (cancelled) return;
      setPeaks(rows);
      if (rows.length === 0 && ++tries < 6) timer = window.setTimeout(load, 10_000);
    };
    setPeaks([]);
    void load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [gameId]);

  useEffect(() => {
    let cancelled = false;
    window.api
      .getStatRecords({ championId })
      .then((rows) => {
        if (!cancelled) setRecords(new Map(rows.map((r) => [r.stat, r])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Re-read once this game's stats arrive, since they may be the new record
  }, [championId, peaks.length]);

  const peakBy = new Map(peaks.map((r) => [r.stat, r.peak]));
  const finalBy = new Map(peaks.map((r) => [r.stat, r.final]));
  if (peakBy.size === 0) {
    return (
      <p className="text-[12.5px] text-lol-text">
        Not recorded for this game. Stats are saved while a game is played with the app open.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {PEAK_GROUPS.map((group) => {
        const rows = PEAK_ROWS.filter((r) => r.group === group.id && peakBy.has(r.key));
        if (rows.length === 0) return null;
        return (
          <section key={group.id}>
            <h3 className="mb-2.5 flex items-center gap-3 font-display text-[11px] font-bold uppercase tracking-widest text-lol-text-bright">
              {group.label}
              <span className="h-px flex-1 bg-lol-border/60" aria-hidden="true" />
            </h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
              {rows.map((r) => {
                const rec = records.get(r.key);
                return (
                  <div
                    key={r.key}
                    className="relative flex items-center gap-3 rounded-xl border border-lol-border/60 bg-black/25 px-3.5 py-3 transition-colors hover:border-lol-border-hover"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-lol-border/50 bg-white/[0.04]">
                      <StatIcon iconKey={r.key} label={r.label} size={28} />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-[12px] text-lol-text">{r.label}</div>
                      <div className="font-display text-[22px] font-bold leading-tight tabular-nums text-lol-text-bright">
                        {r.penetration
                          ? formatPeak(penetrationPercent(finalBy.get(r.key) ?? 1), r.fmt)
                          : formatPeak(peakBy.get(r.key) ?? 0, r.fmt)}
                      </div>
                    </div>
                    {rec &&
                      !r.penetration &&
                      // The record row is this very game, so it either is the record or ties it
                      (rec.gameId === gameId ? (
                        <span className="absolute right-2.5 top-2 rounded bg-lol-gold px-1.5 text-[9.5px] font-bold uppercase tracking-wider text-[#241705]">
                          Record
                        </span>
                      ) : (
                        <span
                          className="absolute right-2.5 top-2 text-[10.5px] text-lol-text/60"
                          title={`Your best on this champion, game ${rec.gameId}`}
                        >
                          best {formatPeak(rec.peak, r.fmt)}
                        </span>
                      ))}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
