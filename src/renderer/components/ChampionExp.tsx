import { useEffect, useMemo, useState } from "react";
import type { ChampionStats } from "../../shared/api";
import ChampionIcon from "./ChampionIcon";
import { ChampionCombobox } from "./ChampionCombobox";
import { ChampionExpandedExp } from "./ChampionExpandedExp";
import { FilterSelect } from "./FilterSelect";
import PatchSelect from "./PatchSelect";
import { SortableTable, type SortableColumn } from "./SortableTable";
import { useChampionData, getChampionName } from "../hooks/useChampions";
import { useHistoryScopeQueue } from "../lib/historyScope";
import { useIpc } from "../hooks/useIpc";
import { useViewState } from "../hooks/useViewState";
import { formatNumber } from "../lib/format";

export function ChampionExp() {
  const champData = useChampionData();
  const [patch, setPatch] = useViewState<string | undefined>("champions.patch", undefined);
  const [queue, setQueue] = useViewState<number | undefined>("champions.queue", undefined);
  const scopedQueue = queue ?? useHistoryScopeQueue();

  const { data, refetch } = useIpc<ChampionStats[]>(
    () => window.api.getChampionStats(patch, scopedQueue),
    [patch, scopedQueue],
  );

  useEffect(() => {
    const unsub = window.api.onGamesUpdated(() => refetch());
    return unsub;
  }, [refetch]);

  const [championFilter, setChampionFilter] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = searchText.trim().toLowerCase();
    return data.filter((c) => {
      if (championFilter != null && c.champion_id !== championFilter) return false;
      if (q && championFilter == null) {
        const name = getChampionName(champData, c.champion_id).toLowerCase();
        if (!name.includes(q)) return false;
      }
      return true;
    });
  }, [data, championFilter, searchText, champData]);

  const columns: Array<SortableColumn<ChampionStats>> = useMemo(
    () => [
      {
        key: "champion",
        label: "Champion",
        defaultDir: "asc",
        sortValue: (r) => getChampionName(champData, r.champion_id),
        render: (r) => (
          <div className="nm">
            <ChampionIcon championId={r.champion_id} size={30} className="rounded-lg" />
            <span>{getChampionName(champData, r.champion_id)}</span>
          </div>
        ),
      },
      {
        key: "games",
        label: "Games",
        sortValue: (r) => r.games,
        render: (r) => formatNumber(r.games),
      },
      {
        key: "wins",
        label: "W",
        sortValue: (r) => r.wins,
        render: (r) => <span className="text-lol-win">{formatNumber(r.wins)}</span>,
      },
      {
        key: "losses",
        label: "L",
        sortValue: (r) => r.games - r.wins,
        render: (r) => <span className="text-lol-loss">{formatNumber(r.games - r.wins)}</span>,
      },
      {
        key: "wr",
        label: "Win rate",
        sortValue: (r) => (r.games > 0 ? r.wins / r.games : 0),
        render: (r) => {
          const wr = r.games > 0 ? (r.wins / r.games) * 100 : 0;
          return (
            <div className="flex items-center justify-end gap-2">
              <span className={`tabular-nums ${wr >= 50 ? "text-lol-win" : "text-lol-loss"}`}>
                {wr.toFixed(1)}%
              </span>
              <div className="h-[5px] w-[84px] overflow-hidden rounded-full bg-white/[0.05]">
                <i
                  className={`block h-full rounded-full ${wr < 50 ? "bg-lol-loss" : "bg-lol-win"}`}
                  style={{ width: `${wr}%` }}
                />
              </div>
            </div>
          );
        },
      },
      {
        key: "kda",
        label: "KDA",
        sortValue: (r) => (r.deaths > 0 ? (r.kills + r.assists) / r.deaths : r.kills + r.assists),
        render: (r) => {
          const kda = r.deaths > 0 ? (r.kills + r.assists) / r.deaths : null;
          return <span className="tabular-nums">{kda != null ? kda.toFixed(2) : "Perfect"}</span>;
        },
      },
      {
        key: "csmin",
        label: "CS/min",
        sortValue: (r) => r.avg_cs_per_min ?? -1,
        render: (r) => (
          <span className="tabular-nums">
            {r.avg_cs_per_min != null ? r.avg_cs_per_min.toFixed(1) : "—"}
          </span>
        ),
      },
      {
        key: "score",
        label: "Score",
        sortValue: (r) => r.avg_score ?? -1,
        render: (r) => (
          <span className="tabular-nums text-lol-gold">
            {r.avg_score != null ? r.avg_score.toFixed(1) : "—"}
          </span>
        ),
      },
    ],
    [champData],
  );

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[30px] font-bold leading-tight tracking-[0.2px] text-lol-text-bright">
            Champions
          </h1>
          <p className="mt-1.5 text-lol-text">Your performance on every champion, all accounts</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            value={queue != null ? String(queue) : undefined}
            onChange={(v) => setQueue(v === undefined ? undefined : Number(v))}
            placeholder="All queues"
            title="Queue"
            options={[
              { value: "420", label: "Ranked Solo" },
              { value: "440", label: "Ranked Flex" },
              { value: "450", label: "ARAM" },
              { value: "400", label: "Normal" },
              { value: "1700", label: "Arena" },
            ]}
          />
          <PatchSelect value={patch} onChange={setPatch} />
          <ChampionCombobox
            value={championFilter}
            onChange={setChampionFilter}
            onQueryChange={setSearchText}
            placeholder="Search champion"
          />
        </div>
      </div>

      <div className="min-w-0 rounded-[14px] border border-lol-border bg-[linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] p-5">
        <SortableTable<ChampionStats>
          columns={columns}
          rows={filtered}
          defaultSortKey="games"
          rowKey={(r) => r.champion_id}
          renderExpandedRow={(r) => (
            <ChampionExpandedExp championId={r.champion_id} patch={patch} queue={scopedQueue} />
          )}
        />
      </div>
    </div>
  );
}
