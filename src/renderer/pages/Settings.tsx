import { useState, useEffect, useCallback, type ButtonHTMLAttributes, type ReactNode } from "react";
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

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "subtle" | "neutral" | "destructive";
  children: ReactNode;
};

function Button({ variant = "primary", children, className = "", ...props }: ButtonProps) {
  const variantClasses = {
    primary: "bg-lol-gold/20 text-lol-gold hover:bg-lol-gold/30 border border-lol-gold/40",
    secondary:
      "border border-lol-border text-lol-text hover:border-lol-gold/60 hover:text-lol-text-bright",
    subtle: "bg-lol-gold/10 border border-lol-gold/30 text-lol-gold hover:bg-lol-gold/20",
    neutral: "bg-lol-border/30 text-lol-text hover:bg-lol-border/50",
    destructive:
      "bg-lol-crimson/15 text-lol-crimson-bright border border-lol-crimson/40 hover:bg-lol-crimson/25",
  };

  return (
    <button
      {...props}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-deep)] ${variantClasses[variant]} ${className}`}
    >
      {children}
    </button>
  );
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
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-deep)] ${
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"
      } ${checked ? "bg-lol-gold shadow-[0_0_8px_var(--theme-accent-glow)]" : "bg-lol-border/60"}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full transform transition-transform duration-200 ${
          checked ? "bg-lol-gold-light shadow-sm" : "bg-white shadow"
        } ${checked ? "translate-x-5" : "translate-x-0"}`}
      />
    </button>
  );
}

