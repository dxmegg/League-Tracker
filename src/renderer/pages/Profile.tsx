import { FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { MatchDetail, MatchListItem, ProfileData, ProfileRankedEntry } from "../lib/types";
import { GameRow } from "./MatchHistory";
import { getChampionName, useChampionData } from "../hooks/useChampions";
import type {
  ChampionData,
  DashboardData,
  ProfileMasteryChampion,
  ProfileRecentGame,
} from "../../shared/api";
import { MasteryCrestIcon, MasteryPointsIcon } from "../components/ProfileIcons";
import ChampionIcon from "../components/ChampionIcon";
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

const LAST_REFRESH_KEY = "profile:lastRefresh";

function readLastRefreshMap(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(LAST_REFRESH_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, number>)
      : {};
  } catch {
    return {};
  }
}

function readLastRefreshFor(puuid: string): number | null {
  return readLastRefreshMap()[puuid] ?? null;
}

function writeLastRefreshFor(puuid: string, at: number): void {
  try {
    const map = readLastRefreshMap();
    map[puuid] = at;
    window.localStorage.setItem(LAST_REFRESH_KEY, JSON.stringify(map));
  } catch {
    // Storage may be unavailable in some Electron contexts.
  }
}

function formatLastRefresh(ts: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"} ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 120) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

const LAST_IMPORT_KEY = "profile:lastImport";
const IMPORT_COOLDOWN_MS = 2 * 60 * 1000;

function readLastImportMap(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(LAST_IMPORT_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, number>)
      : {};
  } catch {
    return {};
  }
}

function readLastImportFor(puuid: string): number | null {
  return readLastImportMap()[puuid] ?? null;
}

