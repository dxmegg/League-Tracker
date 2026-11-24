import ChampionIcon from "./ChampionIcon";
import SummonerIcon from "./SummonerIcon";
import { formatNumber } from "../lib/format";

interface HistoryStatRowProps {
  gameName: string;
  tagLine: string | null;
  profileIconId: number | null;
  gamesLabel: string;
  wins: number;
  losses: number;
  winRate: number;
  recentForm: number[];

  avgScore: number | null;
  // Extra cells in the Score tile; each hides when missing
  avgScoreWins?: number | null;
  avgScoreLosses?: number | null;
  bestScore?: number | null;
  worstScore?: number | null;
  teamAvgScore: number | null;
  mvpCount: number;
  mvpShare: number;
  aceCount: number;
  aceShare: number;

  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  kdaRatio: number;
  killsTotal: number;
  deathsTotal: number;
  assistsTotal: number;
  avgDamageDealt: number;
  damageDealtTotal: number;
  avgDamageTaken: number;
  damageTakenTotal: number;
  avgHealed: number;
  healedTotal: number;
  avgCs: number;
  csPerMin: number;
  avgGold: number;
  goldTotal: number;
  avgGameLengthSec: number;
  // Optional extras for the K/D/A tile; each cell hides when its data is missing
  killParticipation?: number | null;
  damageShare?: number | null;
  longestGameSeconds?: number | null;
  deathsTrend?: { current: number | null; previous: number | null };

  multikillsTotal: number;
  doubles: { count: number; games: number };
  triples: { count: number; games: number };
  quadras: { count: number; games: number };
  pentas: { count: number; games: number };
  // Champions with the most of each multikill, shown as portraits under its bar
  multikillChampions?: Record<
    "double" | "triple" | "quadra" | "penta",
    Array<{ champion_id: number; count: number }>
  >;
  // Skips the identity card and renders just the Score tile, or just KDA and Multikills,
  // straight into the parent grid so the page can place them beside other panels
  tiles?: "score" | "kda";
}

