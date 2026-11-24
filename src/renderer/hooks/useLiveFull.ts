import { useEffect, useMemo, useRef, useState } from "react";
import type { LiveFull } from "../../shared/api";
import { makeDemoSnapshot } from "../lib/liveDemo";

// The tab runs a couple of seconds behind the game on purpose: it keeps the load on the game client low
const POLL_IN_GAME_MS = 2_500;
const POLL_IDLE_MS = 2_500;

// Game seconds between two history points, and the most points kept (~1h of play)
const HISTORY_STEP_SEC = 5;
const HISTORY_MAX = 720;

export type TeamPoint = { kills: number; cs: number; itemValue: number };
export type LiveHistoryPoint = { t: number; ORDER: TeamPoint; CHAOS: TeamPoint };

// CS only moves in steps of two, so the numbers don't flicker on every last hit
const stepCs = (snap: LiveFull): LiveFull => ({
  ...snap,
  players: snap.players.map((p) => ({ ...p, creepScore: p.creepScore - (p.creepScore % 2) })),
});

function toPoint(snap: LiveFull): LiveHistoryPoint {
  const team = (name: string): TeamPoint => {
    const ps = snap.players.filter((p) => p.team === name);
    return {
      kills: ps.reduce((s, p) => s + p.kills, 0),
      cs: ps.reduce((s, p) => s + p.creepScore, 0),
      itemValue: ps.reduce((s, p) => s + p.itemValue, 0),
    };
  };
  return { t: snap.game?.timeSec ?? 0, ORDER: team("ORDER"), CHAOS: team("CHAOS") };
}

// Polls the full live snapshot while mounted. `paused` freezes the last snapshot in place and `demo`
// swaps the source for a built-in sample, so the tab can be inspected without a running game.
export function useLiveFull({ paused, demo }: { paused: boolean; demo: boolean }): {
  snapshot: LiveFull | null;
  error: string | null;
  history: LiveHistoryPoint[];
} {
  const [live, setLive] = useState<LiveFull | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<LiveHistoryPoint[]>([]);
  const inGame = useRef(false);
  const gameKey = useRef<string | null>(null);

  useEffect(() => {
    if (paused || demo) return;
    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      try {
        const next = stepCs(await window.api.getLiveFull());
        if (cancelled) return;
        inGame.current = next.state === "in-game";
        setLive(next);
        setError(null);

        if (next.state === "in-game" && next.game) {
          const point = toPoint(next);
          // A different game id, or a clock that went backwards, means a new match started
          const key = String(next.game.gameId ?? "");
          setHistory((prev) => {
            const last = prev[prev.length - 1];
            const fresh = key !== gameKey.current || (last && point.t < last.t);
            gameKey.current = key;
            const base = fresh ? [] : prev;
            const tail = base[base.length - 1];
            if (tail && point.t - tail.t < HISTORY_STEP_SEC) return base;
            return [...base, point].slice(-HISTORY_MAX);
          });
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
      if (!cancelled)
        timer = window.setTimeout(tick, inGame.current ? POLL_IN_GAME_MS : POLL_IDLE_MS);
    };

    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [paused, demo]);

  // Rebuilt only when demo is switched on, so its clock keeps running from that moment
  const demoSnapshot = useMemo(() => (demo ? makeDemoSnapshot() : null), [demo]);

  return { snapshot: demo ? demoSnapshot : live, error, history: demo ? [] : history };
}
