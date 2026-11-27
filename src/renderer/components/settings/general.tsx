import { useState, useEffect, useCallback } from "react";
import { queueLabel } from "../QueueSelect";
import { QUEUE_LABELS } from "../../../shared/queues";
import { setRemembering } from "../../lib/viewState";
import { useShowAllMode } from "../../hooks/useShowAllMode";
import { useSessionGrouping } from "../../hooks/useSessionGrouping";
import type { useActiveMode } from "../../hooks/useActiveMode";
import { FilterSelect } from "../FilterSelect";
import { Section, Switch } from "./parts";

export function useGeneralSettings() {
  const [showAllMode, setShowAllMode] = useShowAllMode();
  const [grouping, setGrouping] = useSessionGrouping();
  const [autoStart, setAutoStart] = useState(false);
  // Only the packaged program has a path worth registering, so the switch says
  // so instead of pretending in a dev build
  const [autoStartSupported, setAutoStartSupported] = useState(false);
  const [minimizeToTray, setMinimizeToTray] = useState(true);
  // Every queue with games stored, and the subset the user has switched off
  const [queues, setQueues] = useState<number[]>([]);
  const [hiddenQueues, setHiddenQueues] = useState<Set<number>>(new Set());
  const [hideRemakes, setHideRemakes] = useState(false);
  const [rememberFilters, setRememberFilters] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      window.api.getSetting("auto_start"),
      window.api.isAutoStartSupported(),
      window.api.getSetting("minimize_to_tray"),
      window.api.getSetting("hidden_queues"),
      window.api.getSetting("hide_remakes"),
      window.api.getSetting("remember_filters"),
    ]).then(([startup, startupSupported, tray, hidden, remakes, remember]) => {
      setAutoStart(startup === "true");
      setAutoStartSupported(startupSupported);
      setMinimizeToTray(tray !== "false");
      setHiddenQueues(new Set(hidden ? hidden.split(",").map(Number) : []));
      setHideRemakes(remakes === "true");
      setRememberFilters(remember !== "false");
      setLoaded(true);
    });
  }, []);

  // Kept current the same way the queue dropdown is: a game from a queue that
  // wasn't in the database yet adds a switch for it without a reload.
  useEffect(() => {
    const fetchQueues = () => window.api.getStoredQueues().then(setQueues);
    fetchQueues();
    return window.api.onGamesUpdated(fetchQueues);
  }, []);

  const handleAutoStartToggle = useCallback(async () => {
    const next = !autoStart;
    setAutoStart(next);
    // The main process registers or clears the login item off the back of this
    await window.api.setSetting("auto_start", String(next));
  }, [autoStart]);

  const handleToggle = useCallback(async () => {
    const next = !minimizeToTray;
    setMinimizeToTray(next);
    await window.api.setSetting("minimize_to_tray", String(next));
  }, [minimizeToTray]);

  const handleQueueToggle = useCallback(
    async (queueId: number) => {
      const next = new Set(hiddenQueues);
      if (!next.delete(queueId)) next.add(queueId);
      setHiddenQueues(next);
      await window.api.setSetting("hidden_queues", [...next].join(","));
    },
    [hiddenQueues],
  );

  const handleHideRemakesToggle = useCallback(async () => {
    const next = !hideRemakes;
    setHideRemakes(next);
    await window.api.setSetting("hide_remakes", String(next));
  }, [hideRemakes]);

  const handleRememberFiltersToggle = useCallback(async () => {
    const next = !rememberFilters;
    setRememberFilters(next);
    // Takes effect on the pages right away: they read the flag as they mount,
    // and turning it off drops whatever was already stored.
    setRemembering(next);
    await window.api.setSetting("remember_filters", String(next));
  }, [rememberFilters]);

  return {
    loaded,
    autoStart,
    autoStartSupported,
    minimizeToTray,
    queues,
    hiddenQueues,
    hideRemakes,
    rememberFilters,
    showAllMode,
    setShowAllMode,
    grouping,
    setGrouping,
    handleAutoStartToggle,
    handleToggle,
    handleQueueToggle,
    handleHideRemakesToggle,
    handleRememberFiltersToggle,
  };
}

