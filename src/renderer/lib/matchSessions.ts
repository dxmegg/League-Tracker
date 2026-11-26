import type { MatchListItem } from "../../shared/api";

// A game played before this hour still belongs to the previous evening
const DAY_START_HOUR = 5;
// Games further apart than this (end of one to start of the next) are separate sessions
const SESSION_GAP_MS = 90 * 60_000;

export interface GroupStats {
  games: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
  avgScore: number | null;
  playedSec: number;
}

export interface MatchSession extends GroupStats {
  key: number;
  index: number; // 1-based, oldest session of the day first
  startMs: number;
  endMs: number;
  // The group spans several days, so the session needs its date
  dated: boolean;
  matches: MatchListItem[];
}

export interface MatchDay extends GroupStats {
  key: number;
  label: string;
  dateLabel: string;
  sessions: MatchSession[];
}

function dayStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(d.getHours() - DAY_START_HOUR);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Remakes count as games but stay out of the record and averages
function stats(matches: MatchListItem[]): GroupStats {
  const s: GroupStats = {
    games: matches.length,
    wins: 0,
    losses: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    avgScore: null,
    playedSec: 0,
  };
  let scoreSum = 0;
  let scored = 0;
  for (const m of matches) {
    s.playedSec += m.game_duration;
    if (m.is_remake) continue;
    if (m.win) s.wins++;
    else s.losses++;
    s.kills += m.kills;
    s.deaths += m.deaths;
    s.assists += m.assists;
    if (m.score != null) {
      scoreSum += m.score;
      scored++;
    }
  }
  if (scored > 0) s.avgScore = scoreSum / scored;
  return s;
}

function dayLabels(day: number): { label: string; dateLabel: string } {
  const d = new Date(day);
  const today = new Date(dayStart(Date.now()));
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const dateLabel = d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(d.getFullYear() !== today.getFullYear() && { year: "numeric" }),
  });
  if (d.toDateString() === today.toDateString()) return { label: "Today", dateLabel };
  if (d.toDateString() === yesterday.toDateString()) return { label: "Yesterday", dateLabel };
  return { label: dateLabel, dateLabel: "" };
}

export type SessionGrouping = "day" | "week" | "patch" | "off";

// Monday of the week the game belongs to
function weekStart(ms: number): number {
  const d = new Date(dayStart(ms));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

function groupLabels(grouping: SessionGrouping, id: number | string) {
  if (grouping === "patch") return { label: `Patch ${id}`, dateLabel: "" };
  if (grouping === "week") {
    const date = new Date(id as number).toLocaleDateString(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    return { label: `Week of ${date}`, dateLabel: "" };
  }
  return dayLabels(id as number);
}

// Expects a list ordered by date, newest first or oldest first. Groups follow the
// input order; sessions inside a group are numbered oldest first.
export function groupDaysAndSessions(
  matches: MatchListItem[],
  grouping: Exclude<SessionGrouping, "off"> = "day",
): MatchDay[] {
  const idOf = (m: MatchListItem): number | string =>
    grouping === "patch"
      ? (m.game_version ?? "unknown")
      : grouping === "week"
        ? weekStart(m.game_creation)
        : dayStart(m.game_creation);
  const byGroup: Array<{ id: number | string; matches: MatchListItem[] }> = [];
  for (const m of matches) {
    const id = idOf(m);
    const last = byGroup[byGroup.length - 1];
    if (last && last.id === id) last.matches.push(m);
    else byGroup.push({ id, matches: [m] });
  }

  return byGroup.map(({ id, matches: dayMatches }) => {
    const ordered = [...dayMatches].sort((a, b) => a.game_creation - b.game_creation);
    const chunks: MatchListItem[][] = [];
    for (const m of ordered) {
      const chunk = chunks[chunks.length - 1];
      const prev = chunk?.[chunk.length - 1];
      if (
        prev &&
        m.game_creation - (prev.game_creation + prev.game_duration * 1000) <= SESSION_GAP_MS
      ) {
        chunk.push(m);
      } else {
        chunks.push([m]);
      }
    }
    // Keep the caller's direction inside the day
    const newestFirst =
      dayMatches.length > 1 && dayMatches[0].game_creation > dayMatches[1].game_creation;
    const sessions: MatchSession[] = chunks.map((chunk, i) => ({
      ...stats(chunk),
      key: chunk[0].game_id,
      index: i + 1,
      dated: grouping !== "day",
      startMs: chunk[0].game_creation,
      endMs: chunk[chunk.length - 1].game_creation + chunk[chunk.length - 1].game_duration * 1000,
      matches: newestFirst ? [...chunk].reverse() : chunk,
    }));
    if (newestFirst) sessions.reverse();
    // A patch can come up twice when accounts overlap, so the first game keeps the key unique
    const key = typeof id === "number" ? id : dayMatches[0].game_id;
    return { ...stats(dayMatches), key, ...groupLabels(grouping, id), sessions };
  });
}
