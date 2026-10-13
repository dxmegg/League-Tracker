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

const CHAMP_GRID =
  "grid min-w-[1120px] grid-cols-[40px_minmax(160px,1fr)_60px_50px_50px_80px_90px_60px_70px_70px_90px_80px_80px_100px] items-center";

const CHAMPION_ICON_ACCENTS = [
  "border-lol-crimson/70 shadow-[0_0_10px_rgba(229,72,63,0.22)]",
  "border-lol-gold/70 shadow-[0_0_10px_rgba(201,164,92,0.22)]",
  "border-lol-win/70 shadow-[0_0_10px_rgba(74,222,128,0.20)]",
  "border-lol-assist/70 shadow-[0_0_10px_rgba(77,184,255,0.20)]",
  "border-lol-violet/70 shadow-[0_0_10px_rgba(169,139,255,0.20)]",
  "border-lol-text/40 shadow-[0_0_10px_rgba(148,163,184,0.16)]",
];

type Accent = { color: string; tint: string };

const ACCENTS: Accent[] = [
  { color: "#E5483F", tint: "rgba(229,72,63,0.08)" },
  { color: "#C9A45C", tint: "rgba(201,164,92,0.08)" },
  { color: "#22C55E", tint: "rgba(34,197,94,0.08)" },
  { color: "#3B82F6", tint: "rgba(59,130,246,0.08)" },
];

function KpiTile({
  label,
  value,
  caption,
  accent,
}: {
  label: string;
  value: string;
  caption: string;
  accent: Accent;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-[12px] border border-lol-border p-4"
      style={{ background: `radial-gradient(circle at 100% 0, ${accent.tint}, transparent 65%)` }}
    >
      <span
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ backgroundColor: accent.color }}
      />
      <div className="text-[10px] font-bold uppercase tracking-wider text-lol-text">{label}</div>
      <div className="mt-2 text-[26px] font-bold leading-none text-lol-text-bright">{value}</div>
      <div className="mt-1 text-xs text-lol-text">{caption}</div>
    </div>
  );
}

