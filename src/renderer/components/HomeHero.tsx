import type { ChampionData, HomeDashboardPayload, HomeTimePeriod } from "../../shared/api";
import ChampionIcon from "./ChampionIcon";
import { getChampionName } from "../hooks/useChampions";
import { formatNumber } from "../lib/format";

function periodLabel(period: HomeTimePeriod): string {
  if (period === "24h") return "Last 24 hours";
  if (period === "30d") return "Last 30 days";
  if (period === "full") return "All time";
  return "Last 7 days";
}

function formatPlayTime(seconds: number): string {
  if (seconds < 60) return "less than a minute";
  const minutes = Math.floor(seconds / 60);
  if (seconds < 3600) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatAverageGold(gold: number): string {
  return gold >= 1000 ? `${(gold / 1000).toFixed(1)}K G` : `${Math.round(gold)} G`;
}

export function HomeHero({
  dashboard,
  loading,
  timePeriod,
  champData,
}: {
  dashboard: HomeDashboardPayload | null;
  loading: boolean;
  timePeriod: HomeTimePeriod;
  champData: ChampionData;
}) {
  const totalGames = dashboard?.summary.totalGames ?? 0;
  const wins = dashboard?.summary.wins ?? 0;
  const losses = dashboard?.summary.losses ?? 0;
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
  const recentStreak = dashboard?.summary.recentStreak ?? 0;
  const totalTimeSeconds =
    dashboard?.summary.totalTimeSeconds || dashboard?.summary.totalDuration || 0;

  const recentForm = dashboard?.summary.recentForm ?? [];
  const ribbonData = [...recentForm].reverse();

  return (
    <div
      className={`relative overflow-hidden rounded-[10px] bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.10),transparent_42%)] transition-opacity ${loading ? "opacity-50" : ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-lol-border/50 pb-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div>
            <div className="mb-1 font-display text-[12px] font-semibold uppercase tracking-wider text-lol-text">
              {periodLabel(timePeriod)}
            </div>
            <div className="flex items-baseline gap-2.5 font-display text-[42px] font-bold leading-none tracking-[-1px]">
              <span className="text-[#00ff9d]">{formatNumber(wins)}</span>
              <span className="font-medium text-lol-text/60">–</span>
              <span className="text-[#ff3366]">{formatNumber(losses)}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-lol-text">
            <span>{formatNumber(totalGames)} games played</span>
            {totalGames > 0 && <span>{formatPlayTime(totalTimeSeconds)} played</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <b className="block font-display text-[30px] font-bold leading-none text-lol-gold">
              {winRate}% <span className="text-[12px] tracking-[0.08em]">WIN RATE</span>
            </b>
          </div>
          {recentStreak !== 0 && (
            <span
              className={`rounded-md border border-white/10 bg-black/20 px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-wider ${
                recentStreak > 0 ? "bg-lol-win/15 text-[#00ff9d]" : "bg-lol-loss/15 text-[#ff3366]"
              }`}
            >
              {recentStreak > 0 ? `W${recentStreak}` : `L${Math.abs(recentStreak)}`} STREAK
            </span>
          )}
        </div>
      </div>

      <div
        className="relative mt-6 flex h-24 gap-px border-b border-lol-border/60 pb-px"
        aria-hidden="true"
      >
        <span className="pointer-events-none absolute inset-x-0 top-[60px] border-t border-lol-border" />
        {ribbonData.map((game, i) => {
          const tooltip = (
            <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-lol-border bg-lol-card px-2.5 py-1.5 text-left shadow-lg group-hover:block">
              <span className="flex items-center gap-1.5">
                <ChampionIcon championId={game.champion_id} size={18} className="rounded" />
                <span className="font-display text-[11px] font-semibold text-lol-text-bright">
                  {getChampionName(champData, game.champion_id)}
                </span>
              </span>
              <span className="mt-0.5 block text-[11px] text-lol-text">
                <span className="text-[#00ff9d]">{game.kills}</span>
                <span className="mx-0.5">/</span>
                <span className="text-[#ff3366]">{game.deaths}</span>
                <span className="mx-0.5">/</span>
                <span className="text-[#00f2ff]">{game.assists}</span>
                <span className="ml-2 font-display font-semibold text-lol-gold">
                  {(game.score ?? 0).toFixed(1)}
                </span>
              </span>
            </span>
          );
          return (
            <div
              key={i}
              className="group relative z-10 grid min-w-px max-w-[5px] flex-1 grid-rows-[60px_36px]"
            >
              {game.win ? (
                <b
                  className="row-start-1 self-end rounded-sm bg-gradient-to-t from-lol-win/80 to-lol-win"
                  style={{
                    height: `${Math.max(6, Math.round((((game.score ?? 5) as number) / 10) * 60))}px`,
                  }}
                />
              ) : (
                <b
                  className="row-start-2 self-start rounded-sm bg-gradient-to-b from-lol-loss/80 to-lol-loss"
                  style={{
                    height: `${Math.max(4, Math.round((((game.score ?? 5) as number) / 10) * 36))}px`,
                  }}
                />
              )}
              {tooltip}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between gap-3 text-[12px] text-lol-text/60">
        <span>OLDEST (7 DAYS AGO)</span>
        <span className="text-center">WINS ABOVE AXIS / LOSSES BELOW</span>
        <span>LATEST (TODAY)</span>
      </div>

      <div className="mt-5 grid grid-cols-1 divide-y divide-white/10 border-t border-lol-border/40 pt-1 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
        <div className="px-3 py-3 first:pl-0">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-lol-text">
            Kills / Deaths / Assists
          </span>
          <b className="mt-1 block font-display text-[20px] font-bold tabular-nums">
            <span className="text-[#ffb700]">
              {formatNumber(dashboard?.summary.totalKills ?? 0)}
            </span>
            <span className="text-lol-text/50"> / </span>
            <span className="text-[#ff3366]">
              {formatNumber(dashboard?.summary.totalDeaths ?? 0)}
            </span>
            <span className="text-lol-text/50"> / </span>
            <span className="text-[#00f2ff]">
              {formatNumber(dashboard?.summary.totalAssists ?? 0)}
            </span>
          </b>
        </div>
        <div className="px-3 py-3">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-lol-text">
            AVG KDA RATIO
          </span>
          <b className="mt-1 block font-display text-[20px] font-bold tabular-nums text-[#00ff9d]">
            {(dashboard?.summary.avgKda ?? 0).toFixed(2)} : 1
          </b>
        </div>
        <div className="px-3 py-3">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-lol-text">
            AVG DAMAGE TO CHAMPS
          </span>
          <b className="mt-1 block font-display text-[20px] font-bold tabular-nums text-[#ffb700]">
            {dashboard?.summary.statsEligibleGames
              ? formatNumber(Math.round(dashboard.summary.avgDamageDealt))
              : "—"}
          </b>
        </div>
        <div className="px-3 py-3 last:pr-0">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-lol-text">
            AVG CS / GOLD
          </span>
          <b className="mt-1 block font-display text-[20px] font-bold tabular-nums text-lol-text-bright">
            {dashboard?.summary.statsEligibleGames
              ? `${formatNumber(Math.round(dashboard.summary.avgCs))} CS`
              : "—"}
            {dashboard?.summary.statsEligibleGames && (
              <span className="text-lol-text/60">
                {" "}
                • {formatAverageGold(dashboard.summary.avgGold)}
              </span>
            )}
          </b>
        </div>
      </div>
    </div>
  );
}
