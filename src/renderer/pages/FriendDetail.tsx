import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useIpc } from "../hooks/useIpc";
import { useChampionData, getChampionName } from "../hooks/useChampions";
import type {
  TeammateChampionStats,
  TeammateDetail,
  TeammateMatch,
  MatchDetail,
} from "../lib/types";
import ChampionIcon from "../components/ChampionIcon";
import { MatchRowExperiment } from "../components/MatchRowExperiment";
import { Panel } from "../components/Panel";
import StatCard from "../components/StatCard";
import SummonerIcon from "../components/SummonerIcon";
import WinRateBar from "../components/WinRateBar";
import { formatTimeAgo, kdaRatio, kdaColor } from "../lib/format";
import { useHistoryScopeQueue } from "../lib/historyScope";

export default function FriendDetail() {
  const { key = "" } = useParams();
  const { section } = useParams<{ section?: string }>();
  const [searchParams] = useSearchParams();
  const enemies = section === "enemies" || searchParams.get("relation") === "enemies";
  const navigate = useNavigate();
  const scope = useParams<{ scope?: string }>().scope;
  const scopedQueue = useHistoryScopeQueue(scope);
  const champData = useChampionData();
  const { data, loading, refetch } = useIpc<TeammateDetail | null>(
    () => window.api.getTeammateDetail(key, scopedQueue, enemies ? "enemies" : "friends"),
    [key, scopedQueue, enemies],
  );
  const [puuids, setPuuids] = useState<string[] | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [switchMessage, setSwitchMessage] = useState<string | null>(null);
  const [championSort, setChampionSort] = useState<"games" | "winRate" | "kda">("games");
  const [showAllChampions, setShowAllChampions] = useState(false);

  const switchRelation = useCallback(
    async (target: "friends" | "enemies") => {
      if ((enemies && target === "enemies") || (!enemies && target === "friends")) return;
      const result = await window.api.getTeammateDetail(key, scopedQueue, target);
      if (!result) {
        setSwitchMessage("This player has no games in the other relation.");
        window.setTimeout(() => setSwitchMessage(null), 2200);
        return;
      }
      navigate(
        scope
          ? `/history/${scope}/${target}/${encodeURIComponent(key)}`
          : target === "enemies"
            ? `/friends/${encodeURIComponent(key)}?relation=enemies`
            : `/friends/${encodeURIComponent(key)}`,
      );
    },
    [enemies, key, navigate, scope, scopedQueue],
  );

  useEffect(() => {
    window.api.getAllSummonerPuuids().then(setPuuids);
  }, []);

  useEffect(() => {
    const unsub = window.api.onGamesUpdated(() => refetch());
    return unsub;
  }, [refetch]);

  const toggleExpand = useCallback(
    async (gameId: number) => {
      if (expandedId === gameId) {
        setExpandedId(null);
        setDetail(null);
        return;
      }
      setExpandedId(gameId);
      setDetailLoading(true);
      try {
        setDetail(await window.api.getMatchDetail(gameId));
      } finally {
        setDetailLoading(false);
      }
    },
    [expandedId],
  );

  if (loading) {
    return <div className="text-lol-text text-center mt-20">Loading...</div>;
  }

  if (!data) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={scope ? `/history/${scope}/${enemies ? "enemies" : "friends"}` : "/friends"}
            className="rounded-lg border border-lol-border bg-lol-card px-3 py-1.5 text-sm font-medium text-lol-text-bright transition-colors hover:border-lol-crimson"
          >
            ← {enemies ? "Enemies" : "Friends"}
          </Link>
          <RelationChips enemies={enemies} onSelect={switchRelation} />
          {switchMessage && (
            <span className="rounded-lg border border-lol-gold/30 bg-lol-gold/10 px-3 py-1.5 text-xs text-lol-gold">
              {switchMessage}
            </span>
          )}
        </div>
        <Panel>
          <EmptyState text="No games found with this player." />
        </Panel>
      </div>
    );
  }

  const { player, matches } = data;
  const displayWins = enemies ? player.games - player.wins : player.wins;
  const displayLosses = enemies ? player.wins : player.games - player.wins;
  const avg = (total: number) => (player.games > 0 ? (total / player.games).toFixed(1) : "0.0");
  const ratio =
    player.deaths > 0
      ? (player.kills + player.assists) / player.deaths
      : player.kills + player.assists;
  // Their score is computed per game rather than stored, so average what we have
  const selectedStats = (m: TeammateMatch) => (enemies ? m.score : m.friend.score);
  const selectedBadge = (m: TeammateMatch) => (enemies ? m.score_badge : m.friend.score_badge);
  const scored = matches.filter((m) => selectedStats(m) != null);
  const avgScore = scored.length
    ? scored.reduce((sum, m) => sum + (selectedStats(m) ?? 0), 0) / scored.length
    : null;
  const mvps = matches.filter((m) => selectedBadge(m) === "MVP").length;
  const aces = matches.filter((m) => selectedBadge(m) === "ACE").length;
  const displayWinRate = player.games > 0 ? (displayWins / player.games) * 100 : 0;
  const sortedChampions = [...player.champions].sort((a, b) => {
    if (championSort === "winRate") {
      const aWins = enemies ? a.games - a.wins : a.wins;
      const bWins = enemies ? b.games - b.wins : b.wins;
      return bWins / Math.max(b.games, 1) - aWins / Math.max(a.games, 1);
    }
    if (championSort === "kda") {
      const aKda = a.deaths > 0 ? (a.kills + a.assists) / a.deaths : a.kills + a.assists;
      const bKda = b.deaths > 0 ? (b.kills + b.assists) / b.deaths : b.kills + b.assists;
      return bKda - aKda;
    }
    return b.games - a.games;
  });
  const visibleChampions = showAllChampions ? sortedChampions : sortedChampions.slice(0, 20);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={scope ? `/history/${scope}/${enemies ? "enemies" : "friends"}` : "/friends"}
          className="rounded-lg border border-lol-border bg-lol-card px-3 py-1.5 text-sm font-medium text-lol-text-bright transition-colors hover:border-lol-crimson"
        >
          ← {enemies ? "Enemies" : "Friends"}
        </Link>
        <RelationChips enemies={enemies} onSelect={switchRelation} />
        {switchMessage && (
          <span className="rounded-lg border border-lol-gold/30 bg-lol-gold/10 px-3 py-1.5 text-xs text-lol-gold">
            {switchMessage}
          </span>
        )}
      </div>

      <Panel
        className={`border-l-2 ${
          enemies ? "border-l-[#C9A45C]" : "border-l-[#E5483F]"
        } bg-[radial-gradient(circle_at_top_right,rgba(229,72,63,0.18),transparent_60%),linear-gradient(to_bottom,rgba(229,72,63,0.10),transparent_40%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]`}
      >
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex min-w-0 items-center gap-4">
            <SummonerIcon iconId={player.profileIcon} size={80} />
            <div className="min-w-0">
              <h1 className="font-display truncate text-[28px] font-bold leading-tight text-lol-text-bright">
                {player.name}
              </h1>
              <p className="mt-1 text-lol-text">
                {player.games} {enemies ? "games against" : "games together"} · last played{" "}
                {formatTimeAgo(player.lastPlayed)}
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-lol-border bg-lol-card/70 px-4 py-3 text-right">
            <div className="text-[10px] font-bold uppercase tracking-wider text-lol-text">
              Record
            </div>
            <div className="mt-1 text-xl font-bold text-lol-text-bright">
              {displayWins}W <span className="text-lol-text/60">{displayLosses}L</span>
            </div>
            <div className="text-xs text-lol-text">{displayWinRate.toFixed(1)}% win rate</div>
          </div>
        </div>
      </Panel>

      <SectionHeading title="Key metrics" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Record"
          value={`${displayWins}W / ${displayLosses}L`}
          subtext={`${displayWinRate.toFixed(1)}% win rate`}
          accent="win"
        />
        <StatCard
          label="Their KDA"
          value={
            <span className={kdaColor(ratio)}>
              {kdaRatio(player.kills, player.deaths, player.assists)}
            </span>
          }
          subtext={`${avg(player.kills)} / ${avg(player.deaths)} / ${avg(player.assists)} per game`}
          accent="gold"
        />
        <StatCard
          label="Avg score"
          value={avgScore != null ? avgScore.toFixed(1) : "—"}
          subtext={`${mvps} MVP · ${aces} ACE`}
          accent="sky"
        />
        <StatCard
          label={enemies ? "Games against" : "Games together"}
          value={player.games}
          subtext={enemies ? "Shared match history" : "Shared team history"}
          accent="purple"
        />
        <StatCard
          label="Last played"
          value={formatTimeAgo(player.lastPlayed)}
          subtext="Most recent shared game"
          accent="sky"
        />
        {enemies && (
          <StatCard
            label="Your win rate"
            value={`${displayWinRate.toFixed(1)}%`}
            subtext={`${displayWins} wins in ${matches.length} games`}
            accent="win"
          />
        )}
      </div>

      <SectionHeading title="Their champions" aside={`${player.champions.length} champions`} />
      <Panel className="border-t-[3px] border-t-[#3B82F6]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-lol-text">
            Showing {visibleChampions.length} of {player.champions.length}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["games", "winRate", "kda"] as const).map((sort) => (
              <button
                key={sort}
                type="button"
                onClick={() => setChampionSort(sort)}
                className={`rounded-md border px-2.5 py-1 text-[11px] transition-colors ${
                  championSort === sort
                    ? "border-lol-gold/60 bg-lol-gold/10 text-lol-gold"
                    : "border-lol-border bg-lol-card text-lol-text hover:text-lol-text-bright"
                }`}
              >
                {sort === "winRate" ? "Win rate" : sort === "kda" ? "KDA" : "Games"}
              </button>
            ))}
          </div>
        </div>
        {visibleChampions.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2">
            {visibleChampions.map((c) => (
              <ChampionRow
                key={c.champion_id}
                champ={c}
                champData={champData}
                invertWinRate={enemies}
              />
            ))}
          </div>
        ) : (
          <EmptyState text="No champion data available." />
        )}
        {player.champions.length > 20 && (
          <button
            type="button"
            onClick={() => setShowAllChampions((value) => !value)}
            className="mt-4 rounded-md border border-lol-border bg-lol-card px-3 py-1.5 text-xs text-lol-text transition-colors hover:border-lol-gold/60 hover:text-lol-gold"
          >
            {showAllChampions ? "Show top 20" : `Show all ${player.champions.length}`}
          </button>
        )}
      </Panel>

      <SectionHeading title="Detailed statistics" />
      <SectionHeading title={enemies ? "Match history against them" : "Match history together"} />
      <Panel className="border-t-[3px] border-t-[#22C55E]">
        {matches.length > 0 ? (
          <div className="space-y-1">
            {matches.map((m) => (
              <MatchRowExperiment
                key={m.game_id}
                match={m}
                championName={getChampionName(champData, m.champion_id)}
                champData={champData}
                expanded={expandedId === m.game_id}
                detail={expandedId === m.game_id ? detail : null}
                detailLoading={expandedId === m.game_id && detailLoading}
                puuids={puuids}
                onToggle={() => toggleExpand(m.game_id)}
                onPlayerClick={(clickedPlayer) => {
                  if (!clickedPlayer.puuid) return;
                  const encodedPuuid = encodeURIComponent(clickedPlayer.puuid);
                  navigate(
                    scope
                      ? `/history/${scope}/${enemies ? "enemies" : "friends"}/${encodedPuuid}`
                      : `/friends/${encodedPuuid}${enemies ? "?relation=enemies" : ""}`,
                  );
                }}
              />
            ))}
          </div>
        ) : (
          <EmptyState text="No shared matches found." />
        )}
      </Panel>
    </div>
  );
}

