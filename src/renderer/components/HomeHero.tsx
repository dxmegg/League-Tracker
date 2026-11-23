import type { ChampionData, HomeDashboardPayload, HomeTimePeriod } from "../../shared/api";
import ChampionIcon from "./ChampionIcon";
import { getChampionName } from "../hooks/useChampions";
import { formatNumber } from "../lib/format";
import { scoreColor } from "../../shared/opScore";

function periodLabel(period: HomeTimePeriod): string {
  if (period === "24h") return "Last 24 hours";
  if (period === "30d") return "Last 30 days";
  if (period === "full") return "All time";
  return "Last 7 days";
}

const OLDEST_AGO: Record<HomeTimePeriod, string> = {
  "24h": "24 HOURS AGO",
  "7d": "7 DAYS AGO",
  "30d": "30 DAYS AGO",
  full: "",
};

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
  flat = false,
  chartOnly = false,
}: {
  dashboard: HomeDashboardPayload | null;
  loading: boolean;
  timePeriod: HomeTimePeriod;
  champData: ChampionData;
  // Drops the corner glow, whose edge shows as a hard box inside a panel
  flat?: boolean;
  // Chart only: drops the totals grid under the chart
  chartOnly?: boolean;
}) {
  const totalGames = dashboard?.summary.totalGames ?? 0;
  const wins = dashboard?.summary.wins ?? 0;
  const losses = dashboard?.summary.losses ?? 0;
  const remakes = dashboard?.summary.remakes ?? 0;
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
  const recentStreak = dashboard?.summary.recentStreak ?? 0;
  const totalTimeSeconds =
    dashboard?.summary.totalTimeSeconds || dashboard?.summary.totalDuration || 0;

  const recentForm = dashboard?.summary.recentForm ?? [];
  const ribbonData = [...recentForm].reverse();

  return (
    <div
      className={`relative rounded-[10px] transition-opacity ${
        flat
          ? ""
          : "overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.10),transparent_42%)]"
      } ${loading ? "opacity-50" : ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-lol-border/50 pb-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div>
            <div className="mb-1 font-display text-[12px] font-semibold uppercase tracking-wider text-lol-text">
              {periodLabel(timePeriod)}
            </div>
            <div className="flex items-baseline gap-2.5 font-display text-[42px] font-bold leading-none tracking-[-1px]">
              <span className="text-lol-win">{formatNumber(wins)}</span>
              <span className="font-medium text-lol-text/60">–</span>
              <span className="text-lol-loss">{formatNumber(losses)}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-lol-text">
            <span>{formatNumber(totalGames)} games played</span>
            {totalGames > 0 && <span>{formatPlayTime(totalTimeSeconds)} played</span>}
            {remakes > 0 && (
              <span
                title="Remade games are left out of every statistic"
                className="inline-flex items-center gap-1.5 rounded-full border border-lol-border/70 bg-white/[0.04] px-2.5 py-0.5 text-[11.5px]"
              >
                <i className="h-1.5 w-1.5 rounded-full bg-lol-text/60" />
                {formatNumber(remakes)} {remakes === 1 ? "remake" : "remakes"}
                <span className="text-lol-text/60">not counted</span>
              </span>
            )}
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
                recentStreak > 0 ? "bg-lol-win/15 text-lol-win" : "bg-lol-loss/15 text-lol-loss"
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
          // Bars near either end anchor the card to that edge so it never leaves the panel
          const edge =
            i < 9 ? "left-0" : i > ribbonData.length - 10 ? "right-0" : "left-1/2 -translate-x-1/2";
          const kda = (game.kills + game.assists) / Math.max(1, game.deaths);
          const tooltip = (
            <span
              className={`pointer-events-none absolute bottom-full z-50 mb-3 hidden w-[190px] overflow-hidden rounded-xl border border-lol-border bg-lol-card text-left shadow-[0_18px_40px_-10px_rgba(0,0,0,0.9)] group-hover:block ${edge}`}
            >
              <span className={`block h-[3px] ${game.win ? "bg-lol-win" : "bg-lol-loss"}`} />
              <span className="flex items-center gap-2.5 px-3 pt-2.5">
                <ChampionIcon
                  championId={game.champion_id}
                  size={34}
                  className={`rounded-lg ring-2 ${game.win ? "ring-lol-win/70" : "ring-lol-loss/70"}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[13px] font-semibold text-lol-text-bright">
                    {getChampionName(champData, game.champion_id)}
                  </span>
                  <span
                    className={`font-display text-[10px] font-bold uppercase tracking-widest ${game.win ? "text-lol-win" : "text-lol-loss"}`}
                  >
                    {game.win ? "Victory" : "Defeat"}
                  </span>
                </span>
                {game.score != null && (
                  <b
                    className={`rounded-md bg-black/30 px-1.5 py-0.5 font-display text-[14px] ${scoreColor(game.score)}`}
                  >
                    {game.score.toFixed(1)}
                  </b>
                )}
              </span>
              <span className="mt-2 flex items-center justify-between border-t border-lol-border/50 bg-black/20 px-3 py-1.5 font-display text-[12px]">
                <span>
                  <span className="text-lol-gold">{game.kills}</span>
                  <span className="mx-1 text-lol-text/50">/</span>
                  <span className="text-lol-loss">{game.deaths}</span>
                  <span className="mx-1 text-lol-text/50">/</span>
                  <span className="text-lol-assist">{game.assists}</span>
                </span>
                <span className="text-[11px] text-lol-text">{kda.toFixed(2)} KDA</span>
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
        <span>OLDEST{OLDEST_AGO[timePeriod] && ` (${OLDEST_AGO[timePeriod]})`}</span>
        <span className="text-center">WINS ABOVE AXIS / LOSSES BELOW</span>
        <span>LATEST</span>
      </div>

      {!chartOnly && (
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
      )}
    </div>
  );
}
