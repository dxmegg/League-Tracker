import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { AccountListItem } from "../../shared/api";
import { useBackfill } from "../hooks/useBackfill";
import { useActiveAccount } from "../hooks/useActiveAccount";
import { useLcuStatus } from "../hooks/useLcuStatus";
import { ALL_ACCOUNTS_SENTINEL } from "../lib/accountsEvent";
import type { LcuStatus } from "../lib/types";
import { RefreshIcon } from "./icons";

const statusColors: Record<LcuStatus, string> = {
  connected: "bg-lol-win",
  ingame: "bg-sky-400",
  connecting: "bg-amber-500",
  disconnected: "bg-lol-loss",
};

const statusLabels: Record<LcuStatus, string> = {
  connected: "Connected",
  ingame: "In Game",
  connecting: "Connecting...",
  disconnected: "Disconnected",
};

const mainTabs = [
  { to: "/home", label: "HOME" },
  { to: "/local", label: "LOCAL ACCOUNT" },
  { to: "/history", label: "HISTORY" },
  { to: "/champions", label: "CHAMPIONS" },
  { to: "/items", label: "ITEMS" },
  { to: "/augments", label: "AUGMENTS" },
  { to: "/runes", label: "RUNES" },
  { to: "/friends", label: "FRIENDS & FOES" },
  { to: "/trends", label: "TRENDS" },
  { to: "/records", label: "RECORDS" },
  { to: "/data", label: "DATA" },
];

const ACTIVE_TAIL: Record<string, string> = {
  "/data": "total-stats",
};

