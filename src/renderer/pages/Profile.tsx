import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { MatchDetail, MatchListItem, ProfileData, ProfileRankedEntry } from "../lib/types";
import { GameRow } from "./MatchHistory";
import { getChampionName, useChampionData } from "../hooks/useChampions";
import type {
  AccountListItem,
  AccountSnapshot,
  ChampionData,
  CurrentSummoner,
  ProfileMasteryChampion,
  ProfileRecentGame,
  RankEntry,
} from "../../shared/api";
import ChampionIcon from "../components/ChampionIcon";
import { shortRegion } from "../../shared/regions";
import { isAugmentQueue, QUEUE_LABELS } from "../../shared/queues";
import { formatTimeAgo, kdaRatio } from "../lib/format";
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

function toProfileRankedEntry(entry: RankEntry | null): ProfileRankedEntry | null {
  return entry
    ? {
        tier: entry.tier,
        rank: entry.division,
        leaguePoints: entry.leaguePoints,
        wins: entry.wins,
        losses: entry.losses,
      }
    : null;
}

function profileDataFromSnapshot(
  snapshot: AccountSnapshot,
  dataDragonVersion: string,
): ProfileData {
  return {
    puuid: snapshot.puuid,
    gameName: snapshot.gameName ?? "Unknown",
    tagLine: snapshot.tagLine ?? "",
    platform: snapshot.platform ?? "",
    profileIconId: snapshot.profileIconId ?? 0,
    summonerLevel: snapshot.summonerLevel ?? 0,
    dataDragonVersion,
    masteryPoints: 0,
    masteryScore: 0,
    topMasteryChampions: snapshot.topMasteryChampions.map((champion) => ({
      championId: champion.championId,
      championPoints: champion.points,
      championLevel: champion.level,
    })),
    rankedSolo: toProfileRankedEntry(snapshot.rankedSolo),
    rankedFlex: toProfileRankedEntry(snapshot.rankedFlex),
  };
}

function RankCard({
  title,
  entry,
  recentGames,
  championData,
  isLive,
  hasCachedData,
}: {
  title: string;
  entry: ProfileRankedEntry | null;
  recentGames?: ProfileRecentGame[] | null;
  championData: ChampionData;
  isLive: boolean;
  hasCachedData: boolean;
}) {
  return (
    <div className="relative rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] p-5 pl-6 shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03] overflow-visible">
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#5865a8]" />
      <div className="mb-3 flex items-center justify-between">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-lol-gold">{title}</h2>
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
            <p className="text-xl font-bold text-lol-text-bright">
              {entry.tier.toUpperCase()} {entry.rank.toUpperCase()}
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
                  <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-lol-border/60">
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
        <p className="text-sm text-lol-text">
          {!isLive && hasCachedData ? "Log in with this account to sync rank" : "Unranked"}
        </p>
      )}
    </div>
  );
}

