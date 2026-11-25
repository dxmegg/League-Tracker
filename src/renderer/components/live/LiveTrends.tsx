import type { LiveHistoryPoint, TeamPoint } from "../../hooks/useLiveFull";
import { compact, fmtClock } from "../../lib/live";
import { Panel } from "../Panel";
import { SIDE, Title } from "./shared";

const W = 300;
const H = 96;

type Metric = {
  label: string;
  // What the number is, in words, for the line under the title
  about: string;
  unit: string;
  pick: (t: TeamPoint) => number;
  fmt: (v: number) => string;
};

const METRICS: Metric[] = [
  {
    label: "Kill lead",
    about: "Your team's kills minus the enemy team's kills.",
    unit: "kills",
    pick: (t) => t.kills,
    fmt: (v) => String(Math.round(v)),
  },
  {
    label: "Item value lead",
    about: "Gold worth of items your team owns minus the enemy team's.",
    unit: "gold",
    pick: (t) => t.itemValue,
    fmt: compact,
  },
  {
    label: "CS lead",
    about: "Minions your team has killed minus the enemy team's.",
    unit: "CS",
    pick: (t) => t.cs,
    fmt: (v) => String(Math.round(v)),
  },
];

const signed = (v: number, fmt: (n: number) => string) =>
  `${v > 0 ? "+" : v < 0 ? "-" : ""}${fmt(Math.abs(v))}`;

