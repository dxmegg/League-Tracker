import { useEffect, useState } from "react";
import type { LiveGameData, LiveSessionData } from "../../shared/api";
import { useLcuStatus } from "./useLcuStatus";

const POLL_MS = 1_000;

export function useLiveGame(): {
  game: LiveGameData | null;
  session: LiveSessionData | null;
} {
  const status = useLcuStatus();
  const [data, setData] = useState<{
    game: LiveGameData | null;
    session: LiveSessionData | null;
  }>({ game: null, session: null });

  useEffect(() => {
    if (status === "disconnected" || status === "connecting") {
      setData({ game: null, session: null });
      return;
    }

    let cancelled = false;
    const tick = async () => {
      try {
        const [game, session] = await Promise.all([
          window.api.getLiveGame(),
          window.api.getLiveSession(),
        ]);
        if (!cancelled) setData({ game, session });
      } catch {
        if (!cancelled) setData({ game: null, session: null });
      }
    };

    void tick();
    const handle = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [status]);

  return data;
}
