import type { ReactNode } from "react";
import type { GroupStats, MatchDay, MatchSession } from "../lib/matchSessions";
import { formatNumber, formatPlaytime } from "../lib/format";

function Pill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`rounded-md bg-white/[0.05] px-2 py-0.5 font-display text-[12px] font-semibold tabular-nums ${className}`}
    >
      {children}
    </span>
  );
}

function StatPills({ s }: { s: GroupStats }) {
  const kda = s.deaths > 0 ? (s.kills + s.assists) / s.deaths : s.kills + s.assists;
  const decided = s.wins + s.losses;
  return (
    <>
      <Pill className="text-lol-win">{formatNumber(s.wins)}W</Pill>
      <Pill className="text-lol-loss">{formatNumber(s.losses)}L</Pill>
      {decided > 0 && (
        <Pill className="text-lol-text-bright">{Math.round((s.wins / decided) * 100)}% WR</Pill>
      )}
      <Pill className="text-lol-gold">{kda.toFixed(2)} KDA</Pill>
      {s.avgScore != null && <Pill className="text-lol-gold">{s.avgScore.toFixed(1)} score</Pill>}
    </>
  );
}

export function DayHeader({ day }: { day: MatchDay }) {
  return (
    <div className="mb-3 mt-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="h-2 w-2 rotate-45 bg-lol-crimson" aria-hidden="true" />
        <h2 className="font-display text-[19px] font-bold text-lol-text-bright">{day.label}</h2>
        {day.dateLabel && <span className="text-[13px] text-lol-text">{day.dateLabel}</span>}
        <span className="text-[13px] text-lol-text">
          {formatNumber(day.games)} {day.games === 1 ? "game" : "games"} ·{" "}
          {formatPlaytime(day.playedSec)} played
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatPills s={day} />
        </div>
      </div>
      <div className="mt-2 h-[2px] bg-gradient-to-r from-lol-crimson/50 via-lol-crimson/15 to-transparent" />
    </div>
  );
}

function clock(ms: number) {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function SessionHeader({ session, total }: { session: MatchSession; total: number }) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-3 border-l-2 border-lol-gold/50 pl-3">
      <span className="font-display text-[13px] font-bold uppercase tracking-wider text-lol-gold">
        Session {session.index}
        {total > 1 ? ` of ${total}` : ""}
      </span>
      <span className="text-[12.5px] tabular-nums text-lol-text">
        {clock(session.startMs)} – {clock(session.endMs)}
      </span>
      <span className="text-[12.5px] text-lol-text">
        {formatNumber(session.games)} {session.games === 1 ? "game" : "games"}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatPills s={session} />
      </div>
    </div>
  );
}
