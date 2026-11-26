// The Storage tab: what is on disk, how big it is, and the ways to copy it out or back in
import { useEffect, useState, type ReactNode } from "react";
import type { AccountListItem, BackupInfo, DbStats } from "../../shared/api";
import { useIpc } from "../hooks/useIpc";
import { formatNumber, formatTimeAgo } from "../lib/format";
import SummonerIcon from "./SummonerIcon";
import { FilterChip } from "./FilterChip";
import { Title } from "./live/shared";

const TABLE_LABELS: Record<string, string> = {
  games: "Matches",
  match_participants: "Players in matches",
  match_participant_augments: "Augment picks",
  match_participant_challenges: "Challenge values",
  match_teams: "Team results",
  match_bans: "Bans",
  match_timeline_status: "Timelines",
  match_timeline_frames: "Timeline frames",
  match_timeline_events: "Timeline events",
  player_stats: "Your stat lines",
  tracked_game_stats: "Stat lines per account",
  game_augments: "Your augments",
  live_stat_peaks: "Live stat peaks",
  live_game_data: "Live game recordings",
  post_game_data: "Post-game data",
  summoner: "Accounts",
  settings: "Settings",
  ignored_games: "Ignored matches",
  riot_sync_state: "Sync positions",
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub: string }) {
  return (
    <div className="app-tile min-w-0 !p-4">
      <div className="text-[10px] font-bold uppercase tracking-widest text-lol-gold">{label}</div>
      <div className="mt-1 font-display text-[26px] font-bold tabular-nums text-lol-text-bright">
        {value}
      </div>
      <div className="text-[12px] text-lol-text">{sub}</div>
    </div>
  );
}

