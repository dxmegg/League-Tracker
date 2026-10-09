import { useCallback, useEffect, useRef, useState } from "react";
import type { TimelineBackfillProgress } from "../lib/types";

export function useTimelineBackfill() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<TimelineBackfillProgress | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    let mounted = true;
    mountedRef.current = true;
    runningRef.current = false;

    window.api.timelineBackfillStatus().then((current) => {
      if (!mounted || !current) return;
      runningRef.current = true;
      if (current.current > 0 && startedAtRef.current === null) {
        startedAtRef.current = Date.now();
      }
      setRunning(true);
      setProgress(current);
    });

    const offProgress = window.api.onTimelineBackfillProgress((current) => {
      if (!mounted) return;
      if (current.current === 0) {
        startedAtRef.current = null;
        setElapsedMs(0);
      } else if (current.current > 0 && startedAtRef.current === null) {
        startedAtRef.current = Date.now();
      }

      setProgress(current);
      if (current.current === current.total && current.current !== 0 && current.total !== 0) {
        runningRef.current = false;
        setRunning(false);
        startedAtRef.current = null;
      } else {
        runningRef.current = true;
        setRunning(true);
      }
    });

    const offDone = window.api.onTimelineBackfillDone(() => {
      if (!mounted) return;
      startedAtRef.current = null;
      runningRef.current = false;
      setRunning(false);
    });

    const interval = window.setInterval(() => {
      if (mounted && runningRef.current && startedAtRef.current !== null) {
        setElapsedMs(Date.now() - startedAtRef.current);
      }
    }, 1_000);

    return () => {
      mounted = false;
      mountedRef.current = false;
      runningRef.current = false;
      offProgress();
      offDone();
      window.clearInterval(interval);
    };
  }, []);

  const start = useCallback(async (limit: number) => {
    const response = await window.api.timelineBackfillStart({ limit });
    if (response.started && mountedRef.current) {
      startedAtRef.current = null;
      setElapsedMs(0);
      setProgress(null);
      runningRef.current = true;
      setRunning(true);
    }
    return response;
  }, []);

  const stop = useCallback(async () => {
    await window.api.timelineBackfillStop();
    if (!mountedRef.current) return;
    runningRef.current = false;
    setRunning(false);
  }, []);

  const percent =
    progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const etaMs = percent > 0 && elapsedMs > 0 ? (elapsedMs * (100 - percent)) / percent : null;

  return { running, progress, percent, elapsedMs, etaMs, start, stop };
}
