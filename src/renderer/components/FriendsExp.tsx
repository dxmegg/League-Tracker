import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { TeammateChampionStats, TeammateStats } from "../lib/types";
import { useIpc } from "../hooks/useIpc";
import { getChampionName, useChampionData } from "../hooks/useChampions";
import { useHistoryScopeQueue } from "../lib/historyScope";
import { formatNumber, kdaRatio } from "../lib/format";
import ChampionIcon from "./ChampionIcon";
import SummonerIcon from "./SummonerIcon";
import WinRateBar from "./WinRateBar";
import { Panel } from "./Panel";
import { SortableTable, type SortableColumn } from "./SortableTable";

const PAGE_SIZE = 30;

function PanelKpi({
  value,
  barWidth,
  accent,
}: {
  value: string;
  barWidth: number;
  accent: string;
}) {
  return (
    <div className="shrink-0 rounded-md border border-lol-border/60 bg-black/10 px-3 py-2 text-right">
      <span className="text-xs font-semibold tabular-nums text-lol-text-bright">{value}</span>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full"
          style={{ width: `${barWidth}%`, backgroundColor: accent }}
        />
      </div>
    </div>
  );
}

export function FriendsExp() {
  const queue = useHistoryScopeQueue();
  const championData = useChampionData();
  const [relation, setRelation] = useState<"friends" | "enemies">("friends");
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

  const playerRows = useMemo(() => players ?? [], [players]);
  const championRows = useMemo(() => champions ?? [], [champions]);
  const relationWord = relation === "friends" ? "with" : "against";

  useEffect(() => {
    setVisiblePlayers(PAGE_SIZE);
    setVisibleChampions(PAGE_SIZE);
  }, [relation, playerRows.length, championRows.length]);

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
            <span className="shrink-0 rounded-full border border-[#E5483F]/60 p-0.5 shadow-[0_0_8px_rgba(229,72,63,0.28)]">
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
        label: "Win rate",
        render: (row) => (
          <div className="flex min-w-[150px] items-center gap-2">
            <span className="w-12 tabular-nums">
              {row.games > 0 ? ((row.wins / row.games) * 100).toFixed(1) : "0.0"}%
            </span>
            <WinRateBar wins={row.wins} total={row.games} />
          </div>
        ),
        sortValue: (row) => (row.games > 0 ? row.wins / row.games : 0),
        defaultDir: "desc",
      },
      {
        key: "kda",
        label: "KDA together",
        render: (row) => (
          <span className="tabular-nums">{kdaRatio(row.kills, row.deaths, row.assists)}</span>
        ),
        sortValue: (row) =>
          row.deaths > 0 ? (row.kills + row.assists) / row.deaths : row.kills + row.assists,
        defaultDir: "desc",
      },
    ],
    [],
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
            <span className="shrink-0 rounded-full border border-[#C9A45C]/60 p-0.5 shadow-[0_0_8px_rgba(201,164,92,0.28)]">
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
        label: "Their win rate",
        render: (row) => (
          <div className="flex min-w-[150px] items-center gap-2">
            <span className="w-12 tabular-nums">
              {row.games > 0 ? ((row.wins / row.games) * 100).toFixed(1) : "0.0"}%
            </span>
            <WinRateBar wins={row.wins} total={row.games} />
          </div>
        ),
        sortValue: (row) => (row.games > 0 ? row.wins / row.games : 0),
        defaultDir: "desc",
      },
    ],
    [championData],
  );

  const totalPlayerGames = playerRows[0]?.totalGames ?? 0;
  const totalChampionGames = championRows[0]?.totalGames ?? 0;
  const playerKpi = `${formatNumber(playerRows.length)} players / ${formatNumber(totalPlayerGames)} games`;
  const championKpi = `${formatNumber(championRows.length)} champions / ${formatNumber(totalChampionGames)} games`;
  const tableClass =
    "[&_tbody_td]:border-t-[1px] [&_tbody_td]:border-[rgba(255,255,255,0.04)] [&_tbody_td]:text-right [&_tbody_td]:tabular-nums [&_tbody_tr]:transition-colors [&_tbody_tr]:duration-[120ms] [&_tbody_tr:hover]:bg-white/[0.025]";

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
      <div className="shrink-0 overflow-hidden rounded-xl border border-lol-border border-t-[3px] border-t-[#E5483F] bg-[radial-gradient(circle_at_top_right,rgba(229,72,63,0.10),transparent_46%),linear-gradient(180deg,#151012,#0b0d10)] px-5 py-4 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-10 before:bg-[linear-gradient(180deg,rgba(229,72,63,0.05),transparent)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="relative pl-4 font-display text-[30px] font-bold leading-tight tracking-[0.2px] text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2.5 before:w-2.5 before:-translate-y-1/2 before:rotate-45 before:bg-[#E5483F]">
              Friends & Foes
            </h1>
            <p className="relative mt-1.5 pl-4 text-lol-text">Who you win with and who beats you</p>
          </div>
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
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel className="border-t-[3px] border-t-[#E5483F] bg-[radial-gradient(circle_at_top_right,rgba(229,72,63,0.08),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]">
          <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
            <h2 className="relative min-w-0 flex-1 pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
              <span className="block min-w-0 truncate">Players you've played {relationWord}</span>
            </h2>
            <PanelKpi
              value={playerKpi}
              barWidth={Math.min(playerRows.length * 5, 100)}
              accent="#E5483F"
            />
          </div>
          {playersLoading ? (
            <div className="py-8 text-center text-sm text-lol-text">Loading…</div>
          ) : (
            <SortableTable
              className={tableClass}
              columns={playerColumns}
              rows={playerRows.slice(0, visiblePlayers)}
              defaultSortKey="games"
              rowKey={(row) => row.key}
              onReachBottom={() =>
                setVisiblePlayers((count) => Math.min(count + PAGE_SIZE, playerRows.length))
              }
            />
          )}
        </Panel>

        <Panel className="border-t-[3px] border-t-[#C9A45C] bg-[radial-gradient(circle_at_top_right,rgba(201,164,92,0.08),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]">
          <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
            <h2 className="relative min-w-0 flex-1 pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
              <span className="block min-w-0 truncate">Champions you've played {relationWord}</span>
            </h2>
            <PanelKpi
              value={championKpi}
              barWidth={Math.min(championRows.length * 5, 100)}
              accent="#C9A45C"
            />
          </div>
          {championsLoading ? (
            <div className="py-8 text-center text-sm text-lol-text">Loading…</div>
          ) : (
            <SortableTable
              className={tableClass}
              columns={championColumns}
              rows={championRows.slice(0, visibleChampions)}
              defaultSortKey="games"
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
