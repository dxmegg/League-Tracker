import { Outlet, useLocation } from "react-router-dom";
import TopNav from "./TopNav";
import { HistorySideNav } from "./HistorySideNav";
import RecoveryBanner from "./RecoveryBanner";

export function FullHistoryShell() {
  const { pathname } = useLocation();
  const isHistoryRoute = pathname === "/" || pathname.startsWith("/history/");
  const showSideNav = isHistoryRoute;

  function deriveScope(path: string): string {
    if (path === "/") return "full";
    const match = path.match(/^\/history\/([^/]+)/);
    if (!match) return "full";
    return match[1];
  }

  const scope = deriveScope(pathname);

  return (
    <div className="flex flex-col h-full w-full">
      <RecoveryBanner />
      <TopNav />
      <div className="flex flex-1 min-h-0">
        <main className="flex-1 min-h-0 overflow-y-auto p-6">
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