function HighlightCard({
  title,
  champion,
  value,
  caption,
  accent,
  champData,
  emptyTitle,
}: {
  title: string;
  champion: ChampionStats | null;
  value: string;
  caption: string;
  accent: Accent;
  champData: ReturnType<typeof useChampionData>;
  emptyTitle?: string;
}) {
  return (
    <div
      className="relative min-h-[132px] overflow-hidden rounded-[12px] border border-lol-border p-4"
      style={{ background: `radial-gradient(circle at 100% 0, ${accent.tint}, transparent 65%)` }}
      title={emptyTitle}
    >
      <span
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ backgroundColor: accent.color }}
      />
      <div className="flex items-start gap-3">
        {champion ? (
          <div
            className="shrink-0 rounded-lg border p-1 shadow-[0_0_14px_rgba(229,72,63,0.18)]"
            style={{ borderColor: accent.color }}
          >
            <ChampionIcon championId={champion.champion_id} size={40} />
          </div>
        ) : (
          <div className="h-[50px] w-[50px] shrink-0 rounded-lg border border-lol-border bg-black/10" />
        )}
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-lol-text">
            {title}
          </div>
          <div className="mt-1 truncate text-sm font-bold text-lol-text-bright">
            {champion ? getChampionName(champData, champion.champion_id) : "—"}
          </div>
          <div className="mt-1 text-xl font-bold leading-none text-lol-text-bright">{value}</div>
          <div className="mt-1 text-[11px] text-lol-text">{caption}</div>
        </div>
      </div>
    </div>
  );
}

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

  const totalGames = filtered.reduce((sum, champion) => sum + champion.games, 0);
  const totalWins = filtered.reduce((sum, champion) => sum + champion.wins, 0);
  const mostPlayed = filtered.reduce<ChampionStats | null>(
    (best, champion) => (best == null || champion.games > best.games ? champion : best),
    null,
  );
  const bestWinRate = filtered
    .filter((champion) => champion.games >= 25)
    .reduce<ChampionStats | null>((best, champion) => {
      const championWinRate = champion.wins / champion.games;
      const bestWinRate = best ? best.wins / best.games : -1;
      return best == null || championWinRate > bestWinRate ? champion : best;
    }, null);
  const highestScore = filtered
    .filter((champion) => champion.games >= 10 && champion.avg_score != null)
    .reduce<ChampionStats | null>(
      (best, champion) =>
        best == null || (champion.avg_score ?? -1) > (best.avg_score ?? -1) ? champion : best,
      null,
    );
  const mostMvpAce = filtered.reduce<ChampionStats | null>((best, champion) => {
    const championBadges = champion.mvps + champion.aces;
    const bestBadges = best ? best.mvps + best.aces : -1;
    return best == null || championBadges > bestBadges ? champion : best;
  }, null);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center font-display text-[30px] font-bold leading-tight tracking-[0.2px] text-lol-text-bright">
            <span className="mr-2 h-2.5 w-2.5 rotate-45 bg-lol-crimson shadow-[0_0_8px_rgba(229,72,63,0.45)]" />
            <span className="relative pb-2 after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:bg-gradient-to-r after:from-lol-crimson after:to-transparent">
              Champions
            </span>
          </h1>
          <p className="mt-1.5 text-lol-text">Your performance on every champion, all accounts</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/champions/summary")}
            className="h-9 rounded-md border border-lol-border/60 bg-lol-card/40 px-3 text-xs text-lol-text-bright transition-colors duration-[120ms] hover:border-lol-crimson/70 focus-visible:outline-none focus-visible:border-lol-crimson/70 focus-visible:ring-1 focus-visible:ring-lol-crimson/40"
          >
            Check summary
          </button>
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

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiTile
          label="Champions shown"
          value={formatNumber(filtered.length)}
          caption={`of ${formatNumber(filtered.length)} tracked`}
          accent={ACCENTS[0]}
        />
        <KpiTile
          label="Total games"
          value={formatNumber(totalGames)}
          caption="in the selected queue and patch"
          accent={ACCENTS[1]}
        />
        <KpiTile
          label="Average win rate"
          value={totalGames > 0 ? `${((totalWins / totalGames) * 100).toFixed(1)}%` : "—"}
          caption="across all champions"
          accent={ACCENTS[2]}
        />
        <KpiTile
          label="Games per champion"
          value={filtered.length > 0 ? (totalGames / filtered.length).toFixed(1) : "—"}
          caption="average sample"
          accent={ACCENTS[3]}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <HighlightCard
          title="Most played"
          champion={mostPlayed}
          value={mostPlayed ? `${formatNumber(mostPlayed.games)} games` : "—"}
          caption={
            mostPlayed && totalGames > 0
              ? `${((mostPlayed.games / totalGames) * 100).toFixed(1)}% of all games`
              : "No champion data"
          }
          accent={ACCENTS[0]}
          champData={champData}
        />
        <HighlightCard
          title="Best win rate"
          champion={bestWinRate}
          value={
            bestWinRate ? `${((bestWinRate.wins / bestWinRate.games) * 100).toFixed(1)}%` : "—"
          }
          caption={
            bestWinRate
              ? `minimum 25 games · ${formatNumber(bestWinRate.games)} games`
              : "No champion meets the minimum"
          }
          accent={ACCENTS[1]}
          champData={champData}
          emptyTitle={bestWinRate ? undefined : "Not enough games"}
        />
        <HighlightCard
          title="Highest average score"
          champion={highestScore}
          value={highestScore?.avg_score != null ? highestScore.avg_score.toFixed(1) : "—"}
          caption={
            highestScore
              ? `across ${formatNumber(highestScore.games)} games`
              : "No champion meets the minimum"
          }
          accent={ACCENTS[2]}
          champData={champData}
          emptyTitle={highestScore ? undefined : "Not enough games"}
        />
        <HighlightCard
          title="Most MVP/ACE"
          champion={mostMvpAce}
          value={mostMvpAce ? formatNumber(mostMvpAce.mvps + mostMvpAce.aces) : "—"}
          caption={
            mostMvpAce ? `across ${formatNumber(mostMvpAce.games)} games` : "No champion data"
          }
          accent={ACCENTS[3]}
          champData={champData}
        />
      </div>

      <div className="min-w-0 rounded-[14px] border border-lol-border bg-[linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] p-5">
        <div className="scroll">
          <div role="table" className="tbl ct">
            <div role="rowgroup">
              <div role="row" className={CHAMP_GRID}>
                {COLUMNS.map((column) => (
                  <div
                    key={column.label}
                    role="columnheader"
                    data-k={column.key ?? undefined}
                    aria-sort={
                      column.key === sortKey
                        ? sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                    onClick={column.key ? () => handleSort(column.key as ColumnKey) : undefined}
                    className={`px-2.5 pb-2.5 text-right text-[12.5px] font-medium text-lol-text/60 ${
                      column.key === null ? "text-left" : ""
                    } ${column.key ? "cursor-pointer select-none" : ""}`}
                  >
                    <span className="flex items-center justify-end gap-1">
                      {column.label}
                      {column.key === sortKey ? (sortDir === "asc" ? "▴" : "▾") : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div role="rowgroup">
              {sorted.length === 0 ? (
                <div role="row" className={CHAMP_GRID}>
                  <div role="cell" className="col-span-full px-2.5 py-2 text-left">
                    No champions match your filters
                  </div>
                </div>
              ) : (
                sorted.map((r, i) => {
                  const wr = r.games > 0 ? (r.wins / r.games) * 100 : 0;
                  const kda = r.deaths > 0 ? (r.kills + r.assists) / r.deaths : null;
                  return (
                    <div
                      key={r.champion_id}
                      role="row"
                      className={`${CHAMP_GRID} cursor-pointer border-b border-lol-border/40 transition-colors duration-[120ms] hover:bg-white/[0.03]`}
                      tabIndex={0}
                      data-champion-id={r.champion_id}
                      onClick={() => navigate(`/champions/${r.champion_id}`)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") navigate(`/champions/${r.champion_id}`);
                      }}
                    >
                      <div role="cell" className="px-2.5 py-2 text-left text-lol-text/60">
                        {i + 1}
                      </div>
                      <div role="cell" className="px-2.5 py-2">
                        <div className="nm">
                          <ChampionIcon
                            championId={r.champion_id}
                            size={30}
                            className={`rounded-lg border ${CHAMPION_ICON_ACCENTS[i % CHAMPION_ICON_ACCENTS.length]}`}
                          />
                          <span>{getChampionName(champData, r.champion_id)}</span>
                        </div>
                      </div>
                      <div role="cell" className="px-2.5 py-2 text-right">
                        {formatNumber(r.games)}
                      </div>
                      <div role="cell" className="px-2.5 py-2 text-right">
                        <span className="text-lol-win">{formatNumber(r.wins)}</span>
                      </div>
                      <div role="cell" className="px-2.5 py-2 text-right">
                        <span className="text-lol-loss">{formatNumber(r.games - r.wins)}</span>
                      </div>
                      <div role="cell" className="px-2.5 py-2 text-right">
                        <span
                          className={`rounded-md px-1.5 py-0.5 ${
                            wr >= 55
                              ? "bg-lol-win/15 text-lol-win"
                              : wr <= 45
                                ? "bg-lol-crimson/15 text-lol-crimson"
                                : "bg-white/[0.04] text-lol-text"
                          }`}
                        >
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
                      </div>
                      <div role="cell" className="px-2.5 py-2 text-right text-lol-text/60">
                        {r.avg_kills.toFixed(1)} / {r.avg_deaths.toFixed(1)} /{" "}
                        {r.avg_assists.toFixed(1)}
                      </div>
                      <div
                        role="cell"
                        className={`px-2.5 py-2 text-right ${
                          kda != null && kda >= 4
                            ? "text-lol-gold"
                            : kda != null && kda >= 3
                              ? "text-lol-win"
                              : ""
                        }`}
                      >
                        {kda != null ? kda.toFixed(2) : "Perfect"}
                      </div>
                      <div role="cell" className="px-2.5 py-2 text-right">
                        {r.avg_cs_per_min?.toFixed(1) ?? "—"}
                      </div>
                      <div role="cell" className="px-2.5 py-2 text-right text-lol-gold">
                        {r.avg_score?.toFixed(1) ?? "—"}
                      </div>
                      <div role="cell" className="px-2.5 py-2 text-right">
                        {formatNumber(r.mvps)}{" "}
                        <span className="muted">/ {formatNumber(r.aces)}</span>
                      </div>
                      <div role="cell" className="px-2.5 py-2 text-right">
                        {formatNumber(r.avg_damage)}
                      </div>
                      <div role="cell" className="px-2.5 py-2 text-right">
                        {formatNumber(r.avg_gold)}
                      </div>
                      <div role="cell" className="px-2.5 py-2 text-right">
                        <div className="ml-auto grid w-max grid-cols-2 gap-x-2 gap-y-0.5 text-[10.5px] tabular-nums">
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
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
