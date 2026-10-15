import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ItemDetail as ItemDetailData } from "../lib/types";
import { useIpc } from "../hooks/useIpc";
import { useHistoryScopeQueue } from "../lib/historyScope";
import { getChampionName, getItemName, useChampionData, useItemData } from "../hooks/useChampions";
import ItemIcon from "./ItemIcon";
import ChampionIcon from "./ChampionIcon";
import WinRateBar from "./WinRateBar";
import RiotText from "./RiotText";
import { SearchInput } from "./SearchInput";
import { Panel } from "./Panel";
import { formatDuration } from "../lib/format";

const KPI_CLASSES = {
  gold: "border-t-[#C9A45C] bg-[radial-gradient(circle_at_top_right,rgba(201,164,92,0.10),transparent_70%)]",
  green:
    "border-t-[#22C55E] bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.10),transparent_70%)]",
  blue: "border-t-[#3B82F6] bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.10),transparent_70%)]",
};

type ChampionSort = "games" | "winRate" | "name";
const CHAMPIONS_PAGE_SIZE = 50;

function KpiTile({
  label,
  value,
  caption,
  className,
}: {
  label: string;
  value: string;
  caption?: string;
  className: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[12px] border border-lol-border border-t-[3px] p-4 ${className}`}
    >
      <div className="text-[10px] font-bold uppercase tracking-wider text-lol-text">{label}</div>
      <div className="mt-2 text-[26px] font-bold leading-none text-lol-text-bright">{value}</div>
      {caption && <div className="mt-1 text-xs text-lol-text">{caption}</div>}
    </div>
  );
}

function PanelHeading({ title }: { title: string }) {
  return (
    <div className="relative mb-4 flex items-baseline justify-between gap-3">
      <h2 className="flex items-center gap-2 font-display text-[16px] font-semibold text-lol-text-bright">
        <span
          className="h-2 w-2 shrink-0 rotate-45 bg-[#E5483F] shadow-[0_0_6px_0_rgba(229,72,63,0.45)]"
          aria-hidden="true"
        />
        <span>{title}</span>
        <span className="rounded border border-lol-border/60 px-2 py-0.5 font-display text-[10px] font-semibold uppercase tracking-wider text-lol-text">
          MATCH-V5
        </span>
      </h2>
      <span
        className="pointer-events-none absolute bottom-[-6px] left-0 h-px w-2/5 bg-gradient-to-r from-[#E5483F]/35 to-transparent"
        aria-hidden="true"
      />
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-white/[0.08] bg-white/[0.02] px-4 py-3 text-lol-text/70">
      {text}
    </div>
  );
}

export function ItemDetailExp() {
  const { itemId, scope = "full" } = useParams<{ itemId: string; scope?: string }>();
  const id = Number(itemId);
  const queue = useHistoryScopeQueue(scope);
  const items = useItemData();
  const champions = useChampionData();
  const [expandedChampion, setExpandedChampion] = useState<number | null>(null);
  const [championSearch, setChampionSearch] = useState("");
  const [championSort, setChampionSort] = useState<ChampionSort>("games");
  const [championSortDesc, setChampionSortDesc] = useState(true);
  const [championPage, setChampionPage] = useState(1);
  const { data, loading } = useIpc<ItemDetailData>(
    () => window.api.getOwnedItemDetail(id, undefined, queue),
    [id, queue],
  );
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

  const averageGameDuration = useMemo(() => {
    const matches = data?.champions.flatMap((row) => row.matches) ?? [];
    return matches.length > 0
      ? matches.reduce((total, match) => total + match.game_duration, 0) / matches.length
      : null;
  }, [data]);

  const averageKda = useMemo(() => {
    const matches = data?.champions.flatMap((row) => row.matches) ?? [];
    if (matches.length === 0) return "—";

    const totals = matches.reduce(
      (total, match) => ({
        kills: total.kills + match.kills,
        deaths: total.deaths + match.deaths,
        assists: total.assists + match.assists,
      }),
      { kills: 0, deaths: 0, assists: 0 },
    );
    if (totals.deaths === 0 && totals.kills + totals.assists > 0) return "Perfect";
    return ((totals.kills + totals.assists) / Math.max(totals.deaths, 1)).toFixed(2);
  }, [data]);

  if (loading || !data) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-[1320px] items-center justify-center rounded-[14px] border border-lol-border p-12 text-sm text-lol-text">
        Loading item details…
      </div>
    );
  }

  const item = items[id];
  const back = `/history/${scope}/items`;
  const winRate = data.picks ? (data.wins / data.picks) * 100 : 0;
  const buildRate = data.totalGames ? (data.picks / data.totalGames) * 100 : 0;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
      <Link
        to={back}
        className="w-fit text-xs font-semibold text-lol-text transition-colors duration-120 hover:text-lol-text-bright"
      >
        ← Items
      </Link>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[5rem_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="relative overflow-hidden rounded-[12px] border border-lol-border border-l-[#C9A45C] bg-black/10 p-1 shadow-[0_0_14px_rgba(201,164,92,0.12)]">
            <ItemIcon itemId={id} size={64} />
          </div>
        </div>

        <div className="min-w-0 rounded-[12px] border border-lol-border border-t-[#E5483F] border-t-[3px] bg-[radial-gradient(circle_at_top_right,rgba(229,72,63,0.08),transparent_55%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-lol-text">
                Item detail
              </div>
              <h1 className="mt-1 font-display text-[28px] font-bold leading-tight text-lol-text-bright">
                {getItemName(items, id)}
              </h1>
            </div>
            <div className="rounded-lg border border-lol-border bg-black/10 px-3 py-2 text-right">
              <div className="text-[10px] font-bold uppercase tracking-wider text-lol-text">
                Built
              </div>
              <div className="mt-1 text-lg font-bold tabular-nums text-lol-text-bright">
                {data.picks.toLocaleString()}
              </div>
              <div className="text-[11px] text-lol-text">games</div>
            </div>
          </div>
          <div className="mt-5 text-sm leading-relaxed text-lol-text">
            <RiotText markup={item?.description ?? "No item description available."} />
          </div>
          {item?.from && item.from.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-lol-text">
                Components
              </span>
              {item.from.map((component, index) => (
                <span
                  key={component}
                  className="flex items-center gap-1 rounded-lg border border-lol-border bg-black/10 p-1 transition-colors duration-120 hover:border-lol-crimson/40 hover:bg-white/[0.025]"
                >
                  {index > 0 && <span className="text-xs font-bold text-lol-gold">+</span>}
                  <ItemIcon itemId={component} size={28} />
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiTile
          label="Price"
          value={item?.price != null ? item.price.toLocaleString() : "—"}
          className={KPI_CLASSES.gold}
        />
        <KpiTile
          label="Win rate"
          value={`${winRate.toFixed(1)}%`}
          caption={`${data.wins}W ${data.picks - data.wins}L`}
          className={KPI_CLASSES.green}
        />
        <KpiTile
          label="Build rate"
          value={`${buildRate.toFixed(1)}%`}
          caption={`${data.picks.toLocaleString()} of ${data.totalGames.toLocaleString()} games`}
          className={KPI_CLASSES.blue}
        />
        <KpiTile
          label="Avg purchase"
          value={
            data.avgBuyTimeMs != null ? formatDuration(Math.floor(data.avgBuyTimeMs / 1000)) : "—"
          }
          className={KPI_CLASSES.gold}
        />
        <KpiTile
          label="Avg duration"
          value={
            averageGameDuration != null ? formatDuration(Math.round(averageGameDuration)) : "—"
          }
          className={KPI_CLASSES.blue}
        />
        <KpiTile label="Avg KDA" value={averageKda} className={KPI_CLASSES.green} />
      </div>

      <Panel>
        <PanelHeading title="Win rate by patch" />
        {data.patchBreakdown.length === 0 ? (
          <EmptyState text="No patch data available." />
        ) : (
          <div className="flex flex-col gap-2 text-xs">
            {data.patchBreakdown.map((row) => {
              const patch = row.patch.split(".").slice(0, 2).join(".");
              return (
                <div
                  key={row.patch}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-white/[0.04] py-2 last:border-b-0"
                >
                  <span className="font-semibold text-lol-text-bright">{patch}</span>
                  <span className="text-right tabular-nums">{row.games}</span>
                  <span className="text-right tabular-nums">
                    {row.games ? `${((row.wins / row.games) * 100).toFixed(1)}%` : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHeading title="Top pairings" />
        {data.topPairings.length === 0 ? (
          <EmptyState text="No pairing data." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
            {data.topPairings.map((pairing) => (
              <Link
                key={pairing.item_id}
                to={`/history/${scope}/items/${pairing.item_id}`}
                className="min-w-0 rounded-lg border border-lol-border bg-black/10 p-2 transition-colors duration-120 hover:border-lol-crimson/40 hover:bg-white/[0.025]"
              >
                <ItemIcon itemId={pairing.item_id} size={32} />
                <div className="mt-2 truncate text-xs font-semibold text-lol-text-bright">
                  {getItemName(items, pairing.item_id)}
                </div>
                <div className="mt-1 text-[10px] text-lol-text">
                  {pairing.games} games,{" "}
                  {pairing.games ? ((pairing.wins / pairing.games) * 100).toFixed(1) : "—"}% win
                </div>
              </Link>
            ))}
          </div>
        )}
      </Panel>

      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-[18px] font-semibold text-lol-text-bright">
              Champions
            </h2>
            <p className="mt-1 text-xs text-lol-text">
              Champion performance in games where this item was built.
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
        <div className="overflow-hidden rounded-[12px] border border-lol-border bg-[radial-gradient(circle_at_100%_0,rgba(229,72,63,0.08),transparent_42%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]">
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
                  className="group flex min-h-14 w-full items-center gap-3 border-b border-white/[0.04] px-4 py-2.5 text-left transition-colors duration-120 hover:bg-white/[0.025]"
                >
                  <ChampionIcon
                    championId={row.champion_id}
                    size={34}
                    className="rounded-md border border-lol-border shadow-[0_0_10px_rgba(168,85,247,0.12)]"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-lol-text-bright">
                    {getChampionName(champions, row.champion_id)}
                  </span>
                  <span className="hidden w-28 shrink-0 text-right text-xs tabular-nums text-lol-text sm:block">
                    {row.games.toLocaleString()} / {row.championGames.toLocaleString()}
                  </span>
                  <div className="w-28 shrink-0">
                    <WinRateBar wins={row.wins} total={row.games} />
                  </div>
                  <span className="w-14 shrink-0 text-right text-xs tabular-nums text-lol-text-bright">
                    {row.games ? `${((row.wins / row.games) * 100).toFixed(1)}%` : "—"}
                  </span>
                </button>
                {expandedChampion === row.champion_id && (
                  <div className="border-b border-white/[0.04] bg-black/10 px-6 py-2">
                    {(row.matches ?? []).length > 0 ? (
                      row.matches.map((match) => (
                        <div
                          key={match.game_id}
                          className="flex items-center gap-3 border-b border-white/[0.04] py-2 text-xs text-lol-text last:border-0"
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
                        </div>
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
    </div>
  );
}
