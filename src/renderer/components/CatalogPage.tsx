import { useViewState } from "../hooks/useViewState";
// Shared layout of the Items and Augments tabs: headline numbers, a few highlights and one dense,
// sortable list that fits on the first screen
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatNumber } from "../lib/format";
import { FilterChip } from "./FilterChip";
import { SearchInput } from "./SearchInput";

export type CatalogRow = {
  id: number;
  name: string;
  group: string;
  color: string;
  games: number;
  wins: number;
  // Win-rate change from the previous patch to the selected (or newest) one, in points
  trend?: number;
  icon: (size: number) => ReactNode;
  extra: ReactNode;
  // Listed last and never highlighted (trinkets)
  minor?: boolean;
};

type SortKey = "name" | "games" | "winRate" | "trend";
const PAGE_SIZE = 60;
// Fewer games than this on either patch and the change is noise, not a trend
const TREND_MIN_GAMES = 10;

// Win-rate change between two patches, in points
export function patchTrend(
  now: { picks: number; wins: number } | undefined,
  before: { picks: number; wins: number } | undefined,
): number | undefined {
  if (!now || !before || now.picks < TREND_MIN_GAMES || before.picks < TREND_MIN_GAMES) return;
  return (now.wins / now.picks - before.wins / before.picks) * 100;
}

const winRate = (row: CatalogRow) => (row.games > 0 ? (row.wins / row.games) * 100 : 0);
const signed = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
const tone = (value: number) => (value >= 0 ? "text-lol-win" : "text-lol-loss");

const COLUMNS =
  "grid grid-cols-[2.5rem_minmax(11rem,2fr)_minmax(7rem,1fr)_minmax(9rem,1.3fr)_4.5rem_4.5rem_minmax(9rem,1.1fr)] items-center gap-3 px-3";