type RecentGame = ProfileRecentGame;

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
      <div className="min-w-[220px] flex-1 rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] p-3 shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03]">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-lol-gold">
          Last played champions
        </p>
        <p className="text-xs text-lol-text">Loading…</p>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="min-w-[280px] flex-1 rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] p-3 shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03]">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-lol-gold">
          Last played champions
        </p>
        <p className="text-xs text-lol-text">No games recorded</p>
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
    <div className="min-w-[280px] flex-1 rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] p-3 shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03]">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-lol-gold">
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
              <span
                title={getChampionName(champData, championId)}
                className="overflow-hidden rounded-full"
              >
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
      <div className="min-w-[220px] flex-1 rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] p-3 shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03]">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-lol-gold">
          Last games
        </p>
        <p className="text-xs text-lol-text">Loading…</p>
      </div>
    );
  }

  if (games === 0) {
    return (
      <div className="min-w-[220px] flex-1 rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] p-3 shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03]">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-lol-gold">
          Last 0 games
        </p>
        <p className="text-xs text-lol-text">No games recorded</p>
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
    <div className="min-w-[220px] flex-1 rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] p-3 shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03]">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-lol-gold">
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
    <section className="overflow-hidden rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03]">
      <div className="flex items-center justify-between gap-3 px-4 pt-4">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-lol-gold">
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
      {summary && <p className="px-4 pt-1 text-[11px] text-lol-text/60">Last import: {summary}</p>}
      {loading && (!matches || matches.length === 0) && (
        <p className="py-8 text-center text-sm text-lol-text">Loading…</p>
      )}
      {error && (
        <p className="mx-4 mt-4 rounded-md border border-lol-crimson/40 bg-lol-crimson/10 px-3 py-2 text-xs text-lol-crimson-bright">
          {error}
        </p>
      )}
      {!loading && !error && matches && matches.length === 0 && (
        <p className="py-8 text-center text-sm text-lol-text">No recent matches</p>
      )}
      {matches && matches.length > 0 && (
        <div className="space-y-1 px-4 pb-4 pt-3">
          {matches.map((match) => (
            <div
              key={match.game_id}
              className="group cursor-pointer border-b border-lol-border/20 transition-colors hover:bg-white/[0.03]"
            >
              <GameRow
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
            </div>
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
  // TODO: cleanup in Phase 15 — unused setter
  const [recentMatchesLoading, _setRecentMatchesLoading] = useState(false);
  // TODO: cleanup in Phase 15 — unused setter
  const [recentMatchesError, _setRecentMatchesError] = useState<string | null>(null);
  const [recentExpandedId, setRecentExpandedId] = useState<number | null>(null);
  const [recentDetail, setRecentDetail] = useState<MatchDetail | null>(null);
  const [recentDetailLoading, setRecentDetailLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [profileIconFailed, setProfileIconFailed] = useState(false);
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);
  const [selectedPuuid, setSelectedPuuid] = useState<string | null>(null);
  const [livePuuid, setLivePuuid] = useState<string | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [scannedCount, setScannedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const selectorWrapperRef = useRef<HTMLDivElement>(null);
  const selectionInitialized = useRef(false);
  const loadRequestIdRef = useRef(0);
  const selectedPuuidRef = useRef(selectedPuuid);
  const profileRef = useRef(profile);

  useEffect(() => {
    selectedPuuidRef.current = selectedPuuid;
  }, [selectedPuuid]);
  profileRef.current = profile;

  useEffect(() => {
    let mounted = true;
    const refreshLivePuuid = async (): Promise<string | null> => {
      try {
        const nextLivePuuid = await window.api.getCurrentPuuid();
        if (mounted) setLivePuuid(nextLivePuuid);
        return nextLivePuuid;
      } catch (err: unknown) {
        console.warn("Could not refresh current League client account:", err);
        if (mounted) setLivePuuid(null);
        return null;
      }
    };

    void Promise.allSettled([refreshLivePuuid(), window.api.listAccountsWithData()]).then(
      ([liveResult, accountsResult]) => {
        if (!mounted) return;

        const nextLivePuuid = liveResult.status === "fulfilled" ? liveResult.value : null;
        const nextAccounts = accountsResult.status === "fulfilled" ? accountsResult.value : [];
        setAccounts(nextAccounts);

        if (!selectionInitialized.current) {
          selectionInitialized.current = true;
          setSelectedPuuid(nextLivePuuid ?? nextAccounts[0]?.puuid ?? null);
        }
      },
    );
    const livePuuidInterval = window.setInterval(() => {
      void refreshLivePuuid();
    }, 60_000);

    const unsubscribe = window.api.onGamesUpdated(() => {
      void window.api
        .listAccountsWithData()
        .then((nextAccounts) => {
          if (mounted) setAccounts(nextAccounts);
        })
        .catch((err: unknown) => {
          console.warn("Could not refresh local account list:", err);
        });
    });

    return () => {
      mounted = false;
      window.clearInterval(livePuuidInterval);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!selectorOpen) return;

    const handleOutsideMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && !selectorWrapperRef.current?.contains(target)) {
        setSelectorOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideMouseDown);
    return () => document.removeEventListener("mousedown", handleOutsideMouseDown);
  }, [selectorOpen]);

  const loadLocalProfile = useCallback(
    (puuid: string, options?: { silent?: boolean }) =>
      log.safe("load profile", async () => {
        const requestId = ++loadRequestIdRef.current;
        const silent = options?.silent === true;
        if (!silent) {
          setLoading(true);
        }
        setError(null);
        if (!silent) {
          setProfile(null);
        }
        try {
          let profileData: ProfileData;

          if (livePuuid === null || puuid === livePuuid) {
            let profileIconId = 0;
            let currentSummoner: CurrentSummoner | null = null;
            try {
              currentSummoner = await window.api.getCurrentSummoner();
              if (requestId !== loadRequestIdRef.current) return;
              profileIconId = currentSummoner.profileIconId;
            } catch (err: unknown) {
              console.warn("Could not read current League client profile:", err);
              try {
                profileIconId = (await window.api.getCurrentSummonerProfileIcon()) ?? 0;
                if (requestId !== loadRequestIdRef.current) return;
              } catch (iconErr: unknown) {
                console.warn("Could not read current League client profile icon:", iconErr);
              }
            }

            const localProfile = await window.api.getProfile();
            if (requestId !== loadRequestIdRef.current) return;
            if (!localProfile.puuid) {
              if (requestId !== loadRequestIdRef.current) return;
              setError("No local account data. Connect to the League client or import history.");
              return;
            }

            const profileExtras = await window.api.getProfileExtras();
            if (requestId !== loadRequestIdRef.current) return;
            const dataDragonVersion = await window.api.getChampionDataVersion();
            if (requestId !== loadRequestIdRef.current) return;
            profileData = {
              puuid,
              gameName: currentSummoner?.gameName ?? localProfile.name ?? "Local account",
              tagLine: currentSummoner?.tagLine ?? "",
              platform: currentSummoner?.platform || localProfile.platform || "",
              profileIconId: currentSummoner?.profileIconId || profileIconId,
              summonerLevel: currentSummoner?.summonerLevel ?? 0,
              dataDragonVersion,
              masteryPoints: 0,
              masteryScore: 0,
              topMasteryChampions: profileExtras.topMasteryChampions.map((champion) => ({
                championId: champion.championId,
                championPoints: champion.points,
                championLevel: champion.level,
              })),
              rankedSolo: toProfileRankedEntry(profileExtras.rankedSolo),
              rankedFlex: toProfileRankedEntry(profileExtras.rankedFlex),
            };
          } else {
            const snapshot = await window.api.getAccountSnapshot(puuid);
            if (requestId !== loadRequestIdRef.current) return;
            if (!snapshot) {
              if (requestId !== loadRequestIdRef.current) return;
              setError(
                "No cached data for this account. Log in with it in League Client to fetch.",
              );
              return;
            }
            const dataDragonVersion = await window.api.getChampionDataVersion();
            if (requestId !== loadRequestIdRef.current) return;
            profileData = profileDataFromSnapshot(snapshot, dataDragonVersion);
          }

          const localRecentMatches = await readRecentHistoryFromDb(puuid, 20);
          if (requestId !== loadRequestIdRef.current) return;
          if (profileData.puuid !== selectedPuuidRef.current) {
            console.warn("[profile] stale load ignored:", {
              loaded: profileData.puuid,
              current: selectedPuuidRef.current,
            });
            return;
          }
          setProfile(profileData);
          log.log("profile loaded", { puuid, icon: profileData.profileIconId });
          setRecentMatches(localRecentMatches.matches);
          setRecentMatchesAvailable(localRecentMatches.total);
        } catch (err: unknown) {
          if (requestId !== loadRequestIdRef.current) return;
          console.error("Failed to load local profile:", err);
          const message = err instanceof Error ? err.message : "Could not load local profile";
          if (silent) {
            setSyncError(message);
          } else {
            setError(message);
          }
        } finally {
          if (requestId === loadRequestIdRef.current) {
            setLoading(false);
          }
        }
      }),
    [livePuuid, log],
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
    setSyncError(null);
    setScannedCount(0);
    setTotalCount(0);
    if (!selectedPuuid) return;
    if (profileRef.current?.puuid && profileRef.current.puuid !== selectedPuuid) {
      setProfile(null);
      setRecentMatches(null);
    }
    void loadLocalProfile(selectedPuuid);
  }, [selectedPuuid, loadLocalProfile, livePuuid]);

  useEffect(() => {
    if (syncing) {
      return window.api.onBackfillProgress((progress) => {
        setScannedCount(progress.current);
        setTotalCount(progress.total);
      });
    }

    const resetTimer = window.setTimeout(() => {
      setScannedCount(0);
      setTotalCount(0);
    }, 500);
    return () => window.clearTimeout(resetTimer);
  }, [syncing]);

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

  const profileIconUrl =
    profile.profileIconId && profile.dataDragonVersion
      ? `https://ddragon.leagueoflegends.com/cdn/${profile.dataDragonVersion}/img/profileicon/${profile.profileIconId}.png`
      : null;
  const profileInitial = profile.gameName.trim().charAt(0).toUpperCase() || "?";
  const selectedAccount = accounts.find((account) => account.puuid === selectedPuuid);
  const currentAccountLabel = selectedPuuid
    ? selectedAccount
      ? `${selectedAccount.gameName ?? "Unknown"}#${selectedAccount.tagLine ?? ""}`
      : "Unknown"
    : "No account";
  const sortedAccounts = [...accounts].sort((a, b) => {
    const aLive = a.puuid === livePuuid ? 1 : 0;
    const bLive = b.puuid === livePuuid ? 1 : 0;
    if (aLive !== bLive) return bLive - aLive;
    return (b.lastSeen ?? 0) - (a.lastSeen ?? 0);
  });
  const progressPercent = totalCount > 0 ? Math.min(100, (scannedCount / totalCount) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-end">
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={async () => {
              if (!selectedPuuid) return;
              setSyncing(true);
              setSyncError(null);
              try {
                const result = await window.api.syncAccountHistory(selectedPuuid);
                if (!result.ok) {
                  setSyncError(result.error ?? "Sync failed");
                } else {
                  await loadLocalProfile(selectedPuuid, { silent: true });
                }
              } finally {
                setSyncing(false);
              }
            }}
            disabled={syncing || !selectedPuuid}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-lol-gold/30 bg-lol-gold/10 px-3 text-xs font-semibold tracking-wider text-lol-gold transition-colors hover:bg-lol-gold/20 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-deep)]"
          >
            {syncing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        {syncing && (
          <div className="mt-2 flex w-64 flex-col items-end gap-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-lol-border/60">
              <div
                className="h-full bg-lol-gold transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-[11px] tabular-nums text-lol-text">
              {scannedCount} out of {totalCount || "?"} games scanned
            </span>
          </div>
        )}
      </div>
      {syncError && (
        <div className="flex items-start gap-3 rounded-md border border-lol-crimson/40 bg-lol-crimson/10 px-4 py-3">
          <span className="text-sm font-bold text-lol-crimson-bright">!</span>
          <p className="flex-1 text-xs text-lol-crimson-bright">{syncError}</p>
          <button
            type="button"
            onClick={() => setSyncError(null)}
            className="shrink-0 text-xs font-bold uppercase tracking-wider text-lol-crimson-bright transition-colors hover:text-lol-text-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-deep)]"
            aria-label="Dismiss sync error"
          >
            Dismiss
          </button>
        </div>
      )}
      <div className="grid grid-cols-[220px_minmax(0,1fr)_256px_auto] items-start gap-8">
        <div>
          <div className="h-[220px] w-[220px] rounded-lg border border-lol-crimson/40 bg-[linear-gradient(138deg,#c89b37_0%,#ffe09b_50%,#c89b37_100%)] p-[4px] shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)]">
            {profileIconUrl && !profileIconFailed ? (
              <img
                src={profileIconUrl}
                alt={`${profile.gameName} profile icon`}
                className="h-full w-full rounded-md object-cover"
                onError={() => setProfileIconFailed(true)}
              />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center rounded-md bg-lol-dark text-6xl font-semibold text-lol-text-bright"
                aria-label={`${profile.gameName} profile icon placeholder`}
              >
                {profileInitial}
              </div>
            )}
          </div>
          <p className="mt-3 text-center text-xs font-bold uppercase tracking-wider text-lol-text">
            LEVEL{" "}
            {profile.summonerLevel === 0 && selectedPuuid !== livePuuid ? (
              <span className="text-lol-text/60">—</span>
            ) : (
              profile.summonerLevel
            )}
          </p>
        </div>

        <div className="min-w-0 pt-0">
          <div>
            <div ref={selectorWrapperRef} className="relative flex items-center gap-3">
              {selectedAccount ? (
                <h1
                  className="max-w-full break-words text-4xl font-bold tracking-tight text-lol-text-bright"
                  title={`${selectedAccount.gameName ?? ""}#${selectedAccount.tagLine ?? ""}`}
                >
                  {selectedAccount.gameName ?? "Unknown"}
                  {selectedAccount.tagLine ? `#${selectedAccount.tagLine}` : ""}
                </h1>
              ) : (
                <h1 className="max-w-full break-words text-4xl font-bold tracking-tight text-lol-text-bright">
                  {profile.gameName}
                </h1>
              )}
              <button
                type="button"
                onClick={() => setSelectorOpen((value) => !value)}
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-lol-border/60 bg-lol-card/40 px-3 text-xs font-semibold tracking-wider text-lol-text transition-colors hover:border-lol-gold/40 hover:text-lol-text-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-deep)]"
                aria-haspopup="listbox"
                aria-expanded={selectorOpen}
              >
                {currentAccountLabel}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="h-3.5 w-3.5"
                  aria-hidden="true"
                >
                  <path d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" />
                </svg>
              </button>
              {selectorOpen && (
                <div
                  role="listbox"
                  className="absolute left-0 top-full z-50 mt-2 max-h-80 w-80 overflow-y-auto rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] p-1 shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03]"
                >
                  {sortedAccounts.map((account) => {
                    const isLive = account.puuid === livePuuid;
                    const isSelected = account.puuid === selectedPuuid;
                    return (
                      <button
                        key={account.puuid}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          setSelectedPuuid(account.puuid);
                          setSelectorOpen(false);
                        }}
                        className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors ${
                          isSelected
                            ? "bg-lol-gold/15 text-lol-text-bright"
                            : "text-lol-text hover:bg-white/[0.05] hover:text-lol-text-bright"
                        }`}
                      >
                        {account.profileIconId !== null && (
                          <img
                            src={`https://ddragon.leagueoflegends.com/cdn/${profile.dataDragonVersion}/img/profileicon/${account.profileIconId}.png`}
                            alt=""
                            className="h-7 w-7 shrink-0 rounded-full border border-lol-border/40 object-cover"
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                            }}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-bold text-lol-text-bright">
                              {account.gameName ?? "Unknown"}
                              {account.tagLine ? `#${account.tagLine}` : ""}
                            </span>
                            {isLive && (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded border border-lol-win/50 bg-lol-win/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-lol-win">
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-lol-win" />
                                Live
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-lol-text">
                            {account.gameCount} {account.gameCount === 1 ? "game" : "games"}
                            {account.lastSeen && ` · ${formatTimeAgo(account.lastSeen)}`}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {accounts.length === 0 && (
                    <div className="px-3 py-4 text-center text-xs text-lol-text">
                      No accounts with match history yet
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-lol-text">
              <span>
                Region:{" "}
                {!profile.platform && selectedPuuid !== livePuuid ? (
                  <span className="text-lol-text/60">not synced</span>
                ) : (
                  shortRegion(profile.platform)
                )}
              </span>
              <span aria-hidden="true">·</span>
              {selectedPuuid === livePuuid && livePuuid !== null && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-lol-win">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-lol-win" />
                  Live
                </span>
              )}
              {selectedPuuid !== livePuuid && selectedAccount?.lastSeen && (
                <span className="text-[11px] font-bold uppercase tracking-wider text-lol-text">
                  Synced {formatTimeAgo(selectedAccount.lastSeen)}
                </span>
              )}
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
        </div>

        <div className="mt-[84px] w-64 rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] px-5 py-4 shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03]">
          <h2 className="mb-3 text-center text-xs font-bold uppercase tracking-wider text-lol-gold">
            Champion Mastery
          </h2>
          {profile.topMasteryChampions?.length === 0 && selectedPuuid !== livePuuid ? (
            <p className="py-2 text-center text-xs text-lol-text">Log in to sync mastery</p>
          ) : (
            <MasteryChampionStrip
              champions={profile.topMasteryChampions}
              championData={championData}
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <RankCard
          title="Ranked Solo"
          entry={profile.rankedSolo}
          championData={championData}
          isLive={selectedPuuid === livePuuid}
          hasCachedData={Boolean(selectedAccount?.lastSeen)}
        />
        <RankCard
          title="Ranked Flex"
          entry={profile.rankedFlex}
          championData={championData}
          isLive={selectedPuuid === livePuuid}
          hasCachedData={Boolean(selectedAccount?.lastSeen)}
        />
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
