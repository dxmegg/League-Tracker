import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MatchListItem } from "../../shared/api";
import { DayHeader, SessionHeader } from "../components/MatchGroupHeaders";
import { groupDaysAndSessions } from "../lib/matchSessions";
import { QUEUE_GROUP_ARENA } from "../../shared/queues";
import { ChampionCombobox } from "../components/ChampionCombobox";
import { FilterChip } from "../components/FilterChip";
import { FilterSelect, ResultTabs } from "../components/MatchFilters";
import { ArrowDownIcon } from "../components/icons";
import { MATCH_LIST_CLASS, MatchCard, MatchCardHeader } from "../components/MatchCard";
import { Panel } from "../components/Panel";
import { queueLabel } from "../components/QueueSelect";
import { getChampionName, useChampionData } from "../hooks/useChampions";
import { useActiveAccount } from "../hooks/useActiveAccount";
import { useActiveMode } from "../hooks/useActiveMode";
import { useMatches } from "../hooks/useMatches";
import { formatPatch } from "../lib/format";
import { useScopedQueue } from "../lib/historyScope";
import type { MatchFilterOptions, MatchSort, MatchSortDir } from "../lib/types";
import { SORT_OPTIONS } from "./MatchHistory";

const PAGE_SIZE = 25;

// Every toolbar control is 38px tall with the same radius as the search box and tabs
const SELECT_CLASS = "h-[38px] rounded-lg px-3.5";

export default function MatchHistoryTab() {
  const champData = useChampionData();
  const [account] = useActiveAccount();
  const [dataMode] = useActiveMode();
  const [championFilter, setChampionFilter] = useState<number | undefined>();
  const [patchFilter, setPatchFilter] = useState<string | undefined>();
  const [localQueue, setQueueFilter] = useState<number | undefined>();
  const queueFilter = useScopedQueue(localQueue);
  const [resultFilter, setResultFilter] = useState<"win" | "loss" | undefined>();
  const [sort, setSort] = useState<MatchSort | undefined>();
  const [sortDir, setSortDir] = useState<MatchSortDir>("desc");
  const [filterOptions, setFilterOptions] = useState<MatchFilterOptions>({
    patches: [],
    champions: [],
    queues: [],
    accounts: [],
    hasFavorites: false,
  });
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { matches, total, loading, error, hasMore, loadMore } = useMatches(
    {
      championId: championFilter,
      patch: patchFilter,
      queue: queueFilter,
      account,
      sort,
      sortDir,
      result: resultFilter,
    },
    PAGE_SIZE,
  );

  const fetchOptions = useCallback(
    () =>
      window.api
        .getMatchFilterOptions({
          championId: championFilter,
          patch: patchFilter,
          queue: queueFilter,
          account: account === "all" ? undefined : account,
        })
        .then(setFilterOptions),
    [championFilter, patchFilter, queueFilter, account],
  );

  useEffect(() => {
    fetchOptions();
    return window.api.onGamesUpdated(fetchOptions);
  }, [fetchOptions]);

  // A filter chosen for one account can match nothing for the next one
  useEffect(() => {
    setChampionFilter(undefined);
    setPatchFilter(undefined);
    setQueueFilter(undefined);
    setResultFilter(undefined);
  }, [account]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore();
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  // Days and sessions only read right when the list is in time order
  const days = useMemo(
    () => (!sort || sort === "date" ? groupDaysAndSessions(matches) : null),
    [sort, matches],
  );
  const renderCard = (match: MatchListItem, index: number) => (
    <MatchCard
      // The combined view can list one game once per tracked account
      key={`${match.game_id}-${index}`}
      match={match}
      championName={getChampionName(champData, match.champion_id)}
    />
  );

  return (
    <div className="flex min-h-full w-full flex-col gap-5 pr-4">
      <Panel variant="featured">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-display text-[22px] font-bold text-lol-text-bright">
            Match History
            <span className="ml-3 text-[13px] font-normal text-lol-text">{total} games</span>
          </h1>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-lol-border/60 bg-black/20 p-2">
          <ResultTabs value={resultFilter} onChange={setResultFilter} className="h-[38px]" />
          <ChampionCombobox
            value={championFilter ?? null}
            onChange={(value) => setChampionFilter(value ?? undefined)}
            placeholder="Search champion"
          />
          <FilterSelect
            className={SELECT_CLASS}
            value={patchFilter}
            onChange={setPatchFilter}
            placeholder="All Patches"
            title="Patch"
            options={filterOptions.patches.map((patch) => ({
              value: patch,
              label: `Patch ${formatPatch(patch)}`,
            }))}
          />
          {dataMode !== "mayhem" && (
            <FilterSelect
              className={SELECT_CLASS}
              title="Filter by queue type"
              value={queueFilter}
              onChange={(value) => setQueueFilter(value === undefined ? undefined : Number(value))}
              placeholder="Queue Type"
              options={filterOptions.queues.map((q) => ({
                value: q,
                label: q === QUEUE_GROUP_ARENA ? "All Arena" : queueLabel(q),
              }))}
            />
          )}
          <span className="mx-1 h-6 w-px bg-lol-border" aria-hidden="true" />
          <div className="flex items-center gap-2">
            <FilterSelect
              className={SELECT_CLASS}
              value={sort}
              onChange={(value) => {
                setSort(value);
                setSortDir("desc");
              }}
              placeholder="Sort: Date"
              title="Sort by"
              options={SORT_OPTIONS}
            />
            <FilterChip
              onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
              title={sortDir === "desc" ? "Highest or newest first" : "Lowest or oldest first"}
              icon={
                <ArrowDownIcon
                  className={`h-3.5 w-3.5 transition-transform ${sortDir === "asc" ? "rotate-180" : ""}`}
                />
              }
              className="!h-[38px] !rounded-lg !px-3.5"
            >
              {sortDir === "desc" ? "High → Low" : "Low → High"}
            </FilterChip>
          </div>
        </div>

        {loading && matches.length === 0 && (
          <p className="py-8 text-center text-sm text-lol-text">Loading matches...</p>
        )}
        {!loading && error && matches.length === 0 && (
          <p className="py-8 text-center text-sm text-lol-loss">
            Unable to load matches: {error.message}
          </p>
        )}
        {!loading && !error && matches.length === 0 && (
          <p className="py-8 text-center text-sm text-lol-text">
            No games match the current filters.
          </p>
        )}

        <div className="overflow-x-auto pb-1">
          <div className={MATCH_LIST_CLASS}>
            {/* Grouped lists repeat the column labels under every session header */}
            {!days && matches.length > 0 && <MatchCardHeader />}
            {days ? (
              <div className="flex flex-col gap-6">
                {days.map((day) => (
                  <section key={day.key}>
                    <DayHeader day={day} />
                    <div className="flex flex-col gap-4">
                      {day.sessions.map((session) => (
                        <div key={session.key}>
                          <SessionHeader session={session} total={day.sessions.length} />
                          <MatchCardHeader />
                          <div className="flex flex-col gap-2">
                            {session.matches.map(renderCard)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2">{matches.map(renderCard)}</div>
            )}
          </div>
        </div>

        {hasMore && <div ref={sentinelRef} className="h-1" />}
        {loading && matches.length > 0 && (
          <div className="py-3 text-center text-sm text-lol-text">Loading...</div>
        )}
      </Panel>
    </div>
  );
}
