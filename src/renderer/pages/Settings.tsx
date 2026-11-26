import SummonerIcon from "../components/SummonerIcon";
import { useActiveAccount } from "../hooks/useActiveAccount";
import { invalidateAccountsCache } from "../hooks/useChampions";
import { ALL_ACCOUNTS_SENTINEL } from "../lib/accountsEvent";
import { useState, useEffect, useCallback, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useBackfill } from "../hooks/useBackfill";
import { useTimelineBackfill } from "../hooks/useTimelineBackfill";
import { queueLabel } from "../components/QueueSelect";
import { QUEUE_LABELS } from "../../shared/queues";
import { setRemembering } from "../lib/viewState";
import { useActiveMode } from "../hooks/useActiveMode";
import { useDevMode } from "../hooks/useDevMode";
import type { BackupInfo } from "../lib/types";
import {
  type ExportProgress,
  type ImportProgress,
  type RiotAccountConfig,
  type RiotSyncProgress,
  type StorageInfo,
  type StorageResult,
} from "../../shared/api";
import { Title } from "../components/live/shared";
import { XIcon } from "../components/icons";
import { AboutSection } from "../components/AboutSection";
import { ChangelogSection } from "../components/ChangelogSection";

const BACKUP_REASONS: Record<string, string> = {
  auto: "Scheduled",
  manual: "Manual",
  "pre-import": "Before import",
  "pre-repair": "Before repair",
  "pre-restore": "Before restore",
};

const PLATFORM_LABELS: Record<string, string> = {
  euw1: "EUW",
  eun1: "EUNE",
  na1: "NA",
  kr: "KR",
  br1: "BR",
  jp1: "JP",
  tr1: "TR",
  ru: "RU",
  la1: "LAN",
  la2: "LAS",
  oc1: "OCE",
  ph2: "PH",
  sg2: "SG",
  th2: "TH",
  tw2: "TW",
  vn2: "VN",
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

function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1_000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
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

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "subtle" | "neutral" | "destructive";
  children: ReactNode;
};

