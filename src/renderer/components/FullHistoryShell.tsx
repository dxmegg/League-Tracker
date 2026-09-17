import { Outlet } from "react-router-dom";
import TopNav from "./TopNav";

export function FullHistoryShell() {
  return (
    <div className="flex flex-col h-full w-full">
      <TopNav />
      <main className="flex-1 min-h-0 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
