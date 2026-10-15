import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { TeammateStats } from "../lib/types";
import { useIpc } from "../hooks/useIpc";
import { useChampionData, getChampionName } from "../hooks/useChampions";
import { useHistoryScopeQueue } from "../lib/historyScope";
import { formatNumber, kdaRatio } from "../lib/format";
import ChampionIcon from "./ChampionIcon";
import SummonerIcon from "./SummonerIcon";
import WinRateBar from "./WinRateBar";
import { Panel } from "./Panel";
import { SortableTable, type SortableColumn } from "./SortableTable";

function KpiTile({
  label,
  value,
  barWidth,
  accent,
}: {
  label: string;
  value: string;
  barWidth: number;
  accent: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-lol-border/60 bg-black/10 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[10px] font-bold uppercase tracking-wider text-lol-text">
          {label}
        </span>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-lol-text-bright">
          {value}
        </span>
      </div>
      <div className="mt-1 h-2 w-[72px] overflow-hidden rounded-full bg-white/[0.06]">
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
  const {
    data: friends,
    loading: friendsLoading,
    refetch: refetchFriends,
  } = useIpc<TeammateStats[]>(() => window.api.getTeammateStats(queue, "friends"), [queue]);
  const {
    data: enemies,
    loading: enemiesLoading,
    refetch: refetchEnemies,
  } = useIpc<TeammateStats[]>(() => window.api.getTeammateStats(queue, "enemies"), [queue]);
  const PAGE_SIZE = 30;
  const [visibleFriends, setVisibleFriends] = useState(PAGE_SIZE);
  const [visibleFoes, setVisibleFoes] = useState(PAGE_SIZE);

  const friendRows = useMemo<TeammateStats[]>(() => friends ?? [], [friends]);
  const enemyRows = useMemo<TeammateStats[]>(() => enemies ?? [], [enemies]);

  useEffect(() => {
    setVisibleFriends(PAGE_SIZE);
  }, [friendRows.length]);
  useEffect(() => {
    setVisibleFoes(PAGE_SIZE);
  }, [enemyRows.length]);

  useEffect(() => {
    const unsub = window.api.onGamesUpdated(() => {
      refetchFriends();
      refetchEnemies();
    });
    return unsub;
  }, [refetchEnemies, refetchFriends]);

  const friendColumns = useMemo<SortableColumn<TeammateStats>[]>(
    () => [
      {
        key: "name",
        label: "Player",
        render: (row) => (
          <Link
            to={`/friends/${encodeURIComponent(row.key)}`}
            className="nm"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="rounded-full border border-[#E5483F]/60 p-0.5 shadow-[0_0_8px_rgba(229,72,63,0.28)]">
              <SummonerIcon iconId={row.profileIcon} size={30} />
            </span>
            <span>{row.name}</span>
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

  const enemyColumns = useMemo<SortableColumn<TeammateStats>[]>(
    () => [
      {
        key: "champion",
        label: "Champion",
        render: (row) => {
          const championId = row.champions[0]?.champion_id;
          return (
            <Link
              to={`/friends/${encodeURIComponent(row.key)}`}
              className="nm"
              onClick={(event) => event.stopPropagation()}
            >
              {championId ? (
                <span className="rounded-full border border-[#C9A45C]/60 p-0.5 shadow-[0_0_8px_rgba(201,164,92,0.28)]">
                  <ChampionIcon championId={championId} size={30} />
                </span>
              ) : (
                <span className="h-[30px] w-[30px] rounded-full bg-white/[0.04]" />
              )}
              <span>{championId ? getChampionName(championData, championId) : row.name}</span>
            </Link>
          );
        },
        sortValue: (row) => {
          const championId = row.champions[0]?.champion_id;
          return championId ? getChampionName(championData, championId) : row.name;
        },
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

  const bestFriendWinRate = Math.max(
    0,
    ...friendRows.map((row) => (row.games > 0 ? (row.wins / row.games) * 100 : 0)),
  );
  const bestEnemyWinRate = Math.max(
    0,
    ...enemyRows.map((row) => (row.games > 0 ? (row.wins / row.games) * 100 : 0)),
  );
  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
      <div className="shrink-0 overflow-hidden rounded-xl border border-lol-border border-t-[3px] border-t-[#E5483F] bg-[radial-gradient(circle_at_top_right,rgba(229,72,63,0.10),transparent_46%),linear-gradient(180deg,#151012,#0b0d10)] px-5 py-4 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-10 before:bg-[linear-gradient(180deg,rgba(229,72,63,0.05),transparent)]">
        <h1 className="relative pl-4 font-display text-[30px] font-bold leading-tight tracking-[0.2px] text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2.5 before:w-2.5 before:-translate-y-1/2 before:rotate-45 before:bg-[#E5483F]">
          Friends & Foes
        </h1>
        <p className="relative mt-1.5 pl-4 text-lol-text">Who you win with and who beats you</p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel className="border-t-[3px] border-t-[#E5483F] bg-[radial-gradient(circle_at_top_right,rgba(229,72,63,0.08),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="relative pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
              Duo partners
            </h2>
            <span className="text-xs uppercase tracking-wider text-lol-text">
              Games played together
            </span>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <KpiTile
              label="Partners"
              value={formatNumber(friendRows.length)}
              barWidth={Math.min(friendRows.length * 5, 100)}
              accent="#E5483F"
            />
            <KpiTile
              label="Best win rate"
              value={`${bestFriendWinRate.toFixed(1)}%`}
              barWidth={bestFriendWinRate}
              accent="#C9A45C"
            />
          </div>
          {friendsLoading ? (
            <div className="py-8 text-center text-sm text-lol-text">Loading…</div>
          ) : (
            <SortableTable
              className="[&_tbody_td]:border-t-[1px] [&_tbody_td]:border-[rgba(255,255,255,0.04)] [&_tbody_td]:text-right [&_tbody_td]:tabular-nums [&_tbody_tr]:transition-colors [&_tbody_tr]:duration-[120ms] [&_tbody_tr:hover]:bg-white/[0.025]"
              columns={friendColumns}
              rows={friendRows.slice(0, visibleFriends)}
              defaultSortKey="games"
              rowKey={(row) => row.key}
              onReachBottom={() =>
                setVisibleFriends((n) => Math.min(n + PAGE_SIZE, friendRows.length))
              }
            />
          )}
        </Panel>

        <Panel className="border-t-[3px] border-t-[#C9A45C] bg-[radial-gradient(circle_at_top_right,rgba(201,164,92,0.08),transparent_48%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="relative pl-4 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
              Most faced enemies
            </h2>
            <span className="text-xs uppercase tracking-wider text-lol-text">
              Champions on the other team
            </span>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <KpiTile
              label="Enemies"
              value={formatNumber(enemyRows.length)}
              barWidth={Math.min(enemyRows.length * 5, 100)}
              accent="#C9A45C"
            />
            <KpiTile
              label="Toughest matchup"
              value={`${bestEnemyWinRate.toFixed(1)}%`}
              barWidth={bestEnemyWinRate}
              accent="#22C55E"
            />
          </div>
          {enemiesLoading ? (
            <div className="py-8 text-center text-sm text-lol-text">Loading…</div>
          ) : (
            <SortableTable
              className="[&_tbody_td]:border-t-[1px] [&_tbody_td]:border-[rgba(255,255,255,0.04)] [&_tbody_td]:text-right [&_tbody_td]:tabular-nums [&_tbody_tr]:transition-colors [&_tbody_tr]:duration-[120ms] [&_tbody_tr:hover]:bg-white/[0.025]"
              columns={enemyColumns}
              rows={enemyRows.slice(0, visibleFoes)}
              defaultSortKey="games"
              rowKey={(row) => row.key}
              onReachBottom={() => setVisibleFoes((n) => Math.min(n + PAGE_SIZE, enemyRows.length))}
            />
          )}
        </Panel>
      </div>
    </div>
  );
}