export function DataExp() {
  const stats = useIpc<DbStats>(() => window.api.getDbStats(), []);
  const accounts = useIpc<AccountListItem[]>(() => window.api.listAccountsWithData(), []);
  const backups = useIpc<BackupInfo[]>(() => window.api.listBackups(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const refetchStats = stats.refetch;
  const refetchAccounts = accounts.refetch;
  const refetchBackups = backups.refetch;
  const refresh = () => {
    refetchStats();
    refetchAccounts();
    refetchBackups();
  };

  useEffect(() => {
    const show = (p: { label: string; current: number; total: number }) =>
      setProgress(
        p.total
          ? `${p.label}: ${formatNumber(p.current)} / ${formatNumber(p.total)}`
          : `${p.label}…`,
      );
    const offExport = window.api.onExportProgress(show);
    const offImport = window.api.onImportProgress(show);
    return () => {
      offExport();
      offImport();
    };
  }, []);

  const run = async (name: string, action: () => Promise<string | null>) => {
    setBusy(name);
    setMessage(null);
    try {
      setMessage(await action());
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
      setProgress(null);
      refresh();
    }
  };

  const actions = [
    {
      name: "export",
      label: "Export backup file",
      hint: "Everything in one portable file. Follows the Mayhem / All mode switch.",
      run: async () => {
        const r = await window.api.exportData();
        if (r.success) return `Exported ${formatNumber(r.games ?? 0)} games to ${r.path}`;
        return r.error ?? null;
      },
    },
    {
      name: "import",
      label: "Import backup file",
      hint: "Adds the games from a backup file. A snapshot is taken first.",
      run: async () => {
        const r = await window.api.importData();
        if (r.success) {
          return `Imported ${formatNumber(r.imported ?? 0)} of ${formatNumber(r.total ?? 0)} games, ${formatNumber(r.skipped ?? 0)} already stored or skipped`;
        }
        return r.error ?? null;
      },
    },
    {
      name: "snapshot",
      label: "Take snapshot now",
      hint: "A copy of the whole database in the backups folder.",
      run: async () => {
        const r = await window.api.createBackup();
        return r.success ? `Snapshot saved: ${r.backup?.file}` : (r.error ?? "Snapshot failed");
      },
    },
  ];

  const s = stats.data;
  const day = (time: number | null) => (time ? new Date(time).toLocaleDateString() : "—");
  const maxRows = s?.tables[0]?.rows || 1;

  return (
    <div className="flex min-h-full w-full flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-bold leading-none text-lol-text-bright">
            Storage
          </h1>
          <p className="mt-2 text-[13px] text-lol-text">
            Everything Rift Records keeps on this computer
          </p>
        </div>
        <FilterChip onClick={() => window.api.openBackupFolder()}>Open backups folder</FilterChip>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          label="Matches"
          value={s ? formatNumber(s.games) : "—"}
          sub={s ? `${day(s.oldestGame)} – ${day(s.newestGame)}` : ""}
        />
        <Stat
          label="Database"
          value={s ? formatBytes(s.sizeBytes) : "—"}
          sub={s ? `${formatBytes(s.freeBytes)} free inside the file` : ""}
        />
        <Stat
          label="Snapshots"
          value={s ? formatBytes(s.backupBytes) : "—"}
          sub={backups.data ? `${backups.data.length} kept` : ""}
        />
        <Stat
          label="Image cache"
          value={s ? formatBytes(s.imageBytes) : "—"}
          sub="icons downloaded once"
        />
      </div>

      <div className="grid shrink-0 grid-cols-1 gap-3 md:grid-cols-3">
        {actions.map((action) => (
          <button
            key={action.name}
            type="button"
            disabled={busy !== null}
            onClick={() => run(action.name, action.run)}
            className="app-tile !p-4 text-left transition-colors hover:border-lol-crimson/60 disabled:opacity-50"
          >
            <div className="font-display text-[15px] font-bold text-lol-text-bright">
              {busy === action.name ? "Working…" : action.label}
            </div>
            <div className="mt-1 text-[12px] text-lol-text">{action.hint}</div>
          </button>
        ))}
      </div>
      {(progress || message) && (
        <p role="status" className="text-[13px] text-lol-text-bright">
          {progress ?? message}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div className="app-tile min-w-0">
          <Title>What is stored</Title>
          {s?.tables.map((table) => (
            <div
              key={table.name}
              className="grid grid-cols-[minmax(0,1fr)_8rem_6rem] items-center gap-3 py-1.5 text-[13px]"
            >
              <span className="truncate text-lol-text-bright">
                {TABLE_LABELS[table.name] ?? table.name}
              </span>
              <span className="h-1 overflow-hidden rounded-full bg-white/[0.07]">
                <span
                  className="block h-full bg-lol-crimson"
                  // Square root, so small tables stay visible next to millions of events
                  style={{ width: `${Math.sqrt(table.rows / maxRows) * 100}%` }}
                />
              </span>
              <span className="text-right tabular-nums text-lol-text">
                {formatNumber(table.rows)}
              </span>
            </div>
          ))}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <div className="app-tile">
            <Title aside={<span className="text-[12px] text-lol-text">Restore from Settings</span>}>
              Snapshots
            </Title>
            {backups.data?.length === 0 && (
              <p className="text-[13px] text-lol-text">No snapshots yet.</p>
            )}
            {backups.data?.map((backup) => (
              <div
                key={backup.file}
                className="grid grid-cols-[minmax(0,1fr)_6rem_6rem_6rem] gap-3 border-b border-lol-border/30 py-1.5 text-[13px] last:border-0"
              >
                <span className="text-lol-text-bright" title={backup.file}>
                  {new Date(backup.created).toLocaleString()}
                </span>
                <span className="text-lol-text">{backup.reason}</span>
                <span className="text-right tabular-nums text-lol-text">
                  {backup.games == null ? "unreadable" : `${formatNumber(backup.games)} games`}
                </span>
                <span className="text-right tabular-nums text-lol-text">
                  {formatBytes(backup.size)}
                </span>
              </div>
            ))}
          </div>

          <div className="app-tile">
            <Title>Accounts</Title>
            {accounts.data?.map((account) => (
              <div
                key={account.puuid}
                className="grid grid-cols-[2rem_minmax(0,1fr)_6rem_6rem] items-center gap-3 py-1 text-[13px]"
              >
                <SummonerIcon iconId={account.profileIconId} size={28} className="rounded-lg" />
                <span className="truncate text-lol-text-bright">
                  {account.gameName ?? "Unknown"}
                  {account.tagLine ? `#${account.tagLine}` : ""}
                </span>
                <span className="text-right tabular-nums text-lol-text">
                  {formatNumber(account.gameCount)} games
                </span>
                <span className="text-right text-lol-text">
                  {account.lastSeen ? formatTimeAgo(account.lastSeen) : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
