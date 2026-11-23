import { useEffect, useRef, useState } from "react";
import type { SVGProps } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { AccountListItem } from "../../shared/api";
import { useActiveAccount } from "../hooks/useActiveAccount";
import { useActiveMode } from "../hooks/useActiveMode";
import { useActiveTheme } from "../hooks/useActiveTheme";
import { getAccountsWithData } from "../hooks/useChampions";
import { ALL_ACCOUNTS_SENTINEL } from "../lib/accountsEvent";
import {
  CoinsIcon,
  GlobeIcon,
  HomeIcon,
  MedalIcon,
  SettingsIcon,
  ShieldIcon,
  SparklesIcon,
  TrendingUpIcon,
  TrophyIcon,
  UserIcon,
  UsersIcon,
  ZapIcon,
} from "./icons";

type NavIcon = (props: SVGProps<SVGSVGElement>) => React.JSX.Element;

const NAV_ICONS: Record<string, NavIcon> = {
  "/test": SettingsIcon,
  "/home": HomeIcon,
  "/local": UserIcon,
  "/profile": UserIcon,
  "/history": MedalIcon,
  "/champions": ShieldIcon,
  "/items": CoinsIcon,
  "/augments": SparklesIcon,
  "/runes": ZapIcon,
  "/friends": UsersIcon,
  "/trends": TrendingUpIcon,
  "/records": TrophyIcon,
  "/data": GlobeIcon,
};

const mainTabs = [
  { to: "/test", label: "TEST" },
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

// Redesign merges Local Account and History into one page
const redesignTabs = [
  { to: "/test", label: "TEST" },
  { to: "/home", label: "HOME" },
  { to: "/profile", label: "YOUR PROFILE" },
  ...mainTabs.filter((tab) => !["/test", "/home", "/local", "/history"].includes(tab.to)),
];

// Each tab appears in exactly one group; tabs a theme doesn't have are simply skipped.
const NAV_GROUPS = [
  { title: "Main", paths: ["/test", "/home", "/profile", "/local", "/history"] },
  { title: "Analytics", paths: ["/champions", "/items", "/augments", "/runes"] },
  { title: "Community & progress", paths: ["/friends", "/trends", "/records", "/data"] },
];

const ACTIVE_TAIL: Record<string, string> = {
  "/data": "total-stats",
};

export function Sidebar() {
  const { pathname } = useLocation();
  const tabs = useActiveTheme({ exact: true }) === "redesign" ? redesignTabs : mainTabs;
  const [activeAccount, setActiveAccount] = useActiveAccount();
  const [mode] = useActiveMode();
  const [savedAccounts, setSavedAccounts] = useState<AccountListItem[]>([]);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const accountsWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      getAccountsWithData()
        .then((next) => {
          if (!cancelled) setSavedAccounts(next);
        })
        .catch(() => {
          if (!cancelled) setSavedAccounts([]);
        });
    };

    load();
    const unsubscribe = window.api.onGamesUpdated(() => {
      void window.api
        .listAccountsWithData()
        .then((next) => {
          if (!cancelled) setSavedAccounts(next);
        })
        .catch(() => {
          if (!cancelled) setSavedAccounts([]);
        });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
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
        <div className="min-w-0 px-1">
          <div className="font-display text-[18px] font-bold leading-tight text-lol-text-bright">
            Rift Records
          </div>
          <div className="mt-1 text-[11px] leading-snug text-lol-text/60">
            Local match history tracker
          </div>
        </div>

        <nav aria-label="Main navigation" className="flex flex-col gap-4">
          {NAV_GROUPS.map(({ title, paths }) => (
            <div key={title} className="flex flex-col gap-1">
              <h2 className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-lol-text/60">
                {title}
              </h2>
              {tabs
                // Mayhem has no runes, so the tab disappears in that mode
                .filter(
                  (tab) => paths.includes(tab.to) && !(mode === "mayhem" && tab.to === "/runes"),
                )
                .map(({ to, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-all duration-150 ${
                      isLinkActive(to)
                        ? "bg-gradient-to-r from-lol-crimson/25 via-lol-crimson/10 to-transparent text-lol-text-bright shadow-[inset_2px_0_0_var(--theme-crimson)]"
                        : "text-lol-text hover:bg-white/[0.05] hover:text-lol-text-bright"
                    }`}
                  >
                    {(() => {
                      const Icon = NAV_ICONS[to];
                      return Icon ? (
                        <Icon
                          className={`h-[15px] w-[15px] shrink-0 transition-colors ${
                            isLinkActive(to)
                              ? "text-lol-crimson drop-shadow-[0_0_6px_var(--theme-crimson-glow)]"
                              : "opacity-70 group-hover:opacity-100"
                          }`}
                        />
                      ) : null;
                    })()}
                    <span>{label}</span>
                  </NavLink>
                ))}
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
