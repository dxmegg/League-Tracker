import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { TeammateChampionStats, TeammateStats } from "../lib/types";
import { useIpc } from "../hooks/useIpc";
import { getChampionName, useChampionData } from "../hooks/useChampions";
import { useHistoryScopeQueue } from "../lib/historyScope";
import { formatNumber, formatTimeAgo } from "../lib/format";
import { QueueFilterChips } from "../pages/Home";
import ChampionIcon from "./ChampionIcon";
import SummonerIcon from "./SummonerIcon";
import { FilterChip } from "./FilterChip";
import { SearchInput } from "./SearchInput";

const PAGE_SIZE = 50;

type Relation = "friends" | "enemies";
type Subject = "players" | "champions";
type SortKey = "name" | "games" | "winRate" | "kda" | "lastPlayed";

// One line of the list, whether it stands for a player or for a champion
type Row = {
  id: string;
  name: string;
  to: string;
  icon: (size: number) => ReactNode;
  games: number;
  // From your side: games you won with a friend, or won against a foe
  wins: number;
  kda: number;
  lastPlayed?: number;
};

const winRate = (row: Row) => (row.games > 0 ? (row.wins / row.games) * 100 : 0);

export function FriendsExp() {
  const scopedQueue = useHistoryScopeQueue();
  const championData = useChampionData();
  const [queue, setQueue] = useState<number | undefined>(scopedQueue);
  const [relation, setRelation] = useState<Relation>("friends");
  const [subject, setSubject] = useState<Subject>("players");
  const [minGames, setMinGames] = useState(0);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "games", desc: true });
  const [visible, setVisible] = useState(PAGE_SIZE);

  const players = useIpc<TeammateStats[]>(
    () => window.api.getTeammateStats(queue, relation),
    [queue, relation],
  );
  const champions = useIpc<TeammateChampionStats[]>(
    () => window.api.getTeammateChampions(queue, relation),
    [queue, relation],
  );

  useEffect(() => setQueue(scopedQueue), [scopedQueue]);
  useEffect(() => setVisible(PAGE_SIZE), [queue, relation, subject, minGames, search, sort]);
  const refetchPlayers = players.refetch;
  const refetchChampions = champions.refetch;
  useEffect(
    () =>
      window.api.onGamesUpdated(() => {
        refetchPlayers();
        refetchChampions();
      }),
    [refetchPlayers, refetchChampions],
  );

  const rows = useMemo<Row[]>(() => {
    const mine = (wins: number, games: number) => (relation === "enemies" ? games - wins : wins);
    if (subject === "players") {
      return (players.data ?? []).map((p) => ({
        id: p.key,
        name: p.name,
        to: `/friends/${encodeURIComponent(p.key)}`,
        icon: (size) => <SummonerIcon iconId={p.profileIcon} size={size} />,
        games: p.games,
        wins: mine(p.wins, p.games),
        kda: (p.kills + p.assists) / Math.max(p.deaths, 1),
        lastPlayed: p.lastPlayed,
      }));
    }
    return (champions.data ?? []).map((c) => ({
      id: String(c.champion_id),
      name: getChampionName(championData, c.champion_id),
      to: `/champions/${c.champion_id}`,
      icon: (size) => <ChampionIcon championId={c.champion_id} size={size} />,
      games: c.games,
      wins: mine(c.wins, c.games),
      kda: c.kda,
    }));
  }, [subject, relation, players.data, champions.data, championData]);

  const shown = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const value = (r: Row) =>
      sort.key === "winRate" ? winRate(r) : sort.key === "name" ? 0 : (r[sort.key] ?? 0);
    return rows
      .filter((r) => r.games >= minGames && r.name.toLocaleLowerCase().includes(query))
      .sort((a, b) => {
        const diff = sort.key === "name" ? b.name.localeCompare(a.name) : value(a) - value(b);
        return (sort.desc ? -diff : diff) || b.games - a.games;
      });
  }, [rows, search, minGames, sort]);

  // Highlights ignore the filters, so they stay a stable summary of the relation
  const highlights = useMemo(() => {
    const regulars = rows.filter((r) => r.games >= 10);
    const best = (list: Row[], score: (r: Row) => number) =>
      list.reduce<Row | null>((a, b) => (!a || score(b) > score(a) ? b : a), null);
    const friends = relation === "friends";
    return [
      {
        label: friends ? "Most played with" : "Most faced",
        row: best(rows, (r) => r.games),
        value: (r: Row) => `${formatNumber(r.games)} games`,
      },
      {
        label: friends ? "Best duo" : "Easiest opponent",
        row: best(regulars, winRate),
        value: (r: Row) => `${winRate(r).toFixed(1)}%`,
      },
      {
        label: friends ? "Worst luck together" : "Your nemesis",
        row: best(regulars, (r) => -winRate(r)),
        value: (r: Row) => `${winRate(r).toFixed(1)}%`,
      },
    ];
  }, [rows, relation]);

  const loading = subject === "players" ? players.loading : champions.loading;
  const columns =
    "grid grid-cols-[2.5rem_minmax(12rem,2fr)_4.5rem_6rem_minmax(10rem,1.5fr)_4.5rem_6rem] items-center gap-3 px-4";
  const header = (key: SortKey, label: string, align = "text-right") => (
    <button
      type="button"
      onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : true }))}
      className={`${align} text-[10px] font-bold uppercase tracking-wider hover:text-lol-text-bright ${
        sort.key === key ? "text-lol-gold" : "text-lol-text"
      }`}
    >
      {label}
      {sort.key === key && (sort.desc ? " ▾" : " ▴")}
    </button>
  );

  return (
    <div className="flex min-h-full w-full flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-bold leading-none text-lol-text-bright">
            Friends & Foes
          </h1>
          <p className="mt-2 text-[13px] text-lol-text">
            {relation === "friends"
              ? "People on your team and how you do together"
              : "People on the other team and how often you beat them"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <QueueFilterChips value={queue} onChange={setQueue} />
          {(["friends", "enemies"] as const).map((value) => (
            <FilterChip
              key={value}
              active={relation === value}
              onClick={() => setRelation(value)}
              className="h-9 px-5"
            >
              {value === "friends" ? "Friends" : "Foes"}
            </FilterChip>
          ))}
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-1 gap-3 md:grid-cols-3">
        {highlights.map(({ label, row, value }) => (
          <Link
            key={label}
            to={row?.to ?? "#"}
            className="app-tile flex min-w-0 items-center gap-3 !p-4"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center">
              {row?.icon(48)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold uppercase tracking-widest text-lol-gold">
                {label}
              </span>
              <span className="block truncate font-display text-[15px] font-bold text-lol-text-bright">
                {row?.name ?? "Not enough games"}
              </span>
              <span className="block text-[12px] text-lol-text">
                {row ? `${row.wins}W ${row.games - row.wins}L` : "10 games needed"}
              </span>
            </span>
            <span className="shrink-0 font-display text-[18px] font-bold tabular-nums text-lol-text-bright">
              {row ? value(row) : "—"}
            </span>
          </Link>
        ))}
      </div>

      <div className="app-tile min-w-0 !p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-lol-border/60 p-3">
          {(["players", "champions"] as const).map((value) => (
            <FilterChip key={value} active={subject === value} onClick={() => setSubject(value)}>
              {value}
            </FilterChip>
          ))}
          <span className="ml-3 text-[10px] font-bold uppercase tracking-wider text-lol-text">
            Min games
          </span>
          {[0, 3, 10, 25].map((n) => (
            <FilterChip key={n} active={minGames === n} onClick={() => setMinGames(n)}>
              {n ? `${n}+` : "Any"}
            </FilterChip>
          ))}
          <span className="ml-auto text-xs text-lol-text">
            {formatNumber(shown.length)} {subject}
          </span>
          <SearchInput
            className="w-56"
            placeholder={`Search ${subject}`}
            aria-label={`Search ${subject}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className={`${columns} border-b border-lol-border/40 py-2`}>
          <span className="text-right text-[10px] font-bold text-lol-text">#</span>
          {header("name", subject === "players" ? "Player" : "Champion", "text-left")}
          {header("games", "Games")}
          <span className="text-right text-[10px] font-bold uppercase tracking-wider text-lol-text">
            Record
          </span>
          {header("winRate", "Win rate", "text-left")}
          {header("kda", "KDA")}
          {subject === "players" ? header("lastPlayed", "Last played") : <span />}
        </div>

        {loading || shown.length === 0 ? (
          <div className="py-10 text-center text-sm text-lol-text">
            {loading ? "Loading…" : "Nobody matches these filters."}
          </div>
        ) : (
          shown.slice(0, visible).map((row, index) => {
            const rate = winRate(row);
            return (
              <Link
                key={row.id}
                to={row.to}
                className={`${columns} border-b border-lol-border/30 py-2 transition-colors last:border-0 hover:bg-white/[0.05]`}
              >
                <span className="text-right text-xs tabular-nums text-lol-text/60">
                  {index + 1}
                </span>
                <span className="flex min-w-0 items-center gap-3">
                  <span className="shrink-0">{row.icon(34)}</span>
                  <span className="truncate text-[14px] font-semibold text-lol-text-bright">
                    {row.name}
                  </span>
                </span>
                <span className="text-right text-[13px] tabular-nums text-lol-text-bright">
                  {formatNumber(row.games)}
                </span>
                <span className="text-right text-xs tabular-nums">
                  <span className="text-lol-win">{row.wins}W</span>{" "}
                  <span className="text-lol-loss">{row.games - row.wins}L</span>
                </span>
                <span className="flex items-center gap-2">
                  <span
                    className={`w-14 font-display text-[15px] font-bold tabular-nums ${rate >= 50 ? "text-lol-win" : "text-lol-loss"}`}
                  >
                    {rate.toFixed(1)}%
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-lol-loss/40">
                    <span className="block h-full bg-lol-win" style={{ width: `${rate}%` }} />
                  </span>
                </span>
                <span className="text-right text-[13px] tabular-nums text-lol-text">
                  {row.kda.toFixed(2)}
                </span>
                <span className="text-right text-xs text-lol-text">
                  {row.lastPlayed ? formatTimeAgo(row.lastPlayed) : ""}
                </span>
              </Link>
            );
          })
        )}
        {!loading && shown.length > visible && (
          <button
            type="button"
            onClick={() => setVisible((n) => n + PAGE_SIZE)}
            className="w-full py-3 text-xs font-bold uppercase tracking-wider text-lol-text hover:text-lol-text-bright"
          >
            Show more ({formatNumber(shown.length - visible)} left)
          </button>
        )}
      </div>
    </div>
  );
}
