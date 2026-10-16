import { useEffect, useState } from "react";
import type { AccountListItem } from "../../shared/api";
import { getAccountsWithData } from "../hooks/useChampions";
import { formatNumber, formatTimeAgo } from "../lib/format";
import { Panel } from "./Panel";
import { SortableTable, type SortableColumn } from "./SortableTable";
import SummonerIcon from "./SummonerIcon";

export function DataExp() {
  const [accounts, setAccounts] = useState<AccountListItem[] | null>(null);
  const [dbStats, setDbStats] = useState<{ games: number; sizeBytes: number } | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAccountsWithData()
      .then((data) => {
        if (!cancelled) setAccounts(data);
      })
      .catch(() => {
        if (!cancelled) setAccounts([]);
      });
    window.api
      .getDbStats()
      .then((data) => {
        if (!cancelled) setDbStats(data);
      })
      .catch(() => {
        if (!cancelled) setDbStats({ games: 0, sizeBytes: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleExport = async () => {
    const result = await window.api.exportData();
    if (result.success) {
      const filename = result.path?.split(/[\\/]/).pop() ?? "backup.json";
      setExportStatus(`Exported ${result.games ?? 0} games to ${filename}`);
    } else if (result.error) {
      setExportStatus(result.error);
    }
  };

  const sizeMb = dbStats ? (dbStats.sizeBytes / (1024 * 1024)).toFixed(1) : "—";
  const totalMatches = accounts?.reduce((sum, account) => sum + account.gameCount, 0) ?? 0;
  const latestSync = accounts?.reduce(
    (latest, account) => Math.max(latest, account.lastSeen ?? 0),
    0,
  );
  const showAccountKpis = accounts != null && accounts.length >= 3;
  const accountKpis: Array<{ label: string; value: string; width: number; color: string }> = [
    {
      label: "Accounts",
      value: formatNumber(accounts?.length ?? 0),
      width: Math.min((accounts?.length ?? 0) * 20, 100),
      color: "var(--theme-crimson)",
    },
    {
      label: "Matches",
      value: formatNumber(totalMatches),
      width: Math.min(totalMatches, 100),
      color: "var(--theme-gold)",
    },
    {
      label: "Latest sync",
      value: latestSync ? formatTimeAgo(latestSync) : "—",
      width: latestSync ? 100 : 0,
      color: "var(--theme-assist)",
    },
  ];

  const columns: Array<SortableColumn<AccountListItem>> = [
    {
      key: "account",
      label: "Account",
      defaultDir: "asc",
      sortValue: (row) => (row.gameName ?? "") + (row.tagLine ?? ""),
      render: (row) => (
        <div className="nm">
          <SummonerIcon iconId={row.profileIconId} size={30} className="rounded-lg" />
          <span>
            {row.gameName ?? "Unknown"}
            {row.tagLine ? `#${row.tagLine}` : ""}
          </span>
        </div>
      ),
    },
    {
      key: "games",
      label: "Games stored",
      sortValue: (row) => row.gameCount,
      render: (row) => formatNumber(row.gameCount),
    },
    {
      key: "lastSeen",
      label: "Last sync",
      sortValue: (row) => row.lastSeen ?? 0,
      render: (row) => (row.lastSeen ? formatTimeAgo(row.lastSeen) : "—"),
    },
    {
      key: "status",
      label: "Status",
      sortValue: (row) => (row.lastSeen && Date.now() - row.lastSeen < 86400000 ? 1 : 0),
      render: (row) => {
        const fresh = row.lastSeen != null && Date.now() - row.lastSeen < 86400000;
        return (
          <span className={fresh ? "text-lol-win" : "text-lol-gold"}>
            {fresh ? "Up to date" : "Stale"}
          </span>
        );
      },
    },
  ];

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
      <div className="shrink-0 overflow-hidden rounded-xl border border-lol-border border-t-[3px] border-t-[var(--theme-crimson)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-crimson)_10%,transparent),transparent_46%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] px-5 py-4 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-10 before:bg-[linear-gradient(180deg,color-mix(in_oklab,var(--theme-crimson)_5%,transparent),transparent)]">
        <h1 className="relative flex items-center font-display text-[30px] font-bold leading-tight tracking-[0.2px] text-lol-text-bright">
          <span className="mr-2 h-2.5 w-2.5 rotate-45 bg-lol-crimson shadow-[0_0_8px_rgba(229,72,63,0.45)]" />
          <span className="relative pb-2 after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:bg-gradient-to-r after:from-lol-crimson after:to-transparent">
            Data
          </span>
        </h1>
        <p className="relative mt-1.5 pl-4 text-lol-text">
          What is stored locally and when it was last synced
        </p>
      </div>

      <div className="grid grid-cols-12 gap-5">
        <Panel className="col-span-12 border-t-[3px] border-t-[var(--theme-crimson)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-crimson)_8%,transparent),transparent_42%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] xl:col-span-8">
          <h2 className="mb-4 flex items-center font-display text-[16px] font-semibold text-lol-text-bright">
            <span className="mr-2 h-1.5 w-1.5 rotate-45 bg-lol-crimson" />
            <span className="relative pb-1 after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:bg-gradient-to-r after:from-lol-crimson after:to-transparent">
              Accounts
            </span>
          </h2>
          {accounts == null ? (
            <div className="relative overflow-hidden rounded-lg border border-lol-border border-t-[3px] border-t-[var(--theme-crimson)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-crimson)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] p-8 text-center">
              <h3 className="relative mb-2 pl-4 text-left text-xs font-bold uppercase tracking-wider text-lol-gold before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
                Accounts
              </h3>
              <p className="relative text-sm text-lol-text">Loading…</p>
            </div>
          ) : accounts.length === 0 ? (
            <div className="relative overflow-hidden rounded-lg border border-lol-border border-t-[3px] border-t-[var(--theme-crimson)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-crimson)_8%,transparent),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] p-8 text-center">
              <h3 className="relative mb-2 pl-4 text-left text-xs font-bold uppercase tracking-wider text-lol-gold before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
                Accounts
              </h3>
              <p className="relative text-sm text-lol-text">No accounts synced yet.</p>
            </div>
          ) : (
            <>
              {showAccountKpis && (
                <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {accountKpis.map(({ label, value, width, color }) => (
                    <div
                      key={label}
                      className="rounded-md border border-lol-border/60 bg-black/10 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[10px] font-bold uppercase tracking-wider text-lol-text">
                          {label}
                        </span>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-lol-text-bright">
                          {value}
                        </span>
                      </div>
                      <div className="mt-1 h-2 w-[72px] overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${width}%`, backgroundColor: color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <SortableTable<AccountListItem>
                columns={columns}
                rows={accounts}
                defaultSortKey="lastSeen"
                className="data-table [&_tbody_td]:border-t-[1px] [&_tbody_td]:border-[rgba(255,255,255,0.04)] [&_tbody_td]:text-right [&_tbody_td]:tabular-nums [&_tbody_tr]:transition-colors [&_tbody_tr]:duration-[120ms] [&_tbody_tr:hover]:bg-white/[0.025]"
              />
            </>
          )}
        </Panel>

        <Panel className="col-span-12 border-t-[3px] border-t-lol-gold bg-[radial-gradient(circle_at_top_right,rgba(201,164,92,0.08),transparent_42%)] xl:col-span-4">
          <h2 className="mb-4 flex items-center font-display text-[16px] font-semibold text-lol-text-bright">
            <span className="mr-2 h-1.5 w-1.5 rotate-45 bg-lol-gold" />
            <span className="relative pb-1 after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:bg-gradient-to-r after:from-lol-gold after:to-transparent">
              Storage
            </span>
          </h2>
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-lol-border border-t-[3px] border-t-lol-crimson bg-[radial-gradient(circle_at_top_right,rgba(229,72,63,0.08),transparent_55%)] px-3.5 py-3 transition-colors duration-[120ms] hover:bg-white/[0.02]">
              <span className="flex items-center gap-2 text-[12.5px] uppercase tracking-wider text-lol-text">
                <span className="h-1.5 w-1.5 rounded-full bg-lol-crimson" />
                Matches stored
              </span>
              <b className="my-0.5 block font-display text-[28px] font-bold leading-tight text-lol-text-bright">
                {dbStats ? formatNumber(dbStats.games) : "—"}
              </b>
            </div>
            <div className="rounded-xl border border-lol-border border-t-[3px] border-t-lol-win bg-[radial-gradient(circle_at_top_right,rgba(74,222,128,0.08),transparent_55%)] px-3.5 py-3 transition-colors duration-[120ms] hover:bg-white/[0.02]">
              <span className="flex items-center gap-2 text-[12.5px] uppercase tracking-wider text-lol-text">
                <span className="h-1.5 w-1.5 rounded-full bg-lol-win" />
                Local database
              </span>
              <b className="my-0.5 block font-display text-[28px] font-bold leading-tight text-lol-text-bright">
                {sizeMb} MB
              </b>
            </div>
            <div className="rounded-xl border border-lol-border border-t-[3px] border-t-lol-assist bg-[radial-gradient(circle_at_top_right,rgba(77,184,255,0.08),transparent_55%)] px-3.5 py-3 transition-colors duration-[120ms] hover:bg-white/[0.02]">
              <span className="flex items-center gap-2 text-[12.5px] uppercase tracking-wider text-lol-text">
                <span className="h-1.5 w-1.5 rounded-full bg-lol-assist" />
                Accounts
              </span>
              <b className="my-0.5 block font-display text-[28px] font-bold leading-tight text-lol-text-bright">
                {accounts ? formatNumber(accounts.length) : "—"}
              </b>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-lol-border border-t-[3px] border-t-lol-gold bg-[radial-gradient(circle_at_top_right,rgba(201,164,92,0.08),transparent_55%)] p-2">
            <button
              type="button"
              onClick={handleExport}
              className="w-full rounded-lg border border-lol-border bg-lol-card px-4 py-2 text-sm font-medium text-lol-text-bright transition-colors duration-[120ms] hover:border-lol-crimson"
            >
              Export JSON
            </button>
          </div>
          {exportStatus && <p className="mt-2 text-[12.5px] text-lol-text">{exportStatus}</p>}
        </Panel>
      </div>
    </div>
  );
}