export function CatalogPage({
  title,
  subtitle,
  noun,
  extraLabel,
  groups,
  rows,
  loading,
  filters,
  onOpen,
}: {
  title: string;
  subtitle: string;
  noun: string;
  extraLabel: string;
  groups: { value: string; color?: string }[];
  rows: CatalogRow[];
  loading: boolean;
  filters: ReactNode;
  onOpen: (id: number) => void;
}) {
  const [group, setGroup] = useViewState(`catalog.${noun}.group`, "All");
  const [minGames, setMinGames] = useViewState(`catalog.${noun}.minGames`, 0);
  const [search, setSearch] = useViewState(`catalog.${noun}.search`, "");
  const [sort, setSort] = useViewState<{ key: SortKey; desc: boolean }>(`catalog.${noun}.sort`, {
    key: "games",
    desc: true,
  });

  const [shownCount, setShownCount] = useState(PAGE_SIZE);
  useEffect(() => setShownCount(PAGE_SIZE), [group, minGames, search, sort]);

  const totals = useMemo(() => {
    const games = rows.reduce((sum, r) => sum + r.games, 0);
    const wins = rows.reduce((sum, r) => sum + r.wins, 0);
    const main = rows.filter((r) => !r.minor);
    const enough = main.filter((r) => r.games >= 25);
    const best = (list: CatalogRow[], score: (r: CatalogRow) => number) =>
      list.reduce<CatalogRow | null>((a, b) => (!a || score(b) > score(a) ? b : a), null);
    return {
      games,
      average: games ? (wins / games) * 100 : 0,
      popular: best(main, (r) => r.games),
      strongest: best(enough, winRate),
      weakest: best(enough, (r) => -winRate(r)),
      rising: best(
        enough.filter((r) => r.trend != null),
        (r) => r.trend!,
      ),
      maxGames: rows.reduce((max, r) => Math.max(max, r.games), 1),
    };
  }, [rows]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const value = (r: CatalogRow) =>
      sort.key === "games" ? r.games : sort.key === "winRate" ? winRate(r) : (r.trend ?? -Infinity);
    return rows
      .filter(
        (r) =>
          (group === "All" || r.group === group) &&
          r.games >= minGames &&
          (!query || r.name.toLowerCase().includes(query)),
      )
      .sort((a, b) => {
        const diff = sort.key === "name" ? b.name.localeCompare(a.name) : value(a) - value(b) || 0;
        return (
          Number(a.minor ?? false) - Number(b.minor ?? false) ||
          (sort.desc ? -diff : diff) ||
          b.games - a.games
        );
      });
  }, [rows, group, minGames, search, sort]);

  const header = (key: SortKey, label: string, align = "text-right") => (
    <button
      type="button"
      onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : true }))}
      className={`${align} text-[10px] font-bold uppercase tracking-wider transition-colors hover:text-lol-text-bright ${
        sort.key === key ? "text-lol-gold" : "text-lol-text"
      }`}
    >
      {label}
      {sort.key === key && (sort.desc ? " ▾" : " ▴")}
    </button>
  );

  const highlight = (label: string, row: CatalogRow | null, value: (r: CatalogRow) => string) => (
    <button
      type="button"
      disabled={!row}
      onClick={() => row && onOpen(row.id)}
      className="app-tile flex min-w-0 items-center gap-3 !p-3 text-left"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/30">
        {row?.icon(44)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-widest text-lol-gold">
          {label}
        </span>
        <span className="block truncate font-display text-[14px] font-bold text-lol-text-bright">
          {row?.name ?? "Not enough games"}
        </span>
      </span>
      <span className="shrink-0 font-display text-[18px] font-bold tabular-nums text-lol-text-bright">
        {row ? value(row) : "—"}
      </span>
    </button>
  );

  return (
    <div className="flex min-h-full w-full flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-bold leading-none text-lol-text-bright">
            {title}
          </h1>
          <p className="mt-2 text-[13px] text-lol-text">
            {subtitle}
            {!loading &&
              ` · ${formatNumber(rows.length)} ${noun} · ${formatNumber(totals.games)} picks · ${totals.average.toFixed(1)}% average win rate`}
          </p>
        </div>
        <div className="flex items-center gap-2">{filters}</div>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-3 min-[85rem]:grid-cols-4">
        {highlight("Most popular", totals.popular, (r) => formatNumber(r.games))}
        {highlight("Best win rate", totals.strongest, (r) => `${winRate(r).toFixed(1)}%`)}
        {highlight("Worst win rate", totals.weakest, (r) => `${winRate(r).toFixed(1)}%`)}
        {highlight("Rising since last patch", totals.rising, (r) => `${signed(r.trend!)}`)}
      </div>

      <div className="app-tile min-w-0 !p-0">
        <div className="sticky -top-6 z-10 rounded-t-[var(--tile-radius)] border-b border-lol-border/60 bg-[var(--theme-bg-elevated)]">
          <div className="flex flex-wrap items-center gap-2 p-3">
            {groups.map((g) => (
              <FilterChip
                key={g.value}
                active={group === g.value}
                onClick={() => setGroup(g.value)}
              >
                <span style={{ color: group === g.value ? undefined : g.color }}>{g.value}</span>
              </FilterChip>
            ))}
            <span className="ml-3 text-[10px] font-bold uppercase tracking-wider text-lol-text">
              Min games
            </span>
            {[0, 10, 25, 50].map((n) => (
              <FilterChip key={n} active={minGames === n} onClick={() => setMinGames(n)}>
                {n ? `${n}+` : "Any"}
              </FilterChip>
            ))}
            <SearchInput
              className="ml-auto w-56"
              placeholder={`Search ${noun}`}
              aria-label={`Search ${noun}`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className={`${COLUMNS} pb-2`}>
            <span className="text-right text-[10px] font-bold text-lol-text">#</span>
            {header("name", "Name", "text-left")}
            {header("games", "Picks", "text-left")}
            {header("winRate", "Win rate", "text-left")}
            <span className="text-right text-[10px] font-bold uppercase tracking-wider text-lol-text">
              Vs avg
            </span>
            {header("trend", "Trend")}
            <span className="text-right text-[10px] font-bold uppercase tracking-wider text-lol-text">
              {extraLabel}
            </span>
          </div>
        </div>

        {loading || visible.length === 0 ? (
          <div className="py-10 text-center text-sm text-lol-text">
            {loading ? "Loading…" : `No ${noun} match these filters.`}
          </div>
        ) : (
          visible.slice(0, shownCount).map((row, index) => {
            const wr = winRate(row);
            return (
              <button
                type="button"
                key={row.id}
                onClick={() => onOpen(row.id)}
                // Off-screen rows are skipped by layout and paint, which keeps long lists quick
                style={{ contentVisibility: "auto", containIntrinsicSize: "auto 52px" }}
                className={`${COLUMNS} w-full border-b border-lol-border/30 py-2 text-left transition-colors last:border-0 hover:bg-white/[0.05]`}
              >
                <span className="text-right text-xs tabular-nums text-lol-text/60">
                  {index + 1}
                </span>
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    className="shrink-0 overflow-hidden rounded-lg border"
                    style={{ borderColor: row.color }}
                  >
                    {row.icon(34)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold text-lol-text-bright">
                      {row.name}
                    </span>
                    <span className="block text-[11px] font-semibold" style={{ color: row.color }}>
                      {row.group}
                    </span>
                  </span>
                </span>
                <span>
                  <span className="text-[13px] tabular-nums text-lol-text-bright">
                    {formatNumber(row.games)}
                  </span>
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/[0.07]">
                    <span
                      className="block h-full bg-lol-text/60"
                      style={{ width: `${(row.games / totals.maxGames) * 100}%` }}
                    />
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span
                    className={`w-14 font-display text-[15px] font-bold tabular-nums ${tone(wr - 50)}`}
                  >
                    {wr.toFixed(1)}%
                  </span>
                  <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                    <span
                      className={`block h-full ${wr >= 50 ? "bg-lol-win" : "bg-lol-loss"}`}
                      style={{ width: `${wr}%` }}
                    />
                    <span className="absolute inset-y-0 left-1/2 w-px bg-white/40" />
                  </span>
                </span>
                <span className={`text-right text-xs tabular-nums ${tone(wr - totals.average)}`}>
                  {signed(wr - totals.average)}
                </span>
                <span
                  className={`text-right text-xs tabular-nums ${row.trend == null ? "text-lol-text/50" : tone(row.trend)}`}
                >
                  {row.trend == null ? "—" : signed(row.trend)}
                </span>
                <span className="flex items-center justify-end gap-1 text-xs text-lol-text">
                  {row.extra}
                </span>
              </button>
            );
          })
        )}
        {!loading && visible.length > shownCount && (
          <button
            type="button"
            onClick={() => setShownCount((n) => n + PAGE_SIZE * 2)}
            className="w-full py-3 text-xs font-bold uppercase tracking-wider text-lol-text hover:text-lol-text-bright"
          >
            Show more ({formatNumber(visible.length - shownCount)} left)
          </button>
        )}
      </div>
    </div>
  );
}
