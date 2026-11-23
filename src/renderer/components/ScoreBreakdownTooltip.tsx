import { createPortal } from "react-dom";
import {
  scoreColor,
  type ScoreBreakdown,
  type ScoreComponent,
  type ScoreComponentKey,
} from "../../shared/opScore";

const COMPONENT_LABELS: Record<ScoreComponentKey, string> = {
  kda: "KDA",
  kp: "Kill participation",
  dmg: "Damage dealt",
  taken: "Damage taken",
  heal: "Healing & shields",
  gold: "Gold earned",
  cc: "Crowd control",
  cs: "CS per minute",
  vision: "Vision per minute",
  obj: "Objective damage",
  placement: "Placement",
  contrib: "Team kill share",
};

const SYSTEM_LABELS = { aram: "ARAM", sr: "Rift", arena: "Arena", generic: "Standard" } as const;

const FLAG_LABELS: Record<string, string> = {
  afk: "AFK: score set to 1.0",
  "low-sample": "Short game: score is less reliable",
};

const compact = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v).toString());
// Per-minute rates are small numbers that compact() would round away
const small = (v: number) => (v >= 100 ? compact(v) : v.toFixed(1));

// How the player's stat and its full-credit reference read: kda and the shares are graded against
// fixed caps, rates against a role benchmark, the rest against the lobby's best.
function componentValue(c: ScoreComponent): string {
  if (c.key === "kda") return `${c.value.toFixed(1)} · full credit at 8`;
  if (c.key === "kp" || c.key === "contrib") {
    return `${Math.round(c.value * 100)}% · full credit at ${Math.round(c.reference * 100)}%`;
  }
  if (c.key === "placement") return `${Math.round(c.value * 100)}% of the way to first`;
  if (c.key === "cs" || c.key === "vision")
    return `${small(c.value)} · benchmark ${small(c.reference)}`;
  return `${compact(c.value)} · lobby best ${compact(c.reference)}`;
}

// Top edge colour follows the score, the same way the stat tiles colour theirs
function accentFor(score: number): string {
  if (score >= 9) return "var(--color-lol-gold)";
  if (score >= 7) return "var(--color-lol-assist)";
  if (score >= 5) return "var(--color-lol-win)";
  return "var(--color-lol-text)";
}

function barTone(ratio: number): string {
  if (ratio >= 0.75) return "bg-lol-win";
  if (ratio >= 0.4) return "bg-lol-gold";
  return "bg-lol-loss";
}

function Chip({ label, hint, value }: { label: string; hint?: string; value: string }) {
  return (
    <span
      title={hint}
      className="inline-flex items-baseline gap-1.5 rounded-lg border border-lol-border/60 bg-white/[0.04] px-2 py-1 text-[11px] text-lol-text"
    >
      {label}
      <b className="font-display text-[11.5px] font-semibold tabular-nums text-lol-text-bright">
        {value}
      </b>
    </span>
  );
}

const WIDTH = 344;