function Section({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`relative flex flex-col rounded-lg p-5 xl:p-6 2xl:p-7 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] border border-lol-crimson/40 shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03] ${className}`}
    >
      <h2 className="text-xs font-bold uppercase tracking-wider text-lol-gold mb-4">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

export default function Settings() {
  // Shared so a backfill started automatically on first connect shows here too
  const { running: backfilling } = useBackfill();
  const [theme, setTheme] = useState("test");
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
      window.api.getSetting("theme"),
    ]).then(([startup, startupSupported, tray, hidden, remakes, backup, remember, storedTheme]) => {
      setTheme(
        storedTheme === "default" || storedTheme === "test" || storedTheme === "pink"
          ? storedTheme
          : "test",
      );
      setAutoStart(startup === "true");
      setAutoStartSupported(startupSupported);
      setMinimizeToTray(tray !== "false");
      setHiddenQueues(new Set(hidden ? hidden.split(",").map(Number) : []));
      setHideRemakes(remakes === "true");
      setAutoBackup(backup !== "false");
      setRememberFilters(remember === "true");
      setLoading(false);
    });
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

  if (loading) return null;

  return (
    <div className="w-full max-w-3xl xl:max-w-4xl 2xl:max-w-5xl space-y-5 2xl:space-y-6">
      <h1 className="text-xl font-bold text-lol-text-bright">Settings</h1>

      <Section title="Appearance">
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="theme-select" className="text-sm text-lol-text-bright">
            Theme
          </label>
          <select
            id="theme-select"
            className="select"
            value={theme}
            onChange={(event) => {
              const value = event.target.value;
              if (value !== "default" && value !== "test" && value !== "pink") return;
              setTheme(value);
              void window.api.setSetting("theme", value);
              document.documentElement.setAttribute("data-theme", value);
            }}
          >
            <option value="test">Noxian (Default)</option>
            <option value="default">Default (Legacy)</option>
            <option value="pink">Pink</option>
          </select>
        </div>
      </Section>

      <Section title="League history sync">
        <div className="flex items-center gap-2 mt-3">
          <Button variant="primary" onClick={handleBackfill} disabled={backfilling}>
            {backfilling ? "Working..." : "Backfill"}
          </Button>
          <Button
            variant="secondary"
            onClick={handleForceFullBackfill}
            disabled={backfilling}
            title="Walk the entire Riot history from page 0, ignoring the cached completion flag. Use this to test whether the current cap is our page limit or Riot's own cutoff."
          >
            Force Backfill
          </Button>
          <Button variant="subtle" type="button" onClick={handleRiotSync}>
            Sync from Riot History
          </Button>
          <Button
            variant="subtle"
            type="button"
            onClick={handleRestoreOlderGames}
            disabled={restoring}
          >
            {restoring ? "Restoring..." : "Restore older games"}
          </Button>
          <Button variant="subtle" type="button" onClick={handleRepair} disabled={repairing}>
            {repairing ? "Repairing..." : "Repair"}
          </Button>
        </div>
        {backfillStatus && <p className="text-xs text-lol-text mt-2">{backfillStatus}</p>}
      </Section>

      <Section title="Data Management">
        <div className="space-y-4">
          <div className="w-full flex items-center justify-between gap-4 px-3 py-2 xl:px-4 xl:py-3">
            <div>
              <p className="text-sm text-lol-text-bright">Export data</p>
              <p className="text-xs text-lol-text mt-0.5">
                Save all match data to a JSON file for backup.
              </p>
            </div>
            <Button
              variant="primary"
              type="button"
              onClick={handleExportData}
              disabled={exporting}
              className="shrink-0"
            >
              {exporting ? "Exporting…" : "Export"}
            </Button>
          </div>
          {exportStatus && (
            <p className={`text-xs ${exportStatus.error ? "text-red-300" : "text-green-300"}`}>
              {exportStatus.message}
            </p>
          )}

          <div className="border-t border-lol-border" />

          <div className="w-full flex items-center justify-between gap-4 px-3 py-2 xl:px-4 xl:py-3">
            <div>
              <p className="text-sm text-lol-text-bright">Import data</p>
              <p className="text-xs text-lol-text mt-0.5">
                Load match data from a previously exported file.
              </p>
            </div>
            <Button
              variant="primary"
              type="button"
              onClick={handleImportData}
              disabled={importing}
              className="shrink-0"
            >
              {importing ? "Importing…" : "Import"}
            </Button>
          </div>
          {importStatus && (
            <p className={`text-xs ${importStatus.error ? "text-red-300" : "text-green-300"}`}>
              {importStatus.message}
            </p>
          )}
        </div>
      </Section>

      <Section title="Saved accounts">
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
                  : (summoner.game_name ?? summoner.puuid);
              const confirming = confirmDeleteSummoner === summoner.puuid;
              return (
                <div
                  key={summoner.puuid}
                  className="w-full flex items-center justify-between gap-3 rounded-md border border-lol-border px-3 py-2 xl:px-4 xl:py-3"
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
                      <Button
                        variant="destructive"
                        onClick={() => handleDeleteSummoner(summoner.puuid)}
                      >
                        Delete
                      </Button>
                      <Button variant="neutral" onClick={() => setConfirmDeleteSummoner(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="destructive"
                      onClick={() => setConfirmDeleteSummoner(summoner.puuid)}
                      className="shrink-0"
                    >
                      Delete
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <Button
          variant="neutral"
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
          className="mt-3"
        >
          Clean up searched accounts
        </Button>
        {summonerStatus && <p className="mt-3 text-xs text-lol-text">{summonerStatus}</p>}
      </Section>

      {/* General */}
      <Section title="General">
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
                <div className="h-px bg-gradient-to-r from-lol-gold/30 via-lol-gold/10 to-transparent" />
                <p className="text-xs font-bold uppercase tracking-wider text-lol-text">
                  Queues to include
                </p>
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
                      <div
                        key={q}
                        className="w-full flex items-center justify-between py-1.5 xl:py-2"
                      >
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
      </Section>

      {/* Backups */}
      <Section title="Backups">
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
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 text-xs xl:px-4 xl:py-3"
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
                      <Button
                        variant="destructive"
                        onClick={() => handleRestore(backup.file)}
                        disabled={backupBusy}
                      >
                        Restore
                      </Button>
                      <Button variant="neutral" onClick={() => setConfirmRestore(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="primary"
                      onClick={() => setConfirmRestore(backup.file)}
                      disabled={backupBusy || backup.games === null}
                      className="shrink-0"
                    >
                      Restore
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={handleBackupNow} disabled={backupBusy}>
              {backupBusy ? "Working..." : "Back up now"}
            </Button>
            <Button variant="neutral" onClick={() => window.api.openBackupFolder()}>
              Open folder
            </Button>
          </div>
          {backupStatus && <p className="text-xs text-lol-text">{backupStatus}</p>}
        </div>
      </Section>

      {/* Credits */}
      <Section title="Credits & Acknowledgements">
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
            for creating the original Mayhem Tracker. The original project inspired me to build this
            fork and adapt it for my own needs. Without{" "}
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
      </Section>
    </div>
  );
}
