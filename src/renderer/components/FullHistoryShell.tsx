import { Outlet, useLocation } from "react-router-dom";
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

  return (
    <div className="flex flex-col h-full w-full">
      <RecoveryBanner />
      <TopNav />
      <div className="flex flex-1 min-h-0">
        <main className="flex flex-1 min-h-0 flex-col overflow-y-auto p-6">
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
