import { ACTIVE_ACCOUNT_EVENT } from "../lib/accountsEvent";
import { useViewState } from "../hooks/useViewState";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MatchListItem } from "../../shared/api";
import { DayHeader, SessionHeader } from "../components/MatchGroupHeaders";
import { groupDaysAndSessions } from "../lib/matchSessions";
import { useSessionGrouping } from "../hooks/useSessionGrouping";
import { QUEUE_GROUP_ARENA } from "../../shared/queues";
import { ChampionCombobox } from "../components/ChampionCombobox";
import { ContextMenu } from "../components/ContextMenu";
import { FilterChip } from "../components/FilterChip";
import { FilterSelect, ResultTabs, SORT_OPTIONS } from "../components/MatchFilters";
import { ArrowDownIcon, StarIcon } from "../components/icons";
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

const PAGE_SIZE = 25;

// Every toolbar control is 38px tall with the same radius as the search box and tabs
const SELECT_CLASS = "h-[38px] rounded-lg px-3.5";

const NO_OPTIONS: MatchFilterOptions = {
  patches: [],
  champions: [],
  queues: [],
  accounts: [],
  hasFavorites: false,
};

export default function MatchHistoryTab() {
  const champData = useChampionData();
  const [account] = useActiveAccount();
  const [dataMode] = useActiveMode();
  const [championFilter, setChampionFilter] = useViewState<number | undefined>(
    "historyTab.champion",
    undefined,
  );
  const [patchFilter, setPatchFilter] = useViewState<string | undefined>(
    "historyTab.patch",
    undefined,
  );
  const [localQueue, setQueueFilter] = useViewState<number | undefined>(
    "historyTab.queue",
    undefined,
  );
  const queueFilter = useScopedQueue(localQueue);
  const [resultFilter, setResultFilter] = useViewState<"win" | "loss" | undefined>(
    "historyTab.result",
    undefined,
  );
  const [sort, setSort] = useViewState<MatchSort | undefined>("historyTab.sort", undefined);
  const [sortDir, setSortDir] = useViewState<MatchSortDir>("historyTab.sortDir", "desc");
  const [favoritesOnly, setFavoritesOnly] = useViewState("historyTab.favorites", false);
  const [filterOptions, setFilterOptions] = useState(NO_OPTIONS);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    match: MatchListItem;
  } | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { matches, total, loading, error, hasMore, loadMore, reload } = useMatches(
    {
      championId: championFilter,
      patch: patchFilter,
      queue: queueFilter,
      account,
      sort,
      sortDir,
      result: resultFilter,
      favorites: favoritesOnly,
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

  // Removing the last favorite hides the star button, so the filter must not stay on. Waits for
  // real options: the empty placeholder would drop the remembered filter on every visit.
  useEffect(() => {
    if (filterOptions !== NO_OPTIONS && !filterOptions.hasFavorites) setFavoritesOnly(false);
  }, [filterOptions, setFavoritesOnly]);

  const toggleFavorite = async (match: MatchListItem) => {
    setContextMenu(null);
    await window.api.toggleFavorite(match.game_id);
    reload();
    fetchOptions();
  };

  // A filter chosen for one account can match nothing for the next one. Listens for the switch
  // itself: the account value also changes while it loads, which must not clear saved filters.
  useEffect(() => {
    const reset = () => {
      setChampionFilter(undefined);
      setPatchFilter(undefined);
      setQueueFilter(undefined);
      setResultFilter(undefined);
    };
    window.addEventListener(ACTIVE_ACCOUNT_EVENT, reset);
    return () => window.removeEventListener(ACTIVE_ACCOUNT_EVENT, reset);
  }, [setChampionFilter, setPatchFilter, setQueueFilter, setResultFilter]);

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
  const [grouping] = useSessionGrouping();
  const days = useMemo(
    () =>
      grouping !== "off" && (!sort || sort === "date")
        ? groupDaysAndSessions(matches, grouping)
        : null,
    [sort, matches, grouping],
  );
  const renderCard = (match: MatchListItem, index: number) => (
    <MatchCard
      // The combined view can list one game once per tracked account
      key={`${match.game_id}-${index}`}
      match={match}
      championName={getChampionName(champData, match.champion_id)}
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, match });
      }}
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
            {filterOptions.hasFavorites && (
              <FilterChip
                active={favoritesOnly}
                onClick={() => setFavoritesOnly((v) => !v)}
                title={favoritesOnly ? "Showing favorites only" : "Only show favorites"}
                icon={
                  <StarIcon
                    className="h-3.5 w-3.5"
                    fill={favoritesOnly ? "currentColor" : "none"}
                  />
                }
                className={`!h-[38px] !rounded-lg !px-3.5 ${favoritesOnly ? "!text-amber-400" : ""}`}
              >
                Favorites
              </FilterChip>
            )}
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

      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)}>
          <button
            type="button"
            onClick={() => toggleFavorite(contextMenu.match)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-lol-text-bright hover:bg-white/5"
          >
            <span className={contextMenu.match.favorite ? "text-amber-400" : "text-lol-text"}>
              {contextMenu.match.favorite ? "★" : "☆"}
            </span>
            {contextMenu.match.favorite ? "Remove from Favorites" : "Add to Favorites"}
          </button>
        </ContextMenu>
      )}
    </div>
  );
}
