import {
  useState,
  useEffect,
  useCallback,
  type ButtonHTMLAttributes,
  type FormEvent,
  type ReactNode,
} from "react";
import { useBackfill } from "../hooks/useBackfill";
import { useTimelineBackfill } from "../hooks/useTimelineBackfill";
import { queueLabel } from "../components/QueueSelect";
import { FilterSelect } from "../components/FilterSelect";
import { setRemembering } from "../lib/viewState";
import type { BackupInfo } from "../lib/types";
import {
  RIOT_ACCOUNT_PLATFORMS,
  type ExportProgress,
  type ImportProgress,
  type RiotAccountConfig,
  type RiotSyncProgress,
} from "../../shared/api";
import { Panel } from "./Panel";

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

const PAYLOAD_INFO = [
  {
    category: "Match metadata",
    description: "Stored on games for each imported match.",
    fields: [
      "game_id",
      "queue_id",
      "game_mode",
      "game_creation",
      "game_duration",
      "is_remake",
      "puuid",
      "game_version",
      "source",
      "favorite",
      "raw_gz",
    ],
  },
  {
    category: "Player stats",
    description:
      "One normalized row per participant, including items, spells, runes, and objective stats.",
    fields: [
      "game_id",
      "participant_id",
      "puuid",
      "game_name",
      "tag_line",
      "profile_icon",
      "team_id",
      "player_subteam_id",
      "player_subteam_placement",
      "champion_id",
      "win",
      "kills",
      "deaths",
      "assists",
      "double_kills",
      "triple_kills",
      "quadra_kills",
      "penta_kills",
      "total_damage_dealt",
      "total_damage_taken",
      "true_damage",
      "gold_earned",
      "total_heal",
      "largest_killing_spree",
      "largest_critical_strike",
      "cs",
      "early_surrender",
      "total_damage_dealt_all",
      "true_damage_dealt",
      "physical_damage_dealt",
      "magic_damage_dealt",
      "physical_damage_taken",
      "magic_damage_taken",
      "true_damage_taken",
      "damage_self_mitigated",
      "damage_to_objectives",
      "damage_to_turrets",
      "time_cc_others",
      "total_cc_dealt",
      "longest_alive",
      "killing_sprees",
      "first_blood_kill",
      "first_blood_assist",
      "gold_spent",
      "champ_level",
      "total_minions_killed",
      "neutral_minions_killed",
      "neutral_minions_enemy_jungle",
      "neutral_minions_team_jungle",
      "turret_kills",
      "inhibitor_kills",
      "turret_plates_taken",
      "first_tower_kill",
      "first_tower_assist",
      "first_inhibitor_kill",
      "first_inhibitor_assist",
      "baron_kills",
      "objectives_stolen",
      "objectives_stolen_assists",
      "total_units_healed",
      "vision_score",
      "wards_placed",
      "wards_killed",
      "vision_wards_bought",
      "sight_wards_bought",
      "is_remake",
      "queue_id",
      "game_version",
      "spell1",
      "spell2",
      "rune0",
      "rune1",
      "rune2",
      "rune3",
      "rune4",
      "rune5",
      "primary_style",
      "secondary_style",
      "item0",
      "item1",
      "item2",
      "item3",
      "item4",
      "item5",
      "item6",
      "team_position",
      "score",
    ],
  },
  {
    category: "Timeline events",
    description: "Normalized events fetched from the match timeline.",
    fields: [
      "game_id",
      "event_index",
      "timestamp_ms",
      "event_type",
      "participant_id",
      "killer_id",
      "victim_id",
      "team_id",
      "item_id",
      "skill_slot",
      "level_up_type",
      "ward_type",
      "building_type",
      "monster_type",
      "monster_subtype",
      "raw_json",
    ],
  },
  {
    category: "Timeline frames",
    description: "Periodic per-participant snapshots from the match timeline.",
    fields: [
      "game_id",
      "frame_index",
      "timestamp_ms",
      "participant_id",
      "puuid",
      "level",
      "xp",
      "gold",
      "cs",
      "position_x",
      "position_y",
      "attack_damage",
      "ability_power",
      "armor",
      "magic_resist",
      "attack_speed",
      "ability_haste",
      "move_speed",
      "max_health",
      "current_health",
    ],
  },
  {
    category: "Timeline status",
    description: "Fetch state and compressed source payload for each timeline.",
    fields: ["game_id", "fetched_at", "frame_count", "event_count", "fetch_error", "raw_gz"],
  },
  {
    category: "Summoner",
    description: "Saved account identity and latest profile snapshots.",
    fields: [
      "puuid",
      "game_name",
      "tag_line",
      "summoner_id",
      "account_id",
      "profile_icon",
      "updated_at",
      "platform",
      "summoner_level",
      "ranked_solo_json",
      "ranked_flex_json",
      "mastery_json",
      "last_seen",
    ],
  },
  {
    category: "Settings",
    description: "Application preferences stored as string key-value pairs.",
    fields: ["key", "value"],
  },
] satisfies Array<{ category: string; description: string; fields: string[] }>;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "subtle" | "neutral" | "destructive";
  children: ReactNode;
};

