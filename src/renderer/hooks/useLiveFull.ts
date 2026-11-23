import { useEffect, useMemo, useRef, useState } from "react";
import type { LiveFull } from "../../shared/api";
import { makeDemoSnapshot } from "../lib/liveDemo";

const POLL_IN_GAME_MS = 1_000;
const POLL_IDLE_MS = 2_500;

// Polls the full live snapshot while mounted. `paused` freezes the last snapshot in place and `demo`
// swaps the source for a built-in sample, so the tab can be inspected without a running game.
export function useLiveFull({ paused, demo }: { paused: boolean; demo: boolean }): {
  snapshot: LiveFull | null;
  error: string | null;
} {
  const [live, setLive] = useState<LiveFull | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inGame = useRef(false);

  useEffect(() => {
    if (paused || demo) return;
    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      try {
        const next = await window.api.getLiveFull();
        if (cancelled) return;
        inGame.current = next.state === "in-game";
        setLive(next);
        setError(null);
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

  return { snapshot: demo ? demoSnapshot : live, error };
}
