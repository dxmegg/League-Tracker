import { useCallback, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { AccountMenu } from "./AccountMenu";
import { UpdateButton } from "./UpdateButton";
import { useActiveMode } from "../hooks/useActiveMode";
import { useBackfill } from "../hooks/useBackfill";
import { useLcuStatus } from "../hooks/useLcuStatus";
import type { LcuStatus } from "../lib/types";
import { RefreshIcon, SettingsIcon } from "./icons";
import { WindowControls } from "./WindowControls";

const STATUS_DOT: Record<LcuStatus, string> = {
  connected: "bg-lol-win",
  ingame: "bg-sky-400",
  connecting: "bg-amber-500",
  disconnected: "bg-lol-loss",
};

const STATUS_LABEL: Record<LcuStatus, string> = {
  connected: "Connected",
  ingame: "In game",
  connecting: "Connecting...",
  disconnected: "Disconnected",
};

// First path segment to a readable page name; unknown routes fall back to the segment itself.
const PAGE_TITLES: Record<string, string> = {
  home: "Home",
  profile: "Your profile",
  champions: "Champions",
  items: "Items",
  augments: "Augments",
  runes: "Runes",
  friends: "Friends & Foes",
  trends: "Trends",
  records: "Records",
  achievements: "Achievements",
  challenges: "Challenges",
  misc: "Misc. Data",
  data: "Storage",
  settings: "Settings",
  history: "History",
  match: "Match",
  test: "Live game",
  "match-history": "Match history",
};

export function TopBar() {
  const { pathname } = useLocation();
  const segment = pathname.split("/")[1] ?? "";
  const title = PAGE_TITLES[segment] ?? segment;
  const status = useLcuStatus();
  const { running: backfilling } = useBackfill();
  const [mode] = useActiveMode();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await window.api.refreshGames();
    } finally {
      setRefreshing(false);
    }
  }, []);

  return (
    <header className="titlebar-drag relative z-30 flex h-12 w-full shrink-0 items-center gap-3 border-b border-lol-border/40 bg-black/25 pl-4 backdrop-blur">
      <div className="titlebar-no-drag flex items-center gap-1.5 rounded-full border border-lol-border/60 bg-lol-card/60 p-1 pr-1.5">
        <div className="flex items-center gap-2 px-2.5 text-[12px] text-lol-text">
          <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
          {STATUS_LABEL[status]}
        </div>
        {backfilling ? (
          <button
            type="button"
            onClick={() => window.api.cancelBackfill()}
            className="rounded-full bg-lol-crimson px-3 py-1 text-[11.5px] font-semibold text-white hover:bg-lol-crimson-bright"
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-full bg-lol-crimson px-3 py-1 text-[11.5px] font-semibold text-white shadow-[0_2px_12px_var(--theme-crimson-glow)] transition-all hover:bg-lol-crimson-bright disabled:opacity-50"
          >
            <RefreshIcon className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Syncing..." : "Sync"}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 rounded-full border border-lol-crimson/40 bg-lol-crimson/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-lol-text-bright">
        <span className="h-1.5 w-1.5 rounded-full bg-lol-crimson" />
        {mode === "mayhem" ? "ARAM Mayhem" : "All matches"}
      </div>

      {title && (
        <div className="hidden items-center gap-2 text-[13px] font-semibold text-lol-text-bright md:flex">
          <span className="text-lol-text/40">/</span>
          <span className="font-display tracking-wide">{title}</span>
        </div>
      )}

      <div className="titlebar-no-drag ml-auto flex items-center gap-2 pr-2">
        <AccountMenu />
        <UpdateButton />
        <NavLink
          to="/settings"
          title="Settings"
          aria-label="Settings"
          className={({ isActive }) =>
            `flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
              isActive
                ? "border-lol-crimson/60 bg-lol-crimson/20 text-lol-text-bright"
                : "border-lol-border/60 bg-lol-card/60 text-lol-text hover:border-lol-crimson/40 hover:text-lol-text-bright"
            }`
          }
        >
          <SettingsIcon className="h-4 w-4 transition-transform duration-300 hover:rotate-90" />
        </NavLink>
        <WindowControls />
      </div>
    </header>
  );
}
