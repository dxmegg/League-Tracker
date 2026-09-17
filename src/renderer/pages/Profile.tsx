import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { MatchDetail, MatchListItem, ProfileData, ProfileRankedEntry } from "../lib/types";
import { GameRow } from "./MatchHistory";
import { getChampionName, useChampionData } from "../hooks/useChampions";
import type { ChampionData, ProfileMasteryChampion, ProfileRecentGame } from "../../shared/api";
import ChampionIcon from "../components/ChampionIcon";
import { shortRegion } from "../../shared/regions";
import { ARENA_QUEUE_IDS, isAugmentQueue, QUEUE_LABELS } from "../../shared/queues";
import { kdaRatio } from "../lib/format";
import { CHAMPION_ICON_URL } from "../lib/constants";
import { dbg } from "../../shared/debug";

const EMBLEM_BASE_URL = "https://opgg-static.akamaized.net/images/medals_new";

function getPercentColor(percent: number): string {
  return percent >= 54.5
    ? "text-emerald-400"
    : percent >= 47.5
      ? "text-yellow-400"
      : percent >= 37.5
        ? "text-orange-400"
        : "text-red-400";
}

function RankCard({
  title,
  entry,
  recentGames,
  championData,
}: {
  title: string;
  entry: ProfileRankedEntry | null;
  recentGames?: ProfileRecentGame[] | null;
  championData: ChampionData;
}) {
  return (
    <div className="relative rounded-xl border border-lol-border/70 bg-lol-card/60 p-5 pl-6 overflow-visible">
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#5865a8]" />
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-semibold text-lol-text-bright">{title}</h2>
        <button
          type="button"
          aria-label={`${title} options`}
          className="text-lol-text hover:text-lol-text-bright transition-colors"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            ⌄
          </span>
        </button>
      </div>
      {entry ? (
        <div className="grid grid-cols-[64px_1fr] items-center gap-4">
          <img
            src={`${EMBLEM_BASE_URL}/${entry.tier.toLowerCase()}.png`}
            alt={`${entry.tier} ranked emblem`}
            className="h-16 w-16 object-contain"
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
          <div>
            <p className="text-sm font-semibold text-lol-text-bright">
              {entry.tier} {entry.rank}
            </p>
            <p className="text-xs text-lol-gold mt-1">{entry.leaguePoints} LP</p>
          </div>
          <div className="col-span-2">
            {recentGames && <RecentGamesStrip games={recentGames} championData={championData} />}
            {(() => {
              const games = entry.wins + entry.losses;
              const percent = games > 0 ? Math.round((entry.wins / games) * 1000) / 10 : 0;
              return (
                <>
                  <div className="mt-2 flex h-1.5 overflow-hidden bg-red-400/30">
                    <div
                      className="h-full bg-emerald-400 transition-all duration-300 ease-out"
                      style={{ width: `${games > 0 ? (entry.wins / games) * 100 : 0}%` }}
                    />
                    <div
                      className="h-full bg-red-400/60 transition-all duration-300 ease-out"
                      style={{ width: `${games > 0 ? (entry.losses / games) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="mt-auto flex justify-between pt-2 text-xs">
                    <span className="text-emerald-400">{entry.wins}W</span>
                    <span className={getPercentColor(percent)}>{percent.toFixed(1)}% WR</span>
                    <span className="text-red-400">{entry.losses}L</span>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : (
        <p className="text-sm text-lol-text">Unranked</p>
      )}
    </div>
  );
}

type MostPlayedQueue = {
  queue_id: number;
  games: number;
  wins: number;
  isArenaGroup: boolean;
};

type MatchTotals = {
  games: number;
  wins: number;
};

type RecentGame = ProfileRecentGame;

function deriveFromRiotMatches(matches: MatchListItem[]): {
  mostPlayed: MostPlayedQueue | null;
  totals: MatchTotals;
  recentGames: ProfileRecentGame[];
  recentAllGames: ProfileRecentGame[];
} {
  if (matches.length === 0) {
    return {
      mostPlayed: null,
      totals: { games: 0, wins: 0 },
      recentGames: [],
      recentAllGames: [],
    };
  }

  const byQueue = new Map<number, { games: number; wins: number }>();
  for (const match of matches) {
    const current = byQueue.get(match.queue_id) ?? { games: 0, wins: 0 };
    current.games += 1;
    if (match.win) current.wins += 1;
    byQueue.set(match.queue_id, current);
  }

  let bestQueue = 0;
  let bestGames = 0;
  let bestWins = 0;
  for (const [queueId, { games, wins }] of byQueue) {
    if (games > bestGames) {
      bestQueue = queueId;
      bestGames = games;
      bestWins = wins;
    }
  }

  const toRecentGame = (match: MatchListItem): ProfileRecentGame => ({
    game_id: match.game_id,
    champion_id: match.champion_id,
    win: match.win ? 1 : 0,
    is_remake: match.is_remake,
    kills: match.kills,
    deaths: match.deaths,
    assists: match.assists,
    cs: Number.isFinite(match.cs) ? (match.cs ?? 0) : 0,
    game_duration: match.game_duration,
    score: match.score,
    team_position: match.team_position,
    queue_id: match.queue_id,
  });

  const allRecent = matches.map(toRecentGame);
  const isArenaGroup = ARENA_QUEUE_IDS.includes(bestQueue);
  const bestQueueSet = isArenaGroup ? new Set(ARENA_QUEUE_IDS) : new Set([bestQueue]);
  const recentGames = allRecent.filter((game) => bestQueueSet.has(game.queue_id)).slice(0, 5);

  return {
    mostPlayed: {
      queue_id: bestQueue,
      games: bestGames,
      wins: bestWins,
      isArenaGroup,
    },
    totals: {
      games: matches.length,
      wins: matches.filter((match) => match.win).length,
    },
    recentGames,
    recentAllGames: allRecent.slice(0, 5),
  };
}

// TODO: remove when /local migrates (Phase 14)
// oxlint-disable-next-line
function recomputeBoxesFromMatches(matches: MatchListItem[]): {
  mostPlayed: MostPlayedQueue | null;
  totals: MatchTotals;
  recentGames: ProfileRecentGame[];
  recentAllGames: ProfileRecentGame[];
} {
  return deriveFromRiotMatches(matches);
}

const TEAM_POSITION_LABELS: Record<string, string> = {
  TOP: "Top",
  JUNGLE: "Jungle",
  MIDDLE: "Mid",
  BOTTOM: "Bottom",
  UTILITY: "Support",
};
const NO_LANE_QUEUES = new Set([
  // ARAM
  65, 67, 100, 450,
  // Co-op vs AI
  31, 32, 33, 52, 83, 880,
  // Arena
  1700, 1740, 1750,
  // Tutorials
  2000, 2010, 2020,
  // ARAM Mayhem and Mayhem Classic
  2400, 2450,
  // Training Tool
  3140,
]);
function RecentGamesStrip({
  games,
  championData,
}: {
  games: RecentGame[] | null;
  championData: ChampionData;
}) {
  if (!games || games.length === 0) return null;

  return (
    <p className="mt-1 whitespace-nowrap text-sm font-semibold text-lol-text-bright">
      {games.map((game, index) => {
        const result = game.is_remake === 1 ? "R" : game.win === 1 ? "W" : "L";
        const color =
          result === "W"
            ? "text-emerald-400"
            : result === "L"
              ? "text-red-400"
              : "text-lol-text/60";
        const champion = championData[game.champion_id];
        const gamesPerMinute =
          game.game_duration > 0 && Number.isFinite(game.cs) && game.cs > 0
            ? (game.cs / (game.game_duration / 60)).toFixed(1)
            : "0.0";
        const fields: ReactNode[] = [];
        if (champion) {
          fields.push(
            <img
              key="champion"
              src={CHAMPION_ICON_URL(game.champion_id)}
              alt={champion.name}
              className="h-5 w-5 rounded"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />,
            <span key="champion-name">{champion.name}</span>,
          );
        }
        fields.push(
          <span key="kda">
            <span className="text-white">{game.kills}</span>-
            <span className="text-red-400">{game.deaths}</span>-
            <span className="text-blue-400">{game.assists}</span>
          </span>,
          <span key="ratio">
            {((game.kills + game.assists) / Math.max(game.deaths, 1)).toFixed(2)} KDA
          </span>,
        );
        if (game.cs !== 0 || !isAugmentQueue(game.queue_id)) {
          fields.push(
            <span key="cs">
              {game.cs} CS ({gamesPerMinute} CS/M)
            </span>,
          );
        }
        if (game.score !== null) {
          fields.push(<span key="score">Score {game.score}</span>);
        }
        if (!NO_LANE_QUEUES.has(game.queue_id)) {
          fields.push(
            <span key="lane">
              Lane{" "}
              {game.team_position == null
                ? "Unknown"
                : (TEAM_POSITION_LABELS[game.team_position] ?? "Unknown")}
            </span>,
          );
        }
        fields.push(
          <span key="queue">{QUEUE_LABELS[game.queue_id] ?? `Queue ${game.queue_id}`}</span>,
        );

        return (
          <span key={`${game.game_id}-${index}`}>
            {index > 0 && "-"}
            <span className="relative group cursor-default">
              <span className={color}>{result}</span>
              <span className="absolute z-50 hidden group-hover:block top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-lol-gold/50 bg-lol-dark px-2 py-1 text-sm font-normal text-lol-text-bright shadow-lg">
                {fields.map((field, fieldIndex) => (
                  <span key={fieldIndex}>
                    {fieldIndex >= (champion ? 2 : 1) && " | "}
                    {field}
                  </span>
                ))}
              </span>
            </span>
          </span>
        );
      })}
    </p>
  );
}

function MatchStatsBox({
  title,
  totals,
  subtitle,
  recentGames,
  championData,
  hideRecentGamesWhenEmpty = false,
}: {
  title: string;
  totals: MatchTotals | null;
  subtitle?: ReactNode;
  recentGames?: ProfileRecentGame[] | null;
  championData: ChampionData;
  hideRecentGamesWhenEmpty?: boolean;
}) {
  if (!totals || totals.games <= 0) {
    return (
      <div className="min-w-[180px] flex flex-1 flex-col rounded-xl border border-lol-border/70 bg-lol-card/50 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-lol-text/70">
          {title}
        </p>
        <p className="mt-1 text-sm font-semibold text-lol-text-bright">
          {subtitle ?? "No games recorded"}
        </p>
        {!hideRecentGamesWhenEmpty && (
          <RecentGamesStrip games={recentGames ?? null} championData={championData} />
        )}
      </div>
    );
  }

  const losses = totals.games - totals.wins;
  const oneDec = Math.round((totals.wins / totals.games) * 1000) / 10;
  const percentColor = getPercentColor(oneDec);

  return (
    <div className="min-w-[180px] flex flex-1 flex-col rounded-xl border border-lol-border/70 bg-lol-card/50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-lol-text/70">{title}</p>
      {subtitle && <p className="mt-1 text-sm font-semibold text-lol-text-bright">{subtitle}</p>}
      <RecentGamesStrip games={recentGames ?? null} championData={championData} />
      <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-red-400/30">
        <div
          className="h-full bg-emerald-400 transition-all duration-300 ease-out"
          style={{ width: `${(totals.wins / totals.games) * 100}%` }}
        />
        <div
          className="h-full bg-red-400/60 transition-all duration-300 ease-out"
          style={{ width: `${(losses / totals.games) * 100}%` }}
        />
      </div>
      <div className="mt-auto flex justify-between pt-2 text-xs">
        <span className="text-emerald-400">{totals.wins}W</span>
        <span className={percentColor}>{oneDec.toFixed(1)}% WR</span>
        <span className="text-red-400">{losses}L</span>
      </div>
    </div>
  );
}

function PipsRow({ matches }: { matches: MatchListItem[] }) {
  const pips = matches.slice(0, 5).slice().reverse();
  return (
    <p className="mt-1 whitespace-nowrap text-sm font-semibold">
      {pips.map((match, index) => (
        <span key={match.game_id}>
          {index > 0 && <span className="text-lol-text/40">-</span>}
          <span className={match.win ? "text-emerald-400" : "text-red-400"}>
            {match.win ? "W" : "L"}
          </span>
        </span>
      ))}
    </p>
  );
}

function LastPlayedChampionsBox({
  matches,
  loading,
  champData,
}: {
  matches: MatchListItem[];
  loading: boolean;
  champData: ChampionData;
}) {
  if (loading) {
    return (
      <div className="min-w-[220px] flex-1 rounded-xl border border-lol-border/70 bg-lol-card/50 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-lol-text/70">
          Last played champions
        </p>
        <p className="mt-1 text-sm font-semibold text-lol-text">Loading…</p>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="min-w-[280px] flex-1 rounded-xl border border-lol-border/70 bg-lol-card/50 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-lol-text/70">
          Last played champions
        </p>
        <p className="mt-1 text-sm font-semibold text-lol-text-bright">No games recorded</p>
      </div>
    );
  }

  const byChampion = new Map<number, MatchListItem[]>();
  for (const match of matches) {
    const list = byChampion.get(match.champion_id) ?? [];
    list.push(match);
    byChampion.set(match.champion_id, list);
  }
  const top5 = [...byChampion.entries()]
    .map(([championId, games]) => ({ championId, games }))
    .sort(
      (left, right) => right.games.length - left.games.length || left.championId - right.championId,
    )
    .slice(0, 5);

  return (
    <div className="min-w-[280px] flex-1 rounded-xl border border-lol-border/70 bg-lol-card/50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-lol-text/70">
        Last played champions
      </p>
      <PipsRow matches={matches} />
      <div className="mt-2 space-y-1">
        {top5.map(({ championId, games }) => {
          const wins = games.filter((game) => game.win).length;
          const losses = games.length - wins;
          const kills = games.reduce((sum, game) => sum + game.kills, 0);
          const deaths = games.reduce((sum, game) => sum + game.deaths, 0);
          const assists = games.reduce((sum, game) => sum + game.assists, 0);
          return (
            <div
              key={championId}
              className="grid grid-cols-[24px_1fr_auto] items-center gap-2 text-xs"
            >
              <span title={getChampionName(champData, championId)}>
                <ChampionIcon championId={championId} size={22} />
              </span>
              <span className="tabular-nums">
                <span className="text-lol-win">{wins}W</span>
                <span className="text-lol-text/40"> - </span>
                <span className="text-lol-loss">{losses}L</span>
              </span>
              <span className="text-lol-text tabular-nums">
                {(kills / games.length).toFixed(1)}/{(deaths / games.length).toFixed(1)}/
                {(assists / games.length).toFixed(1)}
                <span className="text-lol-text/40"> · </span>
                <span className="text-lol-text-bright">{kdaRatio(kills, deaths, assists)} KDA</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LastGamesBox({ matches, loading }: { matches: MatchListItem[]; loading: boolean }) {
  const games = matches.length;
  if (loading) {
    return (
      <div className="min-w-[220px] flex-1 rounded-xl border border-lol-border/70 bg-lol-card/50 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-lol-text/70">
          Last games
        </p>
        <p className="mt-1 text-sm font-semibold text-lol-text">Loading…</p>
      </div>
    );
  }

  if (games === 0) {
    return (
      <div className="min-w-[220px] flex-1 rounded-xl border border-lol-border/70 bg-lol-card/50 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-lol-text/70">
          Last 0 games
        </p>
        <p className="mt-1 text-sm font-semibold text-lol-text-bright">No games recorded</p>
      </div>
    );
  }

  const wins = matches.filter((match) => match.win).length;
  const losses = games - wins;
  const winRate = (wins / games) * 100;
  const kills = matches.reduce((sum, match) => sum + match.kills, 0);
  const deaths = matches.reduce((sum, match) => sum + match.deaths, 0);
  const assists = matches.reduce((sum, match) => sum + match.assists, 0);

  return (
    <div className="min-w-[220px] flex-1 rounded-xl border border-lol-border/70 bg-lol-card/50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-lol-text/70">
        Last {games} games
      </p>
      <PipsRow matches={matches} />
      <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-lol-loss/30">
        <div className="h-full bg-lol-win" style={{ width: `${winRate}%` }} />
      </div>
      <div className="mt-2 grid grid-cols-3 text-xs">
        <span className="text-lol-win">{wins}W</span>
        <span className="text-center text-lol-text">{winRate.toFixed(1)}% WR</span>
        <span className="text-right text-lol-loss">{losses}L</span>
      </div>
      <div className="mt-1 text-xs text-lol-text tabular-nums">
        {(kills / games).toFixed(1)}/{(deaths / games).toFixed(1)}/{(assists / games).toFixed(1)}
        <span className="text-lol-text/40"> · </span>
        <span className="text-lol-text-bright">{kdaRatio(kills, deaths, assists)} KDA</span>
      </div>
    </div>
  );
}

// TODO: remove when /local migrates (Phase 14)
// oxlint-disable-next-line
function MostPlayedMode({
  mostPlayed,
  recentGames,
  championData,
}: {
  mostPlayed: MostPlayedQueue | null;
  recentGames: ProfileRecentGame[] | null;
  championData: ChampionData;
}) {
  const queueName =
    mostPlayed &&
    (mostPlayed.isArenaGroup
      ? "Arena"
      : (QUEUE_LABELS[mostPlayed.queue_id] ?? `Queue ${mostPlayed.queue_id}`));
  const modeSubtitle =
    mostPlayed && queueName ? `${queueName} | ${mostPlayed.games} Games in total` : undefined;
  return (
    <MatchStatsBox
      title="Most played mode"
      totals={mostPlayed}
      subtitle={modeSubtitle}
      recentGames={recentGames}
      championData={championData}
    />
  );
}

function MasteryChampionStrip({
  champions,
  championData,
}: {
  champions: ProfileMasteryChampion[] | null;
  championData: ChampionData;
}) {
  if (!champions || champions.length === 0) return null;

  return (
    <div className="mt-4 flex justify-center gap-1.5">
      {champions.slice(0, 5).map((masteryChampion) => {
        const champ = championData[masteryChampion.championId];
        const champKey = champ?.key ?? champ?.name;
        const iconUrl = `https://ddragon.leagueoflegends.com/cdn/latest/img/champion/${champKey}.png`;
        console.log(
          "[mastery-icon] id:",
          masteryChampion.championId,
          "key:",
          champKey,
          "url:",
          iconUrl,
        );
        return (
          <MasteryChampionIcon
            key={masteryChampion.championId}
            championId={masteryChampion.championId}
            championKey={champKey}
            championName={champ?.name ?? `Champion ${masteryChampion.championId}`}
            championPoints={masteryChampion.championPoints}
            championLevel={masteryChampion.championLevel}
          />
        );
      })}
    </div>
  );
}

function MasteryChampionIcon({
  championId,
  championKey,
  championName,
  championPoints,
  championLevel,
}: {
  championId: number;
  championKey: string | undefined;
  championName: string;
  championPoints: number;
  championLevel: number;
}) {
  const [iconStage, setIconStage] = useState(0);
  const [crestFailed, setCrestFailed] = useState(false);
  const clampedLevel = Math.min(Math.max(championLevel, 1), 10);
  const crestLevel = clampedLevel <= 3 ? 0 : clampedLevel;
  const primaryIconUrl = `https://ddragon.leagueoflegends.com/cdn/latest/img/champion/${championKey ?? championId}.png`;
  const fallbackIconUrl = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${championId}.png`;

  return (
    <div className="relative group cursor-default">
      {iconStage < 2 ? (
        <img
          src={iconStage === 0 ? primaryIconUrl : fallbackIconUrl}
          alt={championName}
          className="h-8 w-8 rounded object-cover"
          onError={() => setIconStage((stage) => stage + 1)}
        />
      ) : (
        <div className="flex h-8 w-8 items-center justify-center rounded bg-lol-dark text-lg text-lol-gold">
          {championName.charAt(0)}
        </div>
      )}
      <div className="absolute z-50 hidden group-hover:flex top-full mt-2 left-1/2 -translate-x-1/2 w-max max-w-none flex-col items-start whitespace-nowrap rounded border border-lol-border/70 bg-lol-dark p-3 text-xs text-lol-text-bright shadow-lg">
        <div className="flex flex-col gap-1">
          <p>{championName}</p>
          <p>{championPoints.toLocaleString("en-US")} pts</p>
        </div>
        <p className="mt-2 flex min-h-7 items-center gap-2">
          {crestFailed ? (
            <span className="text-lol-gold">Level {championLevel}</span>
          ) : (
            <img
              src={`https://raw.communitydragon.org/latest/game/assets/ux/mastery/legendarychampionmastery/masterycrest_level${crestLevel}.png`}
              alt=""
              className="h-7 w-7 object-contain"
              onError={() => setCrestFailed(true)}
            />
          )}
          {!crestFailed && `Level ${championLevel}`}
        </p>
      </div>
    </div>
  );
}

function RecentRiotMatchesSection({
  matches,
  loading,
  error,
  puuids,
  expandedId,
  detail,
  detailLoading,
  availableCount,
  canLoadMore,
  champData,
  refreshing,
  summary,
  onToggle,
  onLoadMore,
  onRefresh,
  onContextMenu,
  onPlayerClick,
}: {
  matches: MatchListItem[] | null;
  loading: boolean;
  error: string | null;
  puuids: string[] | null;
  expandedId: number | null;
  detail: MatchDetail | null;
  detailLoading: boolean;
  availableCount: number;
  canLoadMore: boolean;
  champData: ChampionData;
  refreshing: boolean;
  summary: string | null;
  onToggle: (gameId: number) => void;
  onLoadMore: () => void;
  onRefresh: () => void;
  onContextMenu: (event: React.MouseEvent, match: MatchListItem) => void;
  onPlayerClick: (player: {
    puuid: string | null;
    gameName: string | null;
    tagLine: string | null;
  }) => void;
}) {
  return (
    <section className="rounded-xl border border-lol-border bg-lol-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-lol-text/70">
          Recent Matches
        </h2>
        <span className="text-[11px] text-lol-text">
          {matches?.length ?? 0} loaded
          {availableCount > (matches?.length ?? 0) && ` · up to ${availableCount} fetchable`}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading || refreshing}
          className="h-9 rounded-lg border border-lol-border bg-lol-card px-4 text-sm text-lol-text transition-colors hover:bg-lol-border/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading || refreshing ? "Refreshing…" : "Refresh Match History"}
        </button>
      </div>
      {summary && <p className="mt-1 text-[11px] text-lol-text/60">Last import: {summary}</p>}
      {loading && (!matches || matches.length === 0) && (
        <p className="mt-4 text-sm text-lol-text">Loading…</p>
      )}
      {error && <p className="mt-4 text-sm text-lol-loss">{error}</p>}
      {!loading && !error && matches && matches.length === 0 && (
        <p className="mt-4 text-sm text-lol-text">No recent matches</p>
      )}
      {matches && matches.length > 0 && (
        <div className="mt-3 space-y-1">
          {matches.map((match) => (
            <GameRow
              key={match.game_id}
              match={match}
              champData={champData}
              expanded={expandedId === match.game_id}
              detail={expandedId === match.game_id ? detail : null}
              detailLoading={expandedId === match.game_id && detailLoading}
              puuids={puuids}
              onPlayerClick={onPlayerClick}
              onToggle={() => onToggle(match.game_id)}
              onContextMenu={(event) => onContextMenu(event, match)}
            />
          ))}
          <div className="mt-3">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loading || !canLoadMore}
              className="w-full h-9 rounded-lg border border-lol-border bg-lol-card text-sm text-lol-text transition-colors hover:border-lol-gold/60 hover:text-lol-text-bright disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Loading…" : canLoadMore ? "Load More" : "All matches loaded"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

async function readRecentHistoryFromDb(
  puuid: string,
  count: number,
): Promise<{ matches: MatchListItem[]; total: number }> {
  return window.api.getMatchHistory(count, 0, {
    account: puuid,
    ignoreHiddenQueues: true,
  });
}

export default function Profile() {
  const log = dbg.scope("profile");
  const championData = useChampionData();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [recentMatches, setRecentMatches] = useState<MatchListItem[] | null>(null);
  const [recentMatchesAvailable, setRecentMatchesAvailable] = useState(0);
  // TODO: remove when /local migrates (Phase 14)
  // oxlint-disable-next-line
  const [recentMatchesLoading, setRecentMatchesLoading] = useState(false);
  // TODO: remove when /local migrates (Phase 14)
  // oxlint-disable-next-line
  const [recentMatchesError, setRecentMatchesError] = useState<string | null>(null);
  const [recentExpandedId, setRecentExpandedId] = useState<number | null>(null);
  const [recentDetail, setRecentDetail] = useState<MatchDetail | null>(null);
  const [recentDetailLoading, setRecentDetailLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileIconFailed, setProfileIconFailed] = useState(false);
  const hasAutoLoaded = useRef(false);

  const loadLocalProfile = useCallback(
    () =>
      log.safe("load profile", async () => {
        setLoading(true);
        setError(null);
        setProfile(null);
        try {
          const localProfile = await window.api.getProfile();
          const profilePuuid = localProfile.puuid;
          if (!profilePuuid) {
            setError("No local account data. Connect to the League client or import history.");
            return;
          }

          const localName = localProfile.name ?? "Local account";
          let profileIconId = 0;
          try {
            profileIconId = (await window.api.getCurrentSummonerProfileIcon()) ?? 0;
          } catch (err: unknown) {
            console.warn("Could not read current League client profile icon:", err);
          }
          const localRecentMatches = await readRecentHistoryFromDb(profilePuuid, 20);
          setProfile({
            puuid: profilePuuid,
            gameName: localName,
            tagLine: "",
            platform: localProfile.platform ?? "",
            profileIconId,
            summonerLevel: 0,
            dataDragonVersion: await window.api.getChampionDataVersion(),
            masteryPoints: 0,
            masteryScore: 0,
            topMasteryChampions: null,
            rankedSolo: null,
            rankedFlex: null,
          });
          log.log("profile loaded", { puuid: profile?.puuid, icon: profile?.profileIconId });
          setRecentMatches(localRecentMatches.matches);
          setRecentMatchesAvailable(localRecentMatches.total);
        } catch (err: unknown) {
          console.error("Failed to load local profile:", err);
          setError(err instanceof Error ? err.message : "Could not load local profile");
        } finally {
          setLoading(false);
        }
      }),
    [log],
  );

  const handleToggleRecentMatch = useCallback(
    async (gameId: number) => {
      if (recentExpandedId === gameId) {
        setRecentExpandedId(null);
        setRecentDetail(null);
        return;
      }
      setRecentExpandedId(gameId);
      setRecentDetailLoading(true);
      try {
        setRecentDetail(await window.api.getMatchDetail(gameId));
      } finally {
        setRecentDetailLoading(false);
      }
    },
    [recentExpandedId],
  );

  useEffect(() => {
    if (hasAutoLoaded.current) return;
    hasAutoLoaded.current = true;
    void loadLocalProfile();
  }, [loadLocalProfile]);

  if (error || !profile) {
    return (
      <div className="max-w-6xl space-y-4">
        {loading && <p className="text-sm text-lol-text">Loading…</p>}
        {error && (
          <p className="rounded-lg border border-red-500/60 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </p>
        )}
      </div>
    );
  }

  const version = profile.dataDragonVersion === "none" ? "latest" : profile.dataDragonVersion;
  const profileIconUrl =
    profile.profileIconId > 0
      ? `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${profile.profileIconId}.png`
      : null;
  const profileInitial = profile.gameName.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="max-w-6xl space-y-8">
      <div className="grid grid-cols-[220px_minmax(0,1fr)_256px_auto] items-start gap-8">
        <div>
          <div className="h-[220px] w-[220px] rounded-xl bg-[linear-gradient(138deg,#c89b37_0%,#ffe09b_50%,#c89b37_100%)] p-[5px]">
            {profileIconUrl && !profileIconFailed ? (
              <img
                src={profileIconUrl}
                alt={`${profile.gameName} profile icon`}
                className="h-full w-full rounded-lg object-cover"
                onError={() => setProfileIconFailed(true)}
              />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center rounded-lg bg-lol-dark text-6xl font-semibold text-lol-text-bright"
                aria-label={`${profile.gameName} profile icon placeholder`}
              >
                {profileInitial}
              </div>
            )}
          </div>
          <p className="mt-3 text-sm text-lol-text">Level {profile.summonerLevel}</p>
        </div>

        <div className="min-w-0 pt-0">
          <div>
            <h1
              className="max-w-full break-words text-4xl font-semibold tracking-tight text-lol-text-bright"
              title={profile.tagLine ? `${profile.gameName}#${profile.tagLine}` : profile.gameName}
            >
              {profile.tagLine ? `${profile.gameName}#${profile.tagLine}` : profile.gameName}
            </h1>
            <p className="mt-2 text-sm text-lol-text">Region: {shortRegion(profile.platform)}</p>
            <div className="mt-4 flex flex-wrap items-stretch gap-3">
              <LastPlayedChampionsBox
                matches={recentMatches ?? []}
                loading={loading}
                champData={championData}
              />
              <LastGamesBox matches={recentMatches ?? []} loading={loading} />
            </div>
          </div>
        </div>

        <div className="mt-[84px] w-64 rounded-xl border border-lol-border/70 bg-lol-card/50 px-5 py-4">
          <h2 className="text-center text-sm font-semibold text-lol-text-bright">
            Champion Mastery
          </h2>
          <MasteryChampionStrip
            champions={profile.topMasteryChampions}
            championData={championData}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <RankCard title="Ranked Solo" entry={profile.rankedSolo} championData={championData} />
        <RankCard title="Ranked Flex" entry={profile.rankedFlex} championData={championData} />
      </div>

      <RecentRiotMatchesSection
        matches={recentMatches}
        loading={recentMatchesLoading}
        error={recentMatchesError}
        puuids={null}
        onPlayerClick={() => undefined}
        expandedId={recentExpandedId}
        detail={recentDetail}
        detailLoading={recentDetailLoading}
        availableCount={recentMatchesAvailable}
        canLoadMore={false}
        champData={championData}
        refreshing={false}
        summary={null}
        onToggle={handleToggleRecentMatch}
        onLoadMore={() => undefined}
        onRefresh={() => undefined}
        onContextMenu={() => undefined}
      />
    </div>
  );
}
