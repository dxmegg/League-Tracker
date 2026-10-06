import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ChampionStats } from "../../shared/api";
import ChampionIcon from "./ChampionIcon";
import { ChampionCombobox } from "./ChampionCombobox";
import { FilterSelect } from "./FilterSelect";
import PatchSelect from "./PatchSelect";
import { useChampionData, getChampionName } from "../hooks/useChampions";
import { useHistoryScopeQueue } from "../lib/historyScope";
import { useIpc } from "../hooks/useIpc";
import { useActiveAccount } from "../hooks/useActiveAccount";
import { useViewState } from "../hooks/useViewState";
import { formatNumber } from "../lib/format";
import { ALL_ACCOUNTS_SENTINEL } from "../lib/accountsEvent";

type ColumnKey =
  | "champion"
  | "games"
  | "wins"
  | "losses"
  | "wr"
  | "kda_detail"
  | "kda"
  | "csmin"
  | "score"
  | "mvp"
  | "dmg"
  | "gold"
  | "mk";

const COLUMNS: Array<{ key: ColumnKey | null; label: string }> = [
  { key: null, label: "#" },
  { key: "champion", label: "Champion" },
  { key: "games", label: "Games" },
  { key: "wins", label: "W" },
  { key: "losses", label: "L" },
  { key: "wr", label: "Win rate" },
  { key: "kda_detail", label: "K/D/A" },
  { key: "kda", label: "KDA" },
  { key: "csmin", label: "CS/min" },
  { key: "score", label: "Score" },
  { key: "mvp", label: "MVP / ACE" },
  { key: "dmg", label: "Avg dmg" },
  { key: "gold", label: "Avg gold" },
  { key: "mk", label: "Multikills" },
];

