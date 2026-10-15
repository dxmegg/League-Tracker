import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { TeammateChampionStats, TeammateStats } from "../lib/types";
import { useIpc } from "../hooks/useIpc";
import { getChampionName, useChampionData } from "../hooks/useChampions";
import { useHistoryScopeQueue } from "../lib/historyScope";
import { formatNumber, formatTimeAgo, kdaRatio } from "../lib/format";
import { QueueFilterChips } from "../pages/Home";
import ChampionIcon from "./ChampionIcon";
import SummonerIcon from "./SummonerIcon";
import { Panel } from "./Panel";
import type { SortableColumn } from "./SortableTable";
import { FilterSelect } from "./FilterSelect";

const PAGE_SIZE = 30;
const PLAYER_GRID_FRIENDS =
  "[&_thead_tr]:grid-cols-[minmax(0,1fr)_60px_130px_90px_110px] [&_tbody_tr]:grid-cols-[minmax(0,1fr)_60px_130px_90px_110px]";
const PLAYER_GRID_FOES =
  "[&_thead_tr]:grid-cols-[minmax(0,1fr)_60px_150px_110px] [&_tbody_tr]:grid-cols-[minmax(0,1fr)_60px_150px_110px]";
const CHAMPION_GRID =
  "[&_thead_tr]:grid-cols-[minmax(0,1fr)_60px_150px_90px] [&_tbody_tr]:grid-cols-[minmax(0,1fr)_60px_150px_90px]";

type SortDirection = "asc" | "desc";

function PanelKpi({ value }: { value: string }) {
  return (
    <div className="shrink-0 rounded-md border border-lol-border/60 bg-black/10 px-2 py-1.5 text-right">
      <span className="text-[11px] font-semibold leading-tight tabular-nums text-lol-text-bright">
        {value}
      </span>
    </div>
  );
}

function WinRateValue({ wins, games }: { wins: number; games: number }) {
  const rate = games > 0 ? (wins / games) * 100 : 0;

  return (
    <div className="flex min-w-0 items-center justify-end gap-2">
      <span className="shrink-0 tabular-nums">{rate.toFixed(1)}%</span>
      <div className="h-2 w-16 shrink-0 overflow-hidden rounded-full bg-lol-crimson/20">
        <div className="h-full rounded-full bg-lol-win" style={{ width: `${rate}%` }} />
      </div>
    </div>
  );
}

function perspectiveWins(wins: number, games: number, relation: "friends" | "enemies") {
  return relation === "enemies" ? games - wins : wins;
}

