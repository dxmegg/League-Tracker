import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type {
  ActivityHeatmapDay,
  ChampionData,
  HomeDashboardPayload,
  HomeTimePeriod,
} from "../../shared/api";
import { QUEUE_GROUP_ARENA } from "../../shared/queues";
import { getChampionName } from "../hooks/useChampions";
import { useIpc } from "../hooks/useIpc";
import { useMatches } from "../hooks/useMatches";
import { formatPatch } from "../lib/format";
import type {
  DashboardData,
  MatchDetail,
  MatchFilterOptions,
  MatchSort,
  MatchSortDir,
} from "../lib/types";
import { SORT_OPTIONS } from "../pages/MatchHistory";
import ActivityHeatmap, { type HeatmapUnit } from "./ActivityHeatmap";
import { ChampionCombobox } from "./ChampionCombobox";
import { FilterChip } from "./FilterChip";
import { FilterSelect } from "./FilterSelect";
import { HistoryStatRow } from "./HistoryStatRow";
import { HomeHero } from "./HomeHero";
import { ArrowDownIcon } from "./icons";
import { MatchRowExperiment } from "./MatchRowExperiment";
import { Panel } from "./Panel";
import { queueLabel } from "./QueueSelect";
import { useActiveMode } from "../hooks/useActiveMode";
import { useScopedQueue } from "../lib/historyScope";

// The list loads this many games per request, first page and every scroll after
const PAGE_SIZE = 25;

// The period filter also sets what one heatmap tile covers
const HEATMAP_UNIT: Record<HomeTimePeriod, HeatmapUnit> = {
  "24h": "hour",
  "7d": "week",
  "30d": "month",
  full: "day",
};

function StatTiles({ dashboard, tiles }: { dashboard: DashboardData; tiles: "score" | "kda" }) {
  const games = dashboard.totalGames;
  const share = (count: number) => (games > 0 ? (count / games) * 100 : 0);
  const mk = dashboard.multikills;
  return (
    <HistoryStatRow
      tiles={tiles}
      gameName=""
      tagLine={null}
      profileIconId={null}
      gamesLabel=""
      wins={dashboard.wins}
      losses={games - dashboard.wins}
      winRate={share(dashboard.wins)}
      recentForm={[]}
      avgScore={dashboard.avgScore ?? null}
      teamAvgScore={dashboard.teamAvgScore ?? null}
      mvpCount={dashboard.mvps}
      mvpShare={share(dashboard.mvps)}
      aceCount={dashboard.aces}
      aceShare={share(dashboard.aces)}
      avgKills={dashboard.avgKills}
      avgDeaths={dashboard.avgDeaths}
      avgAssists={dashboard.avgAssists}
      kdaRatio={
        games > 0
          ? (dashboard.totalKills + dashboard.totalAssists) / Math.max(dashboard.totalDeaths, 1)
          : 0
      }
      killsTotal={dashboard.totalKills}
      deathsTotal={dashboard.totalDeaths}
      assistsTotal={dashboard.totalAssists}
      avgDamageDealt={dashboard.avgDamageDealt}
      damageDealtTotal={dashboard.damageDealtTotal}
      avgDamageTaken={dashboard.avgDamageTaken}
      damageTakenTotal={dashboard.damageTakenTotal}
      avgHealed={dashboard.avgDamageHealed}
      healedTotal={dashboard.damageHealedTotal}
      avgCs={dashboard.avgCs}
      csPerMin={dashboard.csPerMin}
      avgGold={dashboard.avgGold}
      goldTotal={dashboard.goldTotal}
      avgGameLengthSec={dashboard.avgGameLength}
      multikillsTotal={mk.doubles + mk.triples + mk.quadras + mk.pentas}
      doubles={{ count: mk.doubles, games: mk.gamesWithDoubles }}
      triples={{ count: mk.triples, games: mk.gamesWithTriples }}
      quadras={{ count: mk.quadras, games: mk.gamesWithQuadras }}
      pentas={{ count: mk.pentas, games: mk.gamesWithPentas }}
    />
  );
}

