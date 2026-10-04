import type { DashboardData } from "../../shared/api";
import { formatDuration, formatPlaytime, kdaRatio } from "../lib/format";
import SummonerIcon from "./SummonerIcon";

interface HistoryProfile {
  name: string | null;
  profileIcon: number | null;
}

export function HistoryStatRow({
  dashboard,
  profile,
}: {
  dashboard: DashboardData;
  profile?: HistoryProfile | null;
}) {
  const losses = Math.max(dashboard.totalGames - dashboard.wins, 0);
  const winRate = dashboard.totalGames > 0 ? (dashboard.wins / dashboard.totalGames) * 100 : 0;
  const mvpRate = dashboard.scoredWins > 0 ? (dashboard.mvps / dashboard.scoredWins) * 100 : 0;
  const aceRate = dashboard.scoredLosses > 0 ? (dashboard.aces / dashboard.scoredLosses) * 100 : 0;
  const multikills =
    dashboard.multikills.doubles +
    dashboard.multikills.triples +
    dashboard.multikills.quadras +
    dashboard.multikills.pentas;
  const [gameName, tagLine] = (profile?.name ?? "Summoner").split("#", 2);

  return (
    <div className="grid min-w-0 gap-3 rounded-2xl border border-lol-border bg-[linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] p-4 text-lol-text md:grid-cols-[minmax(190px,1.3fr)_repeat(4,minmax(130px,1fr))]">
      <div className="flex min-w-0 items-center gap-3">
        <SummonerIcon
          iconId={profile?.profileIcon ?? null}
          size={56}
          className="shrink-0 rounded-xl bg-lol-card object-cover"
        />
        <div className="min-w-0">
          <div className="truncate font-display text-lg font-semibold text-lol-text-bright">
            {gameName}
            {tagLine && <span className="ml-1 text-sm font-medium text-lol-text">#{tagLine}</span>}
          </div>
          <div className="mt-1 text-xs text-lol-text">
            {dashboard.totalGames.toLocaleString("pl-PL")}{" "}
            {dashboard.totalGames === 1 ? "game" : "games"}
            {dashboard.totalDuration > 0 && ` · ${formatPlaytime(dashboard.totalDuration)} played`}
          </div>
          <div className="mt-2 flex items-center gap-1.5" aria-label="Recent form">
            {dashboard.recentForm.map((game) => (
              <span
                key={game.game_id}
                className={`h-2 w-2 rounded-full ${
                  game.is_remake === 1
                    ? "bg-lol-text/30"
                    : game.win === 1
                      ? "bg-lol-win"
                      : "bg-lol-loss"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col justify-center border-lol-border/60 md:border-l md:pl-4">
        <span className="text-[11px] font-medium uppercase tracking-wider text-lol-text/70">
          Record
        </span>
        <span className="mt-1 font-display text-xl font-semibold tabular-nums text-lol-text-bright">
          <span className="text-lol-win">{dashboard.wins}W</span>{" "}
          <span className="text-lol-loss">{losses}L</span>
        </span>
        <span className="text-xs tabular-nums text-lol-text">{winRate.toFixed(1)}% win rate</span>
      </div>

      <div className="flex flex-col justify-center border-lol-border/60 md:border-l md:pl-4">
        <span className="text-[11px] font-medium uppercase tracking-wider text-lol-text/70">
          KDA
        </span>
        <span className="mt-1 font-display text-xl font-semibold tabular-nums text-lol-text-bright">
          {kdaRatio(dashboard.totalKills, dashboard.totalDeaths, dashboard.totalAssists)}
        </span>
        <span className="text-xs tabular-nums text-lol-text">
          {dashboard.totalKills} / {dashboard.totalDeaths} / {dashboard.totalAssists}
        </span>
      </div>

      <div className="flex flex-col justify-center border-lol-border/60 md:border-l md:pl-4">
        <span className="text-[11px] font-medium uppercase tracking-wider text-lol-text/70">
          Performance
        </span>
        <span className="mt-1 font-display text-xl font-semibold tabular-nums text-lol-gold">
          {dashboard.avgScore == null ? "—" : `${dashboard.avgScore.toFixed(1)} / 10`}
        </span>
        <span className="text-xs tabular-nums text-lol-text">
          Team {dashboard.teamAvgScore.toFixed(1)} · {mvpRate.toFixed(0)}% MVP ·{" "}
          {aceRate.toFixed(0)}% ACE
        </span>
      </div>

      <div className="flex flex-col justify-center border-lol-border/60 md:border-l md:pl-4">
        <span className="text-[11px] font-medium uppercase tracking-wider text-lol-text/70">
          Totals
        </span>
        <span className="mt-1 font-display text-xl font-semibold tabular-nums text-lol-text-bright">
          {multikills.toLocaleString("pl-PL")} multikills
        </span>
        <span className="text-xs tabular-nums text-lol-text">
          {Math.round(dashboard.avgDamageDealt).toLocaleString("pl-PL")} dmg ·{" "}
          {dashboard.avgCs.toFixed(1)} CS · {formatDuration(Math.round(dashboard.avgGameLength))}
        </span>
      </div>
    </div>
  );
}
