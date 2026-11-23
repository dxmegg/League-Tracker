import type { SVGProps } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useActiveMode } from "../hooks/useActiveMode";
import { useActiveTheme } from "../hooks/useActiveTheme";
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
  const [mode] = useActiveMode();

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
      </div>
    </aside>
  );
}
