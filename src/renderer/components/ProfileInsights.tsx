import { useViewState } from "../hooks/useViewState";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AugmentStats, HomeTimePeriod, MatchListItem } from "../../shared/api";
import { scoreColor } from "../../shared/opScore";
import { getAugmentName, useAugmentData } from "../hooks/useChampions";
import { useScopedQueue } from "../lib/historyScope";
import AugmentIcon from "./AugmentIcon";
import ChampionIcon from "./ChampionIcon";
import { Panel } from "./Panel";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// A pause longer than this ends a session
const SESSION_GAP_MS = 90 * 60_000;
const SESSIONS_SHOWN = 11;
const AUGMENTS_COLLAPSED = 10;
// Name column is capped so Picks sits right beside it and the champions fill the middle
const AUGMENT_COLS =
  "grid-cols-[minmax(130px,1.3fr)_52px_minmax(164px,1fr)_minmax(110px,1.1fr)_64px_76px_minmax(100px,1fr)_44px]";

const RARITIES = [
  {
    key: "kPrismatic",
    label: "Prismatic",
    dot: "bg-fuchsia-400",
    text: "text-fuchsia-300",
  },
  {
    key: "kGold",
    label: "Gold",
    dot: "bg-yellow-400",
    text: "text-yellow-300",
  },
  {
    key: "kSilver",
    label: "Silver",
    dot: "bg-slate-300",
    text: "text-slate-200",
  },
];

type AugmentSort = "picks" | "winrate" | "score";
const SORTS: Array<{ id: AugmentSort; label: string }> = [
  { id: "picks", label: "Most picked" },
  { id: "winrate", label: "Win rate" },
  { id: "score", label: "Score" },
];

function Title({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
      <h2 className="flex items-center gap-2 font-display text-[12px] font-bold uppercase tracking-widest text-lol-gold">
        <i className="block h-3.5 w-[3px] rounded-full bg-lol-crimson" aria-hidden="true" />
        {children}
      </h2>
      {aside}
    </div>
  );
}

