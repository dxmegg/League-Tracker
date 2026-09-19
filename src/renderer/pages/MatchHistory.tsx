import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useMatches } from "../hooks/useMatches";
import { useChampionData, getChampionName, useRuneData } from "../hooks/useChampions";
import { useIpc } from "../hooks/useIpc";
import { useLcuStatus } from "../hooks/useLcuStatus";
import { useBackfill } from "../hooks/useBackfill";
import { useViewState } from "../hooks/useViewState";
import type {
  MatchListItem,
  MatchDetail,
  DashboardData,
  MatchFilterOptions,
  MatchSort,
  MatchSortDir,
  MultikillType,
  LcuStatus,
  BackfillProgress,
} from "../lib/types";
import ChampionIcon from "../components/ChampionIcon";
import AugmentIcon from "../components/AugmentIcon";
import ItemIcon from "../components/ItemIcon";
import { RuneCompact } from "../components/RuneSetup";
import RuneIcon from "../components/RuneIcon";
import MatchScoreboard from "../components/MatchScoreboard";
import StatCard from "../components/StatCard";
import SummonerIcon from "../components/SummonerIcon";
import SummonerSpellIcon from "../components/SummonerSpellIcon";
import WinRateBar from "../components/WinRateBar";
import { NoxianHerald } from "../components/NoxianHerald";
import { ArrowDownIcon, StarIcon, SwordsIcon, ZapIcon } from "../components/icons";
import {
  formatDuration,
  formatPlaytime,
  formatTimeAgo,
  formatKDA,
  kdaRatio,
  kdaColor,
  formatPatch,
  winRateColor,
} from "../lib/format";
import { queueLabel } from "../components/QueueSelect";
import { scoreColor } from "../../shared/opScore";
import { splitRuneSelections } from "../lib/runes";
import {
  QUEUE_GROUP_ARENA,
  QUEUE_SCOPE_MAYHEM,
  QUEUE_SCOPE_NORMAL,
  QUEUE_SCOPE_RANKED,
  QUEUE_SCOPE_ARAM,
  QUEUE_SCOPE_ARENA,
  isAugmentQueue,
} from "../../shared/queues";
import { parseRuneIds } from "../lib/runes";

// An empty list means something different depending on whether we're still
// waiting on the client, mid-import, or genuinely out of games.
function emptyStateMessage(
  status: LcuStatus,
  backfill: { running: boolean; progress: BackfillProgress | null },
) {
  if (backfill.running) {
    const p = backfill.progress;
    return p && p.total > 0
      ? `Importing your match history — ${p.current} of ${p.total} games checked...`
      : "Importing your match history...";
  }
  if (status !== "connected" && status !== "ingame") {
    return "Waiting for the League client. Once it's open, recent games import automatically.";
  }
  return "No League games found yet. Use Settings to sync your Riot match history.";
}

// The unselected state is the default sort (date), so it isn't listed here
const SORT_OPTIONS: { value: MatchSort; label: string }[] = [
  { value: "score", label: "Score" },
  { value: "kda", label: "KDA" },
  { value: "kills", label: "Kills" },
  { value: "duration", label: "Duration" },
  { value: "damageDealt", label: "Damage Dealt" },
  { value: "damageTaken", label: "Damage Taken" },
  { value: "healing", label: "Healing" },
];

const SELECT_CLASS =
  "select focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-deep)]";

// A session is a day of play, but the day doesn't end at midnight: games before
// this hour belong to the night that started the evening before.
const DAY_START_HOUR = 5;

// Queues with no lane to show. Riot still reports a teamPosition value for
// these (usually "NONE" or an empty string), so the UI has to drop them by
// queue id rather than by position.
const NO_LANE_QUEUES = new Set([
  65,
  67,
  100,
  450, // ARAM
  31,
  32,
  33,
  52,
  83,
  880, // Co-op vs AI
  1700,
  1740,
  1750, // Arena
  2000,
  2010,
  2020, // Tutorials
  2400,
  2450, // ARAM Mayhem, Mayhem Classic
  3140, // Training Tool
]);

const TEAM_POSITION_LABELS: Record<string, string> = {
  TOP: "Top",
  JUNGLE: "Jungle",
  MIDDLE: "Mid",
  BOTTOM: "Bottom",
  UTILITY: "Support",
};

const ARENA_PLACEMENT_LABELS: Record<number, string> = {
  1: "First place",
  2: "Second place",
  3: "Third place",
  4: "Fourth place",
  5: "Fifth place",
  6: "Sixth place",
};

// Human label for a row's lane, or null when this queue has no lane to show.
// "Unknown" is only for a lane queue whose stored position is missing — a game
// imported before migrateToV9 ran, or a remake that never got a position.
function laneLabel(match: MatchListItem): string | null {
  if (NO_LANE_QUEUES.has(match.queue_id)) return null;
  if (match.team_position == null || match.team_position === "") return "Unknown";
  return TEAM_POSITION_LABELS[match.team_position] ?? "Unknown";
}

// Local midnight of the session day a game belongs to.
function sessionDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(d.getHours() - DAY_START_HOUR);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

interface Session {
  key: number;
  day: number; // local midnight of the session's day, from sessionDay
  matches: MatchListItem[];
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
  avgScore: number | null;
}

