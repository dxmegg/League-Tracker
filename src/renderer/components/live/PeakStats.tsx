import { useEffect, useState } from "react";
import type { LiveStatRecord } from "../../../shared/api";
import { PEAK_ROWS, formatPeak } from "../../lib/liveStats";
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
  if (peakBy.size === 0) {
    return (
      <p className="text-[12.5px] text-lol-text">
        Not recorded for this game. Stats are saved while a game is played with the app open.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
      {PEAK_ROWS.filter((r) => peakBy.has(r.key)).map((r) => {
        const rec = records.get(r.key);
        return (
          <div
            key={r.key}
            className="flex items-center justify-between gap-3 border-b border-lol-border/25 py-1.5"
          >
            <span className="flex items-center gap-2 text-[12.5px] text-lol-text">
              <StatIcon iconKey={r.key} label={r.label} />
              {r.label}
            </span>
            <span className="flex items-baseline gap-2">
              {rec &&
                // The record row is this very game, so it either is the record or ties it
                (rec.gameId === gameId ? (
                  <span className="rounded bg-lol-gold px-1.5 text-[9.5px] font-bold uppercase tracking-wider text-[#241705]">
                    Record
                  </span>
                ) : (
                  <span
                    className="text-[10.5px] text-lol-text/60"
                    title={`Your best on this champion, game ${rec.gameId}`}
                  >
                    best {formatPeak(rec.peak, r.fmt)}
                  </span>
                ))}
              <b className="font-display text-[13px] tabular-nums text-lol-text-bright">
                {formatPeak(peakBy.get(r.key) ?? 0, r.fmt)}
              </b>
            </span>
          </div>
        );
      })}
    </div>
  );
}
