import type { HomeDashboardPayload, HomeTimePeriod } from "../../shared/api";

function periodLabel(period: HomeTimePeriod): string {
  if (period === "24h") return "Last 24 hours";
  if (period === "30d") return "Last 30 days";
  if (period === "full") return "All time";
  return "Last 7 days";
}

export function HomeHero({
  dashboard,
  loading,
  timePeriod,
}: {
  dashboard: HomeDashboardPayload | null;
  loading: boolean;
  timePeriod: HomeTimePeriod;
}) {
  const totalGames = dashboard?.summary.totalGames ?? 0;
  const wins = dashboard?.summary.wins ?? 0;
  const losses = dashboard?.summary.losses ?? 0;
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;

  const recentForm = dashboard?.summary.recentForm ?? [];
  const ribbonData = [...recentForm].reverse();

  return (
    <div className={`transition-opacity ${loading ? "opacity-50" : ""}`}>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="mb-0.5 font-display text-[15px] font-semibold text-lol-text">
            {periodLabel(timePeriod)}
          </div>
          <div className="flex items-baseline gap-3.5 font-display text-[64px] font-bold leading-none tracking-[-1px]">
            <span className="text-lol-win">{wins.toLocaleString("en-US")}</span>
            <span className="font-medium text-lol-text/60">–</span>
            <span className="text-lol-loss">{losses.toLocaleString("en-US")}</span>
          </div>
          <div className="mt-2 text-lol-text">
            {totalGames.toLocaleString("en-US")} games played
          </div>
        </div>
        <div className="text-right">
          <b className="block font-display text-[40px] font-bold leading-none text-lol-gold">
            {winRate}%
          </b>
          <span className="text-[13px] text-lol-text">win rate</span>
        </div>
      </div>

      <div className="relative mt-6 flex h-24 gap-0.5" aria-hidden="true">
        <span className="pointer-events-none absolute inset-x-0 top-[60px] border-t border-lol-border" />
        {ribbonData.map((game, i) => (
          <div key={i} className="relative z-10 grid min-w-px max-w-4 flex-1 grid-rows-[60px_36px]">
            {game.win ? (
              <b className="h-12 self-end rounded-sm bg-lol-win" />
            ) : (
              <b className="h-4 self-start rounded-sm bg-lol-loss" />
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between gap-3 text-[12px] text-lol-text/60">
        <span>Oldest</span>
        <span>Wins above the line, losses below.</span>
        <span>Latest</span>
      </div>

      <div className="mt-5 grid grid-cols-4 gap-4 border-t border-lol-border/40 pt-5">
        <div>
          <b className="block font-display text-[30px] font-bold leading-tight text-lol-gold">
            {(dashboard?.summary.totalKills ?? 0).toLocaleString("en-US")}
          </b>
          <span className="text-[13px] text-lol-text">Kills</span>
        </div>
        <div>
          <b className="block font-display text-[30px] font-bold leading-tight text-lol-loss">
            {(dashboard?.summary.totalDeaths ?? 0).toLocaleString("en-US")}
          </b>
          <span className="text-[13px] text-lol-text">Deaths</span>
        </div>
        <div>
          <b className="block font-display text-[30px] font-bold leading-tight text-lol-assist">
            {(dashboard?.summary.totalAssists ?? 0).toLocaleString("en-US")}
          </b>
          <span className="text-[13px] text-lol-text">Assists</span>
        </div>
        <div>
          <b className="block font-display text-[30px] font-bold leading-tight">
            {(dashboard?.summary.avgKda ?? 0).toFixed(2)}
          </b>
          <span className="text-[13px] text-lol-text">Average K/D/A</span>
        </div>
      </div>
    </div>
  );
}