function Button({ variant = "primary", children, className = "", ...props }: ButtonProps) {
  const variantClasses = {
    primary: "border-lol-crimson/70 bg-lol-crimson/25 text-lol-text-bright hover:bg-lol-crimson/45",
    secondary:
      "border-lol-border/70 bg-lol-card/60 text-lol-text-bright hover:border-lol-crimson/60",
    subtle:
      "border-lol-border/50 bg-lol-card/40 text-lol-text hover:border-lol-crimson/50 hover:text-lol-text-bright",
    neutral:
      "border-lol-border/50 bg-lol-card/40 text-lol-text hover:border-lol-crimson/50 hover:text-lol-text-bright",
    destructive: "border-lol-loss/50 bg-lol-loss/10 text-lol-loss hover:bg-lol-loss/20",
  };

  return (
    <button
      {...props}
      className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-3.5 text-xs font-bold uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-crimson/60 ${variantClasses[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

const INPUT_CLASS =
  "h-9 rounded-lg border border-lol-border/60 bg-black/30 px-3 text-[13px] text-lol-text-bright outline-none transition-colors hover:border-lol-crimson/40 focus:border-lol-crimson/70";

// One account in either list: picture, name, a line under it and its controls
function AccountCard({
  icon,
  name,
  detail,
  dimmed = false,
  children,
}: {
  icon: number | null;
  name: string;
  detail: ReactNode;
  dimmed?: boolean;
  children: ReactNode;
}) {
  const [game, tag] = name.split("#");
  return (
    <div className="group flex min-w-0 items-center gap-3 rounded-xl border border-lol-border/50 bg-black/25 px-3 py-2.5 transition-colors hover:border-lol-crimson/50 hover:bg-white/[0.04]">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-lol-crimson/50 bg-lol-card ${dimmed ? "opacity-40 grayscale" : ""}`}
      >
        {icon == null ? (
          <span className="font-display text-[13px] font-bold text-lol-text">
            {game.slice(0, 2).toUpperCase()}
          </span>
        ) : (
          <SummonerIcon iconId={icon} size={40} />
        )}
      </span>
      <div className={`min-w-0 flex-1 ${dimmed ? "opacity-50" : ""}`}>
        <p
          className="truncate font-display text-[14px] font-bold text-lol-text-bright"
          title={name}
        >
          {game}
          {tag && <span className="ml-1 text-[12px] font-medium text-lol-text">#{tag}</span>}
        </p>
        <p className="flex items-center gap-2 text-[11px] text-lol-text">{detail}</p>
      </div>
      {children}
    </div>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-lol-text/60 transition-colors hover:bg-lol-loss/15 hover:text-lol-loss focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-loss/60"
    >
      <XIcon className="h-3.5 w-3.5" />
    </button>
  );
}

function Switch({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label?: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-crimson/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-deep)] ${
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"
      } ${checked ? "bg-lol-crimson shadow-[0_0_10px_var(--theme-crimson-glow)]" : "bg-white/10"}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full transform transition-transform duration-200 ${
          checked ? "bg-white shadow-sm" : "bg-lol-text shadow"
        } ${checked ? "translate-x-5" : "translate-x-0"}`}
      />
    </button>
  );
}

function Section({
  title,
  children,
  className = "",
  action,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section className={`app-tile min-w-0 ${className}`}>
      <Title aside={action}>{title}</Title>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

// One thing you can run: what it does on the left, its button on the right
function ActionRow({
  name,
  description,
  children,
}: {
  name: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-lol-border/50 bg-black/25 px-4 py-3 transition-colors hover:border-lol-crimson/40">
      <div className="min-w-0">
        <p className="font-display text-[14px] font-bold text-lol-text-bright">{name}</p>
        <p className="text-[12px] text-lol-text">{description}</p>
      </div>
      <div className="flex shrink-0 gap-2">{children}</div>
    </div>
  );
}

const SETTINGS_TABS = [
  { id: "general", label: "General", hint: "Startup behaviour and which games count" },
  { id: "accounts", label: "Accounts", hint: "Riot accounts to sync and accounts already saved" },
  { id: "sync", label: "Sync & repair", hint: "Fetch history, timelines and fix stored data" },
  { id: "data", label: "Backups", hint: "Export, import and database snapshots" },
  { id: "changelog", label: "What's new", hint: "Changes in every release" },
  { id: "about", label: "About", hint: "Version, your data, legal notices and licenses" },
] as const;

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

export default function Settings() {
  const [tab, setTab] = useState<(typeof SETTINGS_TABS)[number]["id"]>("general");
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
  const [mode] = useActiveMode();
  const [devMode, setDevMode] = useDevMode();
  const [autoStart, setAutoStart] = useState(false);
  // Only the packaged program has a path worth registering, so the switch says
  // so instead of pretending in a dev build
  const [autoStartSupported, setAutoStartSupported] = useState(false);
  const [minimizeToTray, setMinimizeToTray] = useState(true);
  // Every queue with games stored, and the subset the user has switched off
  const [queues, setQueues] = useState<number[]>([]);
  const [hiddenQueues, setHiddenQueues] = useState<Set<number>>(new Set());
  const [hideRemakes, setHideRemakes] = useState(false);
  const [autoBackup, setAutoBackup] = useState(false);
  const [rememberFilters, setRememberFilters] = useState(true);
  const [loading, setLoading] = useState(true);
  const [backfillStatus, setBackfillStatus] = useState<string | null>(null);
  const [riotSyncing, setRiotSyncing] = useState(false);
  const [riotSyncStatus, setRiotSyncStatus] = useState<string | null>(null);
  const [riotSyncProgress, setRiotSyncProgress] = useState<RiotSyncProgress | null>(null);
  const [riotAccounts, setRiotAccounts] = useState<RiotAccountConfig[]>([]);
  const [riotAccountStatus, setRiotAccountStatus] = useState<string | null>(null);
  const [resolvedPlatform, setResolvedPlatform] = useState<{
    platform: string;
    route: string;
  } | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
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
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [exportStartedAt, setExportStartedAt] = useState<number | null>(null);
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
  const [hiddenAccounts, setHiddenAccounts] = useState<Set<string>>(new Set());
  const [activeAccount, setActiveAccount] = useActiveAccount();
  const [summonerStatus, setSummonerStatus] = useState<string | null>(null);
  const [mergingDuplicates, setMergingDuplicates] = useState(false);
  const [timelineLimit, setTimelineLimit] = useState(100);
  const [timelineMessage, setTimelineMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      window.api.getSetting("auto_start"),
      window.api.isAutoStartSupported(),
      window.api.getSetting("minimize_to_tray"),
      window.api.getSetting("hidden_queues"),
      window.api.getSetting("hide_remakes"),
      window.api.getSetting("auto_backup"),
      window.api.getSetting("remember_filters"),
      window.api.getSetting("hidden_accounts"),
    ]).then(([startup, startupSupported, tray, hidden, remakes, backup, remember, off]) => {
      setHiddenAccounts(new Set(off ? (JSON.parse(off) as string[]) : []));
      setAutoStart(startup === "true");
      setAutoStartSupported(startupSupported);
      setMinimizeToTray(tray !== "false");
      setHiddenQueues(new Set(hidden ? hidden.split(",").map(Number) : []));
      setHideRemakes(remakes === "true");
      setAutoBackup(backup === "true");
      setRememberFilters(remember !== "false");
      setLoading(false);
    });
  }, []);

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

  const refreshRiotAccounts = useCallback(() => {
    window.api
      .listRiotAccounts()
      .then(setRiotAccounts)
      .catch((err: unknown) => {
        setRiotAccountStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
      });
  }, []);

  useEffect(refreshRiotAccounts, [refreshRiotAccounts]);

  useEffect(() => {
    const offExport = window.api.onExportProgress((progress) => {
      setExportStartedAt((startedAt) => startedAt ?? Date.now());
      setExportProgress(progress);
    });
    const offImport = window.api.onImportProgress((progress) => {
      setImportProgress(progress);
    });
    const offRiotSync = window.api.onRiotSyncProgress((progress) => {
      setRiotSyncProgress(progress);
    });
    return () => {
      offExport();
      offImport();
      offRiotSync();
    };
  }, []);

  const refreshSavedSummoners = useCallback(async () => {
    if (typeof window.api.getSavedSummoners !== "function") {
      console.warn(
        "[settings] getSavedSummoners is not available yet — restart the app so the new preload loads",
      );
      setSummonerStatus(
        "Saved accounts is a new feature — restart the application for it to become available.",
      );
      return [];
    }
    const list = await window.api.getSavedSummoners();
    setSavedSummoners(list);
    return list;
  }, []);

  useEffect(() => {
    void refreshSavedSummoners().catch((err: unknown) => {
      console.error("Failed to load saved accounts:", err);
      setSummonerStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    });
  }, [refreshSavedSummoners]);

  const handleDeleteSummoner = useCallback(
    async (puuid: string) => {
      console.log("[delete] start", puuid);
      setConfirmDeleteSummoner(null);
      setSummonerStatus(null);
      if (typeof window.api.deleteSummoner !== "function") {
        setSummonerStatus("Delete account is not available yet — restart the application.");
        return;
      }
      try {
        console.log("[delete] calling api", puuid);
        const result = await window.api.deleteSummoner(puuid);
        console.log("[delete] result", result);
        setSummonerStatus(
          `Deleted account: ${result.deletedGames} game(s) removed, ${result.deletedTrackedRows} tracked row(s) removed`,
        );
        const list = await refreshSavedSummoners();
        console.log("[delete] list refreshed", list.length);
      } catch (err) {
        console.error("[delete] error", err);
        setSummonerStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [refreshSavedSummoners],
  );

  const handleMergeDuplicateAccounts = useCallback(async () => {
    setMergingDuplicates(true);
    setSummonerStatus(null);
    try {
      if (typeof window.api.mergeDuplicateAccounts !== "function") {
        throw new Error("Merge duplicate accounts is not available yet — restart the application.");
      }
      const result = await window.api.mergeDuplicateAccounts();
      await refreshSavedSummoners();
      setSummonerStatus(
        result.merged === 0 ? "No duplicates found" : `Merged ${result.merged} accounts`,
      );
    } catch (err) {
      console.error("[settings] merge duplicate accounts failed:", err);
      setSummonerStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setMergingDuplicates(false);
    }
  }, [refreshSavedSummoners]);

  const handleRiotSync = useCallback(async () => {
    setRiotSyncing(true);
    setRiotSyncStatus(null);
    setRiotSyncProgress(null);
    try {
      const result = await window.api.syncRiotHistory();
      if (!("added" in result)) {
        setRiotSyncStatus(`Error: ${result.error}`);
      } else if (result.error) {
        setRiotSyncStatus(
          `Synced ${result.added} new match(es) from ${result.scanned} processed match(es). Error: ${result.error}`,
        );
      } else if (result.cancelled) {
        setRiotSyncStatus(`Cancelled after ${result.scanned} game(s).`);
      } else {
        setRiotSyncStatus(
          `Synced ${result.added} new match(es) from ${result.scanned} scanned match(es).`,
        );
      }
    } catch (err: unknown) {
      setRiotSyncStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRiotSyncing(false);
    }
  }, []);

  const handleRemoveRiotAccount = useCallback(async (id: string) => {
    setRiotAccountStatus(null);
    try {
      const accounts = await window.api.removeRiotAccount(id);
      setRiotAccounts(accounts);
      setRiotAccountStatus("Riot account removed.");
    } catch (err: unknown) {
      setRiotAccountStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const handleRiotRefresh = useCallback(async () => {
    setRiotSyncing(true);
    setRiotSyncStatus(null);
    setRiotSyncProgress(null);
    try {
      const result = await window.api.syncRiotHistory({ refreshExisting: true });
      if (!("added" in result)) {
        setRiotSyncStatus(`Error: ${result.error}`);
      } else if (result.error) {
        setRiotSyncStatus(
          `Processed ${result.scanned} match(es); added ${result.added} new match(es). Error: ${result.error}`,
        );
      } else if (result.cancelled) {
        setRiotSyncStatus(`Cancelled after ${result.scanned} game(s).`);
      } else {
        setRiotSyncStatus(
          `Refreshed ${result.scanned} existing/new match(es); added ${result.added} new match(es).`,
        );
      }
    } catch (err: unknown) {
      setRiotSyncStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRiotSyncing(false);
    }
  }, []);

  const handleRiotCancel = useCallback(() => {
    void window.api.riotCancelSync();
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

  const handleAccountToggle = useCallback(
    async (puuid: string) => {
      const next = new Set(hiddenAccounts);
      if (!next.delete(puuid)) next.add(puuid);
      setHiddenAccounts(next);
      await window.api.setSetting("hidden_accounts", JSON.stringify([...next]));
      invalidateAccountsCache();
      // A hidden account can't stay the one being looked at
      if (next.has(activeAccount)) setActiveAccount(ALL_ACCOUNTS_SENTINEL);
    },
    [hiddenAccounts, activeAccount, setActiveAccount],
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

  if (loading) return null;

  return (
    <div className="flex min-h-full w-full flex-col gap-5">
      <div className="shrink-0">
        <h1 className="font-display text-[28px] font-bold leading-none text-lol-text-bright">
          Settings
        </h1>
        <p className="mt-2 text-[13px] text-lol-text">
          {SETTINGS_TABS.find((t) => t.id === tab)?.hint}
        </p>
      </div>
      <div
        role="tablist"
        className="flex w-fit shrink-0 flex-wrap gap-1 rounded-xl border border-lol-border/60 bg-black/30 p-1"
      >
        {SETTINGS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`h-9 rounded-lg px-5 text-xs font-bold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-crimson/60 ${
              tab === t.id
                ? "bg-lol-crimson/35 text-lol-text-bright"
                : "text-lol-text hover:bg-white/5 hover:text-lol-text-bright"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        className={`grid grid-cols-1 gap-4 lg:grid-cols-2 ${tab === "general" ? "items-stretch" : "items-start"}`}
      >
        {tab === "accounts" && (
          <Section title="Riot Accounts" className="lg:col-span-2">
            <p className="text-[12.5px] text-lol-text">
              Accounts included when Match-V5 sync searches for recent League matches.
            </p>
            {riotAccounts.length === 0 ? (
              <p className="text-[12.5px] text-lol-text">No Riot accounts configured.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                {riotAccounts.map((account) => {
                  const name = `${account.gameName}#${account.tagLine}`;
                  // The picture and game count come from the saved account of the same Riot ID
                  const saved = savedSummoners.find(
                    (row) =>
                      `${row.game_name}#${row.tag_line}`.toLowerCase() === name.toLowerCase(),
                  );
                  return (
                    <AccountCard
                      key={account.id}
                      icon={saved?.profile_icon ?? null}
                      name={name}
                      detail={
                        <>
                          <span className="rounded border border-lol-border/60 px-1.5 py-px text-[10px] font-bold uppercase tracking-wider">
                            {PLATFORM_LABELS[account.platform] ?? account.platform}
                          </span>
                          {saved ? `${saved.games} games` : "not synced yet"}
                        </>
                      }
                    >
                      <RemoveButton
                        label={`Remove ${name}`}
                        onClick={() => void handleRemoveRiotAccount(account.id)}
                      />
                    </AccountCard>
                  );
                })}
              </div>
            )}
            {riotAccountStatus && <p className="text-xs text-lol-text">{riotAccountStatus}</p>}
          </Section>
        )}

        {tab === "sync" && (
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
            <ActionRow
              name="Repair"
              description="Reassign games to your accounts and rebuild stats."
            >
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
            <ActionRow
              name="Restore older games"
              description="Look again at games skipped earlier."
            >
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
        )}

        {tab === "sync" && (
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
                <Button
                  variant="primary"
                  onClick={handleTimelineStart}
                  disabled={timelineBackfilling}
                >
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
        )}

        {tab === "data" && (
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
        )}

        {tab === "accounts" && (
          <Section
            title="Saved accounts"
            action={
              <Button
                variant="neutral"
                onClick={() => void handleMergeDuplicateAccounts()}
                disabled={mergingDuplicates}
              >
                {mergingDuplicates ? "Merging..." : "Merge duplicate accounts"}
              </Button>
            }
            className="lg:col-span-2"
          >
            <p className="text-[12.5px] text-lol-text mb-4">
              The switch shows or hides an account's games everywhere; nothing is removed. Deleting
              one removes its summoner row and every game stored for it; games still owned by
              another saved account are kept.
            </p>
            {savedSummoners.length === 0 ? (
              <p className="text-[12.5px] text-lol-text">No saved accounts yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                {savedSummoners.map((summoner) => {
                  const name =
                    summoner.game_name && summoner.tag_line
                      ? `${summoner.game_name}#${summoner.tag_line}`
                      : (summoner.game_name ?? summoner.puuid);
                  const confirming = confirmDeleteSummoner === summoner.puuid;
                  const shown = !hiddenAccounts.has(summoner.puuid);
                  const shownCount = savedSummoners.filter(
                    (other) => !hiddenAccounts.has(other.puuid),
                  ).length;
                  return (
                    <AccountCard
                      key={summoner.puuid}
                      icon={summoner.profile_icon}
                      name={name}
                      dimmed={!shown}
                      detail={
                        confirming
                          ? "Delete all its data?"
                          : `${summoner.games} game${summoner.games === 1 ? "" : "s"}${shown ? "" : " · hidden"}`
                      }
                    >
                      {confirming ? (
                        <>
                          <Button
                            variant="destructive"
                            className="!h-7 !px-2"
                            onClick={() => void handleDeleteSummoner(summoner.puuid)}
                          >
                            Delete
                          </Button>
                          <Button
                            variant="neutral"
                            className="!h-7 !px-2"
                            onClick={() => setConfirmDeleteSummoner(null)}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          {/* Hiding the last one would empty every page */}
                          <Switch
                            label={`Show data from ${name}`}
                            checked={shown}
                            disabled={shown && shownCount === 1}
                            onChange={() => void handleAccountToggle(summoner.puuid)}
                          />
                          <RemoveButton
                            label={`Delete ${name} and its games`}
                            onClick={() => setConfirmDeleteSummoner(summoner.puuid)}
                          />
                        </>
                      )}
                    </AccountCard>
                  );
                })}
              </div>
            )}
            {summonerStatus && <p className="mt-3 text-[12.5px] text-lol-text">{summonerStatus}</p>}
          </Section>
        )}

        {/* General */}
        {tab === "general" && (
          <Section title="General">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 border-b border-lol-border/40 py-2.5 transition-colors duration-[120ms] hover:bg-white/[0.02] last:border-b-0">
                <div>
                  <p className="text-[13.5px] text-lol-text-bright">Start with Windows</p>
                  <p className="text-[12.5px] text-lol-text">
                    Open the program in the system tray when you sign in to Windows, so your games
                    are recorded without having to remember to start it.
                    {!autoStartSupported && " Only available in the packaged program."}
                  </p>
                </div>
                <Switch
                  checked={autoStart}
                  onChange={handleAutoStartToggle}
                  disabled={!autoStartSupported}
                />
              </div>

              <div className="flex items-center justify-between gap-4 border-b border-lol-border/40 py-2.5 transition-colors duration-[120ms] hover:bg-white/[0.02] last:border-b-0">
                <div>
                  <p className="text-[13.5px] text-lol-text-bright">Minimize to tray on close</p>
                  <p className="text-[12.5px] text-lol-text">
                    When enabled, the program can keep storing your games even when the window is
                    closed. You can still close the program from the system tray.
                  </p>
                </div>
                <Switch checked={minimizeToTray} onChange={handleToggle} />
              </div>

              <div className="flex items-center justify-between gap-4 border-b border-lol-border/40 py-2.5 transition-colors duration-[120ms] hover:bg-white/[0.02] last:border-b-0">
                <div>
                  <p className="text-[13.5px] text-lol-text-bright">Remember filters and sorting</p>
                  <p className="text-[12.5px] text-lol-text">
                    Reopen every page with the filters, search, and sort order you last used. When
                    off, each page starts on its defaults again every time the program opens.
                  </p>
                </div>
                <Switch checked={rememberFilters} onChange={handleRememberFiltersToggle} />
              </div>

              <div className="flex items-center justify-between gap-4 border-b border-lol-border/40 py-2.5 transition-colors duration-[120ms] hover:bg-white/[0.02] last:border-b-0">
                <div>
                  <p className="text-[13.5px] text-lol-text-bright">Hide remakes</p>
                  <p className="text-[12.5px] text-lol-text">
                    Leave remade games out of the match history. They are still recorded, and were
                    never counted toward your stats either way.
                  </p>
                </div>
                <Switch checked={hideRemakes} onChange={handleHideRemakesToggle} />
              </div>

              <div className="flex items-center justify-between gap-4 border-b border-lol-border/40 py-2.5 transition-colors duration-[120ms] hover:bg-white/[0.02] last:border-b-0">
                <div>
                  <p className="text-[13.5px] text-lol-text-bright">Developer mode</p>
                  <p className="text-[12.5px] text-lol-text">
                    Show testing tools: the Debug Testing tab and sample data on Live Game. Off
                    again after every launch.
                  </p>
                </div>
                <Switch
                  label="Developer mode"
                  checked={devMode}
                  onChange={() => setDevMode(!devMode)}
                />
              </div>
            </div>
          </Section>
        )}

        {/* A single queue has nothing to choose between */}
        {tab === "general" && queues.length > 1 && (
          <Section title="Queues to include">
            <p className="text-[12.5px] text-lol-text">
              Stats and match history only count the queues switched on here. Games from the others
              are still recorded, and can be counted again by switching their queue back on.
            </p>
            <div className="mt-1 grid grid-cols-1 gap-x-6 xl:grid-cols-2">
              {queues.map((q, _i, all) => {
                const shown = !hiddenQueues.has(q);
                const shownCount = all.filter((id) => !hiddenQueues.has(id)).length;
                return (
                  <div
                    key={q}
                    className="flex items-center justify-between gap-4 border-b border-lol-border/40 py-1.5 transition-colors duration-[120ms] hover:bg-white/[0.02] last:border-b-0 xl:py-2"
                  >
                    <p className="text-sm text-lol-text">{QUEUE_LABELS[q] ?? queueLabel(q)}</p>
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
          </Section>
        )}

        {tab === "data" && (
          <StorageFolders onChanged={() => void window.api.listBackups().then(setBackups)} />
        )}

        {/* Backups */}
        {tab === "data" && (
          <Section title="Backups">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 rounded-xl border border-lol-border/50 bg-black/25 px-4 py-3 text-xs transition-colors hover:border-lol-crimson/40">
                <div>
                  <p className="text-[13.5px] text-lol-text-bright">Automatic backups</p>
                  <p className="text-[12.5px] text-lol-text">
                    Keep a daily copy of your database on this computer, plus one before any import
                    or repair. Older copies thin out to weekly and monthly. If the database ever
                    goes missing or won't open, the newest working copy is restored on startup.
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
        )}

        {tab === "changelog" && <ChangelogSection />}
        {tab === "about" && <AboutSection />}
      </div>
    </div>
  );
}