export function GeneralSections({
  settings,
  setMode,
}: {
  settings: ReturnType<typeof useGeneralSettings>;
  setMode: ReturnType<typeof useActiveMode>[1];
}) {
  const {
    autoStart,
    autoStartSupported,
    minimizeToTray,
    queues,
    hiddenQueues,
    hideRemakes,
    rememberFilters,
    showAllMode,
    setShowAllMode,
    grouping,
    setGrouping,
    handleAutoStartToggle,
    handleToggle,
    handleQueueToggle,
    handleHideRemakesToggle,
    handleRememberFiltersToggle,
  } = settings;

  return (
    <>
      <Section title="General">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 border-b border-lol-border/40 py-2.5 transition-colors duration-[120ms] hover:bg-white/[0.02] last:border-b-0">
            <div>
              <p className="text-[13.5px] text-lol-text-bright">Start with Windows</p>
              <p className="text-[12.5px] text-lol-text">
                Open the program in the system tray when you sign in to Windows, so your games are
                recorded without having to remember to start it.
                {!autoStartSupported && " Only available in the packaged program."}
              </p>
            </div>
            <Switch
              checked={autoStart}
              onChange={handleAutoStartToggle}
              disabled={!autoStartSupported}
            />
          </div>

          <div className="flex items-center justify-between gap-4 border-b border-lol-border/40 py-2.5 transition-colors duration-[120ms] hover:bg-white/[0.02] last:border-b-0">
            <div>
              <p className="text-[13.5px] text-lol-text-bright">Minimize to tray on close</p>
              <p className="text-[12.5px] text-lol-text">
                When enabled, the program can keep storing your games even when the window is
                closed. You can still close the program from the system tray.
              </p>
            </div>
            <Switch checked={minimizeToTray} onChange={handleToggle} />
          </div>

          <div className="flex items-center justify-between gap-4 border-b border-lol-border/40 py-2.5 transition-colors duration-[120ms] hover:bg-white/[0.02] last:border-b-0">
            <div>
              <p className="text-[13.5px] text-lol-text-bright">Remember filters and sorting</p>
              <p className="text-[12.5px] text-lol-text">
                Reopen every page with the filters, search, and sort order you last used. When off,
                each page starts on its defaults again every time the program opens.
              </p>
            </div>
            <Switch checked={rememberFilters} onChange={handleRememberFiltersToggle} />
          </div>

          <div className="flex items-center justify-between gap-4 border-b border-lol-border/40 py-2.5 transition-colors duration-[120ms] hover:bg-white/[0.02] last:border-b-0">
            <div>
              <p className="text-[13.5px] text-lol-text-bright">Hide remakes</p>
              <p className="text-[12.5px] text-lol-text">
                Leave remade games out of the match history. They are still recorded, and were never
                counted toward your stats either way.
              </p>
            </div>
            <Switch checked={hideRemakes} onChange={handleHideRemakesToggle} />
          </div>

          <div className="flex items-center justify-between gap-4 border-b border-lol-border/40 py-2.5 transition-colors duration-[120ms] hover:bg-white/[0.02] last:border-b-0">
            <div>
              <p className="text-[13.5px] text-lol-text-bright">Group match history</p>
              <p className="text-[12.5px] text-lol-text">
                How games are collected into groups in match lists sorted by date.
              </p>
            </div>
            <FilterSelect
              value={grouping}
              onChange={(value) => setGrouping(value ?? "day")}
              placeholder="By day"
              title="Group match history"
              options={[
                { value: "day" as const, label: "By day" },
                { value: "week" as const, label: "By week" },
                { value: "patch" as const, label: "By patch" },
                { value: "off" as const, label: "Off" },
              ]}
            />
          </div>

          <div className="flex items-center justify-between gap-4 border-b border-lol-border/40 py-2.5 transition-colors duration-[120ms] hover:bg-white/[0.02] last:border-b-0">
            <div>
              <p className="text-[13.5px] text-lol-text-bright">All matches mode</p>
              <p className="text-[12.5px] text-lol-text">
                Offer All next to Mayhem in the left bar. Off: the app shows ARAM Mayhem only.
              </p>
            </div>
            <Switch
              label="All matches mode"
              checked={showAllMode}
              onChange={() => {
                // Nothing could switch back from All once its button is gone
                if (showAllMode) setMode("mayhem");
                setShowAllMode(!showAllMode);
              }}
            />
          </div>
        </div>
      </Section>

      {/* A single queue has nothing to choose between */}
      {queues.length > 1 && (
        <Section title="Queues to include">
          <p className="text-[12.5px] text-lol-text">
            Stats and match history only count the queues switched on here. Games from the others
            are still recorded, and can be counted again by switching their queue back on.
          </p>
          <div className="mt-1 grid grid-cols-1 gap-x-6 xl:grid-cols-2">
            {queues.map((q, _i, all) => {
              const shown = !hiddenQueues.has(q);
              const shownCount = all.filter((id) => !hiddenQueues.has(id)).length;
              return (
                <div
                  key={q}
                  className="flex items-center justify-between gap-4 border-b border-lol-border/40 py-1.5 transition-colors duration-[120ms] hover:bg-white/[0.02] last:border-b-0 xl:py-2"
                >
                  <p className="text-sm text-lol-text">{QUEUE_LABELS[q] ?? queueLabel(q)}</p>
                  {/* Switching off the last one would empty every page */}
                  <Switch
                    checked={shown}
                    disabled={shown && shownCount === 1}
                    onChange={() => handleQueueToggle(q)}
                  />
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </>
  );
}
