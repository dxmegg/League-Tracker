import { useState } from "react";
import { useActiveMode } from "../hooks/useActiveMode";
import { AboutSection } from "../components/AboutSection";
import { AccountsSections, useAccountSettings } from "../components/settings/accounts";
import { DataSections, useDataSettings } from "../components/settings/data";
import { DiagnosticsSections } from "../components/settings/diagnostics";
import { GeneralSections, useGeneralSettings } from "../components/settings/general";
import { SyncSections, useSyncSettings } from "../components/settings/sync";

const SETTINGS_TABS = [
  { id: "general", label: "General", hint: "Startup behaviour and which games count" },
  { id: "accounts", label: "Accounts", hint: "Accounts already saved" },
  { id: "sync", label: "Sync & repair", hint: "Fetch history and recalculate scores" },
  { id: "data", label: "Backups", hint: "Export, import and database snapshots" },
  { id: "diagnostics", label: "Diagnostics", hint: "Versions, connections and folders" },
  { id: "about", label: "About", hint: "Version, your data, legal notices and licenses" },
] as const;

export default function Settings() {
  const [tab, setTab] = useState<(typeof SETTINGS_TABS)[number]["id"]>("general");
  const [mode, setMode] = useActiveMode();
  // The state lives here, not in the sections: they unmount when the tab changes, and progress and
  // status messages have to survive that
  const general = useGeneralSettings();
  const accounts = useAccountSettings();
  const sync = useSyncSettings();
  const data = useDataSettings();

  if (!general.loaded || !accounts.loaded || !data.loaded) return null;

  return (
    <div className="flex min-h-full w-full flex-col gap-5">
      <div className="shrink-0">
        <h1 className="font-display text-[28px] font-bold leading-none text-lol-text-bright">
          Settings
        </h1>
        <p className="mt-2 text-[13px] text-lol-text">
          {SETTINGS_TABS.find((t) => t.id === tab)?.hint}
        </p>
      </div>
      <div
        role="tablist"
        className="flex w-fit shrink-0 flex-wrap gap-1 rounded-xl border border-lol-border/60 bg-black/30 p-1"
      >
        {SETTINGS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`h-9 rounded-lg px-5 text-xs font-bold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-crimson/60 ${
              tab === t.id
                ? "bg-lol-crimson/35 text-lol-text-bright"
                : "text-lol-text hover:bg-white/5 hover:text-lol-text-bright"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        className={`grid grid-cols-1 gap-4 lg:grid-cols-2 ${tab === "general" ? "items-stretch" : "items-start"}`}
      >
        {tab === "accounts" && <AccountsSections settings={accounts} />}
        {tab === "sync" && <SyncSections settings={sync} />}
        {tab === "data" && <DataSections settings={data} mode={mode} />}
        {tab === "general" && <GeneralSections settings={general} setMode={setMode} />}
        {tab === "diagnostics" && <DiagnosticsSections />}
        {tab === "about" && <AboutSection />}
      </div>
    </div>
  );
}
