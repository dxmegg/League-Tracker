import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { ItemDetail } from "../lib/types";
import { getChampionName, useChampionData } from "../hooks/useChampions";
import { formatDuration, formatNumber, formatTimeAgo, kdaRatio } from "../lib/format";
import { byGameLength, byMonth, byQueue, winRateBoost, type Bucket } from "../lib/itemStats";
import { scoreColor } from "../../shared/opScore";
import ChampionIcon from "./ChampionIcon";
import { LineChart } from "./LineChart";
import { Panel } from "./Panel";
import { queueLabel } from "./QueueSelect";
import WinRateBar from "./WinRateBar";
import { Title } from "./live/shared";

const ROW = "rounded-xl border border-lol-border/40 bg-black/25";

type Insights = Pick<ItemDetail, "picks" | "wins" | "baseline" | "champions" | "patchBreakdown">;
type Games = ItemDetail["champions"][number]["matches"];

function hint(text: string) {
  return <span className="text-[12px] text-lol-text">{text}</span>;
}

function Empty({ text = "Not enough data" }: { text?: string }) {
  return <p className="py-6 text-center text-xs text-lol-text/70">{text}</p>;
}

// Averages of the games with the item next to the games without it
function Comparison({ data, games, noun }: { data: Insights; games: Games; noun: string }) {
  const base = data.baseline;
  const average = (pick: (g: Games[number]) => number) =>
    games.length ? games.reduce((sum, g) => sum + pick(g), 0) / games.length : null;
  const scored = games.filter((g) => g.score != null);
  const total = (pick: (g: Games[number]) => number) => games.reduce((n, g) => n + pick(g), 0);
  const kda = (k: number, d: number, a: number) => (k + a) / Math.max(d, 1);
  const whole = (v: number) => formatNumber(Math.round(v));

  const rows: Array<{
    label: string;
    mine: number | null;
    other: number | null;
    show: (v: number) => string;
  }> = [
    {
      label: "Win rate",
      mine: data.picks ? (data.wins / data.picks) * 100 : null,
      other: base.games ? (base.wins / base.games) * 100 : null,
      show: (v) => `${v.toFixed(1)}%`,
    },
    {
      label: "KDA",
      mine: games.length
        ? kda(
            total((g) => g.kills),
            total((g) => g.deaths),
            total((g) => g.assists),
          )
        : null,
      other: base.games ? kda(base.kills, base.deaths, base.assists) : null,
      show: (v) => v.toFixed(2),
    },
    { label: "Damage dealt", mine: average((g) => g.damage), other: base.damage, show: whole },
    { label: "Damage taken", mine: average((g) => g.taken), other: base.taken, show: whole },
    { label: "Gold earned", mine: average((g) => g.gold), other: base.gold, show: whole },
    { label: "Healing", mine: average((g) => g.heal), other: base.heal, show: whole },
    {
      label: "Score",
      mine: scored.length ? scored.reduce((n, g) => n + g.score!, 0) / scored.length : null,
      other: base.score,
      show: (v) => v.toFixed(1),
    },
    {
      label: "Game length",
      mine: average((g) => g.game_duration),
      other: base.duration,
      show: (v) => formatDuration(Math.round(v)),
    },
  ];

  return (
    <Panel variant="tile">
      <Title aside={hint(`${formatNumber(base.games)} games without it`)}>
        With and without this {noun}
      </Title>
      <div className="flex flex-col gap-1.5">
        {rows.map(({ label, mine, other, show }) => {
          // A rate differs in points, everything else relative to the value without the item
          const points = label === "Win rate";
          const change =
            mine != null && other ? (points ? mine - other : ((mine - other) / other) * 100) : null;
          const max = Math.max(mine ?? 0, other ?? 0) || 1;
          return (
            <div
              key={label}
              className={`grid grid-cols-[110px_minmax(0,1fr)_76px_76px_64px] items-center gap-3 px-3 py-2 text-[13px] ${ROW}`}
            >
              <span className="text-lol-text">{label}</span>
              <div className="flex flex-col gap-1">
                <i
                  className="block h-1.5 rounded-full bg-lol-crimson"
                  style={{ width: `${((mine ?? 0) / max) * 100}%` }}
                />
                <i
                  className="block h-1.5 rounded-full bg-white/20"
                  style={{ width: `${((other ?? 0) / max) * 100}%` }}
                />
              </div>
              <b className="text-right font-display tabular-nums text-lol-text-bright">
                {mine != null ? show(mine) : "—"}
              </b>
              <span className="text-right font-display tabular-nums text-lol-text/70">
                {other != null ? show(other) : "—"}
              </span>
              {/* Neutral colour: "more damage taken" or "longer games" is not better or worse */}
              <span className="text-right text-[11.5px] tabular-nums text-lol-gold">
                {change != null
                  ? `${Math.round(change) > 0 ? "+" : ""}${Math.round(change) || 0}${points ? " pts" : "%"}`
                  : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function BucketList({ title, rows }: { title: string; rows: Bucket[] }) {
  return (
    <Panel variant="tile">
      <Title aside={hint("games · win rate")}>{title}</Title>
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <div className="flex max-h-[300px] flex-col gap-1.5 overflow-y-auto pr-1">
          {rows.map((row) => (
            <div
              key={row.label}
              className={`flex h-10 shrink-0 items-center gap-3 px-3 text-[13px] ${ROW}`}
            >
              <span className="min-w-0 flex-1 truncate font-semibold text-lol-text-bright">
                {row.label}
              </span>
              <span className="text-[11px] tabular-nums text-lol-text">{row.games}x</span>
              <div className="w-32 shrink-0">
                <WinRateBar wins={row.wins} total={row.games} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function ChampionRanking({
  title,
  note,
  rows,
}: {
  title: string;
  note: string;
  rows: Array<{ id: number; detail: string; value: ReactNode }>;
}) {
  const champions = useChampionData();
  return (
    <Panel variant="tile">
      <Title aside={hint(note)}>{title}</Title>
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <Link
              key={row.id}
              to={`/champions/${row.id}`}
              className={`flex items-center gap-3 px-3 py-2 transition-colors hover:bg-white/[0.04] ${ROW}`}
            >
              <ChampionIcon championId={row.id} size={36} className="rounded-lg" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-[14px] font-bold text-lol-text-bright">
                  {getChampionName(champions, row.id)}
                </div>
                <div className="text-[11px] text-lol-text">{row.detail}</div>
              </div>
              <div className="font-display text-[18px] font-bold tabular-nums">{row.value}</div>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}

function Records({ games, noun }: { games: Games; noun: string }) {
  const champions = useChampionData();
  if (games.length === 0) return null;
  const records: Array<[string, (g: Games[number]) => number, (v: number) => string]> = [
    ["Most kills", (g) => g.kills, String],
    ["Most assists", (g) => g.assists, String],
    ["Most damage", (g) => g.damage, formatNumber],
    ["Most damage taken", (g) => g.taken, formatNumber],
    ["Most gold", (g) => g.gold, formatNumber],
    ["Longest game", (g) => g.game_duration, formatDuration],
  ];
  return (
    <Panel variant="tile">
      <Title aside={hint("click to open the match")}>Records with this {noun}</Title>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 min-[106rem]:grid-cols-6">
        {records.map(([label, pick, show]) => {
          const best = games.reduce((top, g) => (pick(g) > pick(top) ? g : top));
          return (
            <Link
              key={label}
              to={`/match/${best.game_id}`}
              className={`min-w-0 p-3 transition-colors hover:border-lol-crimson/60 ${ROW}`}
            >
              <div className="text-[10px] font-bold uppercase tracking-widest text-lol-text">
                {label}
              </div>
              <div className="mt-1 font-display text-[24px] font-bold tabular-nums text-lol-gold">
                {show(pick(best))}
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-[11px] text-lol-text">
                <ChampionIcon championId={best.champion_id} size={22} />
                <span className="truncate">{getChampionName(champions, best.champion_id)}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </Panel>
  );
}

function RecentGames({ games, noun }: { games: Games; noun: string }) {
  const champions = useChampionData();
  return (
    <Panel variant="tile">
      <Title aside={hint(`last ${Math.min(10, games.length)}`)}>
        Recent games with this {noun}
      </Title>
      <div className="grid grid-cols-1 gap-1.5 min-[106rem]:grid-cols-2">
        {games.slice(0, 10).map((g) => (
          <Link
            key={g.game_id}
            to={`/match/${g.game_id}`}
            className={`flex items-center gap-3 px-3 py-2 text-[12.5px] transition-colors hover:bg-white/[0.04] ${ROW} ${
              g.win
                ? "shadow-[inset_4px_0_0_var(--theme-win)]"
                : "shadow-[inset_4px_0_0_var(--theme-loss)]"
            }`}
          >
            <ChampionIcon championId={g.champion_id} size={38} className="rounded-lg" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-[14px] font-bold text-lol-text-bright">
                {getChampionName(champions, g.champion_id)}
              </div>
              <div className="truncate text-[11px] text-lol-text">
                {queueLabel(g.queue_id)} · {formatTimeAgo(g.game_creation)}
              </div>
            </div>
            <div className="w-24 text-center">
              <div className="font-display font-bold tabular-nums text-lol-text-bright">
                {g.kills} / <span className="text-lol-loss">{g.deaths}</span> / {g.assists}
              </div>
              <div className="text-[11px] text-lol-text">
                {kdaRatio(g.kills, g.deaths, g.assists)} KDA
              </div>
            </div>
            <div className="w-20 text-right">
              <div className="font-display font-bold tabular-nums text-lol-text-bright">
                {formatNumber(g.damage)}
              </div>
              <div className="text-[11px] text-lol-text">damage</div>
            </div>
            <div
              className={`w-10 text-right font-display text-[17px] font-bold tabular-nums ${
                g.score != null ? scoreColor(g.score) : "text-lol-text/50"
              }`}
            >
              {g.score != null ? g.score.toFixed(1) : "—"}
            </div>
          </Link>
        ))}
      </div>
    </Panel>
  );
}

export function ItemInsights({ data, noun = "item" }: { data: Insights; noun?: string }) {
  const games = data.champions
    .flatMap((row) => row.matches)
    .sort((a, b) => b.game_creation - a.game_creation);
  const months = byMonth(games).slice(-12);
  const rates = months.map((m) => (m.wins / m.games) * 100);
  const monthName = (label: string) =>
    new Date(`${label}-01T12:00:00`).toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    });

  const boosted = data.champions
    .map((row) => ({ row, boost: winRateBoost(row) }))
    .filter((entry): entry is { row: Insights["champions"][number]; boost: number } => {
      return entry.boost != null;
    })
    .sort((a, b) => b.boost - a.boost);
  const rated = data.champions.filter((row) => row.games >= 5);
  const byRate = [...rated].sort((a, b) => b.wins / b.games - a.wins / a.games);
  const boostRows = (entries: typeof boosted) =>
    entries.map(({ row, boost }) => ({
      id: row.champion_id,
      detail: `${row.games} games with it · ${row.championGames - row.games} without`,
      value: (
        <span className={boost >= 0 ? "text-lol-win" : "text-lol-loss"}>
          {boost >= 0 ? "+" : ""}
          {boost.toFixed(0)} pts
        </span>
      ),
    }));

  return (
    <>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Comparison data={data} games={games} noun={noun} />
        <Panel variant="tile">
          <Title aside={hint("last 12 months played")}>Win rate over time</Title>
          {months.length >= 2 ? (
            <LineChart
              values={rates}
              format={(v) => `${v.toFixed(1)}%`}
              color="var(--theme-win)"
              xLabels={months.map((m) => monthName(m.label))}
              tooltips={months.map(
                (m, i) => `${monthName(m.label)} · ${rates[i].toFixed(1)}% · ${m.games} games`,
              )}
              yFormat={(v) => `${v.toFixed(0)}%`}
              min={0}
              max={100}
              baseline={50}
              height={260}
            />
          ) : (
            <Empty text="Build it in at least two different months to see a trend" />
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <BucketList title="By game length" rows={byGameLength(games)} />
        <BucketList title="By mode" rows={byQueue(games, queueLabel)} />
        <BucketList
          title="By patch"
          rows={data.patchBreakdown.map((row) => ({
            label: row.patch.split(".").slice(0, 2).join("."),
            games: row.games,
            wins: row.wins,
          }))}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ChampionRanking
          title="Best with it"
          note="min 5 games"
          rows={byRate.slice(0, 5).map((row) => ({
            id: row.champion_id,
            detail: `${row.games} games`,
            value: (
              <span className={row.wins * 2 >= row.games ? "text-lol-win" : "text-lol-loss"}>
                {((row.wins / row.games) * 100).toFixed(0)}%
              </span>
            ),
          }))}
        />
        <ChampionRanking
          title="Biggest boost"
          note="win rate vs without it"
          rows={boostRows(boosted.filter((e) => e.boost > 0).slice(0, 5))}
        />
        <ChampionRanking
          title="Works against you"
          note="win rate vs without it"
          rows={boostRows(
            boosted
              .filter((e) => e.boost < 0)
              .reverse()
              .slice(0, 5),
          )}
        />
      </div>

      <Records games={games} noun={noun} />
      <RecentGames games={games} noun={noun} />
    </>
  );
}
