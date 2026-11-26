import { useViewState } from "../hooks/useViewState";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ItemDetail } from "../lib/types";
import { getChampionName, useChampionData } from "../hooks/useChampions";
import { formatNumber, kdaRatio } from "../lib/format";
import ChampionIcon from "./ChampionIcon";
import { SearchInput } from "./SearchInput";
import WinRateBar from "./WinRateBar";
import { Title } from "./live/shared";

type ChampionSort = "games" | "winRate" | "name";
const CHAMPIONS_PAGE_SIZE = 15;
function ChampionColumn({ label, value }: { label: string; value: string }) {
  return (
    <span className="hidden w-24 shrink-0 text-right md:block">
      <span className="block text-[9.5px] font-bold uppercase tracking-widest text-lol-text/70">
        {label}
      </span>
      <span className="font-display text-[13px] font-semibold tabular-nums text-lol-text-bright">
        {value}
      </span>
    </span>
  );
}

// Searchable per-champion list of an item or augment detail page
export function ChampionBreakdown({
  data,
  noun,
}: {
  data: Pick<ItemDetail, "champions">;
  noun: string;
}) {
  const champions = useChampionData();
  const [expandedChampion, setExpandedChampion] = useState<number | null>(null);
  const [championSearch, setChampionSearch] = useViewState("breakdown.search", "");
  const [championSort, setChampionSort] = useViewState<ChampionSort>("breakdown.sort", "games");
  const [championSortDesc, setChampionSortDesc] = useViewState("breakdown.sortDesc", true);
  const [championPage, setChampionPage] = useState(1);
  const filteredChampions = useMemo(() => {
    if (!data) return [];
    const search = championSearch.trim().toLowerCase();
    const filtered = data.champions.filter((row) =>
      getChampionName(champions, row.champion_id).toLowerCase().includes(search),
    );
    filtered.sort((a, b) => {
      const aName = getChampionName(champions, a.champion_id);
      const bName = getChampionName(champions, b.champion_id);
      const aWinRate = a.games ? a.wins / a.games : 0;
      const bWinRate = b.games ? b.wins / b.games : 0;
      const result =
        championSort === "name"
          ? aName.localeCompare(bName)
          : championSort === "winRate"
            ? aWinRate - bWinRate
            : a.games - b.games;
      return (championSortDesc ? -1 : 1) * result || aName.localeCompare(bName);
    });
    return filtered;
  }, [championSearch, championSort, championSortDesc, champions, data]);

  const championPageCount = Math.max(1, Math.ceil(filteredChampions.length / CHAMPIONS_PAGE_SIZE));
  const currentChampionPage = Math.min(championPage, championPageCount);
  const championPageStart = (currentChampionPage - 1) * CHAMPIONS_PAGE_SIZE;
  const visibleChampions = filteredChampions.slice(
    championPageStart,
    championPageStart + CHAMPIONS_PAGE_SIZE,
  );

  useEffect(() => {
    setChampionPage(1);
  }, [championSearch, championSort, championSortDesc]);

  useEffect(() => {
    if (championPage > championPageCount) setChampionPage(championPageCount);
  }, [championPage, championPageCount]);

  return (
    <div className="app-tile min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Title>Champions</Title>
          <p className="-mt-3 text-xs text-lol-text">
            Champion performance in games with this {noun}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            className="w-52"
            placeholder="Search champions"
            value={championSearch}
            onChange={(event) => setChampionSearch(event.target.value)}
          />
          <select
            value={championSort}
            onChange={(event) => setChampionSort(event.target.value as ChampionSort)}
            className="h-9 rounded-md border border-lol-border/60 bg-lol-card/40 px-2 text-xs text-lol-text-bright"
            aria-label="Sort champions by"
          >
            <option value="games">Games</option>
            <option value="winRate">Win rate</option>
            <option value="name">Name</option>
          </select>
          <button
            type="button"
            onClick={() => setChampionSortDesc((value) => !value)}
            className="h-9 rounded-md border border-lol-border/60 px-2 text-xs font-semibold text-lol-text-bright transition-colors duration-120 hover:border-lol-crimson/40 hover:bg-white/[0.025]"
            aria-label={`Sort ${championSortDesc ? "ascending" : "descending"}`}
          >
            {championSortDesc ? "↓" : "↑"}
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {visibleChampions.length === 0 ? (
          <div className="p-8 text-center text-sm text-lol-text">
            No champions match your search.
          </div>
        ) : (
          visibleChampions.map((row) => (
            <div key={row.champion_id}>
              <button
                type="button"
                onClick={() =>
                  setExpandedChampion((current) =>
                    current === row.champion_id ? null : row.champion_id,
                  )
                }
                aria-expanded={expandedChampion === row.champion_id}
                className={`flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left rounded-xl border border-lol-border/50 bg-black/25 transition-colors hover:border-lol-border-hover hover:bg-white/[0.04] ${
                  row.wins * 2 >= row.games
                    ? "shadow-[inset_4px_0_0_var(--theme-win)]"
                    : "shadow-[inset_4px_0_0_var(--theme-loss)]"
                }`}
              >
                <ChampionIcon
                  championId={row.champion_id}
                  size={34}
                  className="rounded-md border border-lol-border shadow-[0_0_10px_rgba(168,85,247,0.12)]"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-lol-text-bright">
                  {getChampionName(champions, row.champion_id)}
                </span>
                <ChampionColumn label="Taken" value={`${row.games} / ${row.championGames}`} />
                <ChampionColumn
                  label="KDA"
                  value={kdaRatio(
                    row.matches.reduce((n, m) => n + m.kills, 0),
                    row.matches.reduce((n, m) => n + m.deaths, 0),
                    row.matches.reduce((n, m) => n + m.assists, 0),
                  )}
                />
                <ChampionColumn
                  label="Avg damage"
                  value={formatNumber(
                    Math.round(row.matches.reduce((n, m) => n + m.damage, 0) / row.games),
                  )}
                />
                <ChampionColumn
                  label="Without it"
                  value={
                    row.championGames > row.games
                      ? `${(((row.championWins - row.wins) / (row.championGames - row.games)) * 100).toFixed(0)}%`
                      : "—"
                  }
                />
                <div className="w-28 shrink-0">
                  <WinRateBar wins={row.wins} total={row.games} />
                </div>
              </button>
              {expandedChampion === row.champion_id && (
                <div className="mt-1 rounded-xl bg-black/25 px-6 py-2">
                  {(row.matches ?? []).length > 0 ? (
                    row.matches.map((match) => (
                      <Link
                        to={`/match/${match.game_id}`}
                        key={match.game_id}
                        className="flex items-center gap-3 border-b border-white/[0.04] py-2 text-xs text-lol-text last:border-0 hover:bg-white/[0.04]"
                      >
                        <span className={match.win ? "text-lol-win" : "text-lol-loss"}>
                          {match.win ? "WIN" : "LOSS"}
                        </span>
                        <span className="text-lol-text-bright">
                          {match.kills} / {match.deaths} / {match.assists}
                        </span>
                        <span>{Math.floor(match.game_duration / 60)}m</span>
                        <span className="ml-auto">
                          {new Date(match.game_creation).toLocaleDateString()}
                        </span>
                      </Link>
                    ))
                  ) : (
                    <div className="py-2 text-xs text-lol-text">No matching games found.</div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
      {filteredChampions.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-lol-text">
          <span>
            Showing {championPageStart + 1}–
            {Math.min(championPageStart + CHAMPIONS_PAGE_SIZE, filteredChampions.length)} of{" "}
            {filteredChampions.length.toLocaleString()} champions
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setChampionPage((page) => Math.max(1, page - 1))}
              disabled={currentChampionPage === 1}
              className="rounded-md border border-lol-border px-3 py-1.5 font-semibold text-lol-text-bright transition-colors duration-120 hover:border-lol-crimson/40 hover:bg-white/[0.025] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Prev
            </button>
            <span className="tabular-nums">
              Page {currentChampionPage} of {championPageCount}
            </span>
            <button
              type="button"
              onClick={() => setChampionPage((page) => Math.min(championPageCount, page + 1))}
              disabled={currentChampionPage === championPageCount}
              className="rounded-md border border-lol-border px-3 py-1.5 font-semibold text-lol-text-bright transition-colors duration-120 hover:border-lol-crimson/40 hover:bg-white/[0.025] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
