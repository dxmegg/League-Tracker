import { FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { ProfileData, ProfileRankedEntry } from "../lib/types";
import { useChampionData } from "../hooks/useChampions";
import type {
  ChampionData,
  DashboardData,
  ProfileMasteryChampion,
  ProfileRecentGame,
  RecentRiotMatch,
} from "../../shared/api";
import { MasteryCrestIcon, MasteryPointsIcon } from "../components/ProfileIcons";
import { shortRegion, PLATFORM_TO_NAME } from "../../shared/regions";
import { ARENA_QUEUE_IDS, isAugmentQueue, QUEUE_LABELS } from "../../shared/queues";
import { kdaRatio } from "../lib/format";
import { CHAMPION_ICON_URL } from "../lib/constants";

const EMBLEM_BASE_URL = "https://opgg-static.akamaized.net/images/medals_new";
const LAST_LOOKUP_KEY = "profile:lastLookup";
const RECENTS_KEY = "profile:recents";
const FAVORITES_KEY = "profile:favorites";
const MAX_PROFILE_FAVORITES = 10;

type ProfileLink = {
  label: string;
  url: string;
};

function buildProfileLinks(profile: ProfileData): ProfileLink[] {
  const region = shortRegion(profile.platform).toLowerCase();
  const platform = profile.platform.toLowerCase();
  const gameName = encodeURIComponent(profile.gameName.toLowerCase());
  const tagLine = encodeURIComponent(profile.tagLine.toLowerCase());
  const riotId = `${gameName}-${tagLine}`;

  return [
    {
      label: "op.gg",
      url: `https://op.gg/pl/lol/summoners/${region}/${riotId}`,
    },
    {
      label: "League of Graphs",
      url: `https://www.leagueofgraphs.com/summoner/${region}/${riotId}`,
    },
    {
      label: "u.gg",
      url: `https://u.gg/lol/profile/${platform}/${riotId}/overview`,
    },
    {
      label: "Mobalytics",
      url: `https://mobalytics.gg/lol/profile/${region}/${riotId}/overview`,
    },
    {
      label: "MasteryChart",
      url: `https://masterychart.com/profile/${region}/${riotId}`,
    },
    {
      label: "Darkintaqt",
      url: `https://challenges.darkintaqt.com/${region}/${riotId}`,
    },
    {
      label: "ArenaSweats",
      url: "https://arenasweats.lol",
    },
  ];
}

type ProfileLookup = {
  gameName: string;
  tagLine: string;
  platform: string;
};

function isProfileLookup(value: unknown): value is ProfileLookup {
  if (typeof value !== "object" || value === null) return false;
  const lookup = value as Partial<ProfileLookup>;
  return (
    typeof lookup.gameName === "string" &&
    lookup.gameName.length > 0 &&
    typeof lookup.tagLine === "string" &&
    lookup.tagLine.length > 0 &&
    typeof lookup.platform === "string" &&
    lookup.platform.length > 0
  );
}

function readRecentProfiles(): ProfileLookup[] {
  try {
    const stored = window.localStorage.getItem(RECENTS_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isProfileLookup).slice(0, 5) : [];
  } catch {
    return [];
  }
}

function readFavoriteProfiles(): ProfileLookup[] {
  try {
    const stored = window.localStorage.getItem(FAVORITES_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isProfileLookup).slice(0, MAX_PROFILE_FAVORITES) : [];
  } catch {
    return [];
  }
}

function profilesMatch(left: ProfileLookup, right: ProfileLookup): boolean {
  return [left.gameName, left.tagLine, left.platform].every(
    (value, index) => value.toLowerCase() === [right.gameName, right.tagLine, right.platform][index].toLowerCase(),
  );
}

function readLastLookup(): ProfileLookup | null {
  try {
    const stored = window.localStorage.getItem(LAST_LOOKUP_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    return isProfileLookup(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const PROFILE_TIMEOUT_MS = 45_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error("Request timed out — Riot API did not respond")),
        ms,
      ),
    ),
  ]);
}

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
            {recentGames && (
              <RecentGamesStrip games={recentGames} championData={championData} />
            )}
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

