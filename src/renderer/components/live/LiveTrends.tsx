import type { LiveHistoryPoint, TeamPoint } from "../../hooks/useLiveFull";
import { compact, fmtClock } from "../../lib/live";
import { Panel } from "../Panel";
import { SIDE, Title } from "./shared";

const W = 300;
const H = 84;

type Metric = { label: string; pick: (t: TeamPoint) => number; fmt: (v: number) => string };

const METRICS: Metric[] = [
  { label: "Kill lead", pick: (t) => t.kills, fmt: (v) => String(Math.round(v)) },
  { label: "Item value lead", pick: (t) => t.itemValue, fmt: compact },
  { label: "CS lead", pick: (t) => t.cs, fmt: (v) => String(Math.round(v)) },
];

// Your team minus the enemy at every sampled moment: above the line you are ahead, below it behind
function LeadChart({
  metric,
  history,
  allyTeam,
}: {
  metric: Metric;
  history: LiveHistoryPoint[];
  allyTeam: "ORDER" | "CHAOS";
}) {
  const enemyTeam = allyTeam === "ORDER" ? "CHAOS" : "ORDER";
  const diffs = history.map((h) => metric.pick(h[allyTeam]) - metric.pick(h[enemyTeam]));
  const last = diffs[diffs.length - 1] ?? 0;
  const span = Math.max(1, ...diffs.map(Math.abs));
  const t0 = history[0].t;
  const tSpan = Math.max(1, history[history.length - 1].t - t0);
  const x = (t: number) => ((t - t0) / tSpan) * W;
  const y = (v: number) => H / 2 - (v / span) * (H / 2 - 4);
  const points = history.map((h, i) => `${x(h.t).toFixed(1)},${y(diffs[i]).toFixed(1)}`).join(" ");
  const tone = last > 0 ? SIDE.ally.text : last < 0 ? SIDE.enemy.text : "text-lol-text-bright";

  return (
    <div className="rounded-xl border border-lol-border/60 bg-black/25 p-3">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="font-display text-[10px] font-bold uppercase tracking-widest text-lol-text">
          {metric.label}
        </span>
        <b className={`font-display text-[15px] tabular-nums ${tone}`}>
          {last > 0 ? "+" : last < 0 ? "-" : ""}
          {metric.fmt(Math.abs(last))}
        </b>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[84px] w-full" preserveAspectRatio="none">
        <line
          x1="0"
          x2={W}
          y1={H / 2}
          y2={H / 2}
          stroke="currentColor"
          strokeDasharray="3 4"
          className="text-lol-text/30"
        />
        <polyline
          points={points}
          fill="none"
          strokeWidth="2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          stroke={last >= 0 ? SIDE.ally.var : SIDE.enemy.var}
        />
      </svg>
      <div className="flex justify-between text-[10.5px] text-lol-text/60">
        <span>{fmtClock(t0)}</span>
        <span>{fmtClock(history[history.length - 1].t)}</span>
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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {METRICS.map((m) => (
            <LeadChart key={m.label} metric={m} history={history} allyTeam={allyTeam} />
          ))}
        </div>
      )}
    </Panel>
  );
}