export function YourProfileSections({
  account,
  timePeriod,
  champData,
  leading,
}: {
  // "all" aggregates every tracked account; otherwise a single puuid
  account: string;
  timePeriod: HomeTimePeriod;
  champData: ChampionData;
  // Panel placed first in the KDA and Multikills row
  leading?: ReactNode;
}) {
  const [championFilter, setChampionFilter] = useState<number | undefined>(undefined);
  const [patchFilter, setPatchFilter] = useState<string | undefined>(undefined);
  const [localQueue, setQueueFilter] = useState<number | undefined>(undefined);
  const queueFilter = useScopedQueue(localQueue);
  const [dataMode] = useActiveMode();
  const [sort, setSort] = useState<MatchSort | undefined>(undefined);
  const [sortDir, setSortDir] = useState<MatchSortDir>("desc");
  const [filterOptions, setFilterOptions] = useState<MatchFilterOptions>({
    patches: [],
    champions: [],
    queues: [],
    accounts: [],
    hasFavorites: false,
  });
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [puuids, setPuuids] = useState<string[] | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { matches, total, loading, error, hasMore, loadMore } = useMatches(
    {
      championId: championFilter,
      patch: patchFilter,
      queue: queueFilter,
      account,
      sort,
      sortDir,
      timePeriod,
    },
    PAGE_SIZE,
  );

  const { data: dashboard, refetch: refetchDashboard } = useIpc<DashboardData>(
    () =>
      window.api.getDashboard({
        championId: championFilter,
        patch: patchFilter,
        queue: queueFilter,
        account,
        timePeriod,
      }),
    [championFilter, patchFilter, queueFilter, account, timePeriod],
  );
  const { data: chart } = useIpc<HomeDashboardPayload>(
    () => window.api.getHomeDashboard(account, timePeriod, queueFilter),
    [account, timePeriod, queueFilter],
  );
  const { data: activityRows } = useIpc<ActivityHeatmapDay[]>(
    () => window.api.getActivityHeatmap(account, timePeriod, queueFilter),
    [account, timePeriod, queueFilter],
  );

  useEffect(() => {
    window.api.getAllSummonerPuuids().then(setPuuids);
  }, []);

  // Dropdown options come from player_stats, which has no per-account rows for "all"
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
    return window.api.onGamesUpdated(() => {
      refetchDashboard();
      fetchOptions();
    });
  }, [fetchOptions, refetchDashboard]);

  // A filter chosen for one account can match nothing for the next one
  useEffect(() => {
    setChampionFilter(undefined);
    setPatchFilter(undefined);
    setQueueFilter(undefined);
    setExpandedId(null);
  }, [account]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  const toggleExpand = useCallback(
    async (gameId: number) => {
      if (expandedId === gameId) {
        setExpandedId(null);
        setDetail(null);
        return;
      }
      setExpandedId(gameId);
      setDetailLoading(true);
      try {
        setDetail(await window.api.getMatchDetail(gameId));
      } finally {
        setDetailLoading(false);
      }
    },
    [expandedId],
  );

  const hasTiles = dashboard !== null && dashboard.totalGames > 0;

  return (
    <div className="flex flex-col gap-5">
      {(leading || hasTiles) && (
        <div
          className={`grid grid-cols-1 gap-5 xl:min-h-[400px] ${
            leading && hasTiles
              ? "xl:grid-cols-[1fr_1.35fr_1.2fr]"
              : hasTiles
                ? "xl:grid-cols-[1.35fr_1.2fr]"
                : ""
          }`}
        >
          {leading}
          {hasTiles && <StatTiles dashboard={dashboard} tiles="kda" />}
        </div>
      )}

      <Panel>
        <HomeHero
          dashboard={chart}
          loading={!chart}
          timePeriod={timePeriod}
          champData={champData}
          flat
          chartOnly
        />
      </Panel>

      <div
        className={`grid grid-cols-1 gap-5 ${hasTiles ? "xl:grid-cols-[minmax(0,0.9fr)_minmax(0,2fr)]" : ""}`}
      >
        {hasTiles && <StatTiles dashboard={dashboard} tiles="score" />}
        <div className="min-w-0">
          <ActivityHeatmap days={activityRows ?? []} fluid unit={HEATMAP_UNIT[timePeriod]} />
        </div>
      </div>

      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-[16px] font-semibold text-lol-text-bright">
            <span className="mr-2 inline-block h-1.5 w-1.5 rotate-45 bg-lol-crimson align-middle" />
            Full match history
            <span className="ml-3 text-[13px] font-normal text-lol-text">{total} games</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <ChampionCombobox
              value={championFilter ?? null}
              onChange={(value) => setChampionFilter(value ?? undefined)}
              placeholder="Search champion"
            />
            <FilterSelect
              value={patchFilter}
              onChange={(value) => setPatchFilter(value)}
              placeholder="All Patches"
              title="Patch"
              className="h-8 px-3 text-[12.5px]"
              options={filterOptions.patches.map((patch) => ({
                value: patch,
                label: `Patch ${formatPatch(patch)}`,
              }))}
            />
            {dataMode !== "mayhem" && (
              <FilterSelect
                title="Filter by queue type"
                value={queueFilter}
                onChange={(value) =>
                  setQueueFilter(value === undefined ? undefined : Number(value))
                }
                placeholder="Queue Type"
                className="h-8 px-3 text-[12.5px]"
                options={filterOptions.queues.map((q) => ({
                  value: q,
                  label: q === QUEUE_GROUP_ARENA ? "All Arena" : queueLabel(q),
                }))}
              />
            )}
            <div className="flex items-center gap-1">
              <FilterSelect
                value={sort}
                onChange={(value) => {
                  setSort(value);
                  setSortDir("desc");
                }}
                placeholder="Sort"
                title="Sort"
                className="h-8 px-3 text-[12.5px]"
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
                className="h-8 w-8 !px-0"
              />
            </div>
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

        <div className="match-list-exp" style={{ containerType: "inline-size" }}>
          {matches.map((match, index) => (
            <MatchRowExperiment
              // The combined view can list one game once per tracked account
              key={`${match.game_id}-${index}`}
              match={match}
              championName={getChampionName(champData, match.champion_id)}
              champData={champData}
              expanded={expandedId === match.game_id}
              detail={expandedId === match.game_id ? detail : null}
              detailLoading={expandedId === match.game_id && detailLoading}
              puuids={puuids}
              onToggle={() => toggleExpand(match.game_id)}
            />
          ))}
        </div>

        {hasMore && <div ref={sentinelRef} className="h-1" />}
        {loading && matches.length > 0 && (
          <div className="py-3 text-center text-sm text-lol-text">Loading...</div>
        )}
      </Panel>
    </div>
  );
}
