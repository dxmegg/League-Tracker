import { useMemo } from "react";
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

type TeammateTableRow = TeammateStats & Record<string, unknown>;

export function FriendsExp() {
  const queue = useHistoryScopeQueue();
  const championData = useChampionData();
  const { data: friends, loading: friendsLoading } = useIpc<TeammateStats[]>(
    () => window.api.getTeammateStats(queue, "friends"),
    [queue],
  );
  const { data: enemies, loading: enemiesLoading } = useIpc<TeammateStats[]>(
    () => window.api.getTeammateStats(queue, "enemies"),
    [queue],
  );

  const friendRows = useMemo<TeammateTableRow[]>(
    () => (friends ?? []) as TeammateTableRow[],
    [friends],
  );
  const enemyRows = useMemo<TeammateTableRow[]>(
    () => (enemies ?? []) as TeammateTableRow[],
    [enemies],
  );

  const friendColumns = useMemo<SortableColumn<TeammateTableRow>[]>(
    () => [
      {
        key: "name",
        label: "Player",
        render: (row) => (
          <div className="nm">
            <SummonerIcon iconId={row.profileIcon} size={30} />
            <span>{row.name}</span>
          </div>
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

  const enemyColumns = useMemo<SortableColumn<TeammateTableRow>[]>(
    () => [
      {
        key: "champion",
        label: "Champion",
        render: (row) => {
          const championId = row.champions[0]?.champion_id;
          return (
            <div className="nm">
              {championId ? (
                <ChampionIcon championId={championId} size={30} />
              ) : (
                <span className="h-[30px] w-[30px] rounded-full bg-white/[0.04]" />
              )}
              <span>{championId ? getChampionName(championData, championId) : row.name}</span>
            </div>
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
        label: "Your win rate",
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

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
      <div>
        <h1 className="font-display text-[30px] font-bold leading-tight tracking-[0.2px] text-lol-text-bright">
          Friends & Foes
        </h1>
        <p className="mt-1.5 text-lol-text">Who you win with and who beats you</p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-xl font-semibold text-lol-text-bright">
              Duo partners
            </h2>
            <span className="text-xs uppercase tracking-wider text-lol-text">
              Games played together
            </span>
          </div>
          {friendsLoading ? (
            <div className="py-8 text-center text-sm text-lol-text">Loading…</div>
          ) : (
            <SortableTable
              columns={friendColumns}
              rows={friendRows}
              defaultSortKey="games"
              rowKey={(row) => row.key}
            />
          )}
        </Panel>

        <Panel>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-xl font-semibold text-lol-text-bright">
              Most faced enemies
            </h2>
            <span className="text-xs uppercase tracking-wider text-lol-text">
              Champions on the other team
            </span>
          </div>
          {enemiesLoading ? (
            <div className="py-8 text-center text-sm text-lol-text">Loading…</div>
          ) : (
            <SortableTable
              columns={enemyColumns}
              rows={enemyRows}
              defaultSortKey="games"
              rowKey={(row) => row.key}
            />
          )}
        </Panel>
      </div>
    </div>
  );
}
