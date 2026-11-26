import { useState, useEffect, useCallback } from "react";
import { useBackfill } from "../../hooks/useBackfill";
import { useTimelineBackfill } from "../../hooks/useTimelineBackfill";
import type { RiotSyncOptions, RiotSyncProgress } from "../../../shared/api";
import { ActionRow, Button, INPUT_CLASS, Section, formatDuration } from "./parts";

export function useSyncSettings() {
  // Shared so a backfill started automatically on first connect shows here too
  const { running: backfilling } = useBackfill();
  const {
    running: timelineBackfilling,
    progress: timelineProgress,
    percent: timelinePercent,
    etaMs: timelineEtaMs,
    start: startTimelineBackfill,
    stop: stopTimelineBackfill,
  } = useTimelineBackfill();
  const anyRunning = backfilling || timelineBackfilling;
  const [backfillStatus, setBackfillStatus] = useState<string | null>(null);
  const [riotSyncing, setRiotSyncing] = useState(false);
  const [riotSyncStatus, setRiotSyncStatus] = useState<string | null>(null);
  const [riotSyncProgress, setRiotSyncProgress] = useState<RiotSyncProgress | null>(null);
  const [resolvedPlatform, setResolvedPlatform] = useState<{
    platform: string;
    route: string;
  } | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [timelineLimit, setTimelineLimit] = useState(100);
  const [timelineMessage, setTimelineMessage] = useState<string | null>(null);

  useEffect(() => {
    window.api
      .getResolvedPlatform()
      .then((result) => {
        setResolvedPlatform("error" in result ? null : result);
      })
      .catch(() => {
        setResolvedPlatform(null);
      });
  }, []);

  useEffect(
    () =>
      window.api.onRiotSyncProgress((progress) => {
        setRiotSyncProgress(progress);
      }),
    [],
  );

  // Sync and refresh differ only in what they ask for and how they word the outcome
  const runRiotSync = useCallback(
    async (
      options: RiotSyncOptions | undefined,
      partial: (added: number, scanned: number) => string,
      finished: (added: number, scanned: number) => string,
    ) => {
      setRiotSyncing(true);
      setRiotSyncStatus(null);
      setRiotSyncProgress(null);
      try {
        const result = await window.api.syncRiotHistory(options);
        if (!("added" in result)) {
          setRiotSyncStatus(`Error: ${result.error}`);
        } else if (result.error) {
          setRiotSyncStatus(`${partial(result.added, result.scanned)} Error: ${result.error}`);
        } else if (result.cancelled) {
          setRiotSyncStatus(`Cancelled after ${result.scanned} game(s).`);
        } else {
          setRiotSyncStatus(finished(result.added, result.scanned));
        }
      } catch (err: unknown) {
        setRiotSyncStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setRiotSyncing(false);
      }
    },
    [],
  );

  const handleRiotSync = useCallback(
    () =>
      runRiotSync(
        undefined,
        (added, scanned) => `Synced ${added} new match(es) from ${scanned} processed match(es).`,
        (added, scanned) => `Synced ${added} new match(es) from ${scanned} scanned match(es).`,
      ),
    [runRiotSync],
  );

  const handleRiotRefresh = useCallback(
    () =>
      runRiotSync(
        { refreshExisting: true },
        (added, scanned) => `Processed ${scanned} match(es); added ${added} new match(es).`,
        (added, scanned) =>
          `Refreshed ${scanned} existing/new match(es); added ${added} new match(es).`,
      ),
    [runRiotSync],
  );

  const handleRiotCancel = useCallback(() => {
    void window.api.riotCancelSync();
  }, []);

  const handleRepair = useCallback(async () => {
    setRepairing(true);
    setBackfillStatus("Repairing game data...");
    try {
      const result = await window.api.repairPuuids();
      if ("cancelled" in result) {
        setBackfillStatus(null);
      } else if ("error" in result) {
        setBackfillStatus(`Error: ${result.error}`);
      } else {
        setBackfillStatus(
          `Repaired ${result.repairedGames} game(s), rebuilt ${result.rebuiltGames} game(s)`,
        );
      }
    } catch (err: unknown) {
      setBackfillStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRepairing(false);
    }
  }, []);

  const handleRecalculateScores = useCallback(async () => {
    setRecalculating(true);
    setBackfillStatus("Recalculating scores...");
    try {
      const result = await window.api.recalculateScores();
      setBackfillStatus(
        "error" in result
          ? `Error: ${result.error}`
          : `Recalculated scores for ${result.games.toLocaleString()} game(s) in ${(result.ms / 1000).toFixed(1)} s`,
      );
    } catch (err: unknown) {
      setBackfillStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRecalculating(false);
    }
  }, []);

  const handleRestoreOlderGames = useCallback(async () => {
    setRestoring(true);
    setBackfillStatus("Restoring ignored games...");
    try {
      const result = await window.api.restoreOlderGames();
      if ("error" in result) {
        setBackfillStatus(`Error: ${result.error}`);
      } else if (result.restored === 0) {
        setBackfillStatus(`Nothing to restore (${result.remaining} still ignored)`);
      } else {
        setBackfillStatus(
          `Restored ${result.restored} game(s). Run Force Backfill to re-scan them.`,
        );
      }
    } catch (err: unknown) {
      setBackfillStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRestoring(false);
    }
  }, []);

  const handleBackfill = useCallback(async () => {
    setBackfillStatus("Fetching your match list from Riot...");
    try {
      const result = await window.api.backfillHistory();
      if ("error" in result) {
        setBackfillStatus(`Error: ${result.error}`);
        console.warn("[settings] Backfill failed:", result.error);
        return;
      }
      const summary =
        result.added > 0
          ? `Added ${result.added} game(s) from ${result.scanned} found in your Riot history`
          : `No new Mayhem games found (${result.scanned} games checked)`;
      if (result.cancelled) {
        setBackfillStatus(`Stopped after adding ${result.added} game(s). Run it again to finish.`);
      } else {
        setBackfillStatus(
          result.truncated
            ? `${summary}. Stopped at the page limit, so anything older was not checked.`
            : summary,
        );
      }
    } catch (err: any) {
      setBackfillStatus(`Error: ${err.message}`);
      console.warn("[settings] Backfill failed:", err.message);
    }
  }, []);

  const handleForceFullBackfill = useCallback(async () => {
    setBackfillStatus(
      "Walking the entire Riot match history from page 0 — this may take a while...",
    );
    try {
      const result = await window.api.backfillHistory(true);
      if ("error" in result) {
        setBackfillStatus(`Error: ${result.error}`);
        console.warn("[settings] Force backfill failed:", result.error);
        return;
      }
      const summary =
        result.added > 0
          ? `Added ${result.added} game(s) from ${result.scanned} found in your Riot history`
          : `No new games found (${result.scanned} games checked)`;
      setBackfillStatus(
        result.truncated
          ? `${summary}. Stopped at the page limit — this is our own cap, not Riot's.`
          : `${summary}. Riot returned an empty page, so this is the full history.`,
      );
    } catch (err: any) {
      setBackfillStatus(`Error: ${err.message}`);
      console.warn("[settings] Force backfill failed:", err.message);
    }
  }, []);

  const handleTimelineStart = useCallback(async () => {
    setTimelineMessage(null);
    try {
      const result = await startTimelineBackfill(timelineLimit);
      if (!result.started) setTimelineMessage("A backfill is already running.");
    } catch (err) {
      setTimelineMessage(
        `Timeline backfill failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }, [startTimelineBackfill, timelineLimit]);

  const handleTimelineStop = useCallback(async () => {
    await stopTimelineBackfill();
  }, [stopTimelineBackfill]);

  const handleTeamsBackfill = useCallback(async () => {
    setBackfillStatus("Backfilling teams and bans from local payloads...");
    try {
      const result = await window.api.backfillTeamsLocal();
      setBackfillStatus(
        `Teams/bans backfill: ${result.inserted} inserted, ${result.skipped} skipped, ${result.errors} errors.`,
      );
    } catch (err) {
      setBackfillStatus(
        `Teams/bans backfill failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }, []);

  const handleTimelineFieldsBackfill = useCallback(async () => {
    setBackfillStatus("Backfilling timeline fields from local payloads...");
    try {
      const result = await window.api.backfillTimelineLocal();
      setBackfillStatus(
        `Timeline fields backfill: ${result.updated} updated, ${result.skipped} skipped, ${result.errors} errors.`,
      );
    } catch (err) {
      setBackfillStatus(
        `Timeline fields backfill failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }, []);

  useEffect(() => {
    if (!timelineMessage) return;
    const timer = window.setTimeout(() => setTimelineMessage(null), 8_000);
    return () => window.clearTimeout(timer);
  }, [timelineMessage]);

  return {
    backfilling,
    timelineBackfilling,
    timelineProgress,
    timelinePercent,
    timelineEtaMs,
    anyRunning,
    backfillStatus,
    riotSyncing,
    riotSyncStatus,
    riotSyncProgress,
    resolvedPlatform,
    repairing,
    recalculating,
    restoring,
    timelineLimit,
    setTimelineLimit,
    timelineMessage,
    handleRiotSync,
    handleRiotRefresh,
    handleRiotCancel,
    handleRepair,
    handleRecalculateScores,
    handleRestoreOlderGames,
    handleBackfill,
    handleForceFullBackfill,
    handleTimelineStart,
    handleTimelineStop,
    handleTeamsBackfill,
    handleTimelineFieldsBackfill,
  };
}

export function SyncSections({ settings }: { settings: ReturnType<typeof useSyncSettings> }) {
  const {
    backfilling,
    timelineBackfilling,
    timelineProgress,
    timelinePercent,
    timelineEtaMs,
    anyRunning,
    backfillStatus,
    riotSyncing,
    riotSyncStatus,
    riotSyncProgress,
    resolvedPlatform,
    repairing,
    recalculating,
    restoring,
    timelineLimit,
    setTimelineLimit,
    timelineMessage,
    handleRiotSync,
    handleRiotRefresh,
    handleRiotCancel,
    handleRepair,
    handleRecalculateScores,
    handleRestoreOlderGames,
    handleBackfill,
    handleForceFullBackfill,
    handleTimelineStart,
    handleTimelineStop,
    handleTeamsBackfill,
    handleTimelineFieldsBackfill,
  } = settings;

  return (
    <>
      <Section title="League history sync">
        <ActionRow name="Backfill" description="Fetch games the client knows and we don't yet.">
          <Button onClick={handleBackfill} disabled={anyRunning} className="w-28">
            {backfilling ? "Working..." : "Run"}
          </Button>
        </ActionRow>
        <ActionRow
          name="Force full backfill"
          description="Walk the whole Riot history again, ignoring that it was done before."
        >
          <Button
            variant="subtle"
            onClick={handleForceFullBackfill}
            disabled={anyRunning}
            className="w-28"
          >
            Run
          </Button>
        </ActionRow>
        <ActionRow
          name="Riot Match-V5 sync"
          description={
            <>
              Adds pings, spell casts and challenge metrics the client doesn't provide.{" "}
              {resolvedPlatform
                ? `Platform: ${resolvedPlatform.platform} → ${resolvedPlatform.route}`
                : "No platform configured."}
            </>
          }
        >
          {riotSyncing ? (
            <Button variant="destructive" onClick={handleRiotCancel} className="w-28">
              Stop
            </Button>
          ) : (
            <Button onClick={handleRiotSync} className="w-28">
              Sync now
            </Button>
          )}
        </ActionRow>
        <ActionRow
          name="Refresh existing games"
          description="Fetch stored games again through Match-V5. May take several minutes."
        >
          <Button
            variant="subtle"
            onClick={handleRiotRefresh}
            disabled={riotSyncing}
            className="w-28"
          >
            {riotSyncing ? "Working..." : "Refresh"}
          </Button>
        </ActionRow>

        <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-lol-gold">
          Fix stored data
        </p>
        <ActionRow name="Repair" description="Reassign games to your accounts and rebuild stats.">
          <Button variant="subtle" onClick={handleRepair} disabled={repairing} className="w-28">
            {repairing ? "Working..." : "Repair"}
          </Button>
        </ActionRow>
        <ActionRow
          name="Recalculate scores"
          description="Rescore every game with the current system."
        >
          <Button
            variant="subtle"
            onClick={handleRecalculateScores}
            disabled={recalculating || anyRunning}
            className="w-28"
          >
            {recalculating ? "Working..." : "Run"}
          </Button>
        </ActionRow>
        <ActionRow name="Restore older games" description="Look again at games skipped earlier.">
          <Button
            variant="subtle"
            onClick={handleRestoreOlderGames}
            disabled={restoring}
            className="w-28"
          >
            {restoring ? "Working..." : "Restore"}
          </Button>
        </ActionRow>
        <ActionRow name="Teams and bans" description="Rebuild them from the stored match data.">
          <Button
            variant="subtle"
            onClick={handleTeamsBackfill}
            disabled={anyRunning}
            className="w-28"
          >
            Rebuild
          </Button>
        </ActionRow>
        <ActionRow name="Timeline fields" description="Rebuild them from the stored timelines.">
          <Button
            variant="subtle"
            onClick={handleTimelineFieldsBackfill}
            disabled={anyRunning}
            className="w-28"
          >
            Rebuild
          </Button>
        </ActionRow>
        {backfillStatus && <p className="text-[12.5px] text-lol-text">{backfillStatus}</p>}
        {riotSyncing && (
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-xs text-lol-text">
              <span>{riotSyncProgress?.currentAccount ?? "Starting..."}</span>
              <span>
                {riotSyncProgress
                  ? `${riotSyncProgress.currentGame} / ${riotSyncProgress.totalGames} games`
                  : ""}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded bg-black/30">
              <div
                className="h-full bg-lol-crimson transition-all"
                style={{
                  width: `${riotSyncProgress ? (riotSyncProgress.currentGame / Math.max(1, riotSyncProgress.totalGames)) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}
        {riotSyncStatus && <p className="mt-1 text-xs text-lol-text">{riotSyncStatus}</p>}
      </Section>

      <Section title="Timeline backfill">
        <p className="text-[12.5px] text-lol-text">
          Fetches detailed timeline data (gold, items, abilities over time) for stored matches.
          Skips Arena and Mayhem automatically.
        </p>
        <div className="flex flex-col gap-3 rounded-xl border border-lol-border/50 bg-black/25 p-4">
          <label className="flex items-center justify-between gap-4 text-[13.5px] text-lol-text-bright">
            <span>Games to scan</span>
            <input
              type="number"
              min={1}
              max={5000}
              value={timelineLimit}
              disabled={timelineBackfilling}
              onChange={(event) =>
                setTimelineLimit(Math.min(5000, Math.max(1, Number(event.target.value) || 1)))
              }
              className={`${INPUT_CLASS} w-24 text-right`}
            />
          </label>
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={handleTimelineStart} disabled={timelineBackfilling}>
              {timelineBackfilling ? "Working..." : "Start backfill"}
            </Button>
            <Button
              variant="secondary"
              onClick={handleTimelineStop}
              disabled={!timelineBackfilling}
            >
              Stop
            </Button>
          </div>
          {timelineProgress && (
            <div className="space-y-2 text-[12.5px] text-lol-text">
              <div className="h-[5px] overflow-hidden rounded-full bg-white/[0.05]">
                <i
                  className="block h-full rounded-full bg-lol-crimson"
                  style={{ width: `${timelinePercent}%` }}
                />
              </div>
              <p>
                {timelineProgress.current} of {timelineProgress.total} scanned · succeeded{" "}
                {timelineProgress.succeeded} · failed {timelineProgress.failed} · skipped{" "}
                {timelineProgress.skipped}
              </p>
              {timelineProgress.currentGameId !== null && (
                <p className="text-[11.5px]">Current game: {timelineProgress.currentGameId}</p>
              )}
              {timelinePercent > 0 && timelineEtaMs !== null && (
                <p>ETA: {formatDuration(timelineEtaMs)}</p>
              )}
            </div>
          )}
          {timelineMessage && <p className="text-[12.5px] text-lol-text">{timelineMessage}</p>}
        </div>
      </Section>
    </>
  );
}
