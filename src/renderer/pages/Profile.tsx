import { FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { ProfileData, ProfileRankedEntry } from "../lib/types";
import { useChampionData } from "../hooks/useChampions";
import type {
  ChampionData,
  ProfileMasteryChampion,
  ProfileRecentGame,
} from "../../shared/api";
import { MasteryCrestIcon, MasteryPointsIcon } from "../components/ProfileIcons";
import { shortRegion, PLATFORM_TO_NAME } from "../../shared/regions";
import { ARENA_QUEUE_IDS, isAugmentQueue, QUEUE_LABELS } from "../../shared/queues";

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
  recentGames: ProfileRecentGame[] | null;
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
            <RecentGamesStrip games={recentGames} championData={championData} />
            {(() => {
              const games = entry.wins + entry.losses;
              const percent = games > 0 ? Math.round((entry.wins / games) * 1000) / 10 : 0;
              return (
                <>
                  <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-red-400/30">
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

const TEAM_POSITION_LABELS: Record<number, string> = {
  0: "Top",
  1: "Jungle",
  2: "Mid",
  3: "Bot",
  4: "Support",
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
          game.game_duration > 0 ? (game.cs / (game.game_duration / 60)).toFixed(1) : "0.0";
        const fields: ReactNode[] = champion
          ? [
              <img
                key="champion"
                src={`https://ddragon.leagueoflegends.com/cdn/latest/img/champion/${champion.name}.png`}
                alt={champion.name}
                className="h-5 w-5 rounded"
              />,
            ]
          : [];
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
        fields.push(
          <span key="lane">
            Lane {game.team_position === null ? "Unknown" : TEAM_POSITION_LABELS[game.team_position] ?? "Unknown"}
          </span>,
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
                    {fieldIndex > 0 && " | "}
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
}: {
  title: string;
  totals: MatchTotals | null;
  subtitle?: ReactNode;
  recentGames?: ProfileRecentGame[] | null;
  championData: ChampionData;
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
        <RecentGamesStrip games={recentGames ?? null} championData={championData} />
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
  const masteryLevel = Math.min(Math.max(championLevel, 1), 10);
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
      <div className="absolute z-50 hidden group-hover:block top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-lol-border/70 bg-lol-dark px-2 py-1 text-xs text-lol-text-bright shadow-lg">
        <p>{championName}</p>
        <p>{championPoints.toLocaleString("en-US")} pts</p>
        <p className="flex items-center gap-1">
          {crestFailed ? (
            <span className="text-lol-gold">Level {championLevel}</span>
          ) : (
            <img
              src={`https://raw.communitydragon.org/latest/game/assets/ux/mastery/mastery_level_icons/mastery_level_${masteryLevel}.png`}
              alt=""
              className="h-4 w-4"
              onError={() => setCrestFailed(true)}
            />
          )}
          {!crestFailed && `Level ${championLevel}`}
        </p>
      </div>
    </div>
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

export default function Profile() {
  const championData = useChampionData();
  const [gameNameInput, setGameNameInput] = useState("");
  const [platform, setPlatform] = useState("euw1");
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [mostPlayed, setMostPlayed] = useState<MostPlayedQueue | null>(null);
  const [totalMatches, setTotalMatches] = useState<MatchTotals | null>(null);
  const [recentGames, setRecentGames] = useState<RecentGame[] | null>(null);
  const [recentAllGames, setRecentAllGames] = useState<RecentGame[] | null>(null);
  const [recentSoloGames, setRecentSoloGames] = useState<RecentGame[] | null>(null);
  const [recentFlexGames, setRecentFlexGames] = useState<RecentGame[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [recentProfiles, setRecentProfiles] = useState<ProfileLookup[]>([]);
  const [favoriteProfiles, setFavoriteProfiles] = useState<ProfileLookup[]>([]);
  const [favoriteMessage, setFavoriteMessage] = useState<string | null>(null);
  const [linksOpen, setLinksOpen] = useState(false);
  const hasAutoLoaded = useRef(false);
  const favoriteMessageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchProfile = useCallback(async (gameName: string, tagLine: string, selectedPlatform: string) => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    setProfile(null);
    setMostPlayed(null);
    setTotalMatches(null);
    setRecentGames(null);
    setRecentAllGames(null);
    setRecentSoloGames(null);
    setRecentFlexGames(null);
    try {
      const result = await window.api.getProfileData(gameName, tagLine, selectedPlatform);
      if (result && "error" in result) {
        setError(result.error);
      } else if (!result) {
        setNotFound(true);
      } else {
        setProfile(result);
        try {
          const queue = await window.api.getMostPlayedQueue(
            result.puuid,
            result.gameName,
            result.tagLine,
          );
          setMostPlayed(queue);
          const queueIds = queue
            ? queue.isArenaGroup
              ? ARENA_QUEUE_IDS
              : [queue.queue_id]
            : [];
          const recent = await window.api.getRecentGames(
            result.puuid,
            result.gameName,
            result.tagLine,
            queueIds,
            5,
          );
          setRecentGames(recent);
          const recentAll = await window.api.getRecentGames(
            result.puuid,
            result.gameName,
            result.tagLine,
            [],
            5,
          );
          setRecentAllGames(recentAll);
          const [recentSolo, recentFlex] = await Promise.all([
            window.api.getRecentGames(
              result.puuid,
              result.gameName,
              result.tagLine,
              [420],
              5,
            ),
            window.api.getRecentGames(
              result.puuid,
              result.gameName,
              result.tagLine,
              [440],
              5,
            ),
          ]);
          setRecentSoloGames(recentSolo);
          setRecentFlexGames(recentFlex);
          const totals = await window.api.getTotalMatchesPlayed(
            result.puuid,
            result.gameName,
            result.tagLine,
          );
          setTotalMatches(totals);
        } catch (err: unknown) {
          console.error("Failed to load local queue breakdown:", err);
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

    await fetchProfile(gameName, tagLine, platform);
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

    const lookup = readLastLookup();
    if (!lookup) return;
    setGameNameInput(`${lookup.gameName}#${lookup.tagLine}`);
    setPlatform(lookup.platform);
    void fetchProfile(lookup.gameName, lookup.tagLine, lookup.platform);
  }, [fetchProfile]);

  const loadRecentProfile = useCallback(
    (lookup: ProfileLookup) => {
      setGameNameInput(`${lookup.gameName}#${lookup.tagLine}`);
      setPlatform(lookup.platform);
      void fetchProfile(lookup.gameName, lookup.tagLine, lookup.platform);
    },
    [fetchProfile],
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
      {favoriteProfiles.map((favorite) => (
        <div
          key={`${favorite.gameName}#${favorite.tagLine}:${favorite.platform}`}
          className="group flex items-center rounded-full border border-amber-400 px-3 py-1 text-xs text-amber-300 transition-colors hover:border-amber-300 hover:text-amber-200 hover:bg-amber-400/10"
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

  if (loading || error || notFound || !profile) {
    return (
      <div className="max-w-6xl space-y-4">
        {recentStrip}
        {favoritesStrip}
        {form}
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
      </div>
    );
  }

  const version = profile.dataDragonVersion === "none" ? "latest" : profile.dataDragonVersion;
  const profileIconUrl = `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${profile.profileIconId}.png`;

  return (
    <div className="max-w-6xl space-y-8">
      {recentStrip}
      {favoritesStrip}
      {form}
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
                  ? `${totalMatches.games} Games in total`
                  : "No games recorded"
              }
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
          <button
            type="button"
            onClick={() => setLinksOpen((open) => !open)}
            className="h-9 cursor-pointer rounded-lg border border-lol-gold/60 bg-lol-gold/15 px-4 text-sm text-lol-gold transition-colors hover:border-lol-gold hover:bg-lol-gold/25"
          >
            Links
          </button>
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
          recentGames={recentSoloGames}
          championData={championData}
        />
        <RankCard
          title="Ranked Flex"
          entry={profile.rankedFlex}
          recentGames={recentFlexGames}
          championData={championData}
        />
      </div>
    </div>
  );
}