export function FriendsExp() {
  const scopedQueue = useHistoryScopeQueue();
  const championData = useChampionData();
  const [queue, setQueue] = useState<number | undefined>(scopedQueue);
  const [relation, setRelation] = useState<"friends" | "enemies">("friends");
  const [search, setSearch] = useState("");
  const [playerSortKey, setPlayerSortKey] = useState("games");
  const [playerSortDir, setPlayerSortDir] = useState<SortDirection>("desc");
  const [championSortKey, setChampionSortKey] = useState("games");
  const [championSortDir, setChampionSortDir] = useState<SortDirection>("desc");
  const {
    data: players,
    loading: playersLoading,
    refetch: refetchPlayers,
  } = useIpc<TeammateStats[]>(
    () => window.api.getTeammateStats(queue, relation),
    [queue, relation],
  );
  const {
    data: champions,
    loading: championsLoading,
    refetch: refetchChampions,
  } = useIpc<TeammateChampionStats[]>(
    () => window.api.getTeammateChampions(queue, relation),
    [queue, relation],
  );
  const [visiblePlayers, setVisiblePlayers] = useState(PAGE_SIZE);
  const [visibleChampions, setVisibleChampions] = useState(PAGE_SIZE);

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const playerRows = useMemo(
    () =>
      (players ?? []).filter(
        (row) => !normalizedSearch || row.name.toLocaleLowerCase().includes(normalizedSearch),
      ),
    [normalizedSearch, players],
  );
  const championRows = useMemo(
    () =>
      (champions ?? []).filter(
        (row) =>
          !normalizedSearch ||
          getChampionName(championData, row.champion_id)
            .toLocaleLowerCase()
            .includes(normalizedSearch),
      ),
    [championData, champions, normalizedSearch],
  );
  const relationWord = relation === "friends" ? "with" : "against";

  useEffect(() => {
    setQueue(scopedQueue);
  }, [scopedQueue]);

  useEffect(() => {
    setVisiblePlayers(PAGE_SIZE);
    setVisibleChampions(PAGE_SIZE);
    setPlayerSortKey("games");
    setPlayerSortDir("desc");
    setChampionSortKey("games");
    setChampionSortDir("desc");
  }, [queue, relation, playerRows.length, championRows.length, search]);

  useEffect(() => {
    const unsub = window.api.onGamesUpdated(() => {
      refetchPlayers();
      refetchChampions();
    });
    return unsub;
  }, [refetchChampions, refetchPlayers]);

  const playerColumns = useMemo<SortableColumn<TeammateStats>[]>(
    () => [
      {
        key: "name",
        label: "Player",
        render: (row) => (
          <Link
            to={`/friends/${encodeURIComponent(row.key)}`}
            className="nm min-w-0"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="shrink-0 rounded-full border border-lol-crimson/60 p-0.5 shadow-[0_0_8px_var(--theme-crimson-glow)]">
              <SummonerIcon iconId={row.profileIcon} size={30} />
            </span>
            <span className="min-w-0 truncate">{row.name}</span>
          </Link>
        ),
        defaultDir: "asc",
      },
      {
        key: "games",
        label: "Games",
        render: (row) => <span className="tabular-nums">{formatNumber(row.games)}</span>,
        defaultDir: "desc",
      },
      {
        key: "wins",
        label: "Your win rate",
        render: (row) => (
          <WinRateValue wins={perspectiveWins(row.wins, row.games, relation)} games={row.games} />
        ),
        sortValue: (row) =>
          row.games > 0 ? perspectiveWins(row.wins, row.games, relation) / row.games : 0,
        defaultDir: "desc",
      },
      {
        key: "lastPlayed",
        label: "Last played",
        render: (row) => <span className="whitespace-nowrap">{formatTimeAgo(row.lastPlayed)}</span>,
        sortValue: (row) => row.lastPlayed,
        defaultDir: "desc",
      },
      ...(relation === "friends"
        ? [
            {
              key: "kda",
              label: "KDA together",
              render: (row: TeammateStats) => (
                <span className="tabular-nums">{kdaRatio(row.kills, row.deaths, row.assists)}</span>
              ),
              sortValue: (row: TeammateStats) =>
                row.deaths > 0 ? (row.kills + row.assists) / row.deaths : row.kills + row.assists,
              defaultDir: "desc" as const,
            },
          ]
        : []),
    ],
    [relation],
  );

  const championColumns = useMemo<SortableColumn<TeammateChampionStats>[]>(
    () => [
      {
        key: "champion_id",
        label: "Champion",
        render: (row) => (
          <Link
            to={`/champions/${row.champion_id}`}
            className="nm min-w-0"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="shrink-0 rounded-full border border-lol-gold/60 p-0.5 shadow-[0_0_8px_var(--theme-gold)]">
              <ChampionIcon championId={row.champion_id} size={30} />
            </span>
            <span className="min-w-0 truncate">
              {getChampionName(championData, row.champion_id)}
            </span>
          </Link>
        ),
        sortValue: (row) => getChampionName(championData, row.champion_id),
        defaultDir: "asc",
      },
      {
        key: "games",
        label: "Games",
        render: (row) => <span className="tabular-nums">{formatNumber(row.games)}</span>,
        defaultDir: "desc",
      },
      {
        key: "wins",
        label: relation === "friends" ? "Your win rate with" : "Your win rate vs",
        render: (row) => (
          <WinRateValue wins={perspectiveWins(row.wins, row.games, relation)} games={row.games} />
        ),
        sortValue: (row) =>
          row.games > 0 ? perspectiveWins(row.wins, row.games, relation) / row.games : 0,
        defaultDir: "desc",
      },
      {
        key: "kda",
        label: "KDA",
        render: (row) => <span className="tabular-nums">{row.kda.toFixed(2)}</span>,
        sortValue: (row) => row.kda,
        defaultDir: "desc",
      },
    ],
    [championData, relation],
  );

  const totalPlayerGames = playerRows[0]?.totalGames ?? 0;
  const totalChampionGames = championRows[0]?.totalGames ?? 0;
  const playerKpi = `${formatNumber(playerRows.length)} players / ${formatNumber(totalPlayerGames)} games`;
  const championKpi = `${formatNumber(championRows.length)} champions / ${formatNumber(totalChampionGames)} games`;
  const tableClass =
    "[&_thead_tr]:grid [&_tbody_tr]:grid [&_thead_th]:min-w-0 [&_tbody_td]:min-w-0 [&_tbody_td]:border-t-[1px] [&_tbody_td]:border-[rgba(255,255,255,0.04)] [&_tbody_td]:text-right [&_tbody_td]:tabular-nums [&_tbody_tr]:transition-colors [&_tbody_tr]:duration-[120ms] [&_tbody_tr:hover]:bg-white/[0.025]";
  const playerGridClass = relation === "friends" ? PLAYER_GRID_FRIENDS : PLAYER_GRID_FOES;
  const playerTableClass = `${tableClass} ${playerGridClass}`;
  const championTableClass = `${tableClass} ${CHAMPION_GRID}`;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative w-56">
          <span className="sr-only">Search players and champions</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search players or champions"
            className="h-9 w-full rounded-md border border-lol-border/60 bg-lol-card/40 px-3 pr-8 text-sm text-lol-text-bright outline-none transition-colors placeholder:text-lol-text/60 focus:border-lol-crimson/70 focus:ring-1 focus:ring-lol-crimson/40"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-lg leading-none text-lol-text/70 transition-colors hover:text-lol-text-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-crimson/60"
            >
              ×
            </button>
          )}
        </label>
        <QueueFilterChips value={queue} onChange={setQueue} />
        <div className="flex items-center gap-0 rounded-md border border-lol-border/60 bg-lol-card/40 p-0.5">
          {(["friends", "enemies"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={relation === option}
              onClick={() => setRelation(option)}
              className={`h-8 px-3 text-xs font-semibold transition-colors ${
                relation === option
                  ? "rounded bg-lol-crimson text-lol-text-bright"
                  : "text-lol-text hover:text-lol-text-bright"
              }`}
            >
              {option === "friends" ? "FRIENDS" : "FOES"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel className="border-t-[3px] border-t-lol-crimson bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)]">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h2 className="relative min-w-[14rem] flex-1 basis-[16rem] pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
              Players you've played {relationWord}
            </h2>
            <div className="flex shrink-0 items-center gap-2">
              <label className="sr-only">Sort players</label>
              <FilterSelect
                value={playerSortKey}
                onChange={(value) => value && setPlayerSortKey(value)}
                placeholder="Sort"
                title="Sort players"
                options={[
                  { value: "games", label: "Games" },
                  { value: "wins", label: "Win rate" },
                  ...(relation === "friends" ? [{ value: "kda", label: "KDA" }] : []),
                  { value: "lastPlayed", label: "Last played" },
                ]}
                className="max-w-[7.5rem]"
              />
              <button
                type="button"
                aria-label={`Sort ${playerSortDir === "asc" ? "descending" : "ascending"}`}
                onClick={() => setPlayerSortDir(playerSortDir === "asc" ? "desc" : "asc")}
                className="inline-flex h-8 min-w-9 items-center justify-center rounded-md border border-lol-border/50 bg-lol-card/40 px-2.5 text-sm font-bold text-lol-text transition-colors hover:border-lol-crimson/60 hover:text-lol-text-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-crimson/60"
              >
                {playerSortDir === "asc" ? "↑" : "↓"}
              </button>
            </div>
            <PanelKpi value={playerKpi} />
          </div>
          {playersLoading ? (
            <div className="py-8 text-center text-sm text-lol-text">Loading…</div>
          ) : (
            <FriendsTable
              className={playerTableClass}
              columns={playerColumns}
              rows={playerRows}
              visibleRows={visiblePlayers}
              sortKey={playerSortKey}
              sortDir={playerSortDir}
              onSortChange={(key, dir) => {
                setPlayerSortKey(key);
                setPlayerSortDir(dir);
              }}
              emptyText={
                search
                  ? "No players match your search."
                  : relation === "friends"
                    ? "No friends yet."
                    : "No foes yet."
              }
              rowKey={(row) => row.key}
              onReachBottom={() =>
                setVisiblePlayers((count) => Math.min(count + PAGE_SIZE, playerRows.length))
              }
            />
          )}
        </Panel>

        <Panel className="border-t-[3px] border-t-lol-gold bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)]">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h2 className="relative min-w-[14rem] flex-1 basis-[16rem] pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
              Champions you've played {relationWord}
            </h2>
            <div className="flex shrink-0 items-center gap-2">
              <label className="sr-only">Sort champions</label>
              <FilterSelect
                value={championSortKey}
                onChange={(value) => value && setChampionSortKey(value)}
                placeholder="Sort"
                title="Sort champions"
                options={[
                  { value: "games", label: "Games" },
                  { value: "wins", label: "Win rate" },
                  { value: "kda", label: "KDA" },
                ]}
                className="max-w-[7.5rem]"
              />
              <button
                type="button"
                aria-label={`Sort ${championSortDir === "asc" ? "descending" : "ascending"}`}
                onClick={() => setChampionSortDir(championSortDir === "asc" ? "desc" : "asc")}
                className="inline-flex h-8 min-w-9 items-center justify-center rounded-md border border-lol-border/50 bg-lol-card/40 px-2.5 text-sm font-bold text-lol-text transition-colors hover:border-lol-crimson/60 hover:text-lol-text-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-crimson/60"
              >
                {championSortDir === "asc" ? "↑" : "↓"}
              </button>
            </div>
            <PanelKpi value={championKpi} />
          </div>
          {championsLoading ? (
            <div className="py-8 text-center text-sm text-lol-text">Loading…</div>
          ) : (
            <FriendsTable
              className={championTableClass}
              columns={championColumns}
              rows={championRows}
              visibleRows={visibleChampions}
              sortKey={championSortKey}
              sortDir={championSortDir}
              onSortChange={(key, dir) => {
                setChampionSortKey(key);
                setChampionSortDir(dir);
              }}
              emptyText={
                search
                  ? "No champions match your search."
                  : relation === "friends"
                    ? "No friends yet."
                    : "No foes yet."
              }
              rowKey={(row) => row.champion_id}
              onReachBottom={() =>
                setVisibleChampions((count) => Math.min(count + PAGE_SIZE, championRows.length))
              }
            />
          )}
        </Panel>
      </div>
    </div>
  );
}

function FriendsTable<T extends object>({
  columns,
  rows,
  visibleRows,
  sortKey,
  sortDir,
  onSortChange,
  className,
  rowKey,
  onReachBottom,
  emptyText,
}: {
  columns: Array<SortableColumn<T>>;
  rows: T[];
  visibleRows: number;
  sortKey: string;
  sortDir: SortDirection;
  onSortChange: (key: string, dir: SortDirection) => void;
  className: string;
  rowKey: (row: T) => string | number;
  onReachBottom: () => void;
  emptyText: string;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const sortedRows = useMemo(() => {
    const column = columns.find((item) => item.key === sortKey);
    if (!column) return rows;
    const valueOf =
      column.sortValue ??
      ((row: T) => {
        const value = Reflect.get(row, column.key);
        return typeof value === "number" || typeof value === "string" ? value : "";
      });
    return [...rows].sort((a, b) => {
      const left = valueOf(a);
      const right = valueOf(b);
      if (left === right) return 0;
      const result = left > right ? 1 : -1;
      return sortDir === "asc" ? result : -result;
    });
  }, [columns, rows, sortDir, sortKey]);

  useEffect(() => {
    const element = sentinelRef.current;
    if (!element || sortedRows.length <= visibleRows) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onReachBottom();
      },
      { rootMargin: "200px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [onReachBottom, sortedRows.length, visibleRows]);

  const handleSortChange = (key: string) => {
    const nextDirection =
      key === sortKey
        ? sortDir === "asc"
          ? "desc"
          : "asc"
        : (columns.find((column) => column.key === key)?.defaultDir ?? "desc");
    onSortChange(key, nextDirection);
  };

  return (
    <div className={`scroll ${className}`}>
      <table className="tbl">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                aria-sort={
                  column.key === sortKey
                    ? sortDir === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
                }
              >
                <button
                  type="button"
                  aria-label={`Sort by ${column.label}`}
                  onClick={() => handleSortChange(column.key)}
                  className="w-full text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-crimson/60"
                >
                  {column.label}
                  {column.key === sortKey ? (sortDir === "asc" ? " ▴" : " ▾") : ""}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ textAlign: "left" }}>
                {emptyText}
              </td>
            </tr>
          ) : (
            sortedRows.slice(0, visibleRows).map((row) => (
              <Fragment key={rowKey(row)}>
                <tr>
                  {columns.map((column) => (
                    <td key={column.key}>{column.render(row)}</td>
                  ))}
                </tr>
              </Fragment>
            ))
          )}
          {sortedRows.length > visibleRows && (
            <tr aria-hidden="true">
              <td colSpan={columns.length} style={{ padding: 0, borderTop: 0 }}>
                <div ref={sentinelRef} style={{ height: 1 }} />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
