import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useIpc } from "../hooks/useIpc";
import { useViewState } from "../hooks/useViewState";
import { useChampionData, getChampionName } from "../hooks/useChampions";
import type { TeammateStats } from "../lib/types";
import ChampionIcon from "../components/ChampionIcon";
import SummonerIcon from "../components/SummonerIcon";
import WinRateBar from "../components/WinRateBar";
import { formatTimeAgo, kdaRatio, kdaColor } from "../lib/format";
import { useHistoryScopeQueue } from "../lib/historyScope";

type SortKey = "games" | "winRate" | "kda" | "lastPlayed";
type SortDir = "asc" | "desc";
const BATCH_SIZE = 200;

function useNearViewport(rootMargin = "200px") {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return { ref, visible };
}

function LazyChampionIcon({ championId, size }: { championId: number; size: number }) {
  const { ref, visible } = useNearViewport();
  if (!visible) {
    return (
      <div
        ref={ref}
        style={{ width: size, height: size }}
        className="rounded-full bg-white/[0.04]"
      />
    );
  }
  return <ChampionIcon championId={championId} size={size} />;
}

export default function Friends({
  relation,
  historyScope,
  historySection,
}: {
  relation?: "friends" | "enemies";
  historyScope?: string;
  historySection?: string;
}) {
  const navigate = useNavigate();
  const { section } = useParams<{ section?: string }>();
  const [view, setView] = useState<"friends" | "enemies">(relation ?? "friends");
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const { scope } = useParams<{ scope?: string }>();
  const activeScope = historyScope ?? scope;
  const activeSection = historySection ?? section;
  const champData = useChampionData();
  const scopedQueue = useHistoryScopeQueue(activeScope);
  const { data, loading, refetch } = useIpc<TeammateStats[]>(
    () => window.api.getTeammateStats(scopedQueue, view),
    [scopedQueue, view],
  );
  const [search, setSearch] = useViewState("friends.search", "");
  const [sortKey, setSortKey] = useViewState<SortKey>("friends.sortKey", "games");
  const [sortDir, setSortDir] = useViewState<SortDir>("friends.sortDir", "desc");

  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [search, view, sortKey, sortDir]);

  useEffect(() => {
    const unsub = window.api.onGamesUpdated(() => refetch());
    return unsub;
  }, [refetch]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = useMemo(() => {
    if (!data) return [];
    let filtered = data.filter(
      (t) => t.games >= 1 && t.name.toLowerCase().includes(search.toLowerCase()),
    );

    filtered.sort((a, b) => {
      let av: number, bv: number;
      switch (sortKey) {
        case "winRate":
          av = a.games > 0 ? a.wins / a.games : 0;
          bv = b.games > 0 ? b.wins / b.games : 0;
          break;
        case "kda":
          av = a.deaths > 0 ? (a.kills + a.assists) / a.deaths : a.kills + a.assists;
          bv = b.deaths > 0 ? (b.kills + b.assists) / b.deaths : b.kills + b.assists;
          break;
        case "lastPlayed":
          av = a.lastPlayed;
          bv = b.lastPlayed;
          break;
        default:
          av = a.games;
          bv = b.games;
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });

    return filtered;
  }, [data, search, sortKey, sortDir, view]);

  if (loading || !data) {
    return (
      <div className="rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03] p-12 text-center">
        <p className="text-sm text-lol-text">Loading...</p>
      </div>
    );
  }

  const SortHeader = ({
    label,
    field,
    className,
  }: {
    label: string;
    field: SortKey;
    className?: string;
  }) => (
    <th
      onClick={() => handleSort(field)}
      className={`px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none transition-colors hover:text-lol-text-bright focus-visible:outline-none focus-visible:text-lol-gold ${
        sortKey === field ? "text-lol-gold" : "text-lol-text"
      } ${className ?? ""}`}
    >
      {label} {sortKey === field ? (sortDir === "desc" ? "▼" : "▲") : ""}
    </th>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-lol-text">
            {sorted.length} players · {view === "enemies" ? "1+ games against" : "1+ game together"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search player..."
              className="h-9 w-56 rounded-md border border-lol-border/60 bg-lol-card/40 px-3 text-xs text-lol-text-bright placeholder:text-lol-text/50 focus-visible:outline-none focus-visible:border-lol-gold/60 focus-visible:ring-1 focus-visible:ring-lol-gold/40 transition-colors pr-9"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-1 top-1/2 inline-flex h-9 -translate-y-1/2 items-center rounded-md border border-lol-gold/30 bg-lol-gold/10 px-3 text-xs font-semibold tracking-wider text-lol-gold transition-colors hover:bg-lol-gold/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-deep)]"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="h-3.5 w-3.5"
                >
                  <path
                    fillRule="evenodd"
                    d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm2.78-4.22a.75.75 0 0 1-1.06 0L8 9.06l-1.72 1.72a.75.75 0 1 1-1.06-1.06L6.94 8 5.22 6.28a.75.75 0 0 1 1.06-1.06L8 6.94l1.72-1.72a.75.75 0 1 1 1.06 1.06L9.06 8l1.72 1.72a.75.75 0 0 1 0 1.06Z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            )}
          </div>
          <div className="flex items-center gap-0 rounded-md border border-lol-border/60 bg-lol-card/40 p-0.5">
            <button
              type="button"
              onClick={() => setView("friends")}
              className={`h-8 rounded px-3 text-xs font-semibold tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-deep)] ${
                view === "friends"
                  ? "bg-lol-gold/20 text-lol-gold"
                  : "text-lol-text hover:text-lol-text-bright"
              }`}
            >
              FRIENDS
            </button>
            <button
              type="button"
              onClick={() => setView("enemies")}
              className={`h-8 rounded px-3 text-xs font-semibold tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-deep)] ${
                view === "enemies"
                  ? "bg-lol-gold/20 text-lol-gold"
                  : "text-lol-text hover:text-lol-text-bright"
              }`}
            >
              FOES
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03] overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-lol-border/40">
            <tr>
              <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-lol-text w-12">
                #
              </th>
              <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-lol-text">
                Player
              </th>
              <SortHeader label="Games" field="games" />
              <SortHeader label="Win Rate" field="winRate" />
              <SortHeader label="Their KDA" field="kda" />
              <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-lol-text">
                Top Champions
              </th>
              <SortHeader label="Last Played" field="lastPlayed" />
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, visibleCount).map((t, i) => {
              const avgKills = t.games > 0 ? t.kills / t.games : 0;
              const avgDeaths = t.games > 0 ? t.deaths / t.games : 0;
              const avgAssists = t.games > 0 ? t.assists / t.games : 0;
              const ratio =
                avgDeaths > 0 ? (avgKills + avgAssists) / avgDeaths : avgKills + avgAssists;
              const ratioStr = kdaRatio(t.kills, t.deaths, t.assists);

              return (
                <tr
                  key={t.key}
                  onClick={() =>
                    navigate(
                      activeScope && activeSection
                        ? `/history/${activeScope}/${activeSection}/${encodeURIComponent(t.key)}`
                        : `/friends/${encodeURIComponent(t.key)}`,
                    )
                  }
                  className="cv-row group border-b border-lol-border/20 transition-colors hover:bg-white/[0.03] cursor-pointer"
                >
                  <td className="px-3 py-2 text-right text-xs text-lol-text tabular-nums">
                    {i + 1}
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-3 text-sm font-bold text-lol-text-bright">
                      <SummonerIcon iconId={t.profileIcon} size={28} />
                      {t.name}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-lol-text tabular-nums">
                    {t.games}
                  </td>
                  <td className="min-w-0 px-3 py-2">
                    <WinRateBar wins={t.wins} total={t.games} />
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-lol-text tabular-nums">
                    <div className="flex flex-col">
                      <span className={`text-sm ${kdaColor(ratio)}`}>{ratioStr}</span>
                      <span className="text-[10px] text-lol-text">
                        {avgKills.toFixed(1)} / {avgDeaths.toFixed(1)} / {avgAssists.toFixed(1)}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      {t.champions.slice(0, 3).map((c) => (
                        <div key={c.champion_id} className="relative group">
                          <LazyChampionIcon championId={c.champion_id} size={24} />
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-lol-dark border border-lol-border rounded px-2 py-1 text-[10px] text-lol-text-bright whitespace-nowrap z-10">
                            {getChampionName(champData, c.champion_id)} ({c.games})
                          </div>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-lol-text tabular-nums">
                    {formatTimeAgo(t.lastPlayed)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visibleCount < sorted.length && (
          <div className="flex justify-center border-t border-lol-border/20 py-4">
            <button
              type="button"
              onClick={() => setVisibleCount((v) => v + BATCH_SIZE)}
              className="inline-flex h-9 items-center rounded-md border border-lol-gold/30 bg-lol-gold/10 px-4 text-xs font-semibold tracking-wider text-lol-gold transition-colors hover:bg-lol-gold/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-deep)]"
            >
              Load {Math.min(BATCH_SIZE, sorted.length - visibleCount)} more · {visibleCount} of{" "}
              {sorted.length}
            </button>
          </div>
        )}
        {sorted.length === 0 && (
          <div className="rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03] p-12 text-center">
            <p className="text-sm text-lol-text">
              {view === "enemies" ? "No foes yet" : "No friends yet"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