function deriveFromRiotMatches(matches: RecentRiotMatch[]): {
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
    const current = byQueue.get(match.queueId) ?? { games: 0, wins: 0 };
    current.games += 1;
    if (match.win) current.wins += 1;
    byQueue.set(match.queueId, current);
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

  const toRecentGame = (match: RecentRiotMatch): ProfileRecentGame => ({
    game_id: match.gameId,
    champion_id: match.championId,
    win: match.win ? 1 : 0,
    is_remake: 0,
    kills: match.kills,
    deaths: match.deaths,
    assists: match.assists,
    cs: Number.isFinite(match.cs) ? match.cs : 0,
    game_duration: match.gameDuration,
    score: null,
    team_position: match.teamPosition,
    queue_id: match.queueId,
  });

  const allRecent = matches.map(toRecentGame);
  const isArenaGroup = ARENA_QUEUE_IDS.includes(bestQueue);
  const bestQueueSet = isArenaGroup
    ? new Set(ARENA_QUEUE_IDS)
    : new Set([bestQueue]);
  const recentGames = allRecent
    .filter((game) => bestQueueSet.has(game.queue_id))
    .slice(0, 5);

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
const RIOT_TEAM_POSITION_LABELS: Record<string, string> = {
  TOP: "Top",
  JUNGLE: "Jungle",
  MIDDLE: "Mid",
  BOTTOM: "Bottom",
  UTILITY: "Support",
};

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
                : TEAM_POSITION_LABELS[game.team_position] ?? "Unknown"}
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
  const percentColor =
    getPercentColor(oneDec);

  return (
    <div className="min-w-[180px] flex flex-1 flex-col rounded-xl border border-lol-border/70 bg-lol-card/50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-lol-text/70">
        {title}
      </p>
      {subtitle && (
        <p className="mt-1 text-sm font-semibold text-lol-text-bright">{subtitle}</p>
      )}
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
  championData,
  version,
  puuid,
  onRefresh,
  onLoadMore,
  loadingMoreMatches,
}: {
  matches: RecentRiotMatch[] | null;
  loading: boolean;
  error: string | null;
  championData: ChampionData;
  version: string;
  puuid: string | null;
  onRefresh: () => void;
  onLoadMore: () => void;
  loadingMoreMatches: boolean;
}) {
  return (
    <section className="rounded-xl border border-lol-border bg-lol-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-lol-text/70">
          Recent Matches (Riot API)
        </h2>
        <button
          type="button"
          onClick={onRefresh}
          disabled={!puuid || loading}
          className="h-9 rounded-lg border border-lol-border bg-lol-card px-4 text-sm text-lol-text transition-colors hover:bg-lol-border/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh Match History"}
        </button>
      </div>
      {loading ? (
        <p className="mt-4 text-sm text-lol-text">Loading…</p>
      ) : error ? (
        <p className="mt-4 text-sm text-lol-loss">{error}</p>
      ) : matches === null ? (
        <p className="mt-4 text-sm text-lol-text">
          Click Load Profile to fetch recent matches
        </p>
      ) : matches.length === 0 ? (
        <p className="mt-4 text-sm text-lol-text">No recent matches</p>
      ) : (
        <>
          <div className="mt-4 space-y-2">
            {matches.map((match) => {
              const champion = championData[match.championId];
              return (
                <div
                  key={match.gameId}
                  className="flex items-center gap-4 rounded-lg border border-lol-border/30 px-3 py-2"
                >
                  <span
                    className={`w-5 shrink-0 text-center text-xs font-bold ${
                      match.win ? "text-lol-win" : "text-lol-loss"
                    }`}
                  >
                    {match.win ? "W" : "L"}
                  </span>
                  {champion ? (
                    <img
                      src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champion.key}.png`}
                      alt={champion.name}
                      className="h-9 w-9 shrink-0 object-contain"
                    />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate text-sm text-lol-text-bright">
                    {champion?.name ?? `Champion ${match.championId}`}
                  </span>
                  <span className="shrink-0 text-sm text-lol-text">
                    {match.kills} / {match.deaths} / {match.assists}
                    <span className="ml-2 text-xs text-lol-text/70">
                      {kdaRatio(match.kills, match.deaths, match.assists)} KDA
                    </span>
                    <span className="ml-2 text-xs text-lol-text/70">
                      Lane {RIOT_TEAM_POSITION_LABELS[match.teamPosition ?? ""] ?? "Unknown"}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-3">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loadingMoreMatches}
              className="w-full h-9 rounded-lg border border-lol-border bg-lol-card text-sm text-lol-text transition-colors hover:border-lol-gold/60 hover:text-lol-text-bright disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingMoreMatches ? "Loading…" : "Load More"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function ProfileForm({
  value,
  platform,
  loading,
  onValueChange,
  onPlatformChange,
  onSubmit,
}: {
  value: string;
  platform: string;
  loading: boolean;
  onValueChange: (value: string) => void;
  onPlatformChange: (platform: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="flex items-end gap-3">
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-lol-text">
        Riot ID
        <input
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder="GameName#TagLine"
          className="h-9 rounded-lg border border-lol-gold/40 bg-lol-card px-3 text-sm text-lol-text-bright outline-none placeholder:text-lol-text/60 focus:border-lol-gold"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-lol-text">
        Server
        <select
          value={platform}
          onChange={(event) => onPlatformChange(event.target.value)}
          className="h-9 rounded-lg border border-lol-gold/40 bg-lol-card px-3 text-sm text-lol-text outline-none focus:border-lol-gold"
        >
          {Object.entries(PLATFORM_TO_NAME).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={!value.trim() || loading}
        className="h-9 rounded-lg border border-lol-gold/60 bg-lol-gold/15 px-4 text-sm text-lol-gold transition-colors hover:bg-lol-gold/25 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Loading…" : "Load Profile"}
      </button>
    </form>
  );
}

export default function Profile({ localMode = false }: { localMode?: boolean }) {
  const championData = useChampionData();
  const RECENT_PAGE_SIZE = 20;
  const RECENT_LOAD_MORE_SIZE = 10;
  const [gameNameInput, setGameNameInput] = useState("");
  const [platform, setPlatform] = useState("euw1");
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [mostPlayed, setMostPlayed] = useState<MostPlayedQueue | null>(null);
  const [totalMatches, setTotalMatches] = useState<MatchTotals | null>(null);
  const [recentGames, setRecentGames] = useState<RecentGame[] | null>(null);
  const [recentAllGames, setRecentAllGames] = useState<RecentGame[] | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [recentMatches, setRecentMatches] = useState<RecentRiotMatch[] | null>(null);
  const [recentMatchesLoading, setRecentMatchesLoading] = useState(false);
  const [recentMatchesError, setRecentMatchesError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshPhase, setRefreshPhase] = useState<string | null>(null);
  const [refreshTotal, setRefreshTotal] = useState(0);
  const [recentMatchesCount, setRecentMatchesCount] = useState(RECENT_PAGE_SIZE);
  const [loadingMoreMatches, setLoadingMoreMatches] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [recentProfiles, setRecentProfiles] = useState<ProfileLookup[]>([]);
  const [favoriteProfiles, setFavoriteProfiles] = useState<ProfileLookup[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [favoriteMessage, setFavoriteMessage] = useState<string | null>(null);
  const [linksOpen, setLinksOpen] = useState(false);
  const hasAutoLoaded = useRef(false);
  const recentMatchesRequest = useRef(0);
  const favoriteMessageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return window.api.onRecentMatchesProgress(({ current, total }) => {
      setRefreshTotal(total);
      setRefreshPhase(`Fetching matches… ${current} / ${total}`);
    });
  }, []);

  const loadRecentMatches = useCallback(async (puuid: string, selectedPlatform: string) => {
    const requestId = ++recentMatchesRequest.current;
    setRecentMatchesLoading(true);
    setRecentMatchesError(null);
    try {
      const recentResult = await window.api.getRecentRiotMatches(
        puuid,
        selectedPlatform,
        0,
        RECENT_PAGE_SIZE,
      );
      if (requestId !== recentMatchesRequest.current) return;
      if ("error" in recentResult) {
        setRecentMatchesError(recentResult.error);
      } else {
        setRecentMatches(recentResult);
        setRecentMatchesCount(RECENT_PAGE_SIZE);
      }
    } catch (err: unknown) {
      if (requestId === recentMatchesRequest.current) {
        setRecentMatchesError(
          err instanceof Error ? err.message : "Could not load recent matches",
        );
      }
    } finally {
      if (requestId === recentMatchesRequest.current) {
        setRecentMatchesLoading(false);
      }
    }
  }, []);

  const fetchProfile = useCallback(async (
    gameName: string,
    tagLine: string,
    selectedPlatform: string,
    fetchRecentMatches = false,
  ) => {
    setLoading(true);
    setRefreshPhase("Contacting Riot API…");
    setError(null);
    setNotFound(false);
    setProfile(null);
    setDashboard(null);
    setMostPlayed(null);
    setRecentGames(null);
    setRecentAllGames(null);
    setTotalMatches(null);
    setRecentMatchesCount(RECENT_PAGE_SIZE);
    recentMatchesRequest.current += 1;
    setRecentMatches(null);
    setRecentMatchesError(null);
    setRecentMatchesLoading(false);
    try {
      const result = await withTimeout(
        window.api.getProfileData(gameName, tagLine, selectedPlatform),
        PROFILE_TIMEOUT_MS,
      );
      if (result && "error" in result) {
        setError(result.error);
      } else if (!result) {
        setNotFound(true);
      } else {
        setProfile(result);
        setRefreshPhase("Fetching recent matches…");
        if (fetchRecentMatches && !localMode) {
          const requestId = ++recentMatchesRequest.current;
          setRecentMatchesLoading(true);
          setRecentMatchesError(null);
          try {
            setRefreshTotal(RECENT_PAGE_SIZE);
            setRefreshPhase(`Fetching matches… 0 / ${RECENT_PAGE_SIZE}`);
            const [localQueue, localTotals, recent] = await Promise.all([
              window.api.getMostPlayedQueue(
                result.puuid,
                result.gameName || gameName,
                result.tagLine || tagLine,
              ),
              window.api.getTotalMatchesPlayed(
                result.puuid,
                result.gameName || gameName,
                result.tagLine || tagLine,
              ),
              withTimeout(
                window.api.getRecentRiotMatches(
                  result.puuid,
                  result.platform,
                  0,
                  RECENT_PAGE_SIZE,
                ),
                PROFILE_TIMEOUT_MS,
              ),
            ]);
            if ("error" in recent) {
              setRefreshPhase(null);
            } else {
              setRefreshPhase(
                `Fetching matches… ${recent.length} / ${RECENT_PAGE_SIZE}`,
              );
            }
            if (requestId !== recentMatchesRequest.current) return;

            if ("error" in recent) {
              setRecentMatchesError(recent.error);
              const [localQueue, localTotals, localRecent, localRecentAll] =
                await Promise.all([
                  window.api.getMostPlayedQueue(
                    result.puuid,
                    result.gameName || gameName,
                    result.tagLine || tagLine,
                  ),
                  window.api.getTotalMatchesPlayed(
                    result.puuid,
                    result.gameName || gameName,
                    result.tagLine || tagLine,
                  ),
                  window.api.getRecentGames(
                    result.puuid,
                    result.gameName || gameName,
                    result.tagLine || tagLine,
                    [],
                    5,
                  ),
                  window.api.getRecentGames(
                    result.puuid,
                    result.gameName || gameName,
                    result.tagLine || tagLine,
                    [],
                    5,
                  ),
                ]);
              if (requestId === recentMatchesRequest.current) {
                if (localQueue) setMostPlayed(localQueue);
                if (localTotals) setTotalMatches(localTotals);
                if (localRecent) setRecentGames(localRecent);
                if (localRecentAll) setRecentAllGames(localRecentAll);
              }
            } else {
              setRecentMatches(recent);
              setRecentMatchesCount(RECENT_PAGE_SIZE);
              const derived = deriveFromRiotMatches(recent);
              setMostPlayed(localQueue ?? derived.mostPlayed);
              setTotalMatches(localTotals ?? derived.totals);
              setRecentGames(
                localTotals
                  ? await window.api.getRecentGames(
                      result.puuid,
                      result.gameName || gameName,
                      result.tagLine || tagLine,
                      localQueue
                        ? localQueue.isArenaGroup
                          ? ARENA_QUEUE_IDS
                          : [localQueue.queue_id]
                        : [],
                      5,
                    )
                  : derived.recentGames,
              );
              setRecentAllGames(
                localTotals
                  ? await window.api.getRecentGames(
                      result.puuid,
                      result.gameName || gameName,
                      result.tagLine || tagLine,
                      [],
                      5,
                    )
                  : derived.recentAllGames,
              );
            }
          } catch (err) {
            if (requestId === recentMatchesRequest.current) {
              setRecentMatchesError(
                err instanceof Error ? err.message : "Could not load recent matches",
              );
            }
          } finally {
            if (requestId === recentMatchesRequest.current) {
              setRecentMatchesLoading(false);
              setRefreshPhase(null);
            }
          }
        }
        const successfulLookup: ProfileLookup = {
          gameName: result.gameName || gameName,
          tagLine: result.tagLine || tagLine,
          platform: selectedPlatform,
        };
        const normalizedLookup = [
          successfulLookup.gameName.toLowerCase(),
          successfulLookup.tagLine.toLowerCase(),
          successfulLookup.platform.toLowerCase(),
        ];
        const updatedRecents = [
          successfulLookup,
          ...readRecentProfiles().filter((recent) =>
            [recent.gameName, recent.tagLine, recent.platform]
              .map((value) => value.toLowerCase())
              .some((value, index) => value !== normalizedLookup[index]),
          ),
        ].slice(0, 5);
        try {
          window.localStorage.setItem(LAST_LOOKUP_KEY, JSON.stringify(successfulLookup));
        } catch {
          // Storage may be unavailable in some Electron contexts.
        }
        try {
          window.localStorage.setItem(RECENTS_KEY, JSON.stringify(updatedRecents));
          setRecentProfiles(updatedRecents);
        } catch {
          // Storage may be unavailable in some Electron contexts.
        }
      }
    } catch (err: unknown) {
      console.error("Failed to load profile:", err);
      setError(err instanceof Error ? err.message : "Could not load profile");
    } finally {
      setLoading(false);
      setRefreshPhase(null);
      setRefreshTotal(0);
    }
  }, [localMode]);

  const loadLocalProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    setProfile(null);
    setDashboard(null);
    setMostPlayed(null);
    setTotalMatches(null);
    setRecentGames(null);
    setRecentAllGames(null);
    try {
      const [localProfile, puuid] = await Promise.all([
        window.api.getProfile(),
        window.api.getSummonerPuuid(),
      ]);
      if (!puuid) {
        setError("No local account data. Connect to the League client or import history.");
        return;
      }

      const localDashboard = await window.api.getDashboard();
      const localName = localProfile.name ?? "Local account";
      const localMostPlayed = await window.api.getMostPlayedQueue(puuid, localName, "");
      const localQueueIds = localMostPlayed
        ? localMostPlayed.isArenaGroup
          ? ARENA_QUEUE_IDS
          : [localMostPlayed.queue_id]
        : [];
      const [localRecentGames, localRecentAllGames, localTotals] = await Promise.all([
        window.api.getRecentGames(puuid, localName, "", localQueueIds, 5),
        window.api.getRecentGames(puuid, localName, "", [], 5),
        window.api.getTotalMatchesPlayed(puuid, localName, ""),
      ]);
      setProfile({
        puuid,
        gameName: localName,
        tagLine: "",
        platform: "",
        profileIconId: localProfile.profileIcon ?? 0,
        summonerLevel: 0,
        dataDragonVersion: "none",
        masteryPoints: 0,
        masteryScore: 0,
        topMasteryChampions: null,
        rankedSolo: null,
        rankedFlex: null,
      });
      setDashboard(localDashboard);
      setMostPlayed(localMostPlayed);
      setRecentGames(localRecentGames);
      setRecentAllGames(localRecentAllGames);
      setTotalMatches(localTotals);
    } catch (err: unknown) {
      console.error("Failed to load local profile:", err);
      setError(err instanceof Error ? err.message : "Could not load local profile");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const separator = gameNameInput.indexOf("#");
    if (separator < 0) {
      if (!gameNameInput.trim()) {
        try {
          window.localStorage.removeItem(LAST_LOOKUP_KEY);
        } catch {
          // Storage may be unavailable in some Electron contexts.
        }
      }
      setError("Enter your Riot ID as GameName#TagLine");
      setNotFound(false);
      return;
    }
    const gameName = gameNameInput.slice(0, separator).trim();
    const tagLine = gameNameInput.slice(separator + 1).trim();
    if (!gameName || !tagLine) {
      setError("Enter your Riot ID as GameName#TagLine");
      setNotFound(false);
      return;
    }

    await fetchProfile(gameName, tagLine, platform, !localMode);
  };

  useEffect(() => {
    setRecentProfiles(readRecentProfiles());
    setFavoriteProfiles(readFavoriteProfiles());
  }, []);

  useEffect(
    () => () => {
      if (favoriteMessageTimer.current) clearTimeout(favoriteMessageTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (hasAutoLoaded.current) return;
    hasAutoLoaded.current = true;

    if (localMode) {
      void loadLocalProfile();
      return;
    }

    void (async () => {
      let remembered = readLastLookup();
      let rememberedPuuid: string | null = null;
      if (!remembered) {
        const [gameName, tagLine, platform, puuid] = await Promise.all([
          window.api.getSetting("riot_game_name"),
          window.api.getSetting("riot_tag_line"),
          window.api.getSetting("riot_platform"),
          window.api.getSetting("riot_puuid"),
        ]);
        if (gameName && tagLine && platform) {
          remembered = { gameName, tagLine, platform };
          rememberedPuuid = puuid;
        }
      }
      if (!remembered) return;
      setGameNameInput(`${remembered.gameName}#${remembered.tagLine}`);
      setPlatform(remembered.platform);
      if (!localMode && rememberedPuuid) {
        void loadRecentMatches(rememberedPuuid, remembered.platform);
      }
      await fetchProfile(
        remembered.gameName,
        remembered.tagLine,
        remembered.platform,
        !localMode && !rememberedPuuid,
      );
    })();
  }, [fetchProfile, loadLocalProfile, loadRecentMatches, localMode]);

  const loadRecentProfile = useCallback(
    (lookup: ProfileLookup) => {
      setGameNameInput(`${lookup.gameName}#${lookup.tagLine}`);
      setPlatform(lookup.platform);
      void fetchProfile(lookup.gameName, lookup.tagLine, lookup.platform, !localMode);
    },
    [fetchProfile, localMode],
  );

  const toggleFavorite = useCallback(() => {
    if (!profile) return;
    const current: ProfileLookup = {
      gameName: profile.gameName,
      tagLine: profile.tagLine,
      platform: profile.platform,
    };
    const existingIndex = favoriteProfiles.findIndex((favorite) =>
      profilesMatch(favorite, current),
    );
    const updatedFavorites =
      existingIndex >= 0
        ? favoriteProfiles.filter((_, index) => index !== existingIndex)
        : [current, ...favoriteProfiles];

    if (existingIndex < 0 && favoriteProfiles.length >= MAX_PROFILE_FAVORITES) {
      setFavoriteMessage(`Favorites limit reached (${MAX_PROFILE_FAVORITES})`);
      if (favoriteMessageTimer.current) clearTimeout(favoriteMessageTimer.current);
      favoriteMessageTimer.current = setTimeout(() => setFavoriteMessage(null), 2000);
      return;
    }

    try {
      window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(updatedFavorites));
    } catch {
      // Storage may be unavailable in some Electron contexts.
    }
    setFavoriteProfiles(updatedFavorites);
    setFavoriteMessage(null);
  }, [favoriteProfiles, profile]);

  const removeFavorite = useCallback((favoriteToRemove: ProfileLookup) => {
    const updatedFavorites = favoriteProfiles.filter(
      (favorite) => !profilesMatch(favorite, favoriteToRemove),
    );
    try {
      window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(updatedFavorites));
    } catch {
      // Storage may be unavailable in some Electron contexts.
    }
    setFavoriteProfiles(updatedFavorites);
  }, [favoriteProfiles]);

  const handleReorder = (from: number | null, to: number) => {
    if (from == null || from === to) return;
    const reordered = [...favoriteProfiles];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    try {
      window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(reordered));
    } catch {
      // Storage may be unavailable in some Electron contexts.
    }
    setFavoriteProfiles(reordered);
  };

  const currentProfileLookup = profile
    ? {
        gameName: profile.gameName,
        tagLine: profile.tagLine,
        platform: profile.platform,
      }
    : null;
  const isCurrentFavorite =
    currentProfileLookup !== null &&
    favoriteProfiles.some((favorite) => profilesMatch(favorite, currentProfileLookup));

  const form = (
    <ProfileForm
      value={gameNameInput}
      platform={platform}
      loading={loading}
      onValueChange={setGameNameInput}
      onPlatformChange={setPlatform}
      onSubmit={loadProfile}
    />
  );
  const recentStrip = recentProfiles.length > 0 && (
    <div className="flex flex-wrap gap-2">
      {recentProfiles.map((recent) => (
        <button
          key={`${recent.gameName}#${recent.tagLine}:${recent.platform}`}
          type="button"
          disabled={loading}
          onClick={() => loadRecentProfile(recent)}
          className="rounded-full border border-lol-border px-3 py-1 text-xs text-lol-text transition-colors hover:border-lol-gold/60 hover:text-lol-text-bright disabled:cursor-not-allowed disabled:opacity-50"
        >
          {recent.gameName}#{recent.tagLine}
        </button>
      ))}
    </div>
  );
  const favoritesStrip = favoriteProfiles.length > 0 && (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-amber-300">Favorites</span>
      {favoriteProfiles.map((favorite, index) => (
        <div
          key={`${favorite.gameName}#${favorite.tagLine}:${favorite.platform}`}
          draggable={true}
          onDragStart={(event) => {
            setDragIndex(index);
            event.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDragOverIndex(index);
          }}
          onDragLeave={() => setDragOverIndex(null)}
          onDrop={(event) => {
            event.preventDefault();
            handleReorder(dragIndex, index);
          }}
          onDragEnd={() => {
            setDragIndex(null);
            setDragOverIndex(null);
          }}
          className={`group flex items-center rounded-full border border-amber-400 px-3 py-1 text-xs text-amber-300 transition-colors hover:border-amber-300 hover:text-amber-200 hover:bg-amber-400/10 ${
            dragIndex === index ? "opacity-40" : ""
          } ${
            dragOverIndex === index && dragIndex !== index
              ? "border-l-2 border-l-amber-400"
              : ""
          }`}
        >
          <button
            type="button"
            disabled={loading}
            onClick={() => loadRecentProfile(favorite)}
            className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            {favorite.gameName}#{favorite.tagLine}
          </button>
          <button
            type="button"
            aria-label={`Remove ${favorite.gameName}#${favorite.tagLine} from favorites`}
            onClick={(event) => {
              event.stopPropagation();
              removeFavorite(favorite);
            }}
            className="ml-1 hidden cursor-pointer text-amber-300 transition-colors hover:text-amber-100 group-hover:inline-flex"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );

  const loadMoreRecent = useCallback(async () => {
    if (!profile || loadingMoreMatches) return;
    const nextCount = recentMatchesCount + RECENT_LOAD_MORE_SIZE;
    setLoadingMoreMatches(true);
    try {
      setRefreshTotal(nextCount);
      setRefreshPhase(`Fetching matches… 0 / ${nextCount}`);
      const more = await window.api.getRecentRiotMatches(
        profile.puuid,
        profile.platform,
        0,
        nextCount,
      );
      if ("error" in more) {
        setRecentMatchesError(more.error);
        return;
      }
      setRecentMatches(more);
      setRecentMatchesCount(nextCount);
    } catch (err) {
      setRecentMatchesError(
        err instanceof Error ? err.message : "Could not load more matches",
      );
    } finally {
      setLoadingMoreMatches(false);
      setRefreshPhase(null);
      setRefreshTotal(0);
    }
  }, [profile, recentMatchesCount, loadingMoreMatches]);

  const handleRefreshProfile = useCallback(() => {
    if (!profile) return;
    void fetchProfile(profile.gameName, profile.tagLine, profile.platform, !localMode);
  }, [profile, fetchProfile, localMode]);

  if (error || notFound || !profile) {
    return (
      <div className="max-w-6xl space-y-4">
        {!localMode && recentStrip}
        {!localMode && favoritesStrip}
        {!localMode && form}
        {loading && <p className="text-sm text-lol-text">Loading…</p>}
        {error && (
          <p className="rounded-lg border border-red-500/60 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </p>
        )}
        {notFound && (
          <p className="rounded-lg border border-red-500/60 bg-red-500/10 p-3 text-sm text-red-300">
            Account not found. Check the spelling and server.
          </p>
        )}
        {!localMode && (
          <RecentRiotMatchesSection
            matches={recentMatches}
            loading={recentMatchesLoading}
            error={recentMatchesError}
            championData={championData}
            version="latest"
            puuid={null}
            onRefresh={() => undefined}
            onLoadMore={() => undefined}
            loadingMoreMatches={false}
          />
        )}
      </div>
    );
  }

  const version = profile.dataDragonVersion === "none" ? "latest" : profile.dataDragonVersion;
  const profileIconUrl = `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${profile.profileIconId}.png`;

  return (
    <div className="max-w-6xl space-y-8">
      {!localMode && (
        <>
          {recentStrip}
          {favoritesStrip}
          {form}
        </>
      )}
      {localMode && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            {profile.profileIconId > 0 ? (
              <img
                src={profileIconUrl}
                alt={`${profile.gameName} profile icon`}
                className="h-16 w-16 rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-lol-gold text-2xl font-bold text-lol-dark">
                L
              </div>
            )}
            <div>
              <h1 className="text-2xl font-semibold text-lol-text-bright">
                {profile.gameName || "Local account"}
              </h1>
              <p className="text-sm text-lol-text">
                {dashboard
                  ? `${dashboard.totalGames} games · ${dashboard.wins}W ${dashboard.totalGames - dashboard.wins}L · ${dashboard.avgScore?.toFixed(1) ?? "—"} avg score`
                  : "No local data"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-stretch gap-3">
            <MostPlayedMode
              mostPlayed={mostPlayed}
              recentGames={recentGames}
              championData={championData}
            />
            <MatchStatsBox
              title="TOTAL MATCHES PLAYED"
              totals={totalMatches}
              recentGames={recentAllGames}
              championData={championData}
              subtitle={
                totalMatches
                  ? localMode
                    ? `${totalMatches.games} Games in total`
                    : `${totalMatches.games} Games in tracked history`
                  : "No games recorded"
              }
              hideRecentGamesWhenEmpty
            />
          </div>
        </div>
      )}
      {!localMode && (
        <>
      <div className="grid grid-cols-[220px_minmax(0,1fr)_256px_auto] items-start gap-8">
        <div>
          <div className="h-[220px] w-[220px] rounded-xl bg-[linear-gradient(138deg,#c89b37_0%,#ffe09b_50%,#c89b37_100%)] p-[5px]">
            <img
              src={profileIconUrl}
              alt={`${profile.gameName} profile icon`}
              className="h-full w-full rounded-lg object-cover"
            />
          </div>
          <p className="mt-3 text-sm text-lol-text">Level {profile.summonerLevel}</p>
        </div>

        <div className="min-w-0 pt-0">
          <div>
            <div className="flex items-center gap-2">
              <h1
                className="max-w-full break-words text-4xl font-semibold tracking-tight text-lol-text-bright"
                title={`${profile.gameName}#${profile.tagLine}`}
              >
                {profile.gameName}#{profile.tagLine}
              </h1>
              <button
                type="button"
                aria-label={
                  isCurrentFavorite
                    ? "Remove profile from favorites"
                    : "Add profile to favorites"
                }
                onClick={toggleFavorite}
                className={
                  isCurrentFavorite
                    ? "cursor-pointer text-2xl leading-none text-amber-400 transition-colors hover:text-amber-300"
                    : "cursor-pointer text-2xl leading-none text-slate-500 transition-colors hover:text-amber-400"
                }
              >
                {isCurrentFavorite ? "★" : "☆"}
              </button>
              {favoriteMessage && (
                <span className="text-xs text-amber-300">{favoriteMessage}</span>
              )}
            </div>
            <p className="mt-2 text-sm text-lol-text">
              Region: {shortRegion(profile.platform)}
            </p>
          </div>
          <div className="mt-4 flex flex-wrap items-stretch gap-3">
            <MostPlayedMode
              mostPlayed={mostPlayed}
              recentGames={recentGames}
              championData={championData}
            />
            <MatchStatsBox
              title="TOTAL MATCHES PLAYED"
              totals={totalMatches}
              recentGames={recentAllGames}
              championData={championData}
              subtitle={
                totalMatches
                  ? localMode
                    ? `${totalMatches.games} Games in total`
                    : `${totalMatches.games} Games in tracked history`
                  : "No games recorded"
              }
              hideRecentGamesWhenEmpty
            />
          </div>
        </div>
        <div className="mt-[84px] w-64 rounded-xl border border-lol-border/70 bg-lol-card/50 px-5 py-4">
          <h2 className="text-center text-sm font-semibold text-lol-text-bright">
            Champion Mastery
          </h2>
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3 text-sm text-lol-text">
              <MasteryCrestIcon />
              <span>Points</span>
              <strong className="ml-auto text-lol-text-bright">
                {profile.masteryPoints.toLocaleString("en-US")} pts
              </strong>
            </div>
            <div className="flex items-center gap-3 text-sm text-lol-text">
              <MasteryPointsIcon />
              <span>Score</span>
              <strong className="ml-auto text-lol-text-bright">{profile.masteryScore}</strong>
            </div>
          </div>
          <MasteryChampionStrip
            champions={profile.topMasteryChampions}
            championData={championData}
          />
        </div>

        <div className="relative flex flex-col items-end gap-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleRefreshProfile}
              disabled={loading}
              className="h-9 cursor-pointer rounded-lg border border-lol-border bg-lol-card px-4 text-sm text-lol-text transition-colors hover:border-lol-gold/60 hover:text-lol-text-bright disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Refreshing…" : "Refresh Data"}
            </button>
            <button
              type="button"
              onClick={() => setLinksOpen((open) => !open)}
              className="h-9 cursor-pointer rounded-lg border border-lol-gold/60 bg-lol-gold/15 px-4 text-sm text-lol-gold transition-colors hover:border-lol-gold hover:bg-lol-gold/25"
            >
              Links
            </button>
          </div>
          {(loading || refreshPhase || refreshTotal > 0) && (
            <div className="w-64">
              <div className="text-[11px] text-lol-text mb-1 text-right">
                {refreshPhase ?? "Loading…"}
              </div>
              <div className="h-1.5 rounded-full bg-lol-border/60 overflow-hidden">
                {(() => {
                  const match = refreshPhase?.match(/(\d+)\s*\/\s*(\d+)/);
                  const pct = match
                    ? Math.min(
                        100,
                        (Number(match[1]) / Math.max(Number(match[2]), 1)) * 100,
                      )
                    : 100;
                  return (
                    <div
                      className={`h-full rounded-full bg-lol-gold transition-all ${
                        match ? "" : "animate-pulse"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  );
                })()}
              </div>
            </div>
          )}
          <div
            aria-hidden={!linksOpen}
            className={`absolute right-0 top-full z-20 mt-2 w-[320px] rounded-xl border border-lol-border/70 bg-lol-card p-4 shadow-xl transition-all duration-200 ${
              linksOpen
                ? "pointer-events-auto translate-y-0 opacity-100 ease-out"
                : "pointer-events-none -translate-y-2 opacity-0 ease-in"
            }`}
          >
            <h2 className="text-base font-semibold text-lol-text">Useful links</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {buildProfileLinks(profile).map((link) => (
                <button
                  key={link.label}
                  type="button"
                  onClick={() => void window.api.openUrl(link.url)}
                  className="h-9 cursor-pointer rounded-lg border border-lol-gold/50 px-2 text-xs text-lol-gold transition-colors duration-150 hover:border-lol-gold hover:bg-lol-gold/15 hover:text-lol-text-bright"
                >
                  {link.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <RankCard
          title="Ranked Solo"
          entry={profile.rankedSolo}
          championData={championData}
        />
        <RankCard
          title="Ranked Flex"
          entry={profile.rankedFlex}
          championData={championData}
        />
      </div>
        </>
      )}

      {!localMode && (
        <RecentRiotMatchesSection
          matches={recentMatches}
          loading={recentMatchesLoading}
          error={recentMatchesError}
          championData={championData}
          version={version}
          puuid={profile.puuid}
          onRefresh={() => {
            void loadRecentMatches(profile.puuid, profile.platform);
          }}
          onLoadMore={loadMoreRecent}
          loadingMoreMatches={loadingMoreMatches}
        />
      )}
    </div>
  );
}