export function HistoryStatRow(props: HistoryStatRowProps) {
  const winRatePct = Math.max(0, Math.min(100, props.winRate));
  const totalGames = props.wins + props.losses;

  const fmtSec = (s: number) => {
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m}:${r.toString().padStart(2, "0")}`;
  };

  const perMin = (perGame: number) =>
    props.avgGameLengthSec > 0 ? (perGame / props.avgGameLengthSec) * 60 : null;
  const deathsDelta =
    props.deathsTrend?.current != null && props.deathsTrend.previous != null
      ? props.deathsTrend.current - props.deathsTrend.previous
      : null;

  const scoreExtras: Array<[string, string, string]> = [];
  const addExtra = (
    label: string,
    value: number | null | undefined,
    tone: string,
    digits = 1,
  ) => {
    if (value != null) scoreExtras.push([label, value.toFixed(digits), tone]);
  };
  addExtra("Average in wins", props.avgScoreWins, "text-lol-win");
  addExtra("Average in losses", props.avgScoreLosses, "text-lol-loss");
  addExtra("Best game", props.bestScore, "text-lol-gold", 2);
  addExtra("Worst game", props.worstScore, "text-lol-text-bright", 2);
  if (props.avgScoreWins != null && props.avgScoreLosses != null)
    scoreExtras.push([
      "Win vs loss gap",
      `+${(props.avgScoreWins - props.avgScoreLosses).toFixed(1)}`,
      "text-lol-text-bright",
    ]);
  scoreExtras.push([
    "MVP or ACE games",
    `${(props.mvpShare + props.aceShare).toFixed(0)}%`,
    "text-lol-violet",
  ]);
  const vsTeam =
    props.avgScore != null && props.teamAvgScore != null
      ? props.avgScore - props.teamAvgScore
      : null;

  return (
    <div
      className={
        props.tiles
          ? "contents"
          : "mb-6 grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:grid-cols-[1.15fr_0.9fr_1.35fr_1.2fr]"
      }
    >
      {!props.tiles && (
        <div className="app-tile flex flex-col">
          <div className="flex items-center gap-3.5">
            <SummonerIcon
              iconId={props.profileIconId}
              size={60}
              className="rounded-xl bg-lol-card object-cover"
            />
            <div className="min-w-0">
              <h3 className="font-display text-[22px] font-bold leading-tight text-lol-text-bright">
                {props.gameName}
                {props.tagLine && (
                  <small className="ml-1 font-display text-[14px] font-medium text-lol-text">
                    #{props.tagLine}
                  </small>
                )}
              </h3>
              <p className="mt-1 text-[13px] text-lol-text">
                {props.gamesLabel}
              </p>
            </div>
          </div>
          <div className="my-4 flex items-baseline justify-between">
            <b className="font-display text-[26px] font-bold">
              <span className="mr-2.5 text-lol-win">{props.wins}W</span>
              <span className="text-lol-loss">{props.losses}L</span>
            </b>
            <b className="font-display text-[26px] font-bold text-lol-gold">
              {props.winRate.toFixed(2)}%
            </b>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-lol-loss">
            <i
              className="block h-full bg-lol-win"
              style={{ width: `${winRatePct}%` }}
            />
          </div>
          <div
            className="mt-3.5 flex flex-wrap gap-1.5"
            aria-label="Last 30 games"
          >
            {props.recentForm.slice(-30).map((w, i) => (
              <i
                key={i}
                className={`h-[9px] w-[9px] rounded-full ${w ? "bg-lol-win" : "bg-lol-loss"}`}
                aria-hidden="true"
              />
            ))}
          </div>
        </div>
      )}

      {(!props.tiles || props.tiles === "score") && (
        <div className="app-tile flex flex-col">
          <h2 className="mb-4 flex h-8 items-center gap-2 font-display text-[12px] font-bold uppercase tracking-widest text-lol-gold">
            <i
              className="block h-3.5 w-[3px] rounded-full bg-lol-crimson"
              aria-hidden="true"
            />
            Score
          </h2>
          <div className="grid flex-1 grid-cols-2 content-center items-baseline gap-x-8 gap-y-4">
            <div>
              <span className="block text-[13px] text-lol-text">Average</span>
              <b className="font-display text-[40px] font-bold leading-none text-lol-gold">
                {props.avgScore != null ? props.avgScore.toFixed(1) : "—"}
                <small className="text-[20px] font-medium text-lol-text">
                  /10
                </small>
              </b>
            </div>
            <div className="text-right">
              <span className="block text-[13px] text-lol-text">
                Team average
              </span>
              <b className="font-display text-[40px] font-bold leading-none text-lol-text/60">
                {props.teamAvgScore != null
                  ? props.teamAvgScore.toFixed(1)
                  : "—"}
                <small className="text-[20px] font-medium text-lol-text">
                  /10
                </small>
              </b>
            </div>
          </div>
          {props.avgScore != null && (
            <div className="mt-4">
              <div className="relative h-2 rounded-full bg-white/[0.06]">
                <i
                  className="absolute inset-y-0 left-0 rounded-full bg-lol-gold"
                  style={{ width: `${Math.min(100, props.avgScore * 10)}%` }}
                />
                {props.teamAvgScore != null && (
                  <i
                    title="Team average"
                    className="absolute -top-1 h-4 w-0.5 rounded bg-lol-text-bright/70"
                    style={{
                      left: `${Math.min(100, props.teamAvgScore * 10)}%`,
                    }}
                  />
                )}
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[11.5px] text-lol-text">
                <span>0</span>
                {vsTeam != null && (
                  <span
                    className={vsTeam >= 0 ? "text-lol-win" : "text-lol-loss"}
                  >
                    {vsTeam >= 0 ? "+" : ""}
                    {vsTeam.toFixed(1)} vs team average
                  </span>
                )}
                <span>10</span>
              </div>
            </div>
          )}
          {scoreExtras.length > 0 && (
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              {scoreExtras.map(([label, value, tone]) => (
                <div
                  key={label}
                  className="rounded-xl border border-lol-border/50 bg-black/20 px-3 py-2"
                >
                  <b
                    className={`block font-display text-[20px] font-bold leading-tight ${tone}`}
                  >
                    {value}
                  </b>
                  <span className="text-[11.5px] text-lol-text">{label}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-auto grid grid-cols-[44px_40px_1fr_50px] items-center gap-2.5 pt-5 text-[13px]">
            <span className="rounded bg-lol-gold px-2 py-0.5 text-[10.5px] font-bold tracking-wider text-[#241705]">
              MVP
            </span>
            <b className="text-right font-display font-semibold tabular-nums">
              {props.mvpCount}
            </b>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
              <i
                className="block h-full bg-lol-gold"
                style={{ width: `${props.mvpShare}%` }}
              />
            </div>
            <em className="text-right not-italic text-lol-text">
              {props.mvpShare.toFixed(1)}%
            </em>
          </div>
          <div className="mt-2 grid grid-cols-[44px_40px_1fr_50px] items-center gap-2.5 text-[13px]">
            <span className="rounded bg-lol-violet px-2 py-0.5 text-[10.5px] font-bold tracking-wider text-[#150c33]">
              ACE
            </span>
            <b className="text-right font-display font-semibold tabular-nums">
              {props.aceCount}
            </b>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
              <i
                className="block h-full bg-lol-violet"
                style={{ width: `${props.aceShare}%` }}
              />
            </div>
            <em className="text-right not-italic text-lol-text">
              {props.aceShare.toFixed(1)}%
            </em>
          </div>
        </div>
      )}

      {(!props.tiles || props.tiles === "kda") && (
        <>
          <div className="app-tile flex flex-col">
            <h2 className="mb-4 flex h-8 items-center gap-2 font-display text-[12px] font-bold uppercase tracking-widest text-lol-gold">
              <i
                className="block h-3.5 w-[3px] rounded-full bg-lol-crimson"
                aria-hidden="true"
              />
              Average K/D/A
            </h2>
            <div className="flex flex-1 flex-col justify-center py-3">
              <div className="font-display text-[36px] font-bold leading-none">
                <span className="text-lol-gold">
                  {props.avgKills.toFixed(1)}
                </span>
                <span className="mx-1.5 font-medium text-lol-text">/</span>
                <span className="text-lol-loss">
                  {props.avgDeaths.toFixed(1)}
                </span>
                <span className="mx-1.5 font-medium text-lol-text">/</span>
                <span className="text-lol-assist">
                  {props.avgAssists.toFixed(1)}
                </span>
              </div>
              <div className="mt-1.5 text-[13px] text-lol-text">
                <b className="font-display text-[13px] font-semibold text-lol-win">
                  {props.kdaRatio.toFixed(2)} KDA
                </b>{" "}
                from {formatNumber(props.killsTotal)} /{" "}
                {formatNumber(props.deathsTotal)} /{" "}
                {formatNumber(props.assistsTotal)} in total
              </div>
            </div>
            <div className="grid grid-cols-3 gap-x-3 gap-y-3.5 border-t border-lol-border/40 pt-4">
              <div>
                <b className="block font-display text-[16px] font-semibold text-lol-loss">
                  {formatNumber(props.avgDamageDealt)}
                </b>
                <span className="block text-[12px] leading-snug text-lol-text">
                  Damage dealt
                  <br />
                  {formatNumber(props.damageDealtTotal)} total
                </span>
              </div>
              <div>
                <b className="block font-display text-[16px] font-semibold text-lol-assist">
                  {formatNumber(props.avgDamageTaken)}
                </b>
                <span className="block text-[12px] leading-snug text-lol-text">
                  Damage taken
                  <br />
                  {formatNumber(props.damageTakenTotal)} total
                </span>
              </div>
              <div>
                <b className="block font-display text-[16px] font-semibold text-lol-win">
                  {formatNumber(props.avgHealed)}
                </b>
                <span className="block text-[12px] leading-snug text-lol-text">
                  Healed
                  <br />
                  {formatNumber(props.healedTotal)} total
                </span>
              </div>
              <div>
                <b className="block font-display text-[16px] font-semibold text-lol-text-bright">
                  {props.avgCs.toFixed(1)}
                </b>
                <span className="block text-[12px] leading-snug text-lol-text">
                  CS per game
                  <br />
                  {props.csPerMin.toFixed(1)} per minute
                </span>
              </div>
              <div>
                <b className="block font-display text-[16px] font-semibold text-lol-gold">
                  {formatNumber(props.avgGold)}
                </b>
                <span className="block text-[12px] leading-snug text-lol-text">
                  Gold per game
                  <br />
                  {formatNumber(props.goldTotal)} total
                </span>
              </div>
              <div>
                <b className="block font-display text-[16px] font-semibold text-lol-text-bright">
                  {fmtSec(props.avgGameLengthSec)}
                </b>
                <span className="block text-[12px] leading-snug text-lol-text">
                  Average length
                </span>
              </div>
              {perMin(props.avgDamageDealt) != null && (
                <div>
                  <b className="block font-display text-[16px] font-semibold text-lol-loss">
                    {formatNumber(
                      Math.round(perMin(props.avgDamageDealt) ?? 0),
                    )}
                  </b>
                  <span className="block text-[12px] leading-snug text-lol-text">
                    Damage per minute
                    <br />
                    to champions
                  </span>
                </div>
              )}
              {perMin(props.avgGold) != null && (
                <div>
                  <b className="block font-display text-[16px] font-semibold text-lol-gold">
                    {formatNumber(Math.round(perMin(props.avgGold) ?? 0))}
                  </b>
                  <span className="block text-[12px] leading-snug text-lol-text">
                    Gold per minute
                    <br />
                    earned
                  </span>
                </div>
              )}
              {props.killParticipation != null && (
                <div>
                  <b className="block font-display text-[16px] font-semibold text-lol-win">
                    {(props.killParticipation * 100).toFixed(0)}%
                  </b>
                  <span className="block text-[12px] leading-snug text-lol-text">
                    Kill participation
                    <br />
                    of team kills
                  </span>
                </div>
              )}
              {props.damageShare != null && (
                <div>
                  <b className="block font-display text-[16px] font-semibold text-lol-loss">
                    {(props.damageShare * 100).toFixed(0)}%
                  </b>
                  <span className="block text-[12px] leading-snug text-lol-text">
                    Damage share
                    <br />
                    of team damage
                  </span>
                </div>
              )}
              {props.longestGameSeconds != null && (
                <div>
                  <b className="block font-display text-[16px] font-semibold text-lol-text-bright">
                    {fmtSec(props.longestGameSeconds)}
                  </b>
                  <span className="block text-[12px] leading-snug text-lol-text">
                    Longest game
                    <br />
                    played
                  </span>
                </div>
              )}
              {props.deathsTrend?.current != null && (
                <div>
                  <b className="block font-display text-[16px] font-semibold text-lol-loss">
                    {props.deathsTrend.current.toFixed(1)}
                    {deathsDelta != null && (
                      <small
                        className={`ml-1.5 text-[12px] ${
                          Math.abs(deathsDelta) < 0.05
                            ? "text-lol-text"
                            : deathsDelta < 0
                              ? "text-lol-win"
                              : "text-lol-loss"
                        }`}
                      >
                        {Math.abs(deathsDelta) < 0.05
                          ? "="
                          : deathsDelta < 0
                            ? "▼"
                            : "▲"}{" "}
                        {Math.abs(deathsDelta).toFixed(1)}
                      </small>
                    )}
                  </b>
                  <span className="block text-[12px] leading-snug text-lol-text">
                    Deaths per game
                    <br />
                    vs previous period
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="app-tile flex flex-col">
            <div className="mb-4 flex h-8 items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-display text-[12px] font-bold uppercase tracking-widest text-lol-gold">
                <i
                  className="block h-3.5 w-[3px] rounded-full bg-lol-crimson"
                  aria-hidden="true"
                />
                Multikills
              </h2>
              <b className="font-display text-[24px] font-bold text-lol-gold">
                {formatNumber(props.multikillsTotal)}
              </b>
            </div>
            <div className="flex flex-1 flex-col justify-between gap-3">
              {(() => {
                const rows: Array<{
                  key: string;
                  label: string;
                  pillClass: string;
                  barClass: string;
                  data: { count: number; games: number };
                }> = [
                  {
                    key: "double",
                    label: "Double",
                    pillClass: "pill d",
                    barClass: "bg-lol-assist",
                    data: props.doubles,
                  },
                  {
                    key: "triple",
                    label: "Triple",
                    pillClass: "pill t",
                    barClass: "bg-lol-gold",
                    data: props.triples,
                  },
                  {
                    key: "quadra",
                    label: "Quadra",
                    pillClass: "pill q",
                    barClass: "bg-lol-violet",
                    data: props.quadras,
                  },
                  {
                    key: "penta",
                    label: "Penta",
                    pillClass: "pill p",
                    barClass: "bg-lol-loss",
                    data: props.pentas,
                  },
                ];
                const totalGamesSafe = Math.max(1, totalGames);
                return rows.map((row) => {
                  const share =
                    row.data.games > 0
                      ? (row.data.games / totalGamesSafe) * 100
                      : 0;
                  return (
                    <div key={row.key}>
                      <div className="grid grid-cols-[80px_1fr_48px] items-center gap-2.5 text-[12.5px] text-lol-text">
                        <span
                          className={`justify-self-start rounded-full border px-2.5 py-1 font-display text-[11.5px] font-semibold ${
                            row.key === "double"
                              ? "border-lol-assist/50 bg-lol-assist/10 text-lol-assist"
                              : row.key === "triple"
                                ? "border-lol-gold/55 bg-lol-gold/10 text-lol-gold"
                                : row.key === "quadra"
                                  ? "border-lol-violet/55 bg-lol-violet/10 text-lol-violet"
                                  : "border-lol-loss/60 bg-lol-loss/12 text-lol-loss"
                          }`}
                        >
                          {row.label}
                        </span>
                        <div>
                          <b className="mr-1.5 font-display text-[15px] font-semibold text-lol-text-bright">
                            {row.data.count}
                          </b>
                          {row.data.games} games
                        </div>
                        <em className="text-right not-italic">
                          {Math.round(share)}%
                        </em>
                      </div>
                      <div className="mt-1 grid grid-cols-[80px_1fr_48px] gap-2.5">
                        <span />
                        <div className="h-[5px] overflow-hidden rounded-full bg-white/[0.05]">
                          <i
                            className={`block h-full ${row.barClass}`}
                            style={{ width: `${share}%` }}
                          />
                        </div>
                        <span />
                      </div>
                      {(props.multikillChampions?.[row.key as "double"] ?? [])
                        .length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-x-1.5 gap-y-1">
                          {props.multikillChampions![row.key as "double"].map(
                            (c) => (
                              <div
                                key={c.champion_id}
                                title={`${c.count}× ${row.label.toLowerCase()}`}
                                className="flex flex-col items-center gap-0.5"
                              >
                                <ChampionIcon
                                  championId={c.champion_id}
                                  size={30}
                                  className="rounded-lg"
                                />
                                <b className="font-display text-[11px] font-semibold text-lol-text-bright">
                                  {c.count}
                                </b>
                              </div>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
