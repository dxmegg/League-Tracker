import { Outlet, useLocation } from "react-router-dom";
import { useActiveTheme } from "../hooks/useActiveTheme";
import { Sidebar } from "./Sidebar";
import TopNav from "./TopNav";
import { HistorySideNav } from "./HistorySideNav";
import RecoveryBanner from "./RecoveryBanner";
import { Rail } from "./Rail";
import { TopBar } from "./TopBar";

export function FullHistoryShell() {
  const { pathname } = useLocation();
  const SIDEBAR_SCOPES = new Set(["mayhem", "aram", "arena", "ranked", "normal", "rest"]);
  const scopeMatch = pathname.match(/^\/history\/([^/]+)/);
  const scopeFromPath = scopeMatch?.[1];
  const showSideNav = scopeFromPath !== undefined && SIDEBAR_SCOPES.has(scopeFromPath);
  const scope = scopeFromPath ?? "full";
  const activeTheme = useActiveTheme();
  const showSidebar = activeTheme === "experiment";

  if (showSidebar) {
    return (
      <div className="flex h-full w-full min-h-0">
        <Rail />
        <Sidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <TopBar />
          <RecoveryBanner />
          {/* keyed by path so every page change replays the entrance and starts scrolled to the top */}
          <main
            key={pathname}
            className="page-enter flex min-h-0 flex-1 flex-col overflow-y-auto p-6"
          >
            <Outlet />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full min-h-0 flex-col">
      <RecoveryBanner />
      <TopNav />
      <div className="flex min-h-0 flex-1">
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
          <Outlet />
        </main>
        {showSideNav && (
          <div className="shrink-0">
            <HistorySideNav scope={scope} />
          </div>
        )}
      </div>
    </div>
  );
}
