import { Suspense, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import RecoveryBanner from "./RecoveryBanner";
import { Rail } from "./Rail";
import { TopBar } from "./TopBar";
import { startUpdater } from "../hooks/useUpdater";

export function AppShell() {
  const { pathname } = useLocation();

  useEffect(() => {
    void startUpdater();
  }, []);

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
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