export function ChampionExp() {
  const champData = useChampionData();
  const navigate = useNavigate();
  const [patch, setPatch] = useViewState<string | undefined>("champions.patch", undefined);
  const [queue, setQueue] = useViewState<number | undefined>("champions.queue", undefined);
  const scopedQueue = queue ?? useHistoryScopeQueue();
  const [activeAccountRaw] = useActiveAccount();
  const account = activeAccountRaw === ALL_ACCOUNTS_SENTINEL ? "all" : activeAccountRaw;

  const { data, refetch } = useIpc<ChampionStats[]>(
    () => window.api.getChampionStats(patch, scopedQueue, account),
    [patch, scopedQueue, account],
  );

  useEffect(() => {
    const unsub = window.api.onGamesUpdated(() => refetch());
    return unsub;
  }, [refetch]);

  const [championFilter, setChampionFilter] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");
  const [sortKey, setSortKey] = useState<ColumnKey>("games");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

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

  const sorted = useMemo(() => {
    const valueOf = (r: ChampionStats, key: ColumnKey): number | string => {
      switch (key) {
        case "champion":
          return getChampionName(champData, r.champion_id);
        case "games":
          return r.games;
        case "wins":
          return r.wins;
        case "losses":
          return r.games - r.wins;
        case "wr":
          return r.games > 0 ? r.wins / r.games : 0;
        case "kda_detail":
          return r.wins * 10000 + r.kills + r.assists;
        case "kda":
          return r.deaths > 0 ? (r.kills + r.assists) / r.deaths : r.kills + r.assists;
        case "csmin":
          return r.avg_cs_per_min ?? -1;
        case "score":
          return r.avg_score ?? -1;
        case "mvp":
          return r.mvps + r.aces;
        case "dmg":
          return r.avg_damage;
        case "gold":
          return r.avg_gold;
        case "mk":
          return r.double_kills + r.triple_kills + r.quadra_kills + r.penta_kills;
      }
    };

    const copy = [...filtered];
    copy.sort((a, b) => {
      const va = valueOf(a, sortKey);
      const vb = valueOf(b, sortKey);
      if (va === vb) return 0;
      const cmp = va > vb ? 1 : -1;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, champData, sortKey, sortDir]);

  const handleSort = (key: ColumnKey) => {
    if (key === sortKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "champion" ? "asc" : "desc");
    }
  };

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
            allowClear
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
        <div className="scroll">
          <table className="tbl ct">
            <thead>
              <tr>
                {COLUMNS.map((column) => (
                  <th
                    key={column.label}
                    data-k={column.key ?? undefined}
                    aria-sort={
                      column.key === sortKey
                        ? sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                    onClick={column.key ? () => handleSort(column.key as ColumnKey) : undefined}
                    style={{ cursor: column.key ? "pointer" : "default" }}
                  >
                    {column.label}
                    {column.key === sortKey ? (sortDir === "asc" ? " ▴" : " ▾") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} style={{ textAlign: "left" }}>
                    No champions match your filters
                  </td>
                </tr>
              ) : (
                sorted.map((r, i) => {
                  const wr = r.games > 0 ? (r.wins / r.games) * 100 : 0;
                  const kda = r.deaths > 0 ? (r.kills + r.assists) / r.deaths : null;
                  return (
                    <tr
                      key={r.champion_id}
                      className="clk"
                      tabIndex={0}
                      data-champion-id={r.champion_id}
                      onClick={() => navigate(`/champions/${r.champion_id}`)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") navigate(`/champions/${r.champion_id}`);
                      }}
                    >
                      <td className="muted">{i + 1}</td>
                      <td>
                        <div className="nm">
                          <ChampionIcon
                            championId={r.champion_id}
                            size={30}
                            className="rounded-lg"
                          />
                          <span>{getChampionName(champData, r.champion_id)}</span>
                        </div>
                      </td>
                      <td>{formatNumber(r.games)}</td>
                      <td>
                        <span className="text-lol-win">{formatNumber(r.wins)}</span>
                      </td>
                      <td>
                        <span className="text-lol-loss">{formatNumber(r.games - r.wins)}</span>
                      </td>
                      <td>
                        <span className={wr >= 50 ? "text-lol-win" : "text-lol-loss"}>
                          {wr.toFixed(1)}%
                        </span>
                        <span
                          className={`track ${wr < 50 ? "low" : ""}`}
                          style={{
                            display: "inline-block",
                            verticalAlign: "middle",
                            marginLeft: 8,
                            width: 84,
                          }}
                        >
                          <i style={{ width: `${wr}%` }} />
                        </span>
                      </td>
                      <td className="muted">
                        {r.avg_kills.toFixed(1)} / {r.avg_deaths.toFixed(1)} /{" "}
                        {r.avg_assists.toFixed(1)}
                      </td>
                      <td
                        className={
                          kda != null && kda >= 4
                            ? "text-lol-gold"
                            : kda != null && kda >= 3
                              ? "text-lol-win"
                              : ""
                        }
                      >
                        {kda != null ? kda.toFixed(2) : "Perfect"}
                      </td>
                      <td>{r.avg_cs_per_min?.toFixed(1) ?? "—"}</td>
                      <td className="text-lol-gold">{r.avg_score?.toFixed(1) ?? "—"}</td>
                      <td>
                        {formatNumber(r.mvps)}{" "}
                        <span className="muted">/ {formatNumber(r.aces)}</span>
                      </td>
                      <td>{formatNumber(r.avg_damage)}</td>
                      <td>{formatNumber(r.avg_gold)}</td>
                      <td>
                        <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-[11.5px] tabular-nums">
                          <span className="mk0 whitespace-nowrap" title="Double kills">
                            D {formatNumber(r.double_kills)}
                          </span>
                          <span className="mk1 whitespace-nowrap" title="Triple kills">
                            T {formatNumber(r.triple_kills)}
                          </span>
                          <span className="mk2 whitespace-nowrap" title="Quadra kills">
                            Q {formatNumber(r.quadra_kills)}
                          </span>
                          <span className="mk3 whitespace-nowrap" title="Penta kills">
                            P {formatNumber(r.penta_kills)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
