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
import { Panel } from "../components/Panel";
import StatCard from "../components/StatCard";
import SummonerIcon from "../components/SummonerIcon";
import MatchScoreboard from "../components/MatchScoreboard";
import StatBars from "../components/StatBars";
import WinRateBar from "../components/WinRateBar";
import { formatDuration, formatTimeAgo, formatKDA, kdaRatio, kdaColor } from "../lib/format";
import { scoreColor } from "../../shared/opScore";
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

  const switchRelation = useCallback(async () => {
    const target = enemies ? "friends" : "enemies";
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
  }, [enemies, key, navigate, scope, scopedQueue]);

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
          <button
            type="button"
            onClick={switchRelation}
            className="rounded-lg border border-lol-border bg-lol-card px-3 py-1.5 text-sm font-medium text-lol-text transition-colors hover:border-lol-gold/60 hover:text-lol-text-bright"
          >
            Switch
          </button>
        </div>
        <Panel>
          <EmptyState text="No games found with this player." />
        </Panel>
      </div>
    );
  }

  const { player, matches } = data;
  const losses = player.games - player.wins;
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
  const winRate = player.games > 0 ? (player.wins / player.games) * 100 : 0;
  const yourWins = matches.filter((m) => !!m.win).length;
  const yourWinRate = matches.length > 0 ? (yourWins / matches.length) * 100 : 0;
  const sortedChampions = [...player.champions].sort((a, b) => {
    if (championSort === "winRate") {
      return b.wins / Math.max(b.games, 1) - a.wins / Math.max(a.games, 1);
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
        <button
          type="button"
          onClick={switchRelation}
          className="rounded-lg border border-lol-border bg-lol-card px-3 py-1.5 text-sm font-medium text-lol-text transition-colors hover:border-lol-gold/60 hover:text-lol-text-bright"
        >
          Switch relation
        </button>
        {switchMessage && (
          <span className="rounded-lg border border-lol-gold/30 bg-lol-gold/10 px-3 py-1.5 text-xs text-lol-gold">
            {switchMessage}
          </span>
        )}
      </div>

      <Panel className="border-l-2 border-l-[#E5483F] bg-[radial-gradient(circle_at_top_right,rgba(229,72,63,0.18),transparent_60%),linear-gradient(to_bottom,rgba(229,72,63,0.10),transparent_40%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]">
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
              {player.wins}W <span className="text-lol-text/60">{losses}L</span>
            </div>
            <div className="text-xs text-lol-text">{winRate.toFixed(1)}% win rate</div>
          </div>
        </div>
      </Panel>

      <SectionHeading title="Key metrics" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Record"
          value={`${player.wins}W / ${losses}L`}
          subtext={`${winRate.toFixed(1)}% win rate`}
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
            value={`${yourWinRate.toFixed(1)}%`}
            subtext={`${yourWins} wins in ${matches.length} games`}
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
              <ChampionRow key={c.champion_id} champ={c} champData={champData} />
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
              <SharedGameRow
                key={m.game_id}
                match={m}
                champData={champData}
                friendName={player.name}
                enemies={enemies}
                expanded={expandedId === m.game_id}
                detail={expandedId === m.game_id ? detail : null}
                detailLoading={expandedId === m.game_id && detailLoading}
                puuids={puuids}
                onToggle={() => toggleExpand(m.game_id)}
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

function ChampionRow({ champ, champData }: { champ: TeammateChampionStats; champData: any }) {
  const ratio =
    champ.deaths > 0 ? (champ.kills + champ.assists) / champ.deaths : champ.kills + champ.assists;

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
        <WinRateBar wins={champ.wins} total={champ.games} />
      </div>
    </div>
  );
}

function PlayerBlock({
  label,
  championId,
  champData,
  kills,
  deaths,
  assists,
  score,
  badge,
  damage,
  taken,
  heal,
  max,
}: {
  label: string;
  championId: number;
  champData: any;
  kills: number;
  deaths: number;
  assists: number;
  score: number | null;
  badge: "MVP" | "ACE" | null;
  damage: number;
  taken: number;
  heal: number;
  max: { dmg: number; taken: number; heal: number };
}) {
  const kda = kdaRatio(kills, deaths, assists);

  return (
    <div className="flex items-center gap-2 min-w-0">
      <ChampionIcon championId={championId} size={32} />
      <div className="min-w-0 w-24">
        <div className="text-[10px] text-lol-text uppercase tracking-wider truncate" title={label}>
          {label}
        </div>
        <div className="text-xs text-lol-text-bright truncate">
          {getChampionName(champData, championId)}
        </div>
      </div>
      <div className="w-20 shrink-0">
        <div className="text-xs text-lol-text-bright">{formatKDA(kills, deaths, assists)}</div>
        <div
          className={`text-[10px] ${parseFloat(kda) >= 3 || kda === "Perfect" ? "text-lol-gold" : "text-lol-text"}`}
        >
          {kda} KDA
        </div>
      </div>
      <div className="w-10 shrink-0 text-center">
        {score != null && (
          <>
            <div className={`text-sm font-semibold ${scoreColor(score)}`}>{score.toFixed(1)}</div>
            {badge ? (
              <div
                className={`text-[9px] font-bold leading-[15px] px-1 rounded w-fit mx-auto ${
                  badge === "MVP"
                    ? "bg-amber-400/20 text-amber-300"
                    : "bg-purple-500/20 text-purple-400"
                }`}
              >
                {badge}
              </div>
            ) : (
              <div className="text-[10px] text-lol-text uppercase tracking-wider">score</div>
            )}
          </>
        )}
      </div>
      <StatBars damage={damage} taken={taken} heal={heal} max={max} className="w-32" />
    </div>
  );
}

function SharedGameRow({
  match,
  champData,
  friendName,
  expanded,
  detail,
  detailLoading,
  puuids,
  onToggle,
  enemies,
}: {
  match: TeammateMatch;
  champData: any;
  friendName: string;
  expanded: boolean;
  detail: MatchDetail | null;
  detailLoading: boolean;
  puuids: string[] | null;
  onToggle: () => void;
  enemies: boolean;
}) {
  const isWin = !!match.win;
  const accent = isWin ? "bg-lol-win" : "bg-lol-loss";
  const tint = isWin ? "from-lol-win/12 to-lol-win/[0.04]" : "from-lol-loss/12 to-lol-loss/[0.04]";
  // Both bars scale off the same game bests, so the two sides are comparable
  const max = {
    dmg: match.game_max_dmg,
    taken: match.game_max_taken,
    heal: match.game_max_heal,
  };

  return (
    <div>
      <button
        onClick={onToggle}
        className={`group relative overflow-hidden w-full flex items-center gap-4 pl-4 pr-3 py-2.5 border border-b-white/[0.04] border-lol-border/60 bg-lol-card hover:bg-white/[0.02] transition-colors duration-[120ms] text-left ${
          expanded ? "rounded-t-lg" : "rounded-lg"
        }`}
      >
        <span
          className={`absolute left-0 inset-y-0 w-[2px] transition-[width] duration-[120ms] group-hover:w-[3px] ${accent}`}
        />
        <span className={`absolute inset-0 pointer-events-none bg-gradient-to-r ${tint}`} />
        <div
          className={`text-xs font-bold shrink-0 w-8 ${isWin ? "text-lol-win" : "text-lol-loss"}`}
        >
          {isWin ? "WIN" : "LOSS"}
        </div>

        <PlayerBlock
          label={enemies ? friendName : "You"}
          championId={match.champion_id}
          champData={champData}
          kills={match.kills}
          deaths={match.deaths}
          assists={match.assists}
          score={match.score}
          badge={match.score_badge}
          damage={match.total_damage_dealt}
          taken={match.total_damage_taken}
          heal={match.total_heal}
          max={max}
        />

        <span className="w-px self-stretch bg-lol-border/60 shrink-0" />

        <PlayerBlock
          label={enemies ? "You" : friendName}
          championId={match.friend.champion_id}
          champData={champData}
          kills={match.friend.kills}
          deaths={match.friend.deaths}
          assists={match.friend.assists}
          score={match.friend.score}
          badge={match.friend.score_badge}
          damage={match.friend.total_damage_dealt}
          taken={match.friend.total_damage_taken}
          heal={match.friend.total_heal}
          max={max}
        />

        <div className="flex-1" />
        <div className="text-xs text-lol-text text-right shrink-0">
          <div>{formatDuration(match.game_duration)}</div>
          <div>{formatTimeAgo(match.game_creation)}</div>
        </div>
      </button>

      {expanded && (
        <div className="mb-1 bg-lol-card rounded-b-lg border border-t-0 border-lol-border/60 p-3">
          {detailLoading ? (
            <div className="text-sm text-lol-text text-center py-4">Loading...</div>
          ) : detail ? (
            <MatchScoreboard detail={detail} champData={champData} puuids={puuids} />
          ) : null}
        </div>
      )}
    </div>
  );
}
