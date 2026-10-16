import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useIpc } from "../hooks/useIpc";
import { useChampionData, getChampionName, useItemData } from "../hooks/useChampions";
import type {
  TeammateChampionStats,
  TeammateDetail,
  TeammateMatch,
  MatchDetail,
} from "../lib/types";
import ChampionIcon from "../components/ChampionIcon";
import { EmptyState } from "../components/EmptyState";
import ItemIcon from "../components/ItemIcon";
import { MatchRowExperiment } from "../components/MatchRowExperiment";
import { Panel } from "../components/Panel";
import { queueLabel } from "../components/QueueSelect";
import StatCard from "../components/StatCard";
import SummonerIcon from "../components/SummonerIcon";
import WinRateBar from "../components/WinRateBar";
import { formatNumber, formatTimeAgo, kdaRatio, kdaColor } from "../lib/format";
import { useHistoryScopeQueue } from "../lib/historyScope";
import { isArenaQueue } from "../../shared/queues";

export default function FriendDetail() {
  const { key = "" } = useParams();
  const { section } = useParams<{ section?: string }>();
  const [searchParams] = useSearchParams();
  const enemies = section === "enemies" || searchParams.get("relation") === "enemies";
  const navigate = useNavigate();
  const scope = useParams<{ scope?: string }>().scope;
  const scopedQueue = useHistoryScopeQueue(scope);
  const champData = useChampionData();
  const itemData = useItemData();
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
          <EmptyState variant="roomy" text="No games found with this player." />
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
  const queueBreakdown = Array.from(
    matches
      .reduce(
        (groups, match) => {
          const current = groups.get(match.queue_id) ?? {
            queueId: match.queue_id,
            games: 0,
            wins: 0,
            kills: 0,
            deaths: 0,
            assists: 0,
          };
          current.games += 1;
          current.wins += match.win ? 1 : 0;
          current.kills += match.kills;
          current.deaths += match.deaths;
          current.assists += match.assists;
          groups.set(match.queue_id, current);
          return groups;
        },
        new Map<
          number,
          {
            queueId: number;
            games: number;
            wins: number;
            kills: number;
            deaths: number;
            assists: number;
          }
        >(),
      )
      .values(),
  ).sort((a, b) => b.games - a.games);
  const multikills = matches.reduce(
    (totals, match) => ({
      double: totals.double + match.double_kills,
      triple: totals.triple + match.triple_kills,
      quadra: totals.quadra + match.quadra_kills,
      penta: totals.penta + match.penta_kills,
    }),
    { double: 0, triple: 0, quadra: 0, penta: 0 },
  );
  const totalKills = matches.reduce((sum, match) => sum + match.kills, 0);
  const totalDeaths = matches.reduce((sum, match) => sum + match.deaths, 0);
  const totalAssists = matches.reduce((sum, match) => sum + match.assists, 0);
  const arenaMatches = matches.filter((match) => isArenaQueue(match.queue_id));
  const isArenaOnly = matches.length > 0 && arenaMatches.length === matches.length;
  const csMatches = matches.filter(
    (match) => !isArenaQueue(match.queue_id) && typeof match.cs === "number",
  );
  const csDuration = csMatches.reduce((sum, match) => sum + match.game_duration, 0);
  const visionMatches = matches.filter((match) => match.vision_score != null);
  const avgDamage =
    matches.length > 0
      ? matches.reduce(
          (sum, match) =>
            sum + (enemies ? match.total_damage_dealt : match.friend.total_damage_dealt),
          0,
        ) / matches.length
      : 0;
  const itemCounts = new Map<number, number>();
  for (const match of matches) {
    for (const itemId of [
      match.item0,
      match.item1,
      match.item2,
      match.item3,
      match.item4,
      match.item5,
      match.item6,
    ]) {
      if (itemId && itemId > 0) itemCounts.set(itemId, (itemCounts.get(itemId) ?? 0) + 1);
    }
  }
  const topItems = Array.from(itemCounts.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);

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
          enemies ? "border-l-[var(--theme-gold)]" : "border-l-[var(--theme-crimson)]"
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
      <Panel className="border-t-[3px] border-t-[var(--theme-assist)]">
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
          <EmptyState variant="roomy" text="No champion data available." />
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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div>
          <SectionHeading title="Queue breakdown" source="MATCH-V5" />
          <Panel>
            <div className="space-y-2">
              {queueBreakdown.map((queue) => {
                const relationWins = enemies ? queue.games - queue.wins : queue.wins;
                return (
                  <div
                    key={queue.queueId}
                    className="grid grid-cols-[minmax(0,1fr)_48px_72px_72px] items-center gap-2 border-b border-white/[0.04] py-2 last:border-b-0"
                  >
                    <span className="truncate text-xs font-semibold text-lol-text-bright">
                      {queueLabel(queue.queueId)}
                    </span>
                    <span className="text-right text-xs tabular-nums text-lol-text">
                      {queue.games}
                    </span>
                    <span className="text-right text-xs tabular-nums text-lol-text">
                      {((relationWins / queue.games) * 100).toFixed(1)}%
                    </span>
                    <span className="text-right text-xs tabular-nums text-lol-text">
                      {kdaRatio(queue.kills, queue.deaths, queue.assists)}
                    </span>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>

        <div>
          <SectionHeading title="Multikills" source="MATCH-V5" />
          <Panel>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Double", multikills.double],
                ["Triple", multikills.triple],
                ["Quadra", multikills.quadra],
                ["Penta", multikills.penta],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-lol-border/60 bg-black/10 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-lol-text">
                    {label}
                  </div>
                  <div className="mt-1 text-xl font-bold tabular-nums text-lol-text-bright">
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div>
          <SectionHeading
            title={enemies ? "Avg performance against" : "Avg performance together"}
            source="MATCH-V5"
          />
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Avg KDA"
              value={kdaRatio(totalKills, totalDeaths, totalAssists)}
              subtext={`${(totalKills / matches.length).toFixed(1)} / ${(totalDeaths / matches.length).toFixed(1)} / ${(totalAssists / matches.length).toFixed(1)} per game`}
              accent="gold"
            />
            <StatCard
              label="Avg CS/min"
              value={
                isArenaOnly
                  ? "—"
                  : csMatches.length > 0 && csDuration > 0
                    ? (
                        (csMatches.reduce((sum, match) => sum + (match.cs ?? 0), 0) * 60) /
                        csDuration
                      ).toFixed(1)
                    : "—"
              }
              subtext={
                isArenaOnly
                  ? "Not applicable (Arena)"
                  : csMatches.length > 0
                    ? `${csMatches.length} games with CS data`
                    : "CS data unavailable"
              }
              accent="sky"
            />
            <StatCard
              label="Avg vision"
              value={
                visionMatches.length > 0
                  ? (
                      visionMatches.reduce((sum, match) => sum + (match.vision_score ?? 0), 0) /
                      visionMatches.length
                    ).toFixed(1)
                  : "—"
              }
              subtext={
                visionMatches.length > 0
                  ? `${visionMatches.length} games with vision data`
                  : "No vision data tracked for these games."
              }
              accent="purple"
            />
            <StatCard
              label="Avg damage"
              value={formatNumber(Math.round(avgDamage))}
              subtext="Damage dealt per game"
              accent="win"
            />
          </div>
        </div>

        {topItems.length > 0 && (
          <div>
            <SectionHeading title="Top items built" source="MATCH-V5" />
            <Panel>
              <div className="space-y-2">
                {topItems.map(([itemId, picks]) => (
                  <div
                    key={itemId}
                    className="flex items-center gap-3 border-b border-white/[0.04] py-2 last:border-b-0"
                  >
                    <ItemIcon itemId={itemId} size={28} />
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-lol-text-bright">
                      {itemData[itemId]?.name ?? `Item ${itemId}`}
                    </span>
                    <span className="text-xs tabular-nums text-lol-text">{picks}x</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        )}
      </div>
      <SectionHeading title={enemies ? "Match history against them" : "Match history together"} />
      <Panel className="border-t-[3px] border-t-[var(--theme-win)]">
        {matches.length > 0 ? (
          <div className="space-y-1">
            {matches.map((m) => (
              <MatchRowExperiment
                key={m.game_id}
                match={m}
                championName={getChampionName(champData, m.champion_id)}
                secondaryParticipant={{
                  championId: m.friend.champion_id,
                  championName: getChampionName(champData, m.friend.champion_id),
                }}
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
          <EmptyState variant="roomy" text="No shared matches found." />
        )}
      </Panel>
    </div>
  );
}

function SectionHeading({
  title,
  aside,
  source,
}: {
  title: string;
  aside?: string;
  source?: string;
}) {
  return (
    <div className="relative flex items-center gap-3 pb-2 pt-1 text-sm font-semibold uppercase tracking-wider text-lol-text-bright after:absolute after:bottom-0 after:left-0 after:h-px after:w-2/5 after:bg-gradient-to-r after:from-[var(--theme-crimson)]/50 after:to-transparent">
      <span className="h-2 w-2 rotate-45 bg-[var(--theme-crimson)]" />
      <span>{title}</span>
      {source && (
        <span className="rounded border border-lol-border/60 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-lol-text">
          {source}
        </span>
      )}
      {aside && (
        <span className="ml-auto text-[10px] font-normal tracking-normal text-lol-text">
          {aside}
        </span>
      )}
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
        className="rounded-md border-l-2 border-l-[var(--theme-crimson)] shadow-[0_0_10px_color-mix(in_oklab,var(--theme-crimson)_12%,transparent)]"
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