function SectionHeading({ title, aside }: { title: string; aside?: string }) {
  return (
    <div className="relative flex items-center gap-3 pb-2 pt-1 text-sm font-semibold uppercase tracking-wider text-lol-text-bright after:absolute after:bottom-0 after:left-0 after:h-px after:w-2/5 after:bg-gradient-to-r after:from-[#E5483F]/50 after:to-transparent">
      <span className="h-2 w-2 rotate-45 bg-[#E5483F]" />
      <span>{title}</span>
      {aside && (
        <span className="ml-auto text-[10px] font-normal tracking-normal text-lol-text">
          {aside}
        </span>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-white/[0.08] bg-white/[0.02] px-4 py-6 text-center text-sm text-lol-text/70">
      {text}
    </div>
  );
}

function RelationChips({
  enemies,
  onSelect,
}: {
  enemies: boolean;
  onSelect: (relation: "friends" | "enemies") => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-lol-border bg-lol-card p-1">
      {(["friends", "enemies"] as const).map((relation) => {
        const active = relation === (enemies ? "enemies" : "friends");
        return (
          <button
            key={relation}
            type="button"
            onClick={() => onSelect(relation)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-bold tracking-wider transition-colors ${
              active
                ? relation === "enemies"
                  ? "bg-lol-gold/15 text-lol-gold"
                  : "bg-lol-crimson/15 text-lol-crimson"
                : "text-lol-text hover:text-lol-text-bright"
            }`}
          >
            {relation === "friends" ? "FRIENDS" : "FOES"}
          </button>
        );
      })}
    </div>
  );
}

function ChampionRow({
  champ,
  champData,
  invertWinRate = false,
}: {
  champ: TeammateChampionStats;
  champData: any;
  invertWinRate?: boolean;
}) {
  const ratio =
    champ.deaths > 0 ? (champ.kills + champ.assists) / champ.deaths : champ.kills + champ.assists;
  const wins = invertWinRate ? champ.games - champ.wins : champ.wins;

  return (
    <div className="flex items-center gap-2 border-b border-white/[0.04] px-3 py-2 transition-colors duration-[120ms] hover:bg-white/[0.03]">
      <ChampionIcon
        championId={champ.champion_id}
        size={26}
        className="rounded-md border-l-2 border-l-[#E5483F] shadow-[0_0_10px_rgba(229,72,63,0.12)]"
      />
      <div className="min-w-0 flex-1">
        <div className="text-xs text-lol-text-bright truncate">
          {getChampionName(champData, champ.champion_id)}
        </div>
        <div className="text-[10px] text-lol-text">
          {champ.games} {champ.games === 1 ? "game" : "games"} ·{" "}
          <span className={kdaColor(ratio)}>
            {kdaRatio(champ.kills, champ.deaths, champ.assists)} KDA
          </span>
        </div>
      </div>
      <div className="w-28 shrink-0">
        <WinRateBar wins={wins} total={champ.games} />
      </div>
    </div>
  );
}
