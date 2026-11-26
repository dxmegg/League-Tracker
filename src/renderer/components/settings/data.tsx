import { useState, useEffect, useCallback } from "react";
import type { BackupInfo } from "../../lib/types";
import {
  type ExportProgress,
  type ImportProgress,
  type StorageInfo,
  type StorageResult,
} from "../../../shared/api";
import type { useActiveMode } from "../../hooks/useActiveMode";
import { ActionRow, Button, Section, Switch, formatDuration } from "./parts";

const BACKUP_REASONS: Record<string, string> = {
  auto: "Weekly",
  monthly: "Monthly",
  manual: "Manual",
  "pre-delete": "Before delete",
  "pre-import": "Before import",
  "pre-repair": "Before repair",
  "pre-restore": "Before restore",
  "pre-migration-34": "Before upgrade",
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

const EXPORT_PROGRESS_LABELS: Record<ExportProgress["phase"], string> = {
  games: "games scanned",
  "timeline-status": "timeline statuses written",
  "timeline-frames": "timeline frames written",
  "timeline-events": "timeline events written",
  done: "done",
};

const IMPORT_PROGRESS_LABELS: Record<ImportProgress["phase"], string> = {
  reading: "lines read",
  games: "games imported",
  "timeline-status": "timeline statuses imported",
  "timeline-frames": "timeline frames imported",
  "timeline-events": "timeline events imported",
  done: "done",
};

// Where the database and its backups are kept. Both pickers are native dialogs opened by main.
function StorageFolders({ onChanged }: { onChanged: () => void }) {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => void window.api.getStorageInfo().then(setInfo), []);
  useEffect(load, [load]);

  const run = async (change: () => Promise<StorageResult>) => {
    setBusy(true);
    setMessage("Working, this can take a few minutes for large files...");
    const result = await change();
    setMessage(result.status === "error" ? `Error: ${result.message}` : (result.message ?? null));
    setBusy(false);
    load();
    onChanged();
  };

  return (
    <Section title="Folders">
      <ActionRow name="Database" description={<span className="break-all">{info?.dbDir}</span>}>
        <Button variant="neutral" onClick={() => void window.api.openDbFolder()}>
          Open
        </Button>
        {info && !info.dbIsDefault && (
          <Button
            variant="neutral"
            disabled={busy}
            onClick={() => run(() => window.api.changeDbFolder(true))}
          >
            Use default
          </Button>
        )}
        <Button
          variant="neutral"
          disabled={busy}
          onClick={() => run(() => window.api.changeDbFolder(false))}
        >
          Change
        </Button>
      </ActionRow>
      <ActionRow name="Backups" description={<span className="break-all">{info?.backupDir}</span>}>
        {info && !info.backupIsDefault && (
          <Button
            variant="neutral"
            disabled={busy}
            onClick={() => run(() => window.api.changeBackupFolder(true))}
          >
            Use default
          </Button>
        )}
        <Button
          variant="neutral"
          disabled={busy}
          onClick={() => run(() => window.api.changeBackupFolder(false))}
        >
          Change
        </Button>
      </ActionRow>
      <p className="text-[12.5px] text-lol-text">
        Backups inside the database folder are lost together with it. A folder on another drive is
        safer.
      </p>
      {message && <p className="text-[12.5px] text-lol-text-bright">{message}</p>}
    </Section>
  );
}