// Expects a date-ordered list (either direction); remakes count toward the
// session's size but stay out of its record and averages.
function groupIntoSessions(matches: MatchListItem[]): Session[] {
  const sessions: Session[] = [];
  let current: MatchListItem[] = [];
  let currentDay = 0;

  const flush = () => {
    if (current.length === 0) return;
    let wins = 0;
    let losses = 0;
    let kills = 0;
    let deaths = 0;
    let assists = 0;
    let scoreSum = 0;
    let scored = 0;
    for (const m of current) {
      if (m.is_remake) continue;
      if (m.win) wins++;
      else losses++;
      kills += m.kills;
      deaths += m.deaths;
      assists += m.assists;
      if (m.score != null) {
        scoreSum += m.score;
        scored++;
      }
    }
    sessions.push({
      key: current[0].game_id,
      day: currentDay,
      matches: current,
      wins,
      losses,
      kills,
      deaths,
      assists,
      avgScore: scored > 0 ? scoreSum / scored : null,
    });
    current = [];
  };

  for (const m of matches) {
    const day = sessionDay(m.game_creation);
    if (current.length > 0 && day !== currentDay) flush();
    currentDay = day;
    current.push(m);
  }
  flush();
  return sessions;
}

function sessionLabel(day: number): string {
  const d = new Date(day);
  const today = new Date(sessionDay(Date.now()));
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== today.getFullYear() && { year: "numeric" }),
  });
}

