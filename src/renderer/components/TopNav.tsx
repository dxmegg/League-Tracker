import { NavLink } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLcuStatus } from "../hooks/useLcuStatus";
import { useBackfill } from "../hooks/useBackfill";
import type { LcuStatus } from "../lib/types";
import { FolderIcon } from "./SidebarIcons";
import {
  MinusIcon,
  MaximizeIcon,
  RefreshIcon,
  RestoreIcon,
  SettingsIcon,
  XIcon,
} from "./icons";

const AVATAR_SOURCE =
  "https://avatars.githubusercontent.com/u/116650859?v=4";

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
  { to: "/history/mayhem", label: "ARAM MAYHEM MATCHES" },
  { to: "/history/aram", label: "ARAM MATCHES" },
  { to: "/history/arena", label: "ARENA MATCHES" },
  { to: "/history/ranked", label: "RANKED MATCHES" },
  { to: "/history/normal", label: "NORMAL MATCHES" },
  { to: "/", label: "FULL MATCH HISTORY" },
];

const mainTabsWithSubTabs = [
  { to: "/home", label: "HOME", subTabs: [] },
  { to: "/local", label: "LOCAL ACCOUNT", subTabs: [] },
  {
    to: "/history/mayhem",
    label: "ARAM MAYHEM MATCHES",
    subTabs: [
      { section: "champions", label: "CHAMPIONS" },
      { section: "augments", label: "AUGMENTS" },
      { section: "items", label: "ITEMS" },
      { section: "friends", label: "FRIENDS" },
      { section: "enemies", label: "ENEMIES" },
      { section: "trends", label: "TRENDS" },
      { section: "records", label: "RECORDS" },
      { section: "total-stats", label: "TOTAL STATS" },
    ],
  },
  {
    to: "/history/aram",
    label: "ARAM MATCHES",
    subTabs: [
      { section: "champions", label: "CHAMPIONS" },
      { section: "items", label: "ITEMS" },
      { section: "runes", label: "RUNES" },
      { section: "friends", label: "FRIENDS" },
      { section: "enemies", label: "ENEMIES" },
      { section: "trends", label: "TRENDS" },
      { section: "records", label: "RECORDS" },
      { section: "total-stats", label: "TOTAL STATS" },
    ],
  },
  {
    to: "/history/arena",
    label: "ARENA MATCHES",
    subTabs: [
      { section: "champions", label: "CHAMPIONS" },
      { section: "augments", label: "AUGMENTS" },
      { section: "items", label: "ITEMS" },
      { section: "friends", label: "FRIENDS" },
      { section: "enemies", label: "ENEMIES" },
      { section: "trends", label: "TRENDS" },
      { section: "records", label: "RECORDS" },
      { section: "total-stats", label: "TOTAL STATS" },
    ],
  },
  {
    to: "/history/ranked",
    label: "RANKED MATCHES",
    subTabs: [
      { section: "champions", label: "CHAMPIONS" },
      { section: "items", label: "ITEMS" },
      { section: "runes", label: "RUNES" },
      { section: "friends", label: "FRIENDS" },
      { section: "enemies", label: "ENEMIES" },
      { section: "trends", label: "TRENDS" },
      { section: "records", label: "RECORDS" },
      { section: "total-stats", label: "TOTAL STATS" },
    ],
  },
  {
    to: "/history/normal",
    label: "NORMAL MATCHES",
    subTabs: [
      { section: "champions", label: "CHAMPIONS" },
      { section: "items", label: "ITEMS" },
      { section: "runes", label: "RUNES" },
      { section: "friends", label: "FRIENDS" },
      { section: "enemies", label: "ENEMIES" },
      { section: "trends", label: "TRENDS" },
      { section: "records", label: "RECORDS" },
      { section: "total-stats", label: "TOTAL STATS" },
    ],
  },
  {
    to: "/",
    label: "FULL MATCH HISTORY",
    subTabs: [
      { section: "champions", label: "CHAMPIONS" },
      { section: "augments", label: "AUGMENTS" },
      { section: "items", label: "ITEMS" },
      { section: "runes", label: "RUNES" },
      { section: "friends", label: "FRIENDS" },
      { section: "enemies", label: "ENEMIES" },
      { section: "trends", label: "TRENDS" },
      { section: "records", label: "RECORDS" },
      { section: "total-stats", label: "TOTAL STATS" },
    ],
  },
];

