import { Outlet, useLocation } from "react-router-dom";
import { useActiveTheme } from "../hooks/useActiveTheme";
import { Sidebar } from "./Sidebar";
import TopNav from "./TopNav";
import { HistorySideNav } from "./HistorySideNav";
import RecoveryBanner from "./RecoveryBanner";

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
      <div className="flex h-full w-full">
        <Sidebar />
        <div className="flex min-h-0 flex-1 flex-col">
          <RecoveryBanner />
          <main className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
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
