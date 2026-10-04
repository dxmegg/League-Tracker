import SummonerIcon from "./SummonerIcon";

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

  multikillsTotal: number;
  doubles: { count: number; games: number };
  triples: { count: number; games: number };
  quadras: { count: number; games: number };
  pentas: { count: number; games: number };
}

export function HistoryStatRow(props: HistoryStatRowProps) {
  const winRatePct = Math.max(0, Math.min(100, props.winRate));
  const totalGames = props.wins + props.losses;

  const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
  const fmtSec = (s: number) => {
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m}:${r.toString().padStart(2, "0")}`;
  };

  return (
    <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:grid-cols-[1.15fr_0.9fr_1.35fr_1.2fr]">
      <div className="flex flex-col rounded-2xl border border-lol-border bg-[linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] p-5">
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
            <p className="mt-1 text-[13px] text-lol-text">{props.gamesLabel}</p>
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
          <i className="block h-full bg-lol-win" style={{ width: `${winRatePct}%` }} />
        </div>
        <div className="mt-3.5 flex flex-wrap gap-1.5" aria-label="Last 30 games">
          {props.recentForm.slice(-30).map((w, i) => (
            <i
              key={i}
              className={`h-[9px] w-[9px] rounded-full ${w ? "bg-lol-win" : "bg-lol-loss"}`}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col rounded-2xl border border-lol-border bg-[linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] p-5">
        <h2 className="mb-4 font-display text-[16px] font-semibold text-lol-text-bright">Score</h2>
        <div className="flex flex-wrap items-baseline gap-5">
          <div>
            <span className="block text-[13px] text-lol-text">Average</span>
            <b className="font-display text-[40px] font-bold leading-none text-lol-gold">
              {props.avgScore != null ? props.avgScore.toFixed(1) : "—"}
              <small className="text-[20px] font-medium text-lol-text">/10</small>
            </b>
          </div>
          <div>
            <span className="block text-[13px] text-lol-text">Team average</span>
            <b className="font-display text-[40px] font-bold leading-none text-lol-text/60">
              {props.teamAvgScore != null ? props.teamAvgScore.toFixed(1) : "—"}
              <small className="text-[20px] font-medium text-lol-text">/10</small>
            </b>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-[44px_40px_1fr_50px] items-center gap-2.5 text-[13px]">
          <span className="rounded bg-lol-gold px-2 py-0.5 text-[10.5px] font-bold tracking-wider text-[#241705]">
            MVP
          </span>
          <b className="text-right font-display font-semibold tabular-nums">{props.mvpCount}</b>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
            <i className="block h-full bg-lol-gold" style={{ width: `${props.mvpShare}%` }} />
          </div>
          <em className="text-right not-italic text-lol-text">{props.mvpShare.toFixed(1)}%</em>
        </div>
        <div className="mt-2 grid grid-cols-[44px_40px_1fr_50px] items-center gap-2.5 text-[13px]">
          <span className="rounded bg-lol-violet px-2 py-0.5 text-[10.5px] font-bold tracking-wider text-[#150c33]">
            ACE
          </span>
          <b className="text-right font-display font-semibold tabular-nums">{props.aceCount}</b>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
            <i className="block h-full bg-lol-violet" style={{ width: `${props.aceShare}%` }} />
          </div>
          <em className="text-right not-italic text-lol-text">{props.aceShare.toFixed(1)}%</em>
        </div>
      </div>

      <div className="flex flex-col rounded-2xl border border-lol-border bg-[linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] p-5">
        <h2 className="mb-4 font-display text-[16px] font-semibold text-lol-text-bright">
          Average K/D/A
        </h2>
        <div className="font-display text-[36px] font-bold leading-none">
          <span className="text-lol-gold">{props.avgKills.toFixed(1)}</span>
          <span className="mx-1.5 font-medium text-lol-text">/</span>
          <span className="text-lol-loss">{props.avgDeaths.toFixed(1)}</span>
          <span className="mx-1.5 font-medium text-lol-text">/</span>
          <span className="text-lol-assist">{props.avgAssists.toFixed(1)}</span>
        </div>
        <div className="mt-1.5 text-[13px] text-lol-text">
          <b className="font-display text-[13px] font-semibold text-lol-win">
            {props.kdaRatio.toFixed(2)} KDA
          </b>{" "}
          from {props.killsTotal.toLocaleString("en-US")} /{" "}
          {props.deathsTotal.toLocaleString("en-US")} / {props.assistsTotal.toLocaleString("en-US")}{" "}
          in total
        </div>
        <div className="mt-4 grid grid-cols-3 gap-x-3 gap-y-3.5 border-t border-lol-border/40 pt-4">
          <div>
            <b className="block font-display text-[16px] font-semibold text-lol-loss">
              {fmt(props.avgDamageDealt)}
            </b>
            <span className="block text-[12px] leading-snug text-lol-text">
              Damage dealt
              <br />
              {fmt(props.damageDealtTotal)} total
            </span>
          </div>
          <div>
            <b className="block font-display text-[16px] font-semibold text-lol-assist">
              {fmt(props.avgDamageTaken)}
            </b>
            <span className="block text-[12px] leading-snug text-lol-text">
              Damage taken
              <br />
              {fmt(props.damageTakenTotal)} total
            </span>
          </div>
          <div>
            <b className="block font-display text-[16px] font-semibold text-lol-win">
              {fmt(props.avgHealed)}
            </b>
            <span className="block text-[12px] leading-snug text-lol-text">
              Healed
              <br />
              {fmt(props.healedTotal)} total
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
              {fmt(props.avgGold)}
            </b>
            <span className="block text-[12px] leading-snug text-lol-text">
              Gold per game
              <br />
              {fmt(props.goldTotal)} total
            </span>
          </div>
          <div>
            <b className="block font-display text-[16px] font-semibold text-lol-text-bright">
              {fmtSec(props.avgGameLengthSec)}
            </b>
            <span className="block text-[12px] leading-snug text-lol-text">Average length</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col rounded-2xl border border-lol-border bg-[linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] p-5">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-[16px] font-semibold text-lol-text-bright">
            Multikills
          </h2>
          <b className="font-display text-[24px] font-bold text-lol-gold">
            {props.multikillsTotal.toLocaleString("en-US")}
          </b>
        </div>
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
            const share = row.data.games > 0 ? (row.data.games / totalGamesSafe) * 100 : 0;
            return (
              <div key={row.key} className="mb-3">
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
                  <em className="text-right not-italic">{Math.round(share)}%</em>
                </div>
                <div className="mt-1 grid grid-cols-[80px_1fr_48px] gap-2.5">
                  <span />
                  <div className="h-[5px] overflow-hidden rounded-full bg-white/[0.05]">
                    <i className={`block h-full ${row.barClass}`} style={{ width: `${share}%` }} />
                  </div>
                  <span />
                </div>
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}