export function useDataSettings() {
  const [autoBackup, setAutoBackup] = useState(false);
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
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [exportStartedAt, setExportStartedAt] = useState<number | null>(null);
  // Restoring replaces the whole database, so the row asks a second time
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    window.api.getSetting("auto_backup").then((backup) => {
      setAutoBackup(backup !== "false");
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    const offExport = window.api.onExportProgress((progress) => {
      setExportStartedAt((startedAt) => startedAt ?? Date.now());
      setExportProgress(progress);
    });
    const offImport = window.api.onImportProgress((progress) => {
      setImportProgress(progress);
    });
    return () => {
      offExport();
      offImport();
    };
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

  const handleAutoBackupToggle = useCallback(async () => {
    const next = !autoBackup;
    setAutoBackup(next);
    await window.api.setSetting("auto_backup", String(next));
  }, [autoBackup]);

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
        if (result.cancelled) return;
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
    setExportProgress(null);
    setExportStartedAt(null);
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
    setImportProgress(null);
    try {
      const result = await window.api.importData();
      if (result.success) {
        const imported = result.imported ?? 0;
        const total = result.total ?? 0;
        const skipped = result.skipped ?? 0;
        const message =
          skipped === 0 && imported > 0
            ? `Imported ${imported} games`
            : imported === 0 && total > 0
              ? `All ${total} games were already in the database`
              : `Imported ${imported} new games (${skipped} already present)`;
        setImportStatus({
          message,
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

  return {
    loaded,
    autoBackup,
    backups,
    setBackups,
    backupStatus,
    backupBusy,
    confirmRestore,
    setConfirmRestore,
    exportStatus,
    importStatus,
    exporting,
    importing,
    exportProgress,
    importProgress,
    exportStartedAt,
    handleAutoBackupToggle,
    handleBackupNow,
    handleRestore,
    handleExportData,
    handleImportData,
  };
}

export function DataSections({
  settings,
  mode,
}: {
  settings: ReturnType<typeof useDataSettings>;
  mode: ReturnType<typeof useActiveMode>[0];
}) {
  const {
    autoBackup,
    backups,
    setBackups,
    backupStatus,
    backupBusy,
    confirmRestore,
    setConfirmRestore,
    exportStatus,
    importStatus,
    exporting,
    importing,
    exportProgress,
    importProgress,
    exportStartedAt,
    handleAutoBackupToggle,
    handleBackupNow,
    handleRestore,
    handleExportData,
    handleImportData,
  } = settings;

  return (
    <>
      <Section title="Data Management">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-lol-border/50 bg-black/25 px-4 py-3 text-xs transition-colors hover:border-lol-crimson/40">
            <div>
              <p className="text-[13.5px] text-lol-text-bright">
                {mode === "mayhem" ? "Export Mayhem games only" : "Export all games"}
              </p>
              <p className="text-[12.5px] text-lol-text">
                {mode === "mayhem"
                  ? "Save Mayhem match data to a file for backup."
                  : "Save all match data to a file for backup."}
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
          {exporting && exportProgress && (
            <div className="space-y-2 text-[12.5px] text-lol-text">
              <div className="h-[5px] overflow-hidden rounded-full bg-white/[0.05]">
                <i
                  className={`block h-full rounded-full bg-lol-crimson ${
                    exportProgress.total === 0 ? "w-full animate-pulse" : ""
                  }`}
                  style={
                    exportProgress.total > 0
                      ? {
                          width: `${Math.min(
                            100,
                            (exportProgress.current / exportProgress.total) * 100,
                          )}%`,
                        }
                      : undefined
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <p>
                  {exportProgress.current.toLocaleString()}
                  {exportProgress.total > 0 && `/${exportProgress.total.toLocaleString()}`}{" "}
                  {EXPORT_PROGRESS_LABELS[exportProgress.phase]}
                </p>
                {exportStartedAt &&
                  exportProgress.current > 0 &&
                  exportProgress.total > exportProgress.current && (
                    <p className="shrink-0">
                      ETA:{" "}
                      {formatDuration(
                        ((Date.now() - exportStartedAt) / exportProgress.current) *
                          (exportProgress.total - exportProgress.current),
                      )}
                    </p>
                  )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-4 rounded-xl border border-lol-border/50 bg-black/25 px-4 py-3 text-xs transition-colors hover:border-lol-crimson/40">
            <div>
              <p className="text-[13.5px] text-lol-text-bright">Import data</p>
              <p className="text-[12.5px] text-lol-text">
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
          {importing && importProgress && (
            <div className="space-y-2 text-[12.5px] text-lol-text">
              <div className="h-[5px] overflow-hidden rounded-full bg-white/[0.05]">
                <i className="block h-full w-full animate-pulse rounded-full bg-lol-crimson" />
              </div>
              <p>
                {importProgress.current.toLocaleString()}{" "}
                {IMPORT_PROGRESS_LABELS[importProgress.phase]}
              </p>
            </div>
          )}
        </div>
      </Section>

      <StorageFolders onChanged={() => void window.api.listBackups().then(setBackups)} />

      <Section title="Backups">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-lol-border/50 bg-black/25 px-4 py-3 text-xs transition-colors hover:border-lol-crimson/40">
            <div>
              <p className="text-[13.5px] text-lol-text-bright">Automatic backups</p>
              <p className="text-[12.5px] text-lol-text">
                Keep compressed copies of your database on this computer: one renewed every week and
                one every month. A backup you take yourself, or one taken before an import, repair,
                restore or account deletion, is kept as a third copy. If the database ever goes
                missing or won't open, the newest working copy is restored on startup. Imports,
                repairs, restores and account deletions ask about a backup first, whether this is on
                or off.
              </p>
            </div>
            <Switch checked={autoBackup} onChange={handleAutoBackupToggle} />
          </div>

          {backups.length === 0 ? (
            <p className="text-[12.5px] text-lol-text">No backups yet.</p>
          ) : (
            <div className="space-y-1">
              {backups.map((backup) => (
                <div
                  key={backup.file}
                  className="flex items-center justify-between gap-4 rounded-xl border border-lol-border/50 bg-black/25 px-4 py-3 text-xs transition-colors hover:border-lol-crimson/40"
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
                      variant="subtle"
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
          {backupStatus && <p className="text-[12.5px] text-lol-text">{backupStatus}</p>}
        </div>
      </Section>
    </>
  );
}