export default function MatchHistory({
  scope,
}: {
  scope?: "mayhem" | "rest" | "ranked" | "normal" | "aram" | "arena";
}) {
  const [championFilter, setChampionFilter] = useViewState<number | undefined>(
    "matches.champion",
    undefined,
  );
  const [patchFilter, setPatchFilter] = useViewState<string | undefined>(
    "matches.patch",
    undefined,
  );
  const [queueFilter, setQueueFilter] = useViewState<number | undefined>(
    `matches.queue.${scope ?? "full"}`,
    undefined,
  );
  const scopedQueue =
    scope === "mayhem"
      ? (queueFilter ?? QUEUE_SCOPE_MAYHEM)
      : scope === "ranked"
        ? (queueFilter ?? QUEUE_SCOPE_RANKED)
        : scope === "normal"
          ? (queueFilter ?? QUEUE_SCOPE_NORMAL)
          : scope === "aram"
            ? (queueFilter ?? QUEUE_SCOPE_ARAM)
            : scope === "arena"
              ? (queueFilter ?? QUEUE_SCOPE_ARENA)
              : queueFilter;
  const [accountFilter, setAccountFilter] = useViewState<string | undefined>(
    "matches.account",
    undefined,
  );
  const [multikillFilter, setMultikillFilter] = useViewState<MultikillType[]>(
    "matches.multikills",
    [],
  );
  const [sort, setSort] = useViewState<MatchSort | undefined>("matches.sort", undefined);
  const [sortDir, setSortDir] = useViewState<MatchSortDir>("matches.sortDir", "desc");
  const [favoritesOnly, setFavoritesOnly] = useViewState("matches.favorites", false);
  const { matches, total, loading, error, hasMore, loadMore, reload } = useMatches({
    championId: championFilter,
    patch: patchFilter,
    queue: scopedQueue,
    account: accountFilter,
    sort,
    sortDir,
    multikills: multikillFilter,
    favorites: favoritesOnly,
  });

  const toggleMultikill = useCallback(
    (kind: MultikillType) => {
      setMultikillFilter((prev) =>
        prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind],
      );
    },
    [setMultikillFilter],
  );
  const champData = useChampionData();
  const { data: dashboard, refetch: refetchDashboard } = useIpc<DashboardData>(
    () =>
      window.api.getDashboard({
        championId: championFilter,
        patch: patchFilter,
        queue: scopedQueue,
        account: accountFilter,
      }),
    [championFilter, patchFilter, scopedQueue, accountFilter],
  );
  const [filterOptions, setFilterOptions] = useState<MatchFilterOptions>({
    patches: [],
    champions: [],
    queues: [],
    accounts: [],
    hasFavorites: false,
  });
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    match: MatchListItem;
  } | null>(null);
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [puuids, setPuuids] = useState<string[] | null>(null);
  const [profile, setProfile] = useState<{
    name: string | null;
    profileIcon: number | null;
  } | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const lcuStatus = useLcuStatus();
  const backfill = useBackfill();

  useEffect(() => {
    window.api.getAllSummonerPuuids().then(setPuuids);
  }, []);

  // The name and icon can change under us as new games arrive
  useEffect(() => {
    const load = () => window.api.getProfile().then(setProfile);
    load();
    return window.api.onGamesUpdated(load);
  }, []);

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

  const fetchOptions = useCallback(
    () =>
      window.api
        .getMatchFilterOptions({
          championId: championFilter,
          patch: patchFilter,
          queue: scopedQueue,
          account: accountFilter,
        })
        .then(setFilterOptions),
    [championFilter, patchFilter, scopedQueue, accountFilter],
  );

  useEffect(() => {
    fetchOptions();

    const unsub = window.api.onGamesUpdated(() => {
      refetchDashboard();
      fetchOptions();
    });
    return unsub;
  }, [fetchOptions, refetchDashboard]);

  // Clear a selection if new data leaves it without any matching games
  useEffect(() => {
    if (filterOptions.champions.length === 0 && filterOptions.patches.length === 0) return;
    if (championFilter !== undefined && !filterOptions.champions.includes(championFilter)) {
      setChampionFilter(undefined);
    }
    if (patchFilter !== undefined && !filterOptions.patches.includes(patchFilter)) {
      setPatchFilter(undefined);
    }
    if (
      scope === undefined &&
      queueFilter !== undefined &&
      !filterOptions.queues.includes(queueFilter)
    ) {
      setQueueFilter(undefined);
    }
    if (
      accountFilter !== undefined &&
      !filterOptions.accounts.some((a) => a.puuid === accountFilter)
    ) {
      setAccountFilter(undefined);
    }
    // Settles rather than loops: clearing a filter sets it to undefined, and
    // the undefined branch does nothing on the re-run.
  }, [
    filterOptions,
    championFilter,
    patchFilter,
    queueFilter,
    scope,
    accountFilter,
    setChampionFilter,
    setPatchFilter,
    setQueueFilter,
    setAccountFilter,
  ]);

  // Unfavoriting the last game takes the toggle button away with it, so the
  // filter can't be left on with no way to turn it off.
  useEffect(() => {
    if (!filterOptions.hasFavorites) setFavoritesOnly(false);
  }, [filterOptions.hasFavorites, setFavoritesOnly]);

  const championOptions = useMemo(
    () =>
      filterOptions.champions
        .map((id) => ({ id, name: getChampionName(champData, id) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [filterOptions.champions, champData],
  );

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
        const d = await window.api.getMatchDetail(gameId);
        setDetail(d);
      } finally {
        setDetailLoading(false);
      }
    },
    [expandedId],
  );

  const handleToggleFavorite = useCallback(
    async (match: MatchListItem) => {
      setContextMenu(null);
      await window.api.toggleFavorite(match.game_id);
      reload();
      // The first favorite reveals the toggle button, the last one hides it
      fetchOptions();
    },
    [reload, fetchOptions],
  );

  const avgKills =
    dashboard && dashboard.totalGames > 0
      ? (dashboard.totalKills / dashboard.totalGames).toFixed(1)
      : "0";
  const avgDeaths =
    dashboard && dashboard.totalGames > 0
      ? (dashboard.totalDeaths / dashboard.totalGames).toFixed(1)
      : "0";
  const avgAssists =
    dashboard && dashboard.totalGames > 0
      ? (dashboard.totalAssists / dashboard.totalGames).toFixed(1)
      : "0";
  const kdaValue =
    dashboard && dashboard.totalDeaths > 0
      ? (dashboard.totalKills + dashboard.totalAssists) / dashboard.totalDeaths
      : Infinity;
  // With one account selected, the profile card is about that account — not
  // whichever one played most recently.
  const selectedAccount = accountFilter
    ? filterOptions.accounts.find((a) => a.puuid === accountFilter)
    : undefined;
  const profileShown = selectedAccount
    ? { name: selectedAccount.name, profileIcon: selectedAccount.profileIcon }
    : profile;

  // Session headers only make sense when the list reads in time order; any
  // other sort interleaves days, so those render flat.
  const isDateSort = !sort || sort === "date";
  const sessions = useMemo(
    () => (isDateSort ? groupIntoSessions(matches) : null),
    [isDateSort, matches],
  );

  const totalMultikills = dashboard
    ? dashboard.multikills.doubles +
      dashboard.multikills.triples +
      dashboard.multikills.quadras +
      dashboard.multikills.pentas
    : 0;

  return (
    <div className="space-y-4 w-full">
      {/* Stat Cards */}
      {dashboard && dashboard.totalGames > 0 && (
        <div className="grid grid-cols-[minmax(240px,1.4fr)_repeat(3,minmax(170px,1fr))] gap-3 items-stretch max-w-[1800px]">
          <ProfileCard profile={profileShown} dashboard={dashboard} />

          <StatCard
            label="Avg Score"
            accent="gold"
            icon={<StarIcon className="w-3 h-3 2xl:w-4 2xl:h-4" />}
            value={
              dashboard.avgScore != null ? (
                <span className={scoreColor(dashboard.avgScore)}>
                  {dashboard.avgScore.toFixed(1)}
                  <span className="text-lg font-semibold text-lol-text/60"> / 10</span>
                </span>
              ) : (
                "—"
              )
            }
            subtext={<ScoreMeter score={dashboard.avgScore} />}
          >
            <BadgeCounts
              mvps={dashboard.mvps}
              aces={dashboard.aces}
              scoredWins={dashboard.scoredWins}
              scoredLosses={dashboard.scoredLosses}
            />
          </StatCard>

          <StatCard
            label="Avg KDA"
            accent="sky"
            icon={<SwordsIcon className="w-3 h-3 2xl:w-4 2xl:h-4" />}
            value={
              /* Three numbers where the other cards show one — a notch smaller
                 keeps it on one line in the narrowest column */
              <span>
                {avgKills}
                <Slash />
                {avgDeaths}
                <Slash />
                {avgAssists}
              </span>
            }
            subtext={
              <span className={`text-base font-semibold ${kdaColor(kdaValue)}`}>
                {kdaRatio(dashboard.totalKills, dashboard.totalDeaths, dashboard.totalAssists)} KDA
              </span>
            }
          >
            <div className="text-xs text-lol-text">
              {dashboard.totalKills} / {dashboard.totalDeaths} / {dashboard.totalAssists} total
            </div>
          </StatCard>

          <StatCard
            label="Multikills"
            accent="purple"
            icon={<ZapIcon className="w-3 h-3 2xl:w-4 2xl:h-4" />}
            value={totalMultikills}
          >
            <div className="grid grid-cols-4 gap-0.5 xl:gap-1 min-w-0">
              {(
                [
                  {
                    kind: "doubles",
                    label: "D",
                    name: "double",
                    value: dashboard.multikills.doubles,
                    color: "text-sky-400",
                  },
                  {
                    kind: "triples",
                    label: "T",
                    name: "triple",
                    value: dashboard.multikills.triples,
                    color: "text-amber-400",
                  },
                  {
                    kind: "quadras",
                    label: "Q",
                    name: "quadra",
                    value: dashboard.multikills.quadras,
                    color: "text-purple-400",
                  },
                  {
                    kind: "pentas",
                    label: "P",
                    name: "penta",
                    value: dashboard.multikills.pentas,
                    color: "text-red-400",
                  },
                ] as {
                  kind: MultikillType;
                  label: string;
                  name: string;
                  value: number;
                  color: string;
                }[]
              ).map(({ kind, label, name, value, color }) => {
                const active = multikillFilter.includes(kind);
                return (
                  <button
                    key={label}
                    onClick={() => toggleMultikill(kind)}
                    title={`Only show games with a ${name} kill`}
                    className={`min-w-0 text-center rounded-md border px-1 py-0.5 xl:px-1.5 xl:py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-deep)] ${
                      active
                        ? "border-lol-gold/60 bg-lol-gold/10"
                        : "border-transparent hover:border-lol-border hover:bg-white/5"
                    }`}
                  >
                    <div
                      className={`text-base xl:text-lg 2xl:text-xl font-bold leading-tight ${color}`}
                    >
                      {value}
                    </div>
                    <div className="text-[9px] xl:text-[10px] font-semibold text-lol-text">
                      {label}
                    </div>
                  </button>
                );
              })}
            </div>
          </StatCard>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-bold text-lol-text-bright">
          <NoxianHerald className="shrink-0 text-lol-gold" />
          <span>
            {scope === "mayhem"
              ? "ARAM MAYHEM MATCHES"
              : scope === "ranked"
                ? "RANKED MATCHES"
                : scope === "normal"
                  ? "NORMAL MATCHES"
                  : scope === "aram"
                    ? "ARAM MATCHES"
                    : scope === "arena"
                      ? "ARENA MATCHES"
                      : scope === "rest"
                        ? "FULL MATCH HISTORY"
                        : "FULL MATCH HISTORY"}
          </span>
        </h1>
        <div className="flex items-center gap-2">
          {filterOptions.hasFavorites && (
            <button
              onClick={() => setFavoritesOnly((v) => !v)}
              title={favoritesOnly ? "Showing favorites only" : "Only show favorites"}
              className={`flex items-center rounded-lg border px-2 py-1.5 transition-colors ${
                favoritesOnly
                  ? "border-lol-gold/60 bg-lol-gold/10 text-amber-400"
                  : "border-lol-border bg-lol-card text-lol-text hover:border-lol-gold/60 hover:text-lol-text-bright"
              }`}
            >
              {/* h-5 matches the selects' line-height so the boxes end up the same height */}
              <span className="flex h-5 items-center">
                <StarIcon className="h-3.5 w-3.5" fill={favoritesOnly ? "currentColor" : "none"} />
              </span>
            </button>
          )}
          {/* A single-account database doesn't need an account dropdown */}
          {(filterOptions.accounts.length > 1 || accountFilter !== undefined) && (
            <select
              value={accountFilter ?? ""}
              onChange={(e) => setAccountFilter(e.target.value === "" ? undefined : e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">All Accounts</option>
              {filterOptions.accounts.map((a) => (
                <option key={a.puuid} value={a.puuid}>
                  {a.name ?? "Unknown account"}
                </option>
              ))}
            </select>
          )}
          <select
            value={championFilter ?? ""}
            onChange={(e) =>
              setChampionFilter(e.target.value === "" ? undefined : Number(e.target.value))
            }
            className={SELECT_CLASS}
          >
            <option value="">All Champions</option>
            {championOptions.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select
            value={patchFilter ?? ""}
            onChange={(e) => setPatchFilter(e.target.value === "" ? undefined : e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">All Patches</option>
            {filterOptions.patches.map((p) => (
              <option key={p} value={p}>
                Patch {formatPatch(p)}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by queue type"
            title="Filter by queue type"
            value={queueFilter ?? ""}
            onChange={(e) =>
              setQueueFilter(e.target.value === "" ? undefined : Number(e.target.value))
            }
            className={SELECT_CLASS}
          >
            <option value="">Queue Type</option>
            {filterOptions.queues.map((q) => (
              <option key={q} value={q}>
                {q === QUEUE_GROUP_ARENA ? "All Arena" : queueLabel(q)}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <select
              value={sort ?? ""}
              onChange={(e) => {
                setSort(e.target.value === "" ? undefined : (e.target.value as MatchSort));
                setSortDir("desc");
              }}
              className={SELECT_CLASS}
            >
              <option value="">Sort</option>
              {SORT_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
              title={
                !sort || sort === "date"
                  ? sortDir === "desc"
                    ? "Newest first"
                    : "Oldest first"
                  : sortDir === "desc"
                    ? "Highest first"
                    : "Lowest first"
              }
              className="flex items-center rounded-lg border border-lol-border bg-lol-card px-2 py-1.5 text-lol-text transition-colors hover:border-lol-gold/60 hover:text-lol-text-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-deep)]"
            >
              {/* h-5 matches the selects' line-height so the boxes end up the same height */}
              <span className="flex h-5 items-center">
                <ArrowDownIcon
                  className={`h-3.5 w-3.5 transition-transform ${sortDir === "asc" ? "rotate-180" : ""}`}
                />
              </span>
            </button>
          </div>
        </div>
      </div>

      {loading && matches.length === 0 && (
        <div className="bg-lol-card rounded-xl border border-lol-border/60 p-8 text-center text-lol-text">
          Loading matches...
        </div>
      )}

      {!loading && matches.length === 0 && error && (
        <div className="bg-lol-card rounded-xl border border-lol-border/60 p-8 text-center text-lol-loss">
          Unable to load matches: {error.message}
        </div>
      )}

      {matches.length === 0 && !loading && !error && total === 0 && (
        <div className="bg-lol-card rounded-xl border border-lol-border/60 p-8 text-center text-lol-text">
          {championFilter !== undefined ||
          patchFilter !== undefined ||
          (scope === undefined && queueFilter !== undefined) ||
          accountFilter !== undefined ||
          multikillFilter.length > 0 ||
          favoritesOnly
            ? "No games match the current filters."
            : emptyStateMessage(lcuStatus, backfill)}
        </div>
      )}

      {(() => {
        const renderMatch = (m: MatchListItem) => (
          <GameRow
            key={m.game_id}
            match={m}
            champData={champData}
            expanded={expandedId === m.game_id}
            detail={expandedId === m.game_id ? detail : null}
            detailLoading={expandedId === m.game_id && detailLoading}
            puuids={puuids}
            onToggle={() => toggleExpand(m.game_id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, match: m });
            }}
          />
        );
        return sessions ? (
          <div className="space-y-4">
            {sessions.map((s) => (
              <div key={s.key}>
                <SessionHeader session={s} />
                <div className="mb-1 h-0.5 w-full bg-gradient-to-r from-lol-gold/20 via-lol-gold/10 to-transparent" />
                <div className="space-y-1">{s.matches.map(renderMatch)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1">{matches.map(renderMatch)}</div>
        );
      })()}

      {hasMore && <div ref={sentinelRef} className="h-1" />}
      {loading && matches.length > 0 && (
        <div className="text-center py-3 text-sm text-lol-text">Loading...</div>
      )}

      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)}>
          <button
            onClick={() => handleToggleFavorite(contextMenu.match)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-lol-text-bright hover:bg-white/5 text-left"
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

function getResponsiveIconSize() {
  return window.innerWidth >= 1536 ? 72 : window.innerWidth >= 1280 ? 56 : 48;
}

function useResponsiveIconSize() {
  const [size, setSize] = useState(getResponsiveIconSize);

  useEffect(() => {
    const handleResize = () => setSize(getResponsiveIconSize());
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return size;
}

// The identity half of the top row: who we are, how the record stands, and how
// the last handful of games went.
function ProfileCard({
  profile,
  dashboard,
}: {
  profile: { name: string | null; profileIcon: number | null } | null;
  dashboard: DashboardData;
}) {
  const losses = dashboard.totalGames - dashboard.wins;
  const avatarSize = useResponsiveIconSize();
  // Oldest on the left so the strip reads left-to-right in time
  const pips = dashboard.recentForm.slice().reverse();

  return (
    <div className="noxus-card flex flex-col h-full justify-center gap-2 xl:gap-3 p-5 xl:p-6 2xl:p-7">
      <div className="relative flex items-center gap-4">
        <div
          className="shrink-0 rounded-full p-[2px]"
          style={{
            background:
              "linear-gradient(138deg, var(--theme-accent) 0%, var(--theme-accent-bright) 50%, var(--theme-accent) 100%)",
          }}
        >
          <SummonerIcon
            iconId={profile?.profileIcon ?? null}
            size={avatarSize}
            className="rounded-full bg-lol-dark object-cover"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-lg xl:text-xl 2xl:text-xl font-bold text-lol-text-bright truncate leading-tight">
            {profile?.name ?? "Summoner"}
          </div>
          {/* The totals below pool every tracked account, so say when the name
              above only accounts for part of them */}
          <div className="text-xs xl:text-[13px] 2xl:text-sm text-lol-text truncate">
            {dashboard.totalGames} {dashboard.totalGames === 1 ? "game" : "games"}
            {dashboard.totalDuration > 0 && ` · ${formatPlaytime(dashboard.totalDuration)} played`}
            {dashboard.accounts > 1 && ` · ${dashboard.accounts} accounts`}
          </div>
        </div>
      </div>

      <div className="relative">
        <div className="min-h-[48px] flex items-center justify-between gap-3 mb-1.5">
          <div className="text-2xl xl:text-[26px] 2xl:text-2xl font-bold leading-none">
            <span className="text-lol-win">{dashboard.wins}W</span>{" "}
            <span className="text-lol-loss/70">{losses}L</span>
          </div>
          <div
            className="flex items-end gap-1.5"
            title={`Last ${pips.length} ${pips.length === 1 ? "game" : "games"}`}
          >
            {pips.map((g) => (
              <span
                key={g.game_id}
                className={`h-5 w-1.5 xl:h-6 xl:w-2 rounded-full ${g.win ? "bg-lol-win" : "bg-lol-loss/70"}`}
                title={g.win ? "Win" : "Loss"}
              />
            ))}
          </div>
        </div>
        <WinRateBar
          wins={dashboard.wins}
          total={dashboard.totalGames}
          percentClassName={winRateColor}
        />
      </div>
    </div>
  );
}

// Muted separators keep the three averages on one line in a narrow card
function Slash() {
  return <span className="text-lol-text/40 mx-0.5">/</span>;
}

// 0-10 track for the average score, warming up as the score climbs
function ScoreMeter({ score }: { score: number | null }) {
  return (
    <div className="h-2 rounded-full bg-lol-border/60 overflow-hidden">
      <div
        className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-sky-400 to-lol-gold transition-all"
        style={{ width: `${Math.min(100, Math.max(0, (score ?? 0) * 10))}%` }}
      />
    </div>
  );
}

// MVP is the best player on the winning team and ACE the best on the losing
// one, so each rate is out of the games that could have produced it.
function BadgeCounts({
  mvps,
  aces,
  scoredWins,
  scoredLosses,
}: {
  mvps: number;
  aces: number;
  scoredWins: number;
  scoredLosses: number;
}) {
  const rate = (n: number, of: number) => (of > 0 ? `${((n / of) * 100).toFixed(1)}%` : "—");

  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1">
      <span className="rounded bg-amber-400/20 px-1 text-[11px] font-bold leading-[17px] text-amber-300">
        MVP
      </span>
      <span className="text-sm font-semibold text-lol-text-bright">{mvps}</span>
      <span className="text-xs text-lol-text" title="Share of wins">
        {rate(mvps, scoredWins)}
      </span>

      <span className="rounded bg-purple-500/20 px-1 text-[11px] font-bold leading-[17px] text-purple-400">
        ACE
      </span>
      <span className="text-sm font-semibold text-lol-text-bright">{aces}</span>
      <span className="text-xs text-lol-text" title="Share of losses">
        {rate(aces, scoredLosses)}
      </span>
    </div>
  );
}

function ContextMenu({
  x,
  y,
  onClose,
  children,
}: {
  x: number;
  y: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("click", onClose);
    window.addEventListener("contextmenu", onClose, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("click", onClose);
      window.removeEventListener("contextmenu", onClose, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  // Keep the menu inside the viewport
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth) el.style.left = `${x - rect.width}px`;
    if (rect.bottom > window.innerHeight) el.style.top = `${y - rect.height}px`;
  }, [x, y]);

  return (
    <div
      ref={ref}
      style={{ left: x, top: y }}
      className="fixed z-50 min-w-44 py-1 bg-lol-card border border-lol-border rounded-md shadow-lg shadow-black/40"
    >
      {children}
    </div>
  );
}

// One play session's date and combined record, sitting above its rows. A
// session of nothing but remakes has no record to show, so only the count
// survives there.
function SessionHeader({ session }: { session: Session }) {
  const played = session.wins + session.losses;
  const ratio = session.deaths > 0 ? (session.kills + session.assists) / session.deaths : Infinity;

  return (
    <div className="flex items-baseline gap-2 px-2 pb-2">
      <span className="inline-block h-1.5 w-1.5 shrink-0 self-center rounded-full bg-lol-gold/60" />
      <span className="text-sm font-bold tracking-wide text-lol-text-bright">
        {sessionLabel(session.day)}
      </span>
      <span className="text-xs text-lol-text/80">
        {session.matches.length} {session.matches.length === 1 ? "game" : "games"}
      </span>
      {played > 0 && (
        <>
          <span className="text-xs font-semibold">
            <span className="text-lol-win">{session.wins}W</span>{" "}
            <span className="text-lol-loss/70">{session.losses}L</span>
          </span>
          <span
            className={`text-xs ${kdaColor(ratio)}`}
            title={formatKDA(session.kills, session.deaths, session.assists)}
          >
            {kdaRatio(session.kills, session.deaths, session.assists)} KDA
          </span>
          {session.avgScore != null && (
            <span className={`text-xs font-semibold ${scoreColor(session.avgScore)}`}>
              {session.avgScore.toFixed(1)}
              <span className="font-normal text-lol-text"> score</span>
            </span>
          )}
        </>
      )}
      <span className="flex-1 self-center border-t border-lol-border/40" />
    </div>
  );
}

export interface GameRowProps {
  match: MatchListItem;
  champData: any;
  expanded: boolean;
  detail: MatchDetail | null;
  detailLoading: boolean;
  puuids: string[] | null;
  onToggle: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  expandable?: boolean;
  onPlayerClick?: (player: {
    puuid: string | null;
    gameName: string | null;
    tagLine: string | null;
  }) => void;
}

function parseAugmentIds(raw: string | null): number[] {
  if (!raw) return [];
  return raw.split(",").map(Number).filter(Boolean);
}

function formatNumber(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toString();
}

const badgeStyles: Record<string, string> = {
  DOUBLE: "border-sky-400/50 bg-sky-400/10 text-sky-300",
  TRIPLE: "border-amber-400/50 bg-amber-400/10 text-amber-300",
  QUADRA: "border-purple-400/50 bg-purple-400/10 text-purple-300",
  PENTA: "border-rose-400/50 bg-rose-400/10 text-rose-300",
};

function MatchMultikillBadges({
  doubles,
  triples,
  quadras,
  pentas,
}: {
  doubles: number;
  triples: number;
  quadras: number;
  pentas: number;
}) {
  const badges = (
    [
      ["DOUBLE", doubles],
      ["TRIPLE", triples],
      ["QUADRA", quadras],
      ["PENTA", pentas],
    ] as [string, number][]
  ).filter(([, count]) => count > 0);

  return (
    <div className="min-w-0 overflow-hidden">
      <div className="grid grid-cols-2 gap-1 w-[200px]">
        {badges.map(([label, count]) => (
          <span
            key={label}
            className={`w-full inline-flex items-center justify-center text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full border backdrop-blur-sm whitespace-nowrap ${badgeStyles[label]}`}
          >
            {label}
            {count > 1 ? ` x${count}` : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function AugmentGrid({ augmentIds, patch }: { augmentIds: number[]; patch?: string | null }) {
  if (augmentIds.length === 0) return null;
  const cols = augmentIds.length <= 3 ? augmentIds.length : augmentIds.length === 4 ? 2 : 3;

  return (
    <div className="grid gap-1 shrink-0" style={{ gridTemplateColumns: `repeat(${cols}, 24px)` }}>
      {augmentIds.map((id, i) => (
        <div key={i} className="w-6 h-6 rounded-md border border-lol-gold/30 overflow-hidden">
          <AugmentIcon augmentId={id} size={24} patch={patch} />
        </div>
      ))}
    </div>
  );
}

export function GameRow({
  match,
  champData,
  expanded,
  detail,
  detailLoading,
  puuids,
  onToggle,
  onContextMenu,
  expandable = true,
  onPlayerClick,
}: GameRowProps) {
  const isRemake = !!match.is_remake;
  console.log("[card] spells", {
    spell1: match.spell1,
    spell2: match.spell2,
    queue: match.queue_id,
  });
  const isWin = !!match.win;
  const isArena = isAugmentQueue(match.queue_id);
  const placement = match.player_subteam_placement;
  const placementLabel = placement != null ? ARENA_PLACEMENT_LABELS[placement] : null;
  const arenaWin = placement != null && placement <= 3;
  const kda = kdaRatio(match.kills, match.deaths, match.assists);
  const augmentIds = parseAugmentIds(match.augment_ids);
  const runeIds = parseRuneIds(match.rune_ids);
  const runeSetup = splitRuneSelections(runeIds, match.primary_style, match.secondary_style);
  const runeData = useRuneData();
  const statShardIds = parseRuneIds(match.stat_shard_ids);
  const rowBackground = isWin
    ? "linear-gradient(to right, rgba(63,214,122,0.12) 0%, rgba(63,214,122,0.04) 35%, rgba(12,14,17,0.9) 100%)"
    : "linear-gradient(to right, rgba(239,106,106,0.12) 0%, rgba(239,106,106,0.04) 35%, rgba(12,14,17,0.9) 100%)";

  return (
    <div>
      <button
        onClick={expandable ? onToggle : undefined}
        onContextMenu={expandable ? onContextMenu : undefined}
        className={`group relative grid min-w-0 w-full items-center gap-2 overflow-hidden px-5 py-4 rounded-2xl text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-deep)] ${
          isWin
            ? "border border-lol-win/35 hover:border-lol-win/60"
            : "border border-lol-loss/32 hover:border-lol-loss/60"
        }`}
        style={{
          background: rowBackground,
          gridTemplateColumns:
            "95px 84px 170px 64px 56px minmax(140px, 200px) 180px 220px 1fr minmax(64px, auto)",
        }}
      >
        <span
          className={`absolute -left-[5px] top-1/2 w-2.5 h-2.5 -translate-y-1/2 rotate-45 rounded-[2px] ${
            isWin
              ? "bg-lol-win shadow-[0_0_8px_rgba(63,214,122,0.5)]"
              : "bg-lol-loss shadow-[0_0_8px_rgba(239,106,106,0.45)]"
          }`}
          aria-hidden="true"
        />
        <div
          className={`flex min-w-0 flex-col font-bold ${isRemake ? "text-gray-500" : isArena && placementLabel ? (arenaWin ? "text-lol-win" : "text-lol-loss") : isWin ? "text-lol-win" : "text-lol-loss"}`}
        >
          <span className="truncate">
            {isRemake ? "RMK" : isArena && placementLabel ? placementLabel : isWin ? "WIN" : "LOSS"}
          </span>
          <span
            className="mt-0.5 truncate text-[10px] font-normal text-lol-text"
            title={queueLabel(match.queue_id)}
          >
            {queueLabel(match.queue_id)}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-1">
          <div
            className={`w-[52px] h-[52px] rounded-full overflow-hidden shrink-0 border-[3px] ${
              isWin
                ? "border-lol-win shadow-[0_0_10px_rgba(63,214,122,0.4)]"
                : "border-lol-loss shadow-[0_0_10px_rgba(239,106,106,0.35)]"
            }`}
          >
            <ChampionIcon
              championId={match.champion_id}
              size={52}
              className="w-full h-full rounded-full object-cover"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <SummonerSpellIcon
              spellId={match.spell1}
              size={18}
              className="w-[18px] h-[18px] rounded-[3px] object-cover"
            />
            <SummonerSpellIcon
              spellId={match.spell2}
              size={18}
              className="w-[18px] h-[18px] rounded-[3px] object-cover"
            />
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-base font-black tracking-tight text-lol-text-bright truncate">
            {getChampionName(champData, match.champion_id)}
          </div>
          <div className="text-[13px] text-lol-text">
            {formatKDA(match.kills, match.deaths, match.assists)}
          </div>
          <div
            className={`text-[11px] ${
              kda === "Perfect" || parseFloat(kda) >= 3
                ? "text-lol-gold"
                : parseFloat(kda) >= 2
                  ? "text-lol-text"
                  : "text-lol-text/70"
            }`}
          >
            {kda} KDA
          </div>
          {(() => {
            const lane = laneLabel(match);
            return lane ? <div className="text-[10px] text-lol-text truncate">{lane}</div> : null;
          })()}
        </div>
        <div className="flex min-w-0 flex-col items-end text-right tabular-nums">
          <span className="text-base text-lol-text-bright">{match.cs ?? 0}</span>
          {!isRemake && match.game_duration > 0 && (
            <span className="text-[11px] text-lol-text">
              {((match.cs ?? 0) / (match.game_duration / 60)).toFixed(1)} CS/min
            </span>
          )}
        </div>
        {match.score != null ? (
          <div className="flex flex-col items-center gap-0.5 text-center">
            <span className="text-sm font-semibold text-amber-400">{match.score.toFixed(1)}</span>
            {match.score_badge === "MVP" && (
              <span className="rounded bg-amber-400/20 px-1 text-[9px] font-bold leading-[15px] text-amber-300">
                MVP
              </span>
            )}
            {match.score_badge === "ACE" && (
              <span className="rounded bg-purple-500/20 px-1 text-[9px] font-bold leading-[15px] text-purple-400">
                ACE
              </span>
            )}
          </div>
        ) : (
          <div />
        )}
        <div className="min-w-0 w-full overflow-hidden space-y-1">
          {[
            ["DAMAGE", match.total_damage_dealt, match.game_max_dmg, "bg-[#e0524f]"],
            ["TAKEN", match.total_damage_taken, match.game_max_taken, "bg-[#3fc4c9]"],
            ["HEALED", match.total_heal, match.game_max_heal, "bg-[#3fbf72]"],
          ].map(([label, value, max, color]) => {
            const numericValue = value as number;
            const numericMax = max as number;
            const percent = numericMax > 0 ? (numericValue / numericMax) * 100 : 0;
            return (
              <div
                key={label as string}
                className="grid grid-cols-[48px_minmax(20px,1fr)_40px] items-center gap-1.5"
              >
                <span className="text-[10px] text-lol-text">{label as string}</span>
                <div className="relative h-1 overflow-hidden rounded-sm bg-white/5">
                  <div
                    className={`h-full rounded-sm ${color as string}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span className="text-right text-[10px] text-lol-text/80">
                  {numericValue > 0 ? formatNumber(numericValue) : ""}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex min-w-0 items-center gap-1 overflow-hidden">
          <div className="flex items-center justify-center shrink-0">
            {isAugmentQueue(match.queue_id) ? (
              <AugmentGrid augmentIds={augmentIds} patch={match.game_version} />
            ) : (
              <RuneCompact
                runeIds={runeIds}
                primaryStyle={match.primary_style}
                secondaryStyle={match.secondary_style}
                statShardIds={statShardIds}
                runeData={runeData}
                version={match.game_version}
              >
                <span className="flex items-center gap-1 p-1 rounded-lg border border-lol-gold/40 bg-white/[0.02]">
                  <RuneIcon
                    runeId={runeSetup.keystone}
                    path={runeData[runeSetup.keystone ?? 0]?.icon}
                    version={match.game_version}
                    size={22}
                  />
                  <RuneIcon
                    runeId={match.secondary_style}
                    path={runeData[match.secondary_style ?? 0]?.icon}
                    version={match.game_version}
                    size={18}
                  />
                </span>
              </RuneCompact>
            )}
          </div>
          <span className="text-lol-text/40 text-xs select-none">+</span>
          <div className="grid shrink-0 grid-cols-3 gap-0.5">
            {[match.item0, match.item1, match.item2, match.item3, match.item4, match.item5].map(
              (itemId, i) => (
                <ItemIcon key={i} itemId={itemId ?? 0} size={22} patch={match.game_version} />
              ),
            )}
          </div>
        </div>
        <div className="min-w-0 overflow-hidden">
          <MatchMultikillBadges
            doubles={match.double_kills}
            triples={match.triple_kills}
            quadras={match.quadra_kills}
            pentas={match.penta_kills}
          />
        </div>
        <div aria-hidden="true" />
        <div className="flex flex-col items-end whitespace-nowrap text-xs text-lol-text">
          <div className="whitespace-nowrap">{formatDuration(match.game_duration)}</div>
          <div className="whitespace-nowrap">{formatTimeAgo(match.game_creation)}</div>
        </div>
      </button>

      {expandable && expanded && (
        <div className="mb-1 bg-lol-card rounded-b-lg border border-t-0 border-lol-border/60 p-3">
          {detailLoading ? (
            <div className="text-sm text-lol-text text-center py-4">Loading...</div>
          ) : detail ? (
            <MatchScoreboard
              detail={detail}
              champData={champData}
              puuids={puuids}
              onPlayerClick={onPlayerClick}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
