import { useEffect, useState } from "react";
import type { LiveGameData } from "../../shared/api";
import { useLcuStatus } from "./useLcuStatus";

const POLL_MS = 2_000;

export function useLiveGame(): LiveGameData | null {
  const status = useLcuStatus();
  const [data, setData] = useState<LiveGameData | null>(null);

  useEffect(() => {
    if (status !== "ingame") {
      setData(null);
      return;
    }

    let cancelled = false;
    const tick = async () => {
      try {
        const next = await window.api.getLiveGame();
        if (!cancelled) setData(next);
      } catch {
        if (!cancelled) setData(null);
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
