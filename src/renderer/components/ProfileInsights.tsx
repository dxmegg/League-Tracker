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
const SESSION_GAP_MS = 60 * 60_000;
const SESSIONS_SHOWN = 8;
const AUGMENTS_COLLAPSED = 10;

const RARITIES = [
  { key: "kPrismatic", label: "Prismatic", dot: "bg-fuchsia-400", text: "text-fuchsia-300" },
  { key: "kGold", label: "Gold", dot: "bg-yellow-400", text: "text-yellow-300" },
  { key: "kSilver", label: "Silver", dot: "bg-slate-300", text: "text-slate-200" },
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
      <h2 className="font-display text-[16px] font-semibold text-lol-text-bright">
        <span className="mr-2 inline-block h-1.5 w-1.5 rotate-45 bg-lol-crimson align-middle" />
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
  const [rarity, setRarity] = useState<string | null>(null);
  const [sort, setSort] = useState<AugmentSort>("picks");
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
  // Signature pick, best win rate and best score, the last two only over augments with a real sample
  const highlights = useMemo(() => {
    const all = stats ?? [];
    const sampled = all.filter((s) => s.picks >= 5);
    const top = (rows: AugmentStats[], key: (s: AugmentStats) => number) =>
      rows.length ? rows.reduce((a, b) => (key(b) > key(a) ? b : a)) : undefined;
    const signature = top(all, (s) => s.picks);
    const winning = top(sampled, (s) => rate(s.wins, s.picks));
    const scorer = top(sampled, (s) => s.avgScore ?? -1);
    return [
      signature && {
        label: "Signature pick",
        row: signature,
        detail: `${signature.picks} picks · ${rate(signature.wins, signature.picks).toFixed(0)}% win rate`,
      },
      winning && {
        label: "Winning edge",
        row: winning,
        detail: `${rate(winning.wins, winning.picks).toFixed(0)}% win rate over ${winning.picks} picks`,
      },
      scorer && {
        label: "Top scorer",
        row: scorer,
        detail: `${(scorer.avgScore ?? 0).toFixed(1)} average score over ${scorer.picks} picks`,
      },
    ].filter((h): h is NonNullable<typeof h> => Boolean(h));
  }, [stats]);
  const visible = showAll ? rows : rows.slice(0, AUGMENTS_COLLAPSED);

  return (
    <Panel variant="tile" accent="var(--color-lol-gold)" className="flex flex-col">
      <Title aside={<span className="text-[13px] text-lol-text">{stats?.length ?? 0} unique</span>}>
        Augments
      </Title>
      {highlights.length > 0 && (
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          {highlights.map((h) => (
            <div
              key={h.label}
              className="flex items-center gap-3 rounded-xl border border-lol-border/60 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--theme-crimson)_12%,transparent),transparent_70%)] px-3.5 py-3"
            >
              <AugmentIcon augmentId={h.row.augment_id} size={44} />
              <div className="min-w-0">
                <div className="font-display text-[10px] font-bold uppercase tracking-widest text-lol-crimson-bright">
                  {h.label}
                </div>
                <div className="truncate font-display text-[14px] font-semibold text-lol-text-bright">
                  {getAugmentName(augmentData, h.row.augment_id)}
                </div>
                <div className="text-[12px] text-lol-text">{h.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}
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
          <div className="grid grid-cols-[minmax(0,1fr)_64px_minmax(90px,1.2fr)_52px] items-center gap-x-3 px-2 pb-1.5 font-display text-[10px] font-bold uppercase tracking-widest text-lol-text">
            <span>Augment</span>
            <span className="text-right">Picks</span>
            <span>Win rate</span>
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
                  className="grid grid-cols-[minmax(0,1fr)_64px_minmax(90px,1.2fr)_52px] items-center gap-x-3 rounded-lg bg-white/[0.03] px-2 py-1.5 transition-colors hover:bg-white/[0.07]"
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
                    <div className="font-display text-[13px] text-lol-text-bright">{s.picks}×</div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                      <i
                        className="block h-full rounded-full bg-lol-crimson"
                        style={{ width: `${(s.picks / maxPicks) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <b className={`w-11 font-display text-[13px] ${rateColor(wr)}`}>
                      {wr.toFixed(0)}%
                    </b>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-lol-loss/40">
                      <i className="block h-full bg-lol-win" style={{ width: `${wr}%` }} />
                    </div>
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

const fmtDuration = (min: number) =>
  min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min} min`;

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
}: {
  value: number | null;
  suffix?: string;
  digits?: number;
}) {
  if (value == null || Math.abs(value) < 0.05) return <span className="text-lol-text">—</span>;
  const up = value > 0;
  return (
    <span
      className={`font-display text-[12px] font-semibold ${up ? "text-lol-win" : "text-lol-loss"}`}
    >
      {up ? "▲" : "▼"} {Math.abs(value).toFixed(digits)}
      {suffix}
    </span>
  );
}

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

  const metric = (
    label: string,
    cur: number | null,
    prev: number | null,
    fmt: (n: number) => string,
    suffix = "",
    digits = 1,
  ) => (
    <div
      key={label}
      className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 border-b border-lol-border/30 py-2 last:border-b-0"
    >
      <span className="text-[13px] text-lol-text">{label}</span>
      <span className="font-display text-[15px] font-semibold text-lol-text-bright">
        {cur != null ? fmt(cur) : "—"}
      </span>
      <span className="w-20 text-right">
        <Delta
          value={cur != null && prev != null ? cur - prev : null}
          suffix={suffix}
          digits={digits}
        />
      </span>
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.3fr_1fr]">
      <Panel variant="tile" accent="var(--color-lol-assist)">
        <Title
          aside={
            <span
              title="A pause longer than 60 minutes starts a new session"
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
            <div>
              {metric("Games", compare.cur.length, compare.prev.length, (n) => String(n), "", 0)}
              {metric(
                "Win rate",
                rate(winsOf(compare.cur), compare.cur.length),
                compare.prev.length ? rate(winsOf(compare.prev), compare.prev.length) : null,
                (n) => `${n.toFixed(1)}%`,
                " pp",
              )}
              {metric(
                "KDA",
                kdaOf(compare.cur),
                compare.prev.length ? kdaOf(compare.prev) : null,
                (n) => n.toFixed(2),
                "",
                2,
              )}
              {metric(
                "Avg score",
                avgScore(compare.cur),
                compare.prev.length ? avgScore(compare.prev) : null,
                (n) => n.toFixed(1),
                "",
                1,
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
          {/* Bar height = win rate on a 35–75% scale */}
          <div className="my-auto flex items-stretch gap-2.5 py-3">
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
          <p className="mt-2 text-[11px] text-lol-text/70">
            Bar height = win rate, gold ring = best slot with 10+ games. Local time.
          </p>{" "}
        </Panel>
      </div>
    </div>
  );
}