function Button({ variant = "primary", children, className = "", ...props }: ButtonProps) {
  const variantClasses = {
    primary: "border border-lol-crimson bg-lol-crimson text-white hover:bg-lol-crimson/90",
    secondary: "border border-lol-border bg-lol-card text-lol-text-bright hover:border-lol-crimson",
    subtle: "border border-lol-border/70 bg-transparent text-lol-text hover:border-lol-crimson",
    neutral: "border border-lol-border bg-lol-card text-lol-text-bright hover:border-lol-crimson",
    destructive: "border border-lol-loss/60 text-lol-loss hover:border-lol-loss",
  };

  return (
    <button
      {...props}
      className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-[120ms] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-crimson/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-deep)] ${variantClasses[variant]} ${className}`}
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
    <Panel
      className={`relative border-t-2 border-lol-crimson before:pointer-events-none before:absolute before:right-0 before:top-0 before:h-32 before:w-40 before:bg-[radial-gradient(circle_at_top_right,rgba(225,29,72,0.08),transparent_70%)] ${className}`}
    >
      <h2 className="relative z-10 mb-4 font-display text-[16px] font-semibold text-lol-text-bright before:mr-2 before:inline-block before:h-1.5 before:w-1.5 before:rounded-full before:bg-lol-crimson after:mt-2 after:block after:h-px after:w-24 after:bg-gradient-to-r after:from-lol-crimson/70 after:to-transparent">
        {title}
      </h2>
      <div className="flex flex-col gap-3">{children}</div>
    </Panel>
  );
}

export function SettingsExp() {
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
  const [theme, setTheme] = useState<string>(
    () => document.documentElement.getAttribute("data-theme") ?? "experiment",
  );
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
  const [riotSyncing, setRiotSyncing] = useState(false);
  const [riotSyncStatus, setRiotSyncStatus] = useState<string | null>(null);
  const [riotSyncProgress, setRiotSyncProgress] = useState<RiotSyncProgress | null>(null);
  const [riotAccounts, setRiotAccounts] = useState<RiotAccountConfig[]>([]);
  const [riotGameName, setRiotGameName] = useState("");
  const [riotTagLine, setRiotTagLine] = useState("");
  const [riotPlatform, setRiotPlatform] = useState<string>("euw1");
  const [riotAccountStatus, setRiotAccountStatus] = useState<string | null>(null);
  const [resolvedPlatform, setResolvedPlatform] = useState<{
    platform: string;
    route: string;
  } | null>(null);
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
  const [summonerStatus, setSummonerStatus] = useState<string | null>(null);
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
      window.api.getSetting("theme"),
    ]).then(([startup, startupSupported, tray, hidden, remakes, backup, remember, storedTheme]) => {
      setTheme(storedTheme === "test" || storedTheme === "experiment" ? storedTheme : "experiment");
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
    setRiotSyncing(true);
    setRiotSyncStatus(null);
    setRiotSyncProgress(null);
    try {
      const result = await window.api.syncRiotHistory();
      if ("error" in result) {
        setRiotSyncStatus(`Error: ${result.error}`);
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

  const handleAddRiotAccount = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setRiotAccountStatus(null);
      try {
        const accounts = await window.api.addRiotAccount({
          gameName: riotGameName,
          tagLine: riotTagLine,
          platform: riotPlatform,
        });
        setRiotAccounts(accounts);
        setRiotGameName("");
        setRiotTagLine("");
        setRiotAccountStatus("Riot account added.");
      } catch (err: unknown) {
        setRiotAccountStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [riotGameName, riotPlatform, riotTagLine],
  );

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
      if ("error" in result) {
        setRiotSyncStatus(`Error: ${result.error}`);
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
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
      <div>
        <h1 className="font-display text-[30px] font-bold leading-tight tracking-[0.2px] text-lol-text-bright">
          Settings
        </h1>
        <p className="mt-1.5 text-lol-text">
          Control synchronization, storage, and application behavior
        </p>
      </div>

      <Section
        title="Appearance"
        className="[&>h2]:before:bg-lol-crimson border-t-lol-crimson before:bg-[radial-gradient(circle_at_top_right,rgba(225,29,72,0.08),transparent_70%)]"
      >
        <div className="flex items-center justify-between gap-4 border-b border-lol-border/40 py-2.5 transition-colors duration-[120ms] hover:bg-white/[0.02] last:border-b-0">
          <label htmlFor="theme-select" className="text-[13.5px] text-lol-text-bright">
            Theme
          </label>
          <FilterSelect
            value={theme}
            onChange={(value) => {
              if (
                value !== "test" &&
                value !== "experiment" &&
                value !== "experiment2" &&
                value !== "experiment3" &&
                value !== "experiment4" &&
                value !== "experiment5"
              )
                return;
              setTheme(value);
              void window.api.setSetting("theme", value);
              document.documentElement.setAttribute("data-theme", value);
            }}
            placeholder="First Theme"
            title="Theme"
            className="w-48"
            options={[
              { value: "experiment", label: "First Theme" },
              { value: "test", label: "Second Theme" },
              { value: "experiment2", label: "Third Theme" },
              { value: "experiment3", label: "Fourth Theme" },
              { value: "experiment4", label: "Fifth Theme" },
              { value: "experiment5", label: "Sixth Theme" },
            ]}
          />
        </div>
      </Section>
      <Section
        title="Riot Accounts"
        className="[&>h2]:before:bg-lol-violet border-t-lol-violet before:bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.08),transparent_70%)]"
      >
        <p className="text-[12.5px] text-lol-text">
          Accounts included when Match-V5 sync searches for recent League matches.
        </p>
        {riotAccounts.length === 0 ? (
          <p className="text-[12.5px] text-lol-text">No Riot accounts configured.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-lol-border">
            {riotAccounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between gap-4 border-b border-lol-border/40 px-3 py-2 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] text-lol-text-bright">
                    {account.gameName}#{account.tagLine}
                  </p>
                  <p className="text-[11px] uppercase tracking-wide text-lol-text">
                    {PLATFORM_LABELS[account.platform] ?? account.platform}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${account.gameName}#${account.tagLine}`}
                  className="shrink-0 rounded border border-lol-loss/60 px-2 py-1 text-sm text-lol-loss hover:border-lol-loss"
                  onClick={() => void handleRemoveRiotAccount(account.id)}
                >
                  X
                </button>
              </div>
            ))}
          </div>
        )}
        <form
          className="grid gap-3 md:grid-cols-[1fr_1fr_10rem_auto]"
          onSubmit={handleAddRiotAccount}
        >
          <label className="flex flex-col gap-1 text-[11px] text-lol-text">
            Game Name
            <input
              value={riotGameName}
              onChange={(event) => setRiotGameName(event.target.value)}
              className="rounded border border-lol-border bg-lol-card px-3 py-2 text-[13px] text-lol-text-bright outline-none focus:border-lol-crimson"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-lol-text">
            Tag Line
            <input
              value={riotTagLine}
              onChange={(event) => setRiotTagLine(event.target.value)}
              className="rounded border border-lol-border bg-lol-card px-3 py-2 text-[13px] text-lol-text-bright outline-none focus:border-lol-crimson"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-lol-text">
            Platform
            <select
              value={riotPlatform}
              onChange={(event) => setRiotPlatform(event.target.value)}
              className="rounded border border-lol-border bg-lol-card px-3 py-2 text-[13px] text-lol-text-bright outline-none focus:border-lol-crimson"
            >
              {RIOT_ACCOUNT_PLATFORMS.map((platform) => (
                <option key={platform} value={platform}>
                  {PLATFORM_LABELS[platform] ?? platform}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" className="self-end">
            Add account
          </Button>
        </form>
        {riotAccountStatus && <p className="text-xs text-lol-text">{riotAccountStatus}</p>}
      </Section>

      <Section
        title="League history sync"
        className="[&>h2]:before:bg-lol-gold border-t-lol-gold before:bg-[radial-gradient(circle_at_top_right,rgba(234,179,8,0.08),transparent_70%)]"
      >
        <div className="flex items-center gap-2 mt-3">
          <Button variant="primary" onClick={handleBackfill} disabled={anyRunning}>
            {backfilling ? "Working..." : "Backfill"}
          </Button>
          <Button
            variant="secondary"
            onClick={handleForceFullBackfill}
            disabled={anyRunning}
            title="Walk the entire Riot history from page 0, ignoring the cached completion flag. Use this to test whether the current cap is our page limit or Riot's own cutoff."
          >
            Force Backfill
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
          <Button
            variant="subtle"
            type="button"
            onClick={handleTeamsBackfill}
            disabled={anyRunning}
          >
            Backfill teams/bans (local)
          </Button>
          <Button
            variant="subtle"
            type="button"
            onClick={handleTimelineFieldsBackfill}
            disabled={anyRunning}
          >
            Backfill timeline fields (local)
          </Button>
        </div>
        {backfillStatus && <p className="text-[12.5px] text-lol-text mt-2">{backfillStatus}</p>}
        <div className="flex items-center justify-between gap-3 py-2">
          <div>
            <p className="text-sm font-medium text-lol-text-bright">Riot Match-V5 sync</p>
            <p className="text-xs text-lol-text">
              Pull the latest matches through the Riot API to capture pings, spell casts, and
              challenge metrics that LCU does not provide. Only works for accounts with a configured
              Riot ID.
            </p>
            <p className="mt-1 text-[11px] text-amber-300">
              Re-fetches existing games to backfill pings, casts, and challenges. May take several
              minutes.
            </p>
            <p className="mt-1 text-[11px] text-lol-text">
              Platform:{" "}
              {resolvedPlatform
                ? `${resolvedPlatform.platform} → ${resolvedPlatform.route}`
                : "not configured"}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              className="rounded border border-lol-border px-3 py-1.5 text-xs text-lol-text-bright hover:bg-white/5"
              onClick={handleRiotSync}
              disabled={riotSyncing}
            >
              {riotSyncing ? "Syncing..." : "Sync now"}
            </button>
            <button
              className="rounded border border-amber-400/50 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-400/10"
              onClick={handleRiotRefresh}
              disabled={riotSyncing}
            >
              {riotSyncing ? "Refreshing..." : "Refresh existing (Match-V5)"}
            </button>
            {riotSyncing && (
              <button
                className="rounded border border-lol-loss/60 px-3 py-1.5 text-xs text-lol-loss hover:border-lol-loss"
                onClick={handleRiotCancel}
              >
                Stop
              </button>
            )}
          </div>
        </div>
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
                className="h-full bg-emerald-500 transition-all"
                style={{
                  width: `${riotSyncProgress ? (riotSyncProgress.currentGame / Math.max(1, riotSyncProgress.totalGames)) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}
        {riotSyncStatus && <p className="mt-1 text-xs text-lol-text">{riotSyncStatus}</p>}
      </Section>

      <Section
        title="Timeline backfill"
        className="[&>h2]:before:bg-[#10b981] border-t-[#10b981] before:bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.08),transparent_70%)]"
      >
        <p className="text-[12.5px] text-lol-text">
          Fetches detailed timeline data (gold, items, abilities over time) for stored matches.
          Skips Arena and Mayhem automatically.
        </p>
        <Panel className="flex flex-col gap-3 border-t-2 border-t-[#10b981] bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.08),transparent_70%)]">
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
              className="w-24 rounded-lg border border-lol-border bg-lol-card px-3 py-2 text-right text-sm text-lol-text-bright outline-none transition-colors duration-[120ms] hover:border-lol-border/80 focus:border-lol-crimson"
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
                  className="block h-full rounded-full bg-lol-gold"
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
        </Panel>
      </Section>

      <Section
        title="Data Management"
        className="[&>h2]:before:bg-[#3b82f6] border-t-[#3b82f6] before:bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.08),transparent_70%)]"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 border-b border-lol-border/40 px-3 py-2 transition-colors duration-[120ms] hover:bg-white/[0.02] last:border-b-0 xl:px-4 xl:py-3">
            <div>
              <p className="text-[13.5px] text-lol-text-bright">Export data</p>
              <p className="text-[12.5px] text-lol-text">
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
          {exporting && exportProgress && (
            <div className="space-y-2 text-[12.5px] text-lol-text">
              <div className="h-[5px] overflow-hidden rounded-full bg-white/[0.05]">
                <i
                  className={`block h-full rounded-full bg-lol-gold ${
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

          <div className="border-t border-lol-border/40" />

          <div className="flex items-center justify-between gap-4 border-b border-lol-border/40 px-3 py-2 transition-colors duration-[120ms] hover:bg-white/[0.02] last:border-b-0 xl:px-4 xl:py-3">
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
                <i className="block h-full w-full animate-pulse rounded-full bg-lol-gold" />
              </div>
              <p>
                {importProgress.current.toLocaleString()}{" "}
                {IMPORT_PROGRESS_LABELS[importProgress.phase]}
              </p>
            </div>
          )}
        </div>
      </Section>

      <Section
        title="Saved accounts"
        className="[&>h2]:before:bg-lol-violet border-t-lol-violet before:bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.08),transparent_70%)]"
      >
        <p className="text-[12.5px] text-lol-text mb-4">
          Accounts that can appear in the Local Account and Match History views. Deleting one
          removes its summoner row and every game stored for it; games still owned by another saved
          account are kept.
        </p>
        {savedSummoners.length === 0 ? (
          <p className="text-[12.5px] text-lol-text">No saved accounts yet.</p>
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
                  className="flex items-center justify-between gap-4 gap-3 rounded-lg border border-lol-border bg-lol-card px-3 py-2 transition-colors duration-[120ms] hover:bg-white/[0.02] last:border-b-0 xl:px-4 xl:py-3"
                >
                  <div className="min-w-0">
                    <p className="text-[12.5px] text-lol-text-bright truncate">{name}</p>
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
        {summonerStatus && <p className="mt-3 text-[12.5px] text-lol-text">{summonerStatus}</p>}
      </Section>

      {/* General */}
      <Section
        title="General"
        className="[&>h2]:before:bg-[#94a3b8] border-t-[#94a3b8] before:bg-[radial-gradient(circle_at_top_right,rgba(148,163,184,0.08),transparent_70%)]"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 border-b border-lol-border/40 py-2.5 transition-colors duration-[120ms] hover:bg-white/[0.02] last:border-b-0">
            <div>
              <p className="text-[13.5px] text-lol-text-bright">Start with Windows</p>
              <p className="text-[12.5px] text-lol-text">
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

          <div className="border-t border-lol-border/40" />

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

          <div className="border-t border-lol-border/40" />

          <div className="flex items-center justify-between gap-4 border-b border-lol-border/40 py-2.5 transition-colors duration-[120ms] hover:bg-white/[0.02] last:border-b-0">
            <div>
              <p className="text-[13.5px] text-lol-text-bright">Remember filters and sorting</p>
              <p className="text-[12.5px] text-lol-text">
                Reopen every page with the filters, search, and sort order you last used. When off,
                each page starts on its defaults again every time the program opens.
              </p>
            </div>
            <Switch checked={rememberFilters} onChange={handleRememberFiltersToggle} />
          </div>

          <div className="border-t border-lol-border/40" />

          <div className="flex items-center justify-between gap-4 border-b border-lol-border/40 py-2.5 transition-colors duration-[120ms] hover:bg-white/[0.02] last:border-b-0">
            <div>
              <p className="text-[13.5px] text-lol-text-bright">Hide remakes</p>
              <p className="text-[12.5px] text-lol-text">
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
              <div className="border-t border-lol-border/40" />

              <div>
                <div className="h-px bg-gradient-to-r from-lol-gold/30 via-lol-gold/10 to-transparent" />
                <p className="text-xs font-bold uppercase tracking-wider text-lol-text">
                  Queues to include
                </p>
                <p className="text-[12.5px] text-lol-text">
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
                        className="flex items-center justify-between gap-4 border-b border-lol-border/40 py-1.5 transition-colors duration-[120ms] hover:bg-white/[0.02] last:border-b-0 xl:py-2"
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
      <Section
        title="Backups"
        className="[&>h2]:before:bg-lol-crimson border-t-lol-crimson before:bg-[radial-gradient(circle_at_top_right,rgba(225,29,72,0.08),transparent_70%)]"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 border-b border-lol-border/40 py-2.5 transition-colors duration-[120ms] hover:bg-white/[0.02] last:border-b-0">
            <div>
              <p className="text-[13.5px] text-lol-text-bright">Automatic backups</p>
              <p className="text-[12.5px] text-lol-text">
                Keep a daily copy of your database on this computer, plus one before any import or
                repair. Older copies thin out to weekly and monthly. If the database ever goes
                missing or won't open, the newest working copy is restored on startup.
              </p>
            </div>
            <Switch checked={autoBackup} onChange={handleAutoBackupToggle} />
          </div>

          <div className="border-t border-lol-border/40" />

          {backups.length === 0 ? (
            <p className="text-[12.5px] text-lol-text">No backups yet.</p>
          ) : (
            <div className="space-y-1">
              {backups.map((backup) => (
                <div
                  key={backup.file}
                  className="flex items-center justify-between gap-4 gap-3 border-b border-lol-border/40 px-3 py-2 text-xs transition-colors duration-[120ms] hover:bg-white/[0.02] last:border-b-0 xl:px-4 xl:py-3"
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
          {backupStatus && <p className="text-[12.5px] text-lol-text">{backupStatus}</p>}
        </div>
      </Section>

      <Section
        title="Stored Data / Payload Information"
        className="[&>h2]:before:bg-[#a855f7] border-t-[#a855f7] before:bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.08),transparent_70%)]"
      >
        <p className="text-xs text-lol-text mb-3">
          Fields stored per game from LCU / Riot Match-V5 ingestion. Use this to see what data is
          available for analysis.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PAYLOAD_INFO.map((group) => (
            <div
              key={group.category}
              className="rounded-lg border border-lol-border bg-black/20 p-3"
            >
              <h4 className="text-sm font-semibold text-lol-text-bright mb-1">{group.category}</h4>
              <p className="text-[11px] text-lol-text mb-2">{group.description}</p>
              <ul className="flex flex-wrap gap-1.5">
                {group.fields.map((field) => (
                  <li
                    key={field}
                    className="rounded border border-lol-border/50 bg-black/30 px-1.5 py-0.5 text-[10px] text-lol-text-bright tabular-nums"
                  >
                    {field}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* Credits */}
      <Section
        title="Credits & Acknowledgements"
        className="[&>h2]:before:bg-lol-gold border-t-lol-gold before:bg-[radial-gradient(circle_at_top_right,rgba(234,179,8,0.08),transparent_70%)]"
      >
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
              Rift Records
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