function writeLastImportFor(puuid: string, at: number): void {
  try {
    const map = readLastImportMap();
    map[puuid] = at;
    window.localStorage.setItem(LAST_IMPORT_KEY, JSON.stringify(map));
  } catch {
    // Storage may be unavailable in some Electron contexts.
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

function recomputeBoxesFromMatches(
  matches: MatchListItem[],
): {
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
      (left, right) =>
        right.games.length - left.games.length || left.championId - right.championId,
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

function LastGamesBox({
  matches,
  loading,
}: {
  matches: MatchListItem[];
  loading: boolean;
}) {
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
          {availableCount > (matches?.length ?? 0) &&
            ` · up to ${availableCount} fetchable`}
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
      {summary && (
        <p className="mt-1 text-[11px] text-lol-text/60">Last import: {summary}</p>
      )}
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

async function readRecentHistoryFromDb(
  puuid: string,
  count: number,
): Promise<{ matches: MatchListItem[]; total: number }> {
  return window.api.getMatchHistory(count, 0, {
    account: puuid,
    ignoreHiddenQueues: true,
  });
}

export default function Profile({ localMode = false }: { localMode?: boolean }) {
  const championData = useChampionData();
  const [searchParams, setSearchParams] = useSearchParams();
  const RECENT_PAGE_SIZE = 20;
  const [gameNameInput, setGameNameInput] = useState("");
  const [platform, setPlatform] = useState("euw1");
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [mostPlayed, setMostPlayed] = useState<MostPlayedQueue | null>(null);
  const [totalMatches, setTotalMatches] = useState<MatchTotals | null>(null);
  const [recentGames, setRecentGames] = useState<RecentGame[] | null>(null);
  const [recentAllGames, setRecentAllGames] = useState<RecentGame[] | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [recentMatches, setRecentMatches] = useState<MatchListItem[] | null>(null);
  const [_recentMatchesTotal, setRecentMatchesTotal] = useState<number | null>(null);
  const [recentMatchesAvailable, setRecentMatchesAvailable] = useState(0);
  const [recentMatchesLoading, setRecentMatchesLoading] = useState(false);
  const [recentMatchesError, setRecentMatchesError] = useState<string | null>(null);
  const [lastImportSummary, setLastImportSummary] = useState<string | null>(null);
  const [refreshingMatchHistory, setRefreshingMatchHistory] = useState(false);
  const [recentExpandedId, setRecentExpandedId] = useState<number | null>(null);
  const [recentDetail, setRecentDetail] = useState<MatchDetail | null>(null);
  const [recentDetailLoading, setRecentDetailLoading] = useState(false);
  const [recentContextMenu, setRecentContextMenu] = useState<{
    x: number;
    y: number;
    match: MatchListItem;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefreshLabel, setLastRefreshLabel] = useState<string | null>(null);
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
  const matchCountByPuuid = useRef<Map<string, number>>(new Map());
  const lastRefreshAt = useRef(0);

  useEffect(() => {
    if (!recentContextMenu) return;
    const close = () => setRecentContextMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [recentContextMenu]);

  useEffect(() => {
    return window.api.onRecentMatchesProgress(({ current, total }) => {
      setRefreshTotal(total);
      setRefreshPhase(`Fetching matches… ${current} / ${total}`);
    });
  }, []);

  const loadRecentMatches = useCallback(
    async (puuid: string, selectedPlatform: string, selectedCount: number) => {
      const requestId = ++recentMatchesRequest.current;
      setRecentMatchesLoading(true);
      setRecentMatchesError(null);
      try {
        const lastImport = readLastImportFor(puuid);
        const withinCooldown =
          !!lastImport && Date.now() - lastImport < IMPORT_COOLDOWN_MS;

        if (!withinCooldown) {
          const importResult = await window.api.importRecentRiotMatches(
            puuid,
            selectedPlatform,
            selectedCount,
          );
          if (requestId !== recentMatchesRequest.current) return;
          if ("error" in importResult) {
            setRecentMatchesError(importResult.error);
          } else {
            setRecentMatchesAvailable(importResult.totalAvailable);
            setLastImportSummary(
              `imported ${importResult.imported} of ${importResult.scanned} attempted (${importResult.totalAvailable} available)`,
            );
            if (importResult.imported > 0 || importResult.scanned === 0) {
              writeLastImportFor(puuid, Date.now());
            }
          }
        }

        const history = await readRecentHistoryFromDb(puuid, selectedCount);
        if (requestId !== recentMatchesRequest.current) return;
        setRecentMatches(history.matches);
        setRecentMatchesTotal(history.total);
        setRecentMatchesCount(selectedCount);
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
    },
    [],
  );

  const fetchProfile = useCallback(async (
    gameName: string,
    tagLine: string,
    selectedPlatform: string,
    fetchRecentMatches = false,
    silent = false,
    force = false,
  ) => {
    if (!silent) setLoading(true);
    setRefreshPhase("Contacting Riot API…");
    setError(null);
    setNotFound(false);
    setProfile(null);
    setDashboard(null);
    setMostPlayed(null);
    setRecentGames(null);
    setRecentAllGames(null);
    setTotalMatches(null);
    setRecentMatchesAvailable(0);
    setRecentMatchesTotal(null);
    recentMatchesRequest.current += 1;
    setRecentMatches(null);
    setRecentMatchesTotal(null);
    setRecentMatchesError(null);
    setRecentMatchesLoading(false);
    setLoadingMoreMatches(false);
    try {
      const result = await withTimeout(
        window.api.getProfileData(gameName, tagLine, selectedPlatform, force),
        PROFILE_TIMEOUT_MS,
      );
      if (result && "error" in result) {
        setError(result.error);
      } else if (!result) {
        setNotFound(true);
      } else {
        setProfile(result);
        const previousRefresh = readLastRefreshFor(result.puuid);
        if (previousRefresh) setLastRefreshLabel(formatLastRefresh(previousRefresh));
        writeLastRefreshFor(result.puuid, Date.now());
        const cachedCount = matchCountByPuuid.current.get(result.puuid) ?? 20;
        setRecentMatchesCount(cachedCount);
        setRefreshPhase("Fetching recent matches…");
        if (fetchRecentMatches && !localMode) {
          const requestId = ++recentMatchesRequest.current;
          setRecentMatchesLoading(true);
          setRecentMatchesError(null);
          try {
            const lastImport = readLastImportFor(result.puuid);
            const withinCooldown =
              !!lastImport && Date.now() - lastImport < IMPORT_COOLDOWN_MS && !force;

            if (!withinCooldown) {
              const importResult = await window.api.importRecentRiotMatches(
                result.puuid,
                result.platform,
                recentMatchesCount,
              );
              console.log("[profile] fetchProfile import result:", importResult);
              if (requestId !== recentMatchesRequest.current) return;
              if ("error" in importResult) {
                setRecentMatchesError(importResult.error);
              } else {
                setRecentMatchesAvailable(importResult.totalAvailable);
                setLastImportSummary(
                  `imported ${importResult.imported} of ${importResult.scanned} attempted (${importResult.totalAvailable} available)`,
                );
                if (importResult.imported > 0 || importResult.scanned === 0) {
                  writeLastImportFor(result.puuid, Date.now());
                }
              }
              console.log(
                "[profile] import done for",
                result.puuid,
                "→",
                "error" in importResult ? importResult.error : importResult,
              );
            }

            const history = await readRecentHistoryFromDb(result.puuid, recentMatchesCount);
            if (requestId !== recentMatchesRequest.current) return;
            setRecentMatches(history.matches);
            console.log(
              "[profile] local query returned",
              history.matches.length,
              "of",
              history.total,
              "for",
              result.puuid,
            );
            setRecentMatchesTotal(history.total);
            const derived = deriveFromRiotMatches(history.matches);
            setMostPlayed(derived.mostPlayed);
            setTotalMatches(derived.totals);
            setRecentGames(derived.recentGames);
            setRecentAllGames(derived.recentAllGames);
          } catch (err) {
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
      if (!silent) setLoading(false);
      setRefreshPhase(null);
      setRefreshTotal(0);
    }
  }, [localMode, recentMatchesCount]);

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
      const queryGameName = searchParams.get("gameName");
      const queryTagLine = searchParams.get("tagLine");
      const queryPlatform = searchParams.get("platform");

      if (queryGameName && queryTagLine && queryPlatform) {
        setGameNameInput(`${queryGameName}#${queryTagLine}`);
        setPlatform(queryPlatform);
        await fetchProfile(queryGameName, queryTagLine, queryPlatform, true);
        return;
      }

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
        void loadRecentMatches(rememberedPuuid, remembered.platform, recentMatchesCount);
      }
      await fetchProfile(
        remembered.gameName,
        remembered.tagLine,
        remembered.platform,
        !localMode && !rememberedPuuid,
      );
    })();
  }, [
    fetchProfile,
    loadLocalProfile,
    loadRecentMatches,
    localMode,
    recentMatchesCount,
    searchParams,
  ]);

  useEffect(() => {
    const SILENT_REFRESH_AFTER_MS = 5 * 60 * 1000;

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (localMode) return;
      if (!profile) return;
      const last = readLastRefreshFor(profile.puuid);
      if (last && Date.now() - last < SILENT_REFRESH_AFTER_MS) return;
      void fetchProfile(profile.gameName, profile.tagLine, profile.platform, true, true);
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [profile, fetchProfile, localMode]);

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

  const handleLoadMoreMatches = useCallback(async () => {
    if (!profile || loadingMoreMatches) return;
    if (recentMatchesCount >= 100) return;
    setLoadingMoreMatches(true);
    try {
      const nextCount = Math.min(100, recentMatchesCount + 30);
      const importResult = await window.api.importRecentRiotMatches(
        profile.puuid,
        profile.platform,
        nextCount,
      );
      if ("error" in importResult) {
        setRecentMatchesError(importResult.error);
        return;
      }
      writeLastImportFor(profile.puuid, Date.now());
      setRecentMatchesAvailable(importResult.totalAvailable);
      const more = await readRecentHistoryFromDb(profile.puuid, nextCount);
      setRecentMatches(more.matches);
      setRecentMatchesTotal(more.total);
      setRecentMatchesCount(nextCount);
      matchCountByPuuid.current.set(profile.puuid, nextCount);
      const derived = recomputeBoxesFromMatches(more.matches);
      setRecentGames(derived.recentGames);
      setRecentAllGames(derived.recentAllGames);
    } finally {
      setLoadingMoreMatches(false);
    }
  }, [profile, recentMatchesCount, loadingMoreMatches]);

  const handleRefreshProfile = useCallback(
    (event?: React.MouseEvent<HTMLButtonElement>) => {
      if (!profile) return;
      const now = Date.now();
      const isForce = !!event && (event.ctrlKey || event.shiftKey || event.metaKey);
      if (!isForce && now - lastRefreshAt.current < 3_000) return;
      lastRefreshAt.current = now;
      void fetchProfile(
        profile.gameName,
        profile.tagLine,
        profile.platform,
        !localMode,
        false,
        isForce,
      );
    },
    [profile, fetchProfile, localMode],
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

  const handleScoreboardPlayerClick = useCallback(
    (player: { puuid: string | null; gameName: string | null; tagLine: string | null }) => {
      if (!player.gameName || !player.tagLine) return;
      const next = new URLSearchParams();
      next.set("gameName", player.gameName);
      next.set("tagLine", player.tagLine);
      next.set("platform", platform);
      setSearchParams(next);
      void fetchProfile(player.gameName, player.tagLine, platform, true, false, true);
    },
    [platform, setSearchParams, fetchProfile],
  );

  const handleRefreshMatchHistory = useCallback(async () => {
    if (!profile || refreshingMatchHistory) return;
    setRefreshingMatchHistory(true);
    setRecentMatchesError(null);
    try {
      const importResult = await window.api.importRecentRiotMatches(
        profile.puuid,
        profile.platform,
        20,
      );
      console.log(
        "[profile] handleRefreshMatchHistory import result:",
        importResult,
      );
      if ("error" in importResult) {
        setRecentMatchesError(importResult.error);
      } else {
        setRecentMatchesAvailable(importResult.totalAvailable);
        setLastImportSummary(
          `imported ${importResult.imported} of ${importResult.scanned} attempted (${importResult.totalAvailable} available)`,
        );
        if (importResult.imported > 0 || importResult.scanned === 0) {
          writeLastImportFor(profile.puuid, Date.now());
        }
        const history = await readRecentHistoryFromDb(profile.puuid, recentMatchesCount);
        console.log("[profile] match history read:", history.matches.length, "of", history.total);
        setRecentMatches(history.matches);
        setRecentMatchesTotal(history.total);
        const derived = deriveFromRiotMatches(history.matches);
        setMostPlayed(derived.mostPlayed);
        setTotalMatches(derived.totals);
        setRecentGames(derived.recentGames);
        setRecentAllGames(derived.recentAllGames);
      }
    } catch (err) {
      setRecentMatchesError(
        err instanceof Error ? err.message : "Could not refresh match history",
      );
    } finally {
      setRefreshingMatchHistory(false);
    }
  }, [profile, refreshingMatchHistory, recentMatchesCount]);

  const handleToggleRecentFavorite = useCallback(
    async (match: MatchListItem) => {
      setRecentContextMenu(null);
      await window.api.toggleFavorite(match.game_id);
      if (profile) {
        const history = await window.api.getMatchHistory(recentMatchesCount, 0, {
          account: profile.puuid,
          ignoreHiddenQueues: true,
        });
        setRecentMatches(history.matches);
      }
    },
    [profile, recentMatchesCount],
  );

  useEffect(() => {
    if (localMode) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "F5") return;
      event.preventDefault();
      handleRefreshProfile();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleRefreshProfile, localMode]);

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
            puuids={null}
            onPlayerClick={handleScoreboardPlayerClick}
            expandedId={recentExpandedId}
            detail={recentDetail}
            detailLoading={recentDetailLoading}
            availableCount={recentMatchesAvailable}
            canLoadMore={false}
            champData={championData}
            refreshing={false}
            summary={lastImportSummary}
            onToggle={handleToggleRecentMatch}
            onLoadMore={handleLoadMoreMatches}
            onRefresh={() => undefined}
            onContextMenu={() => undefined}
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
            <LastPlayedChampionsBox
              matches={recentMatches ?? []}
              loading={loading}
              champData={championData}
            />
            <LastGamesBox matches={recentMatches ?? []} loading={loading} />
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
              title="Click to refresh. Ctrl/Shift+click to force a fresh fetch and ignore caches."
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
          {lastRefreshLabel && (
            <span className="text-[11px] text-lol-text/70">
              Last refresh — {lastRefreshLabel}
            </span>
          )}
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
          puuids={[profile.puuid]}
          onPlayerClick={handleScoreboardPlayerClick}
          expandedId={recentExpandedId}
          detail={recentDetail}
          detailLoading={recentDetailLoading}
          availableCount={recentMatchesAvailable}
          canLoadMore={
            recentMatchesCount < 100 &&
            recentMatchesCount < recentMatchesAvailable
          }
          champData={championData}
          refreshing={refreshingMatchHistory}
          summary={lastImportSummary}
          onToggle={handleToggleRecentMatch}
          onLoadMore={handleLoadMoreMatches}
          onRefresh={handleRefreshMatchHistory}
          onContextMenu={(event, match) => {
            event.preventDefault();
            setRecentContextMenu({ x: event.clientX, y: event.clientY, match });
          }}
        />
      )}
      {recentContextMenu && (
        <div
          className="fixed z-50 min-w-44 py-1 bg-lol-card border border-lol-border rounded-md shadow-lg shadow-black/40"
          style={{ left: recentContextMenu.x, top: recentContextMenu.y }}
        >
          <button
            onClick={() => handleToggleRecentFavorite(recentContextMenu.match)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-lol-text-bright hover:bg-white/5 text-left"
          >
            <span
              className={
                recentContextMenu.match.favorite ? "text-amber-400" : "text-lol-text"
              }
            >
              {recentContextMenu.match.favorite ? "★" : "☆"}
            </span>
            {recentContextMenu.match.favorite
              ? "Remove from Favorites"
              : "Add to Favorites"}
          </button>
        </div>
      )}
    </div>
  );
}