const rate = (wins: number, games: number) => (games > 0 ? (wins / games) * 100 : 0);
const rateColor = (r: number) => (r >= 50 ? "text-lol-win" : "text-lol-loss");

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1 font-display text-[11.5px] font-semibold transition-colors ${
        active
          ? "border-lol-crimson/60 bg-lol-crimson/20 text-lol-text-bright"
          : "border-lol-border/60 bg-lol-card/40 text-lol-text hover:text-lol-text-bright"
      }`}
    >
      {children}
    </button>
  );
}

export function ProfileAugments({
  account,
  timePeriod,
}: {
  account: string;
  timePeriod: HomeTimePeriod;
}) {
  const queue = useScopedQueue(undefined);
  const augmentData = useAugmentData(undefined);
  const [stats, setStats] = useState<AugmentStats[] | null>(null);
  const [rarity, setRarity] = useViewState<string | null>("profile.augRarity", null);
  const [sort, setSort] = useViewState<AugmentSort>("profile.augSort", "picks");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStats(null);
    window.api
      .getAugmentStats(undefined, undefined, queue, account, timePeriod)
      .then((rows) => {
        if (!cancelled) setStats(rows);
      })
      .catch(() => {
        if (!cancelled) setStats([]);
      });
    return () => {
      cancelled = true;
    };
  }, [account, timePeriod, queue]);

  const rows = useMemo(() => {
    const filtered = (stats ?? []).filter(
      (s) => !rarity || augmentData[s.augment_id]?.rarity === rarity,
    );
    // Win rate and score over one or two picks are noise, so those sorts need a small sample
    const pool = sort === "picks" ? filtered : filtered.filter((s) => s.picks >= 3);
    const key = (s: AugmentStats) =>
      sort === "winrate" ? rate(s.wins, s.picks) : sort === "score" ? (s.avgScore ?? -1) : s.picks;
    return [...pool].sort((a, b) => key(b) - key(a) || b.picks - a.picks);
  }, [stats, rarity, sort, augmentData]);

  const maxPicks = Math.max(1, ...(stats ?? []).map((s) => s.picks));
  // Win rate over every augment pick, the baseline for the "vs average" column
  const overallRate = rate(
    (stats ?? []).reduce((sum, s) => sum + s.wins, 0),
    (stats ?? []).reduce((sum, s) => sum + s.picks, 0),
  );
  // Signature pick, best win rate and best score, the last two only over augments with a real sample
  const highlights = useMemo(() => {
    const all = stats ?? [];
    const sampled = all.filter((s) => s.picks >= 5);
    const top = (rows: AugmentStats[], key: (s: AugmentStats) => number) =>
      rows.length ? rows.reduce((a, b) => (key(b) > key(a) ? b : a)) : undefined;
    const signature = top(all, (s) => s.picks);
    const winning = top(sampled, (s) => rate(s.wins, s.picks));
    const scorer = top(sampled, (s) => s.avgScore ?? -1);
    const weakest = top(sampled, (s) => -rate(s.wins, s.picks));
    const kdaOf = (s: AugmentStats) =>
      s.kills != null && s.deaths != null && s.assists != null
        ? (s.kills + s.assists) / Math.max(s.deaths, 1)
        : -1;
    const killer = top(sampled, kdaOf);
    const good = "text-lol-crimson-bright";
    return [
      signature && {
        label: "Signature pick",
        tone: good,
        row: signature,
        detail: `${signature.picks} picks · ${rate(signature.wins, signature.picks).toFixed(0)}% win rate`,
      },
      winning && {
        label: "Winning edge",
        tone: good,
        row: winning,
        detail: `${rate(winning.wins, winning.picks).toFixed(0)}% win rate over ${winning.picks} picks`,
      },
      scorer && {
        label: "Top scorer",
        tone: good,
        row: scorer,
        detail: `${(scorer.avgScore ?? 0).toFixed(1)} average score over ${scorer.picks} picks`,
      },
      killer &&
        kdaOf(killer) >= 0 && {
          label: "Best KDA",
          tone: good,
          row: killer,
          detail: `${kdaOf(killer).toFixed(2)} KDA over ${killer.picks} picks`,
        },
      weakest && {
        label: "Weakest pick",
        tone: "text-lol-loss",
        row: weakest,
        detail: `${rate(weakest.wins, weakest.picks).toFixed(0)}% win rate over ${weakest.picks} picks`,
      },
    ].filter((h): h is Exclude<typeof h, false | undefined> => Boolean(h));
  }, [stats]);
  const rarityPicks = useMemo(() => {
    const rows = RARITIES.map((r) => ({
      ...r,
      picks: (stats ?? [])
        .filter((s) => augmentData[s.augment_id]?.rarity === r.key)
        .reduce((sum, s) => sum + s.picks, 0),
    }));
    return { rows, total: rows.reduce((sum, r) => sum + r.picks, 0) };
  }, [stats, augmentData]);
  const visible = showAll ? rows : rows.slice(0, AUGMENTS_COLLAPSED);

  return (
    <div className="grid grid-cols-1 gap-5 min-[1800px]:grid-cols-[minmax(0,2.3fr)_minmax(0,1fr)]">
      <Panel variant="tile" className="flex flex-col">
        <Title
          aside={<span className="text-[13px] text-lol-text">{stats?.length ?? 0} unique</span>}
        >
          Augments
        </Title>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Chip active={rarity === null} onClick={() => setRarity(null)}>
            All
          </Chip>
          {RARITIES.map((r) => (
            <Chip key={r.key} active={rarity === r.key} onClick={() => setRarity(r.key)}>
              <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${r.dot}`} />
              {r.label}
            </Chip>
          ))}
          <span className="mx-1 h-4 w-px bg-lol-border/60" />
          {SORTS.map((s) => (
            <Chip key={s.id} active={sort === s.id} onClick={() => setSort(s.id)}>
              {s.label}
            </Chip>
          ))}
        </div>

        {stats === null ? (
          <p className="py-8 text-center text-sm text-lol-text">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-lol-text">No augments for this selection.</p>
        ) : (
          <>
            <div
              className={`grid ${AUGMENT_COLS} items-center gap-x-3 px-2 pb-1.5 font-display text-[10px] font-bold uppercase tracking-widest text-lol-text`}
            >
              <span>Augment</span>
              <span className="text-right">Picks</span>
              <span>Most played on</span>
              <span>Win rate</span>
              <span>vs avg</span>
              <span>Record</span>
              <span>Avg K / D / A</span>
              <span className="text-right">Score</span>
            </div>
            <div className="flex flex-col gap-1">
              {visible.map((s) => {
                const wr = rate(s.wins, s.picks);
                const meta = augmentData[s.augment_id];
                const tone = RARITIES.find((r) => r.key === meta?.rarity);
                return (
                  <div
                    key={s.augment_id}
                    title={meta?.desc?.replace(/<[^>]+>/g, "")}
                    className={`grid ${AUGMENT_COLS} items-center gap-x-3 rounded-lg bg-white/[0.03] px-2 py-1.5 transition-colors hover:bg-white/[0.07]`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <AugmentIcon augmentId={s.augment_id} size={32} />
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold text-lol-text-bright">
                          {getAugmentName(augmentData, s.augment_id)}
                        </div>
                        {tone && (
                          <div className={`text-[10.5px] font-semibold ${tone.text}`}>
                            {tone.label}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-display text-[13px] text-lol-text-bright">
                        {s.picks}×
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <i
                          className="block h-full rounded-full bg-lol-crimson"
                          style={{ width: `${(s.picks / maxPicks) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {(s.champions ?? []).map((c) => (
                        <div
                          key={c.champion_id}
                          title={`${c.picks}× picked`}
                          className="flex flex-col items-center"
                        >
                          <ChampionIcon
                            championId={c.champion_id}
                            size={26}
                            className="rounded-md"
                          />
                          <span className="font-display text-[10.5px] font-semibold leading-tight text-lol-text-bright">
                            {c.picks}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <b className={`w-10 font-display text-[13px] ${rateColor(wr)}`}>
                        {wr.toFixed(0)}%
                      </b>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-lol-loss/40">
                        <i className="block h-full bg-lol-win" style={{ width: `${wr}%` }} />
                      </div>
                    </div>
                    <b
                      className={`whitespace-nowrap font-display text-[12.5px] tabular-nums ${wr >= overallRate ? "text-lol-win" : "text-lol-loss"}`}
                    >
                      {wr >= overallRate ? "+" : ""}
                      {(wr - overallRate).toFixed(1)} pp
                    </b>
                    <div className="whitespace-nowrap font-display text-[12px] tabular-nums">
                      <span className="text-lol-win">{s.wins}W</span>{" "}
                      <span className="text-lol-loss">{s.picks - s.wins}L</span>
                    </div>
                    <div className="whitespace-nowrap">
                      {s.kills != null && s.deaths != null && s.assists != null ? (
                        <>
                          <div className="font-display text-[12.5px] tabular-nums text-lol-text-bright">
                            {s.kills.toFixed(1)} /{" "}
                            <span className="text-lol-loss">{s.deaths.toFixed(1)}</span> /{" "}
                            {s.assists.toFixed(1)}
                          </div>
                          <div className="text-[10.5px] text-lol-text">
                            {((s.kills + s.assists) / Math.max(s.deaths, 1)).toFixed(2)} KDA
                          </div>
                        </>
                      ) : (
                        <span className="text-lol-text">—</span>
                      )}
                    </div>
                    <b
                      className={`text-right font-display text-[13px] ${s.avgScore != null ? scoreColor(s.avgScore) : "text-lol-text"}`}
                    >
                      {s.avgScore != null ? s.avgScore.toFixed(1) : "—"}
                    </b>
                  </div>
                );
              })}
            </div>
            {rows.length > AUGMENTS_COLLAPSED && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="mx-auto mt-3 rounded-lg border border-lol-border bg-lol-card px-4 py-1.5 text-[12.5px] font-medium text-lol-text-bright transition-colors hover:border-lol-crimson"
              >
                {showAll ? "Show less" : `Show all ${rows.length}`}
              </button>
            )}
          </>
        )}
      </Panel>

      <Panel variant="tile" className="flex flex-col">
        <Title>Highlights</Title>
        <div className="flex flex-1 flex-col gap-3">
          {highlights.map((h) => (
            <div
              key={h.label}
              className="flex flex-1 items-center gap-3 rounded-xl border border-lol-border/60 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--theme-crimson)_12%,transparent),transparent_70%)] px-3.5 py-3"
            >
              <AugmentIcon augmentId={h.row.augment_id} size={44} />
              <div className="min-w-0">
                <div
                  className={`font-display text-[10px] font-bold uppercase tracking-widest ${h.tone}`}
                >
                  {h.label}
                </div>
                <div className="truncate font-display text-[14px] font-semibold text-lol-text-bright">
                  {getAugmentName(augmentData, h.row.augment_id)}
                </div>
                <div className="text-[12px] text-lol-text">{h.detail}</div>
              </div>
            </div>
          ))}
          {rarityPicks.total > 0 && (
            <div className="rounded-xl border border-lol-border/50 bg-black/20 px-3.5 py-3">
              <div className="mb-2 font-display text-[10px] font-bold uppercase tracking-widest text-lol-text">
                Picks by rarity
              </div>
              {rarityPicks.rows.map((r) => (
                <div
                  key={r.key}
                  className="grid grid-cols-[76px_1fr_44px] items-center gap-2 py-0.5 text-[12.5px]"
                >
                  <span className={`font-semibold ${r.text}`}>{r.label}</span>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <i
                      className={`block h-full rounded-full ${r.dot}`}
                      style={{
                        width: `${(r.picks / rarityPicks.total) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-right tabular-nums text-lol-text">
                    {((r.picks / rarityPicks.total) * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

type Session = { start: number; end: number; games: MatchListItem[] };

// Real games only, oldest first
function loadGames(matches: MatchListItem[]): MatchListItem[] {
  // The combined view lists a game once per tracked account
  const seen = new Set<number>();
  return matches
    .filter((m) => !m.is_remake && !seen.has(m.game_id) && seen.add(m.game_id))
    .sort((a, b) => a.game_creation - b.game_creation);
}

function buildSessions(games: MatchListItem[]): Session[] {
  const sessions: Session[] = [];
  for (const game of games) {
    const end = game.game_creation + game.game_duration * 1000;
    const last = sessions[sessions.length - 1];
    if (last && game.game_creation - last.end <= SESSION_GAP_MS) {
      last.games.push(game);
      last.end = end;
    } else {
      sessions.push({ start: game.game_creation, end, games: [game] });
    }
  }
  return sessions;
}

const avgScore = (games: MatchListItem[]) => {
  const scored = games.filter((g) => g.score != null);
  return scored.length ? scored.reduce((sum, g) => sum + (g.score ?? 0), 0) / scored.length : null;
};
const kdaOf = (games: MatchListItem[]) => {
  const k = games.reduce((s, g) => s + g.kills + g.assists, 0);
  const d = games.reduce((s, g) => s + g.deaths, 0);
  return games.length ? k / Math.max(1, d) : null;
};
const winsOf = (games: MatchListItem[]) => games.filter((g) => g.win).length;
const avgOf = (
  games: MatchListItem[],
  key: "kills" | "deaths" | "assists" | "total_damage_dealt",
) => (games.length ? games.reduce((s, g) => s + g[key], 0) / games.length : null);
const avgLengthMin = (games: MatchListItem[]) =>
  games.length ? games.reduce((s, g) => s + g.game_duration, 0) / games.length / 60 : null;

const fmtDuration = (min: number) =>
  min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min} min`;

const shortDay = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function SessionRow({ session }: { session: Session }) {
  const wins = winsOf(session.games);
  const losses = session.games.length - wins;
  const score = avgScore(session.games);
  const day = new Date(session.start).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return (
    <div
      className={`rounded-lg border-l-[3px] bg-white/[0.03] px-3 py-2 ${wins >= losses ? "border-lol-win" : "border-lol-loss"}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-[13px] font-semibold text-lol-text-bright">{day}</span>
        <span className="text-[11.5px] tabular-nums text-lol-text">
          {fmtTime(session.start)}–{fmtTime(session.end)} ·{" "}
          {fmtDuration(Math.round((session.end - session.start) / 60_000))}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
          {session.games.slice(0, 14).map((g) => (
            <span
              key={g.game_id}
              className={`rounded-md p-px ${g.win ? "bg-lol-win/60" : "bg-lol-loss/60"}`}
              title={g.win ? "Win" : "Loss"}
            >
              <ChampionIcon championId={g.champion_id} size={22} className="rounded-[5px]" />
            </span>
          ))}
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-[13px] text-lol-text-bright">
            <span className="text-lol-win">{wins}W</span>{" "}
            <span className="text-lol-loss">{losses}L</span>
          </div>
          <div className="text-[11px] text-lol-text">
            {score != null ? (
              <span className={scoreColor(score)}>score {score.toFixed(1)}</span>
            ) : (
              "—"
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const PERIOD_MS: Partial<Record<HomeTimePeriod, number>> = {
  "24h": DAY,
  "7d": 7 * DAY,
  "30d": 30 * DAY,
};

function Delta({
  value,
  suffix = "",
  digits = 1,
  lowerBetter = false,
  neutral = false,
}: {
  value: number | null;
  suffix?: string;
  digits?: number;
  // Deaths going down is an improvement; neutral stats (game count, length) get no verdict colour
  lowerBetter?: boolean;
  neutral?: boolean;
}) {
  if (value == null || Math.abs(value) < 0.05)
    return <span className="text-[12px] text-lol-text">no change</span>;
  const up = value > 0;
  const good = lowerBetter ? !up : up;
  const tone = neutral
    ? "bg-white/[0.07] text-lol-text-bright"
    : good
      ? "bg-lol-win/15 text-lol-win"
      : "bg-lol-loss/15 text-lol-loss";
  return (
    <span
      className={`whitespace-nowrap rounded-md px-2 py-1 font-display text-[13px] font-semibold ${tone}`}
    >
      {up ? "▲" : "▼"} {Math.abs(value).toFixed(digits)}
      {suffix}
    </span>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const SLOTS = [
  { label: "00–04", from: 0, to: 4 },
  { label: "04–08", from: 4, to: 8 },
  { label: "08–12", from: 8, to: 12 },
  { label: "12–16", from: 12, to: 16 },
  { label: "16–20", from: 16, to: 20 },
  { label: "20–24", from: 20, to: 24 },
];

// Sessions, period-over-period comparison and time-of-day form all read the same list of games.
// shortcut: reads the newest 1500 games of the scope, enough for the 30d comparison; raise it for heavier accounts.
export function ProfilePlayInsights({
  account,
  timePeriod,
}: {
  account: string;
  timePeriod: HomeTimePeriod;
}) {
  const queue = useScopedQueue(undefined);
  const [games, setGames] = useState<MatchListItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setGames(null);
    window.api
      .getMatchHistory(1500, 0, { account, queue })
      .then((res) => {
        if (!cancelled) setGames(loadGames(res.matches));
      })
      .catch(() => {
        if (!cancelled) setGames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [account, queue]);

  const sessions = useMemo(() => (games ? buildSessions(games).reverse() : []), [games]);
  // Best session needs a few games, or a lone 1-0 would always win
  const records = useMemo(() => {
    if (sessions.length === 0) return null;
    const pickMax = (list: Session[], key: (s: Session) => number) =>
      list.reduce((a, b) => (key(b) > key(a) ? b : a));
    const sample = sessions.filter((s) => s.games.length >= 5);
    return {
      most: pickMax(sessions, (s) => s.games.length),
      longest: pickMax(sessions, (s) => s.end - s.start),
      best: pickMax(sample.length ? sample : sessions, (s) =>
        rate(winsOf(s.games), s.games.length),
      ),
    };
  }, [sessions]);

  // "Full" has no previous period, so it compares the last 30 days with the 30 before
  const span = PERIOD_MS[timePeriod] ?? 30 * DAY;
  const spanLabel = timePeriod === "full" ? "30d" : timePeriod;
  const compare = useMemo(() => {
    if (!games) return null;
    const now = Date.now();
    const cur = games.filter((g) => g.game_creation >= now - span);
    const prev = games.filter(
      (g) => g.game_creation >= now - 2 * span && g.game_creation < now - span,
    );
    return { cur, prev };
  }, [games, span]);

  const slots = useMemo(
    () =>
      SLOTS.map((slot) => {
        const inSlot = (games ?? []).filter((g) => {
          const h = new Date(g.game_creation).getHours();
          return h >= slot.from && h < slot.to;
        });
        return { ...slot, games: inSlot.length, wins: winsOf(inSlot) };
      }),
    [games],
  );
  const bestSlot = [...slots]
    .filter((s) => s.games >= 10)
    .sort((a, b) => rate(b.wins, b.games) - rate(a.wins, a.games))[0];

  // Weekday form, Monday first; getDay() counts from Sunday
  const weekdays = useMemo(
    () =>
      WEEKDAYS.map((label, i) => {
        const inDay = (games ?? []).filter(
          (g) => (new Date(g.game_creation).getDay() + 6) % 7 === i,
        );
        return { label, games: inDay.length, wins: winsOf(inDay) };
      }),
    [games],
  );
  const slotStats = (() => {
    const played = slots.filter((s) => s.games >= 10);
    if (played.length === 0) return null;
    const byRate = [...played].sort((a, b) => rate(b.wins, b.games) - rate(a.wins, a.games));
    const busiest = [...slots].sort((a, b) => b.games - a.games)[0];
    return { best: byRate[0], worst: byRate[byRate.length - 1], busiest };
  })();

  const metric = (
    label: string,
    cur: number | null,
    prev: number | null,
    fmt: (n: number) => string,
    opts: {
      suffix?: string;
      digits?: number;
      lowerBetter?: boolean;
      neutral?: boolean;
    } = {},
  ) => {
    // Two-column grid of small cards: the old full-width rows left a wide gap between label and value
    return (
      <div
        key={label}
        className="flex flex-col justify-between gap-3 rounded-xl border border-lol-border/50 bg-black/20 px-4 py-3"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-display text-[10.5px] font-bold uppercase tracking-widest text-lol-text">
            {label}
          </span>
          <Delta
            value={cur != null && prev != null ? cur - prev : null}
            suffix={opts.suffix}
            digits={opts.digits}
            lowerBetter={opts.lowerBetter}
            neutral={opts.neutral}
          />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[26px] font-semibold leading-none text-lol-text-bright">
            {cur != null ? fmt(cur) : "—"}
          </span>
          <span className="text-[12px] text-lol-text">was {prev != null ? fmt(prev) : "—"}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.3fr_1fr]">
      <Panel variant="tile" accent="var(--color-lol-assist)">
        <Title
          aside={
            <span
              title="A pause longer than 90 minutes starts a new session"
              className="text-[13px] text-lol-text"
            >
              {sessions.length} total · avg{" "}
              {games && sessions.length ? (games.length / sessions.length).toFixed(1) : "0"} games
            </span>
          }
        >
          Sessions
        </Title>
        {games === null ? (
          <p className="py-8 text-center text-sm text-lol-text">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="py-8 text-center text-sm text-lol-text">No games yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {records && (
              <div className="mb-1 grid grid-cols-3 gap-2">
                {[
                  [
                    "Record games",
                    String(records.most.games.length),
                    `${shortDay(records.most.start)}`,
                    "text-lol-gold",
                  ],
                  [
                    "Longest session",
                    fmtDuration(Math.round((records.longest.end - records.longest.start) / 60_000)),
                    shortDay(records.longest.start),
                    "text-lol-assist",
                  ],
                  [
                    "Best session",
                    `${winsOf(records.best.games)}W ${records.best.games.length - winsOf(records.best.games)}L`,
                    `${shortDay(records.best.start)} · ${rate(winsOf(records.best.games), records.best.games.length).toFixed(0)}%`,
                    "text-lol-win",
                  ],
                ].map(([label, value, sub, tone]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-lol-border/50 bg-black/20 px-3 py-2"
                  >
                    <div className="font-display text-[10px] font-bold uppercase tracking-widest text-lol-text">
                      {label}
                    </div>
                    <b className={`font-display text-[20px] font-bold leading-tight ${tone}`}>
                      {value}
                    </b>
                    <div className="text-[11px] text-lol-text">{sub}</div>
                  </div>
                ))}
              </div>
            )}
            {sessions.slice(0, SESSIONS_SHOWN).map((s) => (
              <SessionRow key={s.start} session={s} />
            ))}
          </div>
        )}
      </Panel>

      <div className="flex flex-col gap-5">
        <Panel variant="tile" accent="var(--color-lol-win)">
          <Title
            aside={
              <span className="text-[13px] text-lol-text">
                last {spanLabel} vs previous {spanLabel}
              </span>
            }
          >
            Period comparison
          </Title>
          {compare === null ? (
            <p className="py-6 text-center text-sm text-lol-text">Loading…</p>
          ) : compare.cur.length === 0 ? (
            <p className="py-6 text-center text-sm text-lol-text">
              No games in the last {spanLabel}.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {metric("Games", compare.cur.length, compare.prev.length, (n) => String(n), {
                digits: 0,
                neutral: true,
              })}
              {metric("Wins", winsOf(compare.cur), winsOf(compare.prev), (n) => String(n), {
                digits: 0,
              })}
              {metric(
                "Win rate",
                rate(winsOf(compare.cur), compare.cur.length),
                compare.prev.length ? rate(winsOf(compare.prev), compare.prev.length) : null,
                (n) => `${n.toFixed(1)}%`,
                { suffix: " pp" },
              )}
              {metric(
                "KDA",
                kdaOf(compare.cur),
                compare.prev.length ? kdaOf(compare.prev) : null,
                (n) => n.toFixed(2),
                { digits: 2 },
              )}
              {metric(
                "Avg score",
                avgScore(compare.cur),
                compare.prev.length ? avgScore(compare.prev) : null,
                (n) => n.toFixed(1),
              )}
              {metric(
                "Deaths per game",
                avgOf(compare.cur, "deaths"),
                avgOf(compare.prev, "deaths"),
                (n) => n.toFixed(1),
                {
                  lowerBetter: true,
                },
              )}
              {metric(
                "Damage per game",
                avgOf(compare.cur, "total_damage_dealt"),
                avgOf(compare.prev, "total_damage_dealt"),
                (n) => Math.round(n).toLocaleString("fr-FR"),
                { digits: 0 },
              )}
              {metric(
                "Game length",
                avgLengthMin(compare.cur),
                avgLengthMin(compare.prev),
                (n) => `${n.toFixed(1)} min`,
                { suffix: " min", neutral: true },
              )}
            </div>
          )}
        </Panel>

        <Panel variant="tile" accent="var(--color-lol-violet)" className="flex flex-1 flex-col">
          <Title
            aside={
              bestSlot && (
                <span className="text-[13px] text-lol-text">
                  best: <b className="text-lol-win">{bestSlot.label}</b>
                </span>
              )
            }
          >
            When you play best
          </Title>
          {slotStats && (
            <div className="mb-2 grid grid-cols-3 gap-2">
              {[
                ["Best hours", slotStats.best, "text-lol-win"],
                ["Worst hours", slotStats.worst, "text-lol-loss"],
                ["Busiest hours", slotStats.busiest, "text-lol-assist"],
              ].map(([label, slot, tone]) => {
                const s = slot as (typeof slots)[number];
                return (
                  <div
                    key={label as string}
                    className="rounded-xl border border-lol-border/50 bg-black/20 px-3 py-2"
                  >
                    <div className="font-display text-[10px] font-bold uppercase tracking-widest text-lol-text">
                      {label as string}
                    </div>
                    <b className={`font-display text-[18px] font-bold leading-tight ${tone}`}>
                      {s.label}
                    </b>
                    <div className="text-[11px] text-lol-text">
                      {rate(s.wins, s.games).toFixed(0)}% · {s.games} games
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {/* Bar height = win rate on a 35–75% scale */}
          <div className="flex items-stretch gap-2.5 py-2">
            {slots.map((s) => {
              const wr = rate(s.wins, s.games);
              const height = s.games ? Math.min(100, Math.max(6, ((wr - 35) / 40) * 100)) : 0;
              const best = bestSlot?.label === s.label;
              return (
                <div
                  key={s.label}
                  title={`${s.games} games · ${s.wins}W ${s.games - s.wins}L`}
                  className="group relative z-10 flex flex-1 flex-col items-center justify-end gap-1.5"
                >
                  <div className="flex h-[150px] w-full flex-col items-center justify-end gap-1">
                    <span
                      className={`font-display text-[12px] font-bold ${s.games ? rateColor(wr) : "text-lol-text/50"}`}
                    >
                      {s.games ? `${wr.toFixed(0)}%` : "—"}
                    </span>
                    <div
                      className={`w-full rounded-t-lg transition-[filter] group-hover:brightness-125 ${
                        wr >= 50
                          ? "bg-gradient-to-t from-lol-win/30 to-lol-win/85"
                          : "bg-gradient-to-t from-lol-loss/30 to-lol-loss/85"
                      } ${best ? "ring-2 ring-lol-gold/70" : ""}`}
                      style={{ height: `${(height / 100) * 120}px` }}
                    />
                  </div>{" "}
                  <span className="text-[11px] font-semibold tabular-nums text-lol-text-bright">
                    {s.label}
                  </span>
                  <span className="-mt-1 text-[10px] tabular-nums text-lol-text/70">
                    {s.games} games
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-auto border-t border-lol-border/40 pt-3">
            <div className="mb-2 font-display text-[10px] font-bold uppercase tracking-widest text-lol-text">
              By weekday
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {weekdays.map((d) => {
                const wr = rate(d.wins, d.games);
                // Colour strength follows distance from 50%, capped at ±15 points
                const strength = d.games ? Math.min(1, Math.abs(wr - 50) / 15) : 0;
                const tint = wr >= 50 ? "var(--color-lol-win)" : "var(--color-lol-loss)";
                return (
                  <div
                    key={d.label}
                    title={`${d.games} games · ${d.wins}W ${d.games - d.wins}L`}
                    className="rounded-lg border border-lol-border/40 px-1 py-1.5 text-center"
                    style={{
                      background: `color-mix(in srgb, ${tint} ${Math.round(strength * 28)}%, transparent)`,
                    }}
                  >
                    <div className="text-[10.5px] font-semibold text-lol-text">{d.label}</div>
                    <b
                      className={`font-display text-[13px] ${d.games ? rateColor(wr) : "text-lol-text/50"}`}
                    >
                      {d.games ? `${wr.toFixed(0)}%` : "—"}
                    </b>
                    <div className="text-[10px] tabular-nums text-lol-text/70">{d.games}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="mt-3 text-[11px] text-lol-text/70">
            Bar height = win rate, gold ring = best slot with 10+ games. Local time.
          </p>{" "}
        </Panel>
      </div>
    </div>
  );
}