export function Sidebar() {
  const { pathname } = useLocation();
  const status = useLcuStatus();
  const { running: backfilling } = useBackfill();
  const [refreshing, setRefreshing] = useState(false);
  const [activeAccount, setActiveAccount] = useActiveAccount();
  const [savedAccounts, setSavedAccounts] = useState<AccountListItem[]>([]);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const accountsWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.api
      .listAccountsWithData()
      .then(setSavedAccounts)
      .catch(() => setSavedAccounts([]));
  }, []);

  useEffect(() => {
    if (!accountsOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!accountsWrapRef.current?.contains(e.target as Node)) setAccountsOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [accountsOpen]);

  const activeAccountData = savedAccounts.find((a) => a.puuid === activeAccount);
  const isAll = activeAccount === ALL_ACCOUNTS_SENTINEL;
  const accountLabel = isAll
    ? "All accounts"
    : activeAccountData?.gameName
      ? `${activeAccountData.gameName}${activeAccountData.tagLine ? `#${activeAccountData.tagLine}` : ""}`
      : "Unknown";
  const accountSubtitle = isAll
    ? `${savedAccounts.length} accounts`
    : activeAccountData?.tagLine
      ? `#${activeAccountData.tagLine}`
      : "";
  const accountIconId = isAll ? null : (activeAccountData?.profileIconId ?? null);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await window.api.refreshGames();
    } finally {
      setRefreshing(false);
    }
  }, []);

  const isLinkActive = (to: string) => {
    if (to === "/history") return pathname === "/history" || pathname === "/";
    if (to === "/home" || to === "/local") return pathname === to || pathname.startsWith(`${to}/`);
    const tail = ACTIVE_TAIL[to] ?? to.slice(1);
    return (
      pathname === to ||
      pathname.startsWith(`${to}/`) ||
      pathname === `/history/full/${tail}` ||
      pathname.startsWith(`/history/full/${tail}/`)
    );
  };

  return (
    <aside className="relative flex h-full w-[236px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-lol-border/40 bg-lol-card/40 p-5">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-lol-crimson/[0.08] to-transparent" />
      <div className="relative z-10 flex h-full flex-col gap-5">
        <div className="flex items-center gap-3">
          <svg
            aria-hidden="true"
            className="h-9 w-9 shrink-0 text-lol-crimson"
            viewBox="0 0 36 36"
            fill="none"
          >
            <path d="M18 2 32 10v16L18 34 4 26V10L18 2Z" stroke="currentColor" strokeWidth="1.5" />
            <path d="m18 9 8 5v8l-8 5-8-5v-8l8-5Z" fill="currentColor" />
          </svg>
          <div className="min-w-0">
            <div className="font-bold text-[17px] leading-tight text-lol-text-bright">
              League Tracker
            </div>
            <div className="mt-1 text-[11.5px] leading-snug text-lol-text/60">
              Work in progress, forked from yhprum
            </div>
          </div>
        </div>

        <div
          className="flex items-center gap-2 rounded-lg border border-lol-border/40 bg-lol-card/40 px-3 py-2 text-[13px] text-lol-text"
          title={statusLabels[status]}
        >
          <div className={`h-2 w-2 shrink-0 rounded-full ${statusColors[status]}`} />
          <span>{statusLabels[status]}</span>
          {backfilling ? (
            <button
              type="button"
              onClick={() => window.api.cancelBackfill()}
              className="ml-auto rounded-md bg-lol-crimson px-3 py-1 text-[12.5px] font-semibold text-white hover:bg-lol-crimson-bright"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-lol-crimson px-3 py-1 text-[12.5px] font-semibold text-white hover:bg-lol-crimson-bright disabled:opacity-50"
            >
              <RefreshIcon className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
              <span>{refreshing ? "Syncing..." : "Sync"}</span>
            </button>
          )}
        </div>

        <nav aria-label="Main navigation" className="flex flex-col gap-1">
          {mainTabs.map(({ to, label }, index) => (
            <div key={to}>
              {index === 3 && <hr className="my-2 border-lol-border/40" />}
              <NavLink
                to={to}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isLinkActive(to)
                    ? "bg-gradient-to-r from-lol-crimson/30 to-lol-crimson/5 text-lol-text-bright shadow-[inset_2px_0_0_var(--theme-crimson)]"
                    : "text-lol-text hover:bg-white/[0.04] hover:text-lol-text-bright"
                }`}
              >
                <span
                  className={`h-[7px] w-[7px] shrink-0 rotate-45 border-[1.5px] border-current opacity-70 ${
                    isLinkActive(to) ? "border-lol-crimson bg-lol-crimson opacity-100" : ""
                  }`}
                  aria-hidden="true"
                />
                <span>{label}</span>
              </NavLink>
            </div>
          ))}
        </nav>

        <section ref={accountsWrapRef} className="relative">
          <h2 className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-lol-text/60">
            Saved accounts
          </h2>
          <button
            type="button"
            onClick={() => setAccountsOpen((v) => !v)}
            className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
              accountsOpen
                ? "border-lol-border/60 bg-lol-crimson/15 text-lol-text-bright"
                : "border-transparent text-lol-text hover:bg-white/[0.04] hover:text-lol-text-bright"
            }`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-lol-card text-[11px] font-bold text-lol-text-bright">
              {isAll ? (
                "All"
              ) : accountIconId != null ? (
                <img
                  src={`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${accountIconId}.jpg`}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                accountLabel.slice(0, 2).toUpperCase()
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] leading-tight">{accountLabel}</span>
              {accountSubtitle && (
                <span className="block truncate text-[12px] leading-tight text-lol-text/60">
                  {accountSubtitle}
                </span>
              )}
            </span>
            <span className="shrink-0 text-[10px] text-lol-text/60" aria-hidden="true">
              {accountsOpen ? "▴" : "▾"}
            </span>
          </button>

          <div
            className={`absolute left-0 right-0 top-full z-50 origin-top transition-[max-height,opacity,transform] duration-200 ease-out ${
              accountsOpen
                ? "pointer-events-auto mt-1 max-h-[420px] scale-y-100 opacity-100"
                : "pointer-events-none mt-0 max-h-0 scale-y-95 opacity-0"
            }`}
            style={{ overflow: "hidden" }}
            aria-hidden={!accountsOpen}
          >
            <div className="max-h-[420px] overflow-y-auto rounded-lg border border-lol-border bg-lol-card shadow-xl">
              <button
                type="button"
                onClick={() => {
                  setActiveAccount(ALL_ACCOUNTS_SENTINEL);
                  setAccountsOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
                  isAll
                    ? "bg-lol-crimson/15 text-lol-text-bright"
                    : "text-lol-text hover:bg-white/[0.04] hover:text-lol-text-bright"
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-lol-crimson/60 to-lol-crimson/20 text-[11px] font-bold text-white">
                  All
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] leading-tight">All accounts</span>
                  <span className="block text-[12px] leading-tight text-lol-text/60">
                    {savedAccounts.length} accounts
                  </span>
                </span>
              </button>

              {savedAccounts.map((account) => {
                const isActive = account.puuid === activeAccount;
                const accLabel = account.gameName
                  ? `${account.gameName}${account.tagLine ? `#${account.tagLine}` : ""}`
                  : "Unknown";
                return (
                  <button
                    key={account.puuid}
                    type="button"
                    onClick={() => {
                      setActiveAccount(account.puuid);
                      setAccountsOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
                      isActive
                        ? "bg-lol-crimson/15 text-lol-text-bright"
                        : "text-lol-text hover:bg-white/[0.04] hover:text-lol-text-bright"
                    }`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-lol-card text-[11px] font-bold text-lol-text-bright">
                      {account.profileIconId != null ? (
                        <img
                          src={`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${account.profileIconId}.jpg`}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        accLabel.slice(0, 2).toUpperCase()
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] leading-tight">
                      {accLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <div className="mt-auto">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-lol-crimson/20 text-lol-text-bright"
                  : "text-lol-text hover:bg-white/[0.04] hover:text-lol-text-bright"
              }`
            }
          >
            Settings
          </NavLink>
        </div>
      </div>
    </aside>
  );
}
