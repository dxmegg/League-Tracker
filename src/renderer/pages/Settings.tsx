import { useState, useEffect, useCallback } from "react";
import { useBackfill } from "../hooks/useBackfill";
import { queueLabel } from "../components/QueueSelect";
import { setRemembering } from "../lib/viewState";
import type { BackupInfo } from "../lib/types";

const BACKUP_REASONS: Record<string, string> = {
  auto: "Scheduled",
  manual: "Manual",
  "pre-import": "Before import",
  "pre-repair": "Before repair",
  "pre-restore": "Before restore",
};

function formatSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTaken(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function Switch({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ${
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"
      } ${checked ? "bg-lol-gold" : "bg-lol-border"}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export default function Settings() {
  // Shared so a backfill started automatically on first connect shows here too
  const { running: backfilling } = useBackfill();
  const [autoStart, setAutoStart] = useState(false);
  // Only the packaged program has a path worth registering, so the switch says
  // so instead of pretending in a dev build
  const [autoStartSupported, setAutoStartSupported] = useState(false);
  const [minimizeToTray, setMinimizeToTray] = useState(true);
  // Every queue with games stored, and the subset the user has switched off
  const [queues, setQueues] = useState<number[]>([]);
  const [hiddenQueues, setHiddenQueues] = useState<Set<number>>(new Set());
  const [hideRemakes, setHideRemakes] = useState(false);
  const [autoBackup, setAutoBackup] = useState(true);
  const [rememberFilters, setRememberFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [backfillStatus, setBackfillStatus] = useState<string | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [exportStatus, setExportStatus] = useState<{ message: string; error: boolean } | null>(
    null,
  );
  const [importStatus, setImportStatus] = useState<{ message: string; error: boolean } | null>(
    null,
  );
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  // Restoring replaces the whole database, so the row asks a second time
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [savedSummoners, setSavedSummoners] = useState<
    Array<{
      puuid: string;
      game_name: string | null;
      tag_line: string | null;
      profile_icon: number | null;
      updated_at: number;
      games: number;
    }>
  >([]);
  const [confirmDeleteSummoner, setConfirmDeleteSummoner] = useState<string | null>(null);
  const [summonerStatus, setSummonerStatus] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      window.api.getSetting("auto_start"),
      window.api.isAutoStartSupported(),
      window.api.getSetting("minimize_to_tray"),
      window.api.getSetting("hidden_queues"),
      window.api.getSetting("hide_remakes"),
      window.api.getSetting("auto_backup"),
      window.api.getSetting("remember_filters"),
    ]).then(
      ([
        startup,
        startupSupported,
        tray,
        hidden,
        remakes,
        backup,
        remember,
      ]) => {
        setAutoStart(startup === "true");
        setAutoStartSupported(startupSupported);
        setMinimizeToTray(tray !== "false");
        setHiddenQueues(new Set(hidden ? hidden.split(",").map(Number) : []));
        setHideRemakes(remakes === "true");
        setAutoBackup(backup !== "false");
        setRememberFilters(remember === "true");
        setLoading(false);
      },
    );
  }, []);

  const refreshSavedSummoners = useCallback(() => {
    if (typeof window.api.getSavedSummoners !== "function") {
      console.warn(
        "[settings] getSavedSummoners is not available yet — restart the app so the new preload loads",
      );
      setSummonerStatus(
        "Saved accounts is a new feature — restart the application for it to become available.",
      );
      return;
    }
    window.api
      .getSavedSummoners()
      .then(setSavedSummoners)
      .catch((err: unknown) => {
        console.error("Failed to load saved accounts:", err);
      });
  }, []);

  useEffect(refreshSavedSummoners, [refreshSavedSummoners]);

  const handleDeleteSummoner = useCallback(
    async (puuid: string) => {
      setConfirmDeleteSummoner(null);
      setSummonerStatus(null);
      if (typeof window.api.deleteSummoner !== "function") {
        setSummonerStatus("Delete account is not available yet — restart the application.");
        return;
      }
      try {
        const result = await window.api.deleteSummoner(puuid);
        setSummonerStatus(
          `Deleted account: ${result.deletedGames} game(s) removed, ${result.deletedTrackedRows} tracked row(s) removed`,
        );
        refreshSavedSummoners();
      } catch (err) {
        setSummonerStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [refreshSavedSummoners],
  );

  const handleRiotSync = useCallback(async () => {
    // TODO: rewrite Riot history sync from scratch
  }, []);

  const handleRepair = useCallback(async () => {
    setRepairing(true);
    setBackfillStatus("Repairing game data...");
    try {
      const result = await window.api.repairPuuids();
      if ("error" in result) {
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

  // Kept current the same way the queue dropdown is: a game from a queue that
  // wasn't in the database yet adds a switch for it without a reload.
  useEffect(() => {
    const fetchQueues = () => window.api.getStoredQueues().then(setQueues);
    fetchQueues();
    return window.api.onGamesUpdated(fetchQueues);
  }, []);

  const refreshBackups = useCallback(() => {
    window.api.listBackups().then(setBackups);
  }, []);

  useEffect(refreshBackups, [refreshBackups]);

  useEffect(() => {
    if (!exportStatus) return;
    const timer = window.setTimeout(() => setExportStatus(null), 8_000);
    return () => window.clearTimeout(timer);
  }, [exportStatus]);

  useEffect(() => {
    if (!importStatus) return;
    const timer = window.setTimeout(() => setImportStatus(null), 8_000);
    return () => window.clearTimeout(timer);
  }, [importStatus]);

  const handleAutoStartToggle = useCallback(async () => {
    const next = !autoStart;
    setAutoStart(next);
    // The main process registers or clears the login item off the back of this
    await window.api.setSetting("auto_start", String(next));
  }, [autoStart]);

  const handleToggle = useCallback(async () => {
    const next = !minimizeToTray;
    setMinimizeToTray(next);
    await window.api.setSetting("minimize_to_tray", String(next));
  }, [minimizeToTray]);

  const handleQueueToggle = useCallback(
    async (queueId: number) => {
      const next = new Set(hiddenQueues);
      if (!next.delete(queueId)) next.add(queueId);
      setHiddenQueues(next);
      await window.api.setSetting("hidden_queues", [...next].join(","));
    },
    [hiddenQueues],
  );

  const handleHideRemakesToggle = useCallback(async () => {
    const next = !hideRemakes;
    setHideRemakes(next);
    await window.api.setSetting("hide_remakes", String(next));
  }, [hideRemakes]);

  const handleAutoBackupToggle = useCallback(async () => {
    const next = !autoBackup;
    setAutoBackup(next);
    await window.api.setSetting("auto_backup", String(next));
  }, [autoBackup]);

  const handleRememberFiltersToggle = useCallback(async () => {
    const next = !rememberFilters;
    setRememberFilters(next);
    // Takes effect on the pages right away: they read the flag as they mount,
    // and turning it off drops whatever was already stored.
    setRemembering(next);
    await window.api.setSetting("remember_filters", String(next));
  }, [rememberFilters]);

  const handleBackupNow = useCallback(async () => {
    setBackupBusy(true);
    setBackupStatus(null);
    try {
      const result = await window.api.createBackup();
      setBackupStatus(
        result.success
          ? `Backed up ${result.backup?.games} game(s)`
          : `Error: ${result.error ?? "backup failed"}`,
      );
      refreshBackups();
    } catch (err: any) {
      setBackupStatus(`Error: ${err.message}`);
    } finally {
      setBackupBusy(false);
    }
  }, [refreshBackups]);

  const handleRestore = useCallback(
    async (file: string) => {
      setConfirmRestore(null);
      setBackupBusy(true);
      setBackupStatus(null);
      try {
        const result = await window.api.restoreBackup(file);
        setBackupStatus(
          result.success
            ? `Restored ${result.games} game(s) from ${file}`
            : `Error: ${result.error ?? "restore failed"}`,
        );
        refreshBackups();
      } catch (err: any) {
        setBackupStatus(`Error: ${err.message}`);
      } finally {
        setBackupBusy(false);
      }
    },
    [refreshBackups],
  );

  const handleExportData = useCallback(async () => {
    setExporting(true);
    setExportStatus(null);
    try {
      const result = await window.api.exportData();
      if (result.success) {
        const filename = result.path?.split(/[\\/]/).pop() ?? "backup.json";
        setExportStatus({
          message: `Exported ${result.games ?? 0} games to ${filename}`,
          error: false,
        });
      } else if (result.error) {
        setExportStatus({ message: result.error, error: true });
      }
    } catch (err: unknown) {
      setExportStatus({
        message: err instanceof Error ? err.message : String(err),
        error: true,
      });
    } finally {
      setExporting(false);
    }
  }, []);

  const handleImportData = useCallback(async () => {
    setImporting(true);
    setImportStatus(null);
    try {
      const result = await window.api.importData();
      if (result.success) {
        setImportStatus({
          message: `Imported ${result.imported ?? 0} games`,
          error: false,
        });
      } else if (result.error) {
        setImportStatus({ message: result.error, error: true });
      }
    } catch (err: unknown) {
      setImportStatus({
        message: err instanceof Error ? err.message : String(err),
        error: true,
      });
    } finally {
      setImporting(false);
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
        setBackfillStatus(
          `Stopped after adding ${result.added} game(s). Run it again to finish.`,
        );
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

  if (loading) return null;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold text-lol-text-bright">Settings</h1>

      <div className="bg-lol-card rounded-xl border border-lol-border/60 p-5">
        <h2 className="text-sm font-semibold text-lol-text-bright mb-2">League history sync</h2>
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={handleBackfill}
            disabled={backfilling}
            className="px-4 py-1.5 rounded text-sm bg-lol-gold/20 text-lol-gold hover:bg-lol-gold/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {backfilling ? "Working..." : "Backfill"}
          </button>
          <button
            onClick={handleForceFullBackfill}
            disabled={backfilling}
            title="Walk the entire Riot history from page 0, ignoring the cached completion flag. Use this to test whether the current cap is our page limit or Riot's own cutoff."
            className="px-4 py-1.5 rounded text-sm border border-lol-border text-lol-text hover:border-lol-gold/60 hover:text-lol-text-bright transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Force Backfill
          </button>
          <button
            className="rounded-md bg-lol-gold/15 border border-lol-gold/40 px-3 py-1.5 text-xs text-lol-gold"
            type="button"
            onClick={handleRiotSync}
          >
            Sync from Riot History
          </button>
          <button
            type="button"
            onClick={handleRestoreOlderGames}
            disabled={restoring}
            className="rounded-md bg-lol-gold/15 border border-lol-gold/40 px-3 py-1.5 text-xs text-lol-gold"
          >
            {restoring ? "Restoring..." : "Restore older games"}
          </button>
          <button
            type="button"
            onClick={handleRepair}
            disabled={repairing}
            className="rounded-md bg-lol-gold/15 border border-lol-gold/40 px-3 py-1.5 text-xs text-lol-gold"
          >
            {repairing ? "Repairing..." : "Repair"}
          </button>
        </div>
        {backfillStatus && (
          <p className="text-xs text-lol-text mt-2">{backfillStatus}</p>
        )}
      </div>

      <div className="bg-lol-card rounded-xl border border-lol-border/60 p-5">
        <h2 className="text-sm font-semibold text-lol-text-bright mb-4">Data Management</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-lol-text-bright">Export data</p>
              <p className="text-xs text-lol-text mt-0.5">
                Save all match data to a JSON file for backup.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportData}
              disabled={exporting}
              className="shrink-0 px-4 py-1.5 rounded text-sm bg-lol-gold/20 text-lol-gold hover:bg-lol-gold/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? "Exporting…" : "Export"}
            </button>
          </div>
          {exportStatus && (
            <p className={`text-xs ${exportStatus.error ? "text-red-300" : "text-green-300"}`}>
              {exportStatus.message}
            </p>
          )}

          <div className="border-t border-lol-border" />

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-lol-text-bright">Import data</p>
              <p className="text-xs text-lol-text mt-0.5">
                Load match data from a previously exported file.
              </p>
            </div>
            <button
              type="button"
              onClick={handleImportData}
              disabled={importing}
              className="shrink-0 px-4 py-1.5 rounded text-sm bg-lol-gold/20 text-lol-gold hover:bg-lol-gold/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing ? "Importing…" : "Import"}
            </button>
          </div>
          {importStatus && (
            <p className={`text-xs ${importStatus.error ? "text-red-300" : "text-green-300"}`}>
              {importStatus.message}
            </p>
          )}
        </div>
      </div>

      <div className="bg-lol-card rounded-xl border border-lol-border/60 p-5">
        <h2 className="text-sm font-semibold text-lol-text-bright mb-2">Saved accounts</h2>
        <p className="text-xs text-lol-text mb-4">
          Accounts that can appear in the Local Account and Match History views. Deleting one
          removes its summoner row and every game stored for it; games still owned by another saved
          account are kept.
        </p>
        {savedSummoners.length === 0 ? (
          <p className="text-xs text-lol-text">No saved accounts yet.</p>
        ) : (
          <div className="space-y-2">
            {savedSummoners.map((summoner) => {
              const name =
                summoner.game_name && summoner.tag_line
                  ? `${summoner.game_name}#${summoner.tag_line}`
                  : summoner.game_name ?? summoner.puuid;
              const confirming = confirmDeleteSummoner === summoner.puuid;
              return (
                <div
                  key={summoner.puuid}
                  className="flex items-center justify-between gap-3 rounded-md border border-lol-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs text-lol-text-bright truncate">{name}</p>
                    <p className="text-[11px] text-lol-text">
                      {summoner.games} game{summoner.games === 1 ? "" : "s"} stored
                    </p>
                  </div>
                  {confirming ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-lol-text">Delete all data?</span>
                      <button
                        onClick={() => handleDeleteSummoner(summoner.puuid)}
                        className="px-3 py-1 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setConfirmDeleteSummoner(null)}
                        className="px-3 py-1 rounded bg-lol-border/40 text-lol-text hover:bg-lol-border/60 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteSummoner(summoner.puuid)}
                      className="shrink-0 px-3 py-1 rounded text-xs bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <button
          onClick={async () => {
            setSummonerStatus(null);
            const removed = await window.api.deleteSearchedSummoners();
            setSummonerStatus(
              removed.removed > 0
                ? `Removed ${removed.removed} searched account(s) and ${removed.games} game(s)`
                : "No searched accounts to remove",
            );
            refreshSavedSummoners();
          }}
          className="mt-3 px-3 py-1.5 rounded text-xs bg-lol-border/40 text-lol-text hover:bg-lol-border/60 transition-colors"
        >
          Clean up searched accounts
        </button>
        {summonerStatus && <p className="mt-3 text-xs text-lol-text">{summonerStatus}</p>}
      </div>

      {/* General */}
      <div className="bg-lol-card rounded-xl border border-lol-border/60 p-5">
        <h2 className="text-sm font-semibold text-lol-text-bright mb-4">General</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-lol-text-bright">Start with Windows</p>
              <p className="text-xs text-lol-text mt-0.5">
                Open the program in the system tray when you sign in to Windows, so your games are
                recorded without having to remember to start it.
                {!autoStartSupported && " Only available in the packaged program."}
              </p>
            </div>
            <Switch
              checked={autoStart}
              onChange={handleAutoStartToggle}
              disabled={!autoStartSupported}
            />
          </div>

          <div className="border-t border-lol-border" />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-lol-text-bright">Minimize to tray on close</p>
              <p className="text-xs text-lol-text mt-0.5">
                When enabled, the program can keep storing your games even when the window is
                closed. You can still close the program from the system tray.
              </p>
            </div>
            <Switch checked={minimizeToTray} onChange={handleToggle} />
          </div>

          <div className="border-t border-lol-border" />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-lol-text-bright">Remember filters and sorting</p>
              <p className="text-xs text-lol-text mt-0.5">
                Reopen every page with the filters, search, and sort order you last used. When off,
                each page starts on its defaults again every time the program opens.
              </p>
            </div>
            <Switch checked={rememberFilters} onChange={handleRememberFiltersToggle} />
          </div>

          <div className="border-t border-lol-border" />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-lol-text-bright">Hide remakes</p>
              <p className="text-xs text-lol-text mt-0.5">
                Leave remade games out of the match history. They are still recorded, and were never
                counted toward your stats either way.
              </p>
            </div>
            <Switch checked={hideRemakes} onChange={handleHideRemakesToggle} />
          </div>

          {/* A single queue has nothing to choose between, so the whole block
              waits until a second one shows up in the database */}
          {queues.length > 1 && (
            <>
              <div className="border-t border-lol-border" />

              <div>
                <p className="text-sm text-lol-text-bright">Queues to include</p>
                <p className="text-xs text-lol-text mt-0.5">
                  Stats and match history only count the queues switched on here. Games from the
                  others are still recorded, and can be counted again by switching their queue back
                  on.
                </p>
                <div className="mt-3 space-y-3">
                  {queues.map((q, _i, all) => {
                    const shown = !hiddenQueues.has(q);
                    const shownCount = all.filter((id) => !hiddenQueues.has(id)).length;
                    return (
                      <div key={q} className="flex items-center justify-between">
                        <p className="text-sm text-lol-text">{queueLabel(q)}</p>
                        {/* Switching off the last one would empty every page */}
                        <Switch
                          checked={shown}
                          disabled={shown && shownCount === 1}
                          onChange={() => handleQueueToggle(q)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Backups */}
      <div className="bg-lol-card rounded-xl border border-lol-border/60 p-5">
        <h2 className="text-sm font-semibold text-lol-text-bright mb-4">Backups</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-lol-text-bright">Automatic backups</p>
              <p className="text-xs text-lol-text mt-0.5">
                Keep a daily copy of your database on this computer, plus one before any import or
                repair. Older copies thin out to weekly and monthly. If the database ever goes
                missing or won't open, the newest working copy is restored on startup.
              </p>
            </div>
            <Switch checked={autoBackup} onChange={handleAutoBackupToggle} />
          </div>

          <div className="border-t border-lol-border" />

          {backups.length === 0 ? (
            <p className="text-xs text-lol-text">No backups yet.</p>
          ) : (
            <div className="space-y-1">
              {backups.map((backup) => (
                <div
                  key={backup.file}
                  className="flex items-center justify-between gap-3 text-xs py-1"
                >
                  <div className="min-w-0">
                    <p className="text-lol-text-bright">{formatTaken(backup.created)}</p>
                    <p className="text-lol-text">
                      {BACKUP_REASONS[backup.reason] ?? backup.reason} ·{" "}
                      {backup.games === null ? "unreadable" : `${backup.games} games`} ·{" "}
                      {formatSize(backup.size)}
                    </p>
                  </div>
                  {confirmRestore === backup.file ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-lol-text">Replace current data?</span>
                      <button
                        onClick={() => handleRestore(backup.file)}
                        disabled={backupBusy}
                        className="px-3 py-1 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                      >
                        Restore
                      </button>
                      <button
                        onClick={() => setConfirmRestore(null)}
                        className="px-3 py-1 rounded bg-lol-border/40 text-lol-text hover:bg-lol-border/60 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmRestore(backup.file)}
                      disabled={backupBusy || backup.games === null}
                      className="px-3 py-1 rounded shrink-0 bg-lol-gold/20 text-lol-gold hover:bg-lol-gold/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Restore
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleBackupNow}
              disabled={backupBusy}
              className="px-4 py-1.5 rounded text-sm bg-lol-gold/20 text-lol-gold hover:bg-lol-gold/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {backupBusy ? "Working..." : "Back up now"}
            </button>
            <button
              onClick={() => window.api.openBackupFolder()}
              className="px-4 py-1.5 rounded text-sm bg-lol-border/40 text-lol-text hover:bg-lol-border/60 transition-colors"
            >
              Open folder
            </button>
          </div>
          {backupStatus && <p className="text-xs text-lol-text">{backupStatus}</p>}
        </div>
      </div>

      {/* Credits */}
      <div className="bg-lol-card rounded-xl border border-lol-border/60 p-5">
        <h2 className="text-sm font-semibold text-lol-text-bright mb-4">
          Credits &amp; Acknowledgements
        </h2>
        <div className="space-y-3 text-sm text-lol-text leading-relaxed">
          <p>
            <a
              href="https://github.com/dxmegg/League-Tracker"
              onClick={(event) => {
                event.preventDefault();
                window.api.openUrl("https://github.com/dxmegg/League-Tracker");
              }}
              className="text-lol-gold hover:underline"
            >
              League Tracker
            </a>{" "}
            - By{" "}
            <a
              href="https://github.com/dxmegg"
              onClick={(event) => {
                event.preventDefault();
                window.api.openUrl("https://github.com/dxmegg");
              }}
              className="text-lol-gold hover:underline"
            >
              me
            </a>
            , for{" "}
            <a
              href="https://github.com/dxmegg"
              onClick={(event) => {
                event.preventDefault();
                window.api.openUrl("https://github.com/dxmegg");
              }}
              className="text-lol-gold hover:underline"
            >
              me
            </a>
          </p>
          <p>
            This project is a fork of{" "}
            <a
              href="https://github.com/Yhprum/mayhem-tracker"
              onClick={(event) => {
                event.preventDefault();
                window.api.openUrl("https://github.com/Yhprum/mayhem-tracker");
              }}
              className="text-lol-gold hover:underline"
            >
              Mayhem Tracker
            </a>{" "}
            by{" "}
            <a
              href="https://github.com/Yhprum"
              onClick={(event) => {
                event.preventDefault();
                window.api.openUrl("https://github.com/Yhprum");
              }}
              className="text-lol-gold hover:underline"
            >
              Yhprum
            </a>
            .
          </p>
          <p>
            Huge thanks to{" "}
            <a
              href="https://github.com/Yhprum"
              onClick={(event) => {
                event.preventDefault();
                window.api.openUrl("https://github.com/Yhprum");
              }}
              className="text-lol-gold hover:underline"
            >
              Yhprum
            </a>{" "}
            for creating the original Mayhem Tracker. The original project inspired me to build
            this fork and adapt it for my own needs. Without{" "}
            <a
              href="https://github.com/Yhprum"
              onClick={(event) => {
                event.preventDefault();
                window.api.openUrl("https://github.com/Yhprum");
              }}
              className="text-lol-gold hover:underline"
            >
              Yhprum
            </a>
            's work, this wouldn&apos;t exist.
          </p>
          <p>
            If you&apos;re looking for the original, unmodified tracker, check out it{" "}
            <a
              href="https://github.com/Yhprum/mayhem-tracker"
              onClick={(event) => {
                event.preventDefault();
                window.api.openUrl("https://github.com/Yhprum/mayhem-tracker");
              }}
              className="text-lol-gold hover:underline"
            >
              here
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