// Your team minus the enemy at every sampled moment: above the line you are ahead, below it behind
function LeadChart({
  metric,
  history,
  allyTeam,
  short,
}: {
  metric: Metric;
  history: LiveHistoryPoint[];
  allyTeam: "ORDER" | "CHAOS";
  // Too little was recorded for a line to say anything, so show the numbers only
  short: boolean;
}) {
  const enemyTeam = allyTeam === "ORDER" ? "CHAOS" : "ORDER";
  const diffs = history.map((h) => metric.pick(h[allyTeam]) - metric.pick(h[enemyTeam]));
  const last = diffs[diffs.length - 1] ?? 0;
  const span = Math.max(1, ...diffs.map(Math.abs));
  const t0 = history[0].t;
  const tEnd = history[history.length - 1].t;
  const tSpan = Math.max(1, tEnd - t0);
  const mid = H / 2;
  const x = (t: number) => ((t - t0) / tSpan) * W;
  const y = (v: number) => mid - (v / span) * (mid - 6);
  const coords = history.map((h, i) => `${x(h.t).toFixed(1)},${y(diffs[i]).toFixed(1)}`);
  const line = coords.join(" ");
  const area = `M0,${mid} L${coords.join(" L")} L${W},${mid} Z`;
  const tone = last > 0 ? SIDE.ally.text : last < 0 ? SIDE.enemy.text : "text-lol-text-bright";
  const id = metric.label.replace(/\W+/g, "-").toLowerCase();

  // Best and worst moments, so the line has something to be read against
  let hi = 0;
  let lo = 0;
  diffs.forEach((d, i) => {
    if (d > diffs[hi]) hi = i;
    if (d < diffs[lo]) lo = i;
  });
  // "1 kill", "8 kills"; gold and CS keep their unit as it is
  const unitFor = (v: number) => (metric.unit === "kills" && v === 1 ? "kill" : metric.unit);
  const verdict =
    last > 0
      ? `Your team finished ahead by ${metric.fmt(last)} ${unitFor(last)}.`
      : last < 0
        ? `The enemy finished ahead by ${metric.fmt(-last)} ${unitFor(-last)}.`
        : "The teams finished level.";

  return (
    <div className="rounded-xl border border-lol-border/60 bg-black/25 p-3">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-[10px] font-bold uppercase tracking-widest text-lol-text">
          {metric.label}
        </span>
        <b className={`font-display text-[17px] tabular-nums ${tone}`}>
          {signed(last, metric.fmt)}
        </b>
      </div>
      <p className="mb-2 mt-0.5 text-[11.5px] leading-snug text-lol-text">{metric.about}</p>

      {!short && (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-[96px] w-full" preserveAspectRatio="none">
            <defs>
              <clipPath id={`${id}-up`}>
                <rect x="0" y="0" width={W} height={mid} />
              </clipPath>
              <clipPath id={`${id}-down`}>
                <rect x="0" y={mid} width={W} height={mid} />
              </clipPath>
            </defs>
            <path d={area} fill={SIDE.ally.var} fillOpacity="0.18" clipPath={`url(#${id}-up)`} />
            <path d={area} fill={SIDE.enemy.var} fillOpacity="0.18" clipPath={`url(#${id}-down)`} />
            <line
              x1="0"
              x2={W}
              y1={mid}
              y2={mid}
              stroke="currentColor"
              strokeDasharray="3 4"
              className="text-lol-text/40"
            />
            <polyline
              points={line}
              fill="none"
              strokeWidth="2"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              stroke={last >= 0 ? SIDE.ally.var : SIDE.enemy.var}
            />
          </svg>
        </div>
      )}

      {!short && (
        <div className="flex justify-between text-[10.5px] text-lol-text/70">
          <span>{fmtClock(t0)}</span>
          <span>{fmtClock(tEnd)}</span>
        </div>
      )}
      <div className="mt-3 flex flex-col gap-2 border-t border-lol-border/40 pt-3">
        <div className="text-[12.5px] leading-relaxed text-lol-text-bright">{verdict}</div>
        {(diffs[hi] > 0 || diffs[lo] < 0) && (
          <div className="grid grid-cols-2 gap-2">
            {diffs[hi] > 0 && (
              <div className="rounded-lg bg-white/[0.04] px-2.5 py-1.5">
                <div className="text-[10px] font-bold uppercase tracking-widest text-lol-text">
                  Biggest lead
                </div>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <b className={`font-display text-[15px] tabular-nums ${SIDE.ally.text}`}>
                    {signed(diffs[hi], metric.fmt)}
                  </b>
                  <span className="text-[11.5px] tabular-nums text-lol-text">
                    at {fmtClock(history[hi].t)}
                  </span>
                </div>
              </div>
            )}
            {diffs[lo] < 0 && (
              <div className="rounded-lg bg-white/[0.04] px-2.5 py-1.5">
                <div className="text-[10px] font-bold uppercase tracking-widest text-lol-text">
                  Biggest deficit
                </div>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <b className={`font-display text-[15px] tabular-nums ${SIDE.enemy.text}`}>
                    {signed(diffs[lo], metric.fmt)}
                  </b>
                  <span className="text-[11.5px] tabular-nums text-lol-text">
                    at {fmtClock(history[lo].t)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function LiveTrends({
  history,
  allyTeam,
}: {
  history: LiveHistoryPoint[];
  allyTeam: "ORDER" | "CHAOS";
}) {
  const t0 = history[0]?.t ?? 0;
  const tEnd = history[history.length - 1]?.t ?? 0;
  // Fewer than 6 points or under two minutes: a line would be a stub
  const short = history.length < 6 || tEnd - t0 < 120;
  return (
    <Panel variant="tile" accent="var(--color-lol-win)">
      <Title aside={<span className="text-[13px] text-lol-text">Your team vs the enemy</span>}>
        Game flow
      </Title>
      {history.length < 2 ? (
        <p className="text-[12.5px] text-lol-text">
          Collecting data. The charts fill in as the game goes on, a point every few seconds.
        </p>
      ) : (
        <>
          {short && (
            <p className="mb-3 rounded-lg border border-lol-gold/30 bg-lol-gold/10 px-3 py-2 text-[12.5px] text-lol-text-bright">
              Only {Math.round(tEnd - t0)} seconds of this game were recorded ({fmtClock(t0)} to{" "}
              {fmtClock(tEnd)}), which is too little for a chart. The numbers below are the lead at
              that moment. Keep the app open from the start of a game to get the full curve.
            </p>
          )}
          {!short && (
            <p className="mb-3 text-[12.5px] text-lol-text">
              Each chart is your team minus the enemy team over the length of the game. Above the
              dashed line you were <b className={SIDE.ally.text}>ahead</b>, below it the enemy was{" "}
              <b className={SIDE.enemy.text}>ahead</b>. The number at the top right is where it
              ended.
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {METRICS.map((m) => (
              <LeadChart
                key={m.label}
                metric={m}
                history={history}
                allyTeam={allyTeam}
                short={short}
              />
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}