export default function TopNav() {
  const status = useLcuStatus();
  const { running: backfilling } = useBackfill();
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
  const panelRefs = useRef(new Map<string, HTMLDivElement>());
  const tabsRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    window.api.isWindowMaximized().then(setMaximized);
    return window.api.onMaximizedChanged(setMaximized);
  }, []);

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;

    const update = () => {
      const atRightEdge = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
      setHasOverflow(!atRightEdge && el.scrollWidth > el.clientWidth);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    el.addEventListener("scroll", update);
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await window.api.refreshGames();
    } finally {
      setRefreshing(false);
    }
  }, []);

  return (
    <nav className="titlebar-drag h-14 w-full shrink-0 border-b border-lol-border/60 bg-lol-card/60 flex items-center">
      <button
        type="button"
        onClick={() => window.api.openUrl("https://github.com/dxmegg/League-Tracker")}
        aria-label="Open League Tracker GitHub repository"
        className="titlebar-no-drag flex h-full shrink-0 items-center gap-2.5 px-3 transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-lol-gold/60"
      >
        <img
          src={AVATAR_SOURCE}
          alt="League Tracker avatar"
          className="h-8 w-8 rounded-full object-cover"
        />
        <span className="hidden 2xl:flex flex-col justify-center text-left leading-none">
          <span className="font-bold text-[13px] tracking-[0.02em] text-lol-text-bright">
            League Tracker
          </span>
          <span className="mt-1 text-[8px] font-semibold uppercase tracking-[0.25em] text-lol-gold/80">
            WIP - FORKED FROM YHPRUM
          </span>
        </span>
      </button>

      <div className="relative flex-1 min-w-0">
        <div
          ref={tabsRef}
          className={`titlebar-no-drag no-scrollbar flex items-center gap-0.5 px-1 h-full ${
            hasOverflow ? "overflow-x-auto" : "overflow-hidden"
          }`}
        >
          {mainTabsWithSubTabs.map(({ to, label, subTabs }) => (
            <div
              key={to}
              className="relative shrink-0"
              onMouseEnter={
                subTabs.length > 0 ? () => setHoveredTab(to) : undefined
              }
              onMouseLeave={
                subTabs.length > 0
                  ? () =>
                      setHoveredTab((current) => (current === to ? null : current))
                  : undefined
              }
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                  setHoveredTab((current) => (current === to ? null : current));
                }
              }}
            >
              <NavLink
                to={to}
                end={to === "/"}
                data-tab-id={to}
                aria-haspopup={subTabs.length > 0 ? "menu" : undefined}
                aria-expanded={subTabs.length > 0 ? hoveredTab === to : undefined}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    setHoveredTab(to);
                  } else if (event.key === "Escape") {
                    setHoveredTab(null);
                  }
                }}
                className={({ isActive }) =>
                  `titlebar-no-drag flex shrink-0 items-center gap-1.5 bevel-tab px-2.5 py-2 text-[10px] font-semibold tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-gold/60 ${
                    isActive
                      ? "bg-lol-crimson/30 ring-1 ring-lol-gold/40 text-lol-text-bright"
                      : "text-lol-text hover:bg-white/5 hover:text-lol-text-bright"
                  }`
                }
              >
                <FolderIcon />
                <span>{label}</span>
              </NavLink>
              {subTabs.length > 0 && (
                <div
                  className={`absolute top-full left-0 z-40 pt-1 min-w-[180px] transition-opacity duration-150 ${
                    hoveredTab === to
                      ? "opacity-100 pointer-events-auto"
                      : "opacity-0 pointer-events-none"
                  }`}
                >
                  <div
                    ref={(element) => {
                      if (element) {
                        panelRefs.current.set(to, element);
                      } else {
                        panelRefs.current.delete(to);
                      }
                    }}
                    role="menu"
                    className="bevel-panel flex flex-col gap-0.5 border border-lol-border/60 bg-lol-card/95 p-2 backdrop-blur-sm"
                    onKeyDown={(event) => {
                      const panel = panelRefs.current.get(to);
                      if (!panel) return;

                      if (event.key === "Escape") {
                        event.preventDefault();
                        setHoveredTab(null);
                        document
                          .querySelector<HTMLElement>(`[data-tab-id="${to}"]`)
                          ?.focus();
                        return;
                      }

                      if (event.key !== "Tab") return;

                      const links = Array.from(
                        panel.querySelectorAll<HTMLAnchorElement>("a"),
                      );
                      const currentIndex = links.indexOf(
                        document.activeElement as HTMLAnchorElement,
                      );
                      const nextIndex = event.shiftKey
                        ? currentIndex - 1
                        : currentIndex + 1;

                      if (currentIndex < 0) return;

                      if (nextIndex >= 0 && nextIndex < links.length) {
                        event.preventDefault();
                        links[nextIndex].focus();
                      } else {
                        setHoveredTab(null);
                      }
                    }}
                  >
                    {subTabs.map((sub) => (
                      <NavLink
                        key={sub.section}
                        to={
                          to === "/"
                            ? `/history/full/${sub.section}`
                            : `${to}/${sub.section}`
                        }
                        tabIndex={hoveredTab === to ? 0 : -1}
                        onClick={() => setHoveredTab(null)}
                        className={({ isActive }) =>
                          `block rounded-md px-3 py-1.5 text-[11px] tracking-wider transition-colors ${
                            isActive
                              ? "bg-lol-gold/10 text-lol-gold"
                              : "text-lol-text hover:bg-white/5 hover:text-lol-text-bright"
                          }`
                        }
                      >
                        {sub.label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        {hasOverflow && (
          <div className="pointer-events-none absolute right-0 top-1 bottom-1 w-10 bg-gradient-to-l from-lol-card/95 to-transparent" />
        )}
      </div>

      <div className="titlebar-no-drag flex shrink-0 items-center gap-1 px-1.5">
        <NavLink
          to="/settings"
          title="Settings"
          className={({ isActive }) =>
            `titlebar-no-drag flex items-center gap-2 rounded-md px-3 py-2 text-[11px] font-semibold tracking-wider transition-colors ${
              isActive
                ? "bg-lol-gold/10 text-lol-gold"
                : "text-lol-text hover:bg-white/5 hover:text-lol-text-bright"
            }`
          }
        >
          <SettingsIcon className="h-4 w-4" />
          <span className="hidden 2xl:inline">SETTINGS</span>
        </NavLink>

        <div className="flex items-center gap-2 whitespace-nowrap" title={statusLabels[status]}>
          <div className={`h-2 w-2 rounded-full ${statusColors[status]}`} />
          <span className="hidden lg:inline text-xs text-lol-text">{statusLabels[status]}</span>
        </div>

        {backfilling ? (
          <button
            type="button"
            onClick={() => window.api.cancelBackfill()}
            className="titlebar-no-drag flex items-center gap-1.5 rounded-md border border-lol-border bg-white/5 px-2.5 py-1 text-xs text-lol-text transition-colors hover:bg-white/10 hover:text-lol-text-bright"
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Sync"
            className="titlebar-no-drag flex items-center gap-1.5 rounded-md border border-lol-gold/25 bg-lol-gold/10 px-2.5 py-1 text-xs text-lol-gold transition-colors hover:bg-lol-gold/20 disabled:opacity-50"
          >
            <RefreshIcon className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden xl:inline">{refreshing ? "Syncing..." : "Sync"}</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => window.api.minimizeWindow()}
          title="Minimize"
          className="titlebar-no-drag flex h-9 w-8 items-center justify-center text-lol-text transition-colors hover:bg-white/5 hover:text-lol-text-bright"
        >
          <MinusIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => window.api.toggleMaximizeWindow()}
          title={maximized ? "Restore" : "Maximize"}
          className="titlebar-no-drag flex h-9 w-8 items-center justify-center text-lol-text transition-colors hover:bg-white/5 hover:text-lol-text-bright"
        >
          {maximized ? <RestoreIcon className="h-3 w-3" /> : <MaximizeIcon className="h-3 w-3" />}
        </button>
        <button
          type="button"
          onClick={() => window.api.closeWindow()}
          title="Close"
          className="titlebar-no-drag flex h-9 w-8 items-center justify-center text-lol-text transition-colors hover:bg-lol-loss hover:text-white"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </nav>
  );
}
