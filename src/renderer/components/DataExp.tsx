import { useEffect, useState } from "react";
import type { AccountListItem } from "../../shared/api";
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
    window.api
      .listAccountsWithData()
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
      <div>
        <h1 className="font-display text-[30px] font-bold leading-tight tracking-[0.2px] text-lol-text-bright">
          Data
        </h1>
        <p className="mt-1.5 text-lol-text">What is stored locally and when it was last synced</p>
      </div>

      <div className="grid grid-cols-12 gap-5">
        <Panel className="col-span-12 xl:col-span-8">
          <h2 className="mb-4 font-display text-[16px] font-semibold text-lol-text-bright">
            Accounts
          </h2>
          {accounts == null ? (
            <div className="py-6 text-center text-sm text-lol-text">Loading…</div>
          ) : accounts.length === 0 ? (
            <div className="py-6 text-center text-sm text-lol-text">No accounts synced yet.</div>
          ) : (
            <SortableTable<AccountListItem>
              columns={columns}
              rows={accounts}
              defaultSortKey="lastSeen"
            />
          )}
        </Panel>

        <Panel className="col-span-12 xl:col-span-4">
          <h2 className="mb-4 font-display text-[16px] font-semibold text-lol-text-bright">
            Storage
          </h2>
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-lol-border bg-black/10 px-3.5 py-3">
              <span className="text-[12.5px] uppercase tracking-wider text-lol-text">
                Matches stored
              </span>
              <b className="my-0.5 block font-display text-[28px] font-bold leading-tight text-lol-text-bright">
                {dbStats ? formatNumber(dbStats.games) : "—"}
              </b>
            </div>
            <div className="rounded-xl border border-lol-border bg-black/10 px-3.5 py-3">
              <span className="text-[12.5px] uppercase tracking-wider text-lol-text">
                Local database
              </span>
              <b className="my-0.5 block font-display text-[28px] font-bold leading-tight text-lol-text-bright">
                {sizeMb} MB
              </b>
            </div>
            <div className="rounded-xl border border-lol-border bg-black/10 px-3.5 py-3">
              <span className="text-[12.5px] uppercase tracking-wider text-lol-text">Accounts</span>
              <b className="my-0.5 block font-display text-[28px] font-bold leading-tight text-lol-text-bright">
                {accounts ? formatNumber(accounts.length) : "—"}
              </b>
            </div>
          </div>
          <button
            type="button"
            onClick={handleExport}
            className="mt-4 w-full rounded-lg border border-lol-border bg-lol-card px-4 py-2 text-sm font-medium text-lol-text-bright transition-colors hover:border-lol-crimson"
          >
            Export JSON
          </button>
          {exportStatus && <p className="mt-2 text-[12.5px] text-lol-text">{exportStatus}</p>}
        </Panel>
      </div>
    </div>
  );
}