export function ScoreBreakdownTooltip({
  breakdown,
  anchor,
}: {
  breakdown: ScoreBreakdown;
  anchor: DOMRect;
}) {
  const adjust = Math.abs(breakdown.adjust) >= 0.05;
  const chips =
    (breakdown.multikill ? 1 : 0) +
    (breakdown.carry ? 1 : 0) +
    (breakdown.win > 0 ? 1 : 0) +
    breakdown.extras.length +
    (adjust ? 1 : 0);
  const height =
    130 + breakdown.components.length * 40 + (chips ? 44 : 0) + breakdown.flags.length * 22;

  // Opens to the right of the cell, or to the left when there is no room; clamped to the viewport
  const room = window.innerWidth - anchor.right - 12 - 8;
  const left = room >= WIDTH ? anchor.right + 12 : Math.max(8, anchor.left - WIDTH - 12);
  const top = Math.min(
    Math.max(anchor.top + anchor.height / 2 - height / 2, 8),
    Math.max(8, window.innerHeight - height - 8),
  );
  const clamped = breakdown.raw !== breakdown.score && (breakdown.raw > 10 || breakdown.raw < 1);
  const accent = accentFor(breakdown.score);
  const weights = breakdown.cls ? `${breakdown.cls} weights` : "Standard weights";

  // A portal, not an inline fixed box: a transformed ancestor (the page-enter animation) turns
  // `fixed` into "relative to that ancestor" and the card's overflow then clips it
  return createPortal(
    <div
      className="pointer-events-none fixed z-[1000] rounded-2xl border border-t-[3px] border-lol-border bg-[#0d0a10]/95 p-4 text-left shadow-[0_28px_70px_-18px_rgba(0,0,0,0.95)] backdrop-blur-xl"
      style={{
        left,
        top,
        width: WIDTH,
        borderTopColor: accent,
        backgroundImage: `radial-gradient(circle at top right, color-mix(in srgb, ${accent} 12%, transparent), transparent 60%)`,
      }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-[10px] font-bold uppercase tracking-widest text-lol-text">
            Score breakdown
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-lol-crimson/40 bg-lol-crimson/10 px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider text-lol-text-bright">
              {SYSTEM_LABELS[breakdown.system]}
            </span>
            <span className="text-[11px] text-lol-text">{weights}</span>
          </div>
        </div>
        <div className="text-right">
          <div
            className={`font-display text-[34px] font-bold leading-none tabular-nums ${scoreColor(breakdown.score)}`}
          >
            {breakdown.score.toFixed(1)}
          </div>
          {breakdown.badge && (
            <span
              className={`mt-1 inline-block rounded px-1.5 py-0.5 font-display text-[9px] font-bold ${
                breakdown.badge === "MVP"
                  ? "bg-amber-400/20 text-amber-300"
                  : "bg-purple-500/20 text-purple-400"
              }`}
            >
              {breakdown.badge}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {breakdown.components.map((c) => (
          <div key={c.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12px] font-semibold text-lol-text-bright">
                {COMPONENT_LABELS[c.key]}
              </span>
              <span className="font-display text-[12px] tabular-nums text-lol-text-bright">
                {c.points.toFixed(1)}
                <span className="text-lol-text/60"> / {c.weight.toFixed(1)}</span>
              </span>
            </div>
            <div className="mt-0.5 text-[10.5px] text-lol-text">{componentValue(c)}</div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.07]">
              <i
                className={`block h-full rounded-full ${barTone(c.ratio)}`}
                style={{ width: `${c.ratio * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {chips > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-lol-border/40 pt-3">
          {breakdown.multikill && (
            <Chip
              label={breakdown.multikill.label}
              value={`+${breakdown.multikill.points.toFixed(1)}`}
            />
          )}
          {breakdown.carry && (
            <Chip
              label="Carry"
              hint={`${breakdown.carry.lead.toFixed(2)}× the next best damage`}
              value={`+${breakdown.carry.points.toFixed(1)}`}
            />
          )}
          {breakdown.extras.map((e) => (
            <Chip key={e.label} label={e.label} value={`+${e.points.toFixed(1)}`} />
          ))}
          {breakdown.win > 0 && <Chip label="Victory" value={`+${breakdown.win.toFixed(1)}`} />}
          {adjust && (
            <Chip
              label="Calibration"
              hint="Keeps the median of all games near 6.0"
              value={`${breakdown.adjust > 0 ? "+" : "−"}${Math.abs(breakdown.adjust).toFixed(1)}`}
            />
          )}
        </div>
      )}

      {breakdown.flags.map((f) => (
        <div key={f} className="mt-2 text-[11px] font-semibold text-lol-gold">
          {FLAG_LABELS[f] ?? f}
        </div>
      ))}

      {clamped && (
        <div className="mt-2 text-[10.5px] text-lol-text">
          Raw total {breakdown.raw.toFixed(2)}, {breakdown.raw > 10 ? "capped" : "floored"} at{" "}
          {breakdown.score.toFixed(1)}
        </div>
      )}
    </div>,
    document.body,
  );
}
