import type { ChampionData, HomeDashboardPayload, HomeTimePeriod } from "../../shared/api";
import ChampionIcon from "./ChampionIcon";
import { getChampionName } from "../hooks/useChampions";
import { formatNumber } from "../lib/format";
import StatCard from "./StatCard";

function periodLabel(period: HomeTimePeriod): string {
  if (period === "24h") return "Last 24 hours";
  if (period === "30d") return "Last 30 days";
  if (period === "full") return "All time";
  return "Last 7 days";
}

function formatDuration(seconds: number): string {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${(totalSeconds % 60).toString().padStart(2, "0")}`;
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

  const recentForm = dashboard?.summary.recentForm ?? [];
  const ribbonData = [...recentForm].reverse();

  return (
    <div
      className={`relative overflow-hidden rounded-[10px] bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.10),transparent_42%)] transition-opacity ${loading ? "opacity-50" : ""}`}
    >
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="mb-0.5 font-display text-[15px] font-semibold text-lol-text">
            {periodLabel(timePeriod)}
          </div>
          <div className="flex items-baseline gap-3.5 font-display text-[64px] font-bold leading-none tracking-[-1px]">
            <span className="text-lol-win">{formatNumber(wins)}</span>
            <span className="font-medium text-lol-text/60">–</span>
            <span className="text-lol-loss">{formatNumber(losses)}</span>
          </div>
          <div className="mt-2 text-lol-text">{formatNumber(totalGames)} games played</div>
        </div>
        <div className="text-right">
          <b className="block font-display text-[40px] font-bold leading-none text-lol-gold">
            {winRate}%
          </b>
          <span className="text-[13px] text-lol-text">win rate</span>
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
                <span className="text-lol-win">{game.kills}</span>
                <span className="mx-0.5">/</span>
                <span className="text-lol-loss">{game.deaths}</span>
                <span className="mx-0.5">/</span>
                <span className="text-lol-assist">{game.assists}</span>
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
        <span>Oldest</span>
        <span>Wins above the line, losses below.</span>
        <span>Latest</span>
      </div>

      <div className="mt-5 grid grid-cols-4 gap-4 border-t border-lol-border/40 pt-5">
        <div className="relative rounded-md border-t-[3px] border-t-amber-400 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.08),transparent_70%)]">
          <b className="block font-display text-[30px] font-bold leading-tight text-lol-gold">
            {formatNumber(dashboard?.summary.totalKills ?? 0)}
          </b>
          <span className="text-[13px] text-lol-text">
            <i className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
            Kills
          </span>
        </div>
        <div className="relative rounded-md border-t-[3px] border-t-red-400 bg-[radial-gradient(circle_at_top_right,rgba(248,113,113,0.08),transparent_70%)]">
          <b className="block font-display text-[30px] font-bold leading-tight text-lol-loss">
            {formatNumber(dashboard?.summary.totalDeaths ?? 0)}
          </b>
          <span className="text-[13px] text-lol-text">
            <i className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-red-400" />
            Deaths
          </span>
        </div>
        <div className="relative rounded-md border-t-[3px] border-t-sky-400 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.08),transparent_70%)]">
          <b className="block font-display text-[30px] font-bold leading-tight text-lol-assist">
            {formatNumber(dashboard?.summary.totalAssists ?? 0)}
          </b>
          <span className="text-[13px] text-lol-text">
            <i className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-sky-400" />
            Assists
          </span>
        </div>
        <div className="relative rounded-md border-t-[3px] border-t-lol-text-bright bg-[radial-gradient(circle_at_top_right,rgba(226,232,240,0.08),transparent_70%)]">
          <b className="block font-display text-[30px] font-bold leading-tight">
            {(dashboard?.summary.avgKda ?? 0).toFixed(2)}
          </b>
          <span className="text-[13px] text-lol-text">
            <i className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-lol-text-bright" />
            Average K/D/A
          </span>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-lol-border/40 pt-4 xl:grid-cols-4">
        <StatCard
          label="Avg damage"
          value={
            dashboard?.summary.statsEligibleGames
              ? formatNumber(Math.round(dashboard.summary.avgDamageDealt))
              : "—"
          }
          subtext="per game"
          accent="gold"
          className="p-3 xl:p-3 2xl:p-3"
        />
        <StatCard
          label="Avg gold"
          value={
            dashboard?.summary.statsEligibleGames
              ? formatNumber(Math.round(dashboard.summary.avgGold))
              : "—"
          }
          subtext="per game"
          accent="sky"
          className="p-3 xl:p-3 2xl:p-3"
        />
        <StatCard
          label="Avg CS"
          value={
            dashboard?.summary.statsEligibleGames
              ? formatNumber(Math.round(dashboard.summary.avgCs))
              : "—"
          }
          subtext="per game"
          accent="purple"
          className="p-3 xl:p-3 2xl:p-3"
        />
        <StatCard
          label="Avg game duration"
          value={
            dashboard?.summary.statsEligibleGames
              ? formatDuration(dashboard.summary.avgGameLength)
              : "—"
          }
          subtext="MM:SS"
          accent="win"
          className="p-3 xl:p-3 2xl:p-3"
        />
      </div>
    </div>
  );
}
