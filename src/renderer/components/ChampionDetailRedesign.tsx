import { useMemo, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type {
  AugmentStats,
  ChampionAllyRow,
  ChampionDetailStats,
  ChampionKeystoneStat,
  ChampionMatchupRow,
  ChampionQueueStat,
  ChampionRecordsResult,
  ChampionRoleStat,
  ChampionStats,
  ChampionWeeklyWinRate,
  GlobalChampionDetail,
  HomeTimePeriod,
  MatchListItem,
} from "../../shared/api";
import { QUEUE_LABELS } from "../../shared/queues";
import { scoreColor } from "../../shared/opScore";
import { useActiveAccount } from "../hooks/useActiveAccount";
import {
  getAugmentName,
  getChampionName,
  getItemName,
  useAugmentData,
  useChampionData,
  useItemData,
  useRuneData,
} from "../hooks/useChampions";
import { useIpc } from "../hooks/useIpc";
import { useViewState } from "../hooks/useViewState";
import { ALL_ACCOUNTS_SENTINEL } from "../lib/accountsEvent";
import { formatDuration, formatNumber, formatPlain, formatPlaytime } from "../lib/format";
import { useHistoryScopeQueue } from "../lib/historyScope";
import AugmentIcon from "./AugmentIcon";
import ChampionIcon from "./ChampionIcon";
import ItemIcon from "./ItemIcon";
import { LineChartExp } from "./LineChartExp";
import { MatchRowExperiment } from "./MatchRowExperiment";
import RuneIcon from "./RuneIcon";
import { FilterSelect } from "./FilterSelect";
import WinRateBar from "./WinRateBar";

// Record keys worth showing on a single page; the full list lives in the old Records tab
const RECORD_KEYS = [
  "kills",
  "kda",
  "damage",
  "gold",
  "cs",
  "pentaKills",
  "longestGame",
  "shortestWin",
] as const;
const DURATION_RECORDS = new Set(["longestGame", "shortestWin"]);
const MIN_MATCHUP_GAMES = 3;

function Section({
  title,
  hint,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`min-w-0 rounded-[14px] border border-lol-border bg-[var(--theme-card)] p-5 ${className}`}
    >
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[15px] font-bold text-lol-text-bright">{title}</h2>
        {hint && <span className="text-[11px] text-lol-text/70">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Kpi({
  label,
  value,
  sub,
  valueClass = "text-lol-text-bright",
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-[12px] border border-lol-border bg-[var(--theme-card)] px-4 py-3.5 text-center flex flex-col items-center justify-center">
      <div className="text-[10.5px] font-bold uppercase tracking-widest text-lol-text/80">
        {label}
      </div>
      <div
        className={`mt-1 whitespace-nowrap font-display text-[26px] font-bold leading-none ${valueClass}`}
      >
        {value}
      </div>
      <div className="mt-1 h-4 text-[11px] text-lol-text">{sub ?? ""}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-lol-border/40 py-1.5 text-[13px]">
      <span className="text-lol-text">{label}</span>
      <span className="font-semibold tabular-nums text-lol-text-bright">{value}</span>
    </div>
  );
}

// One row of any "name + sample + win rate" list (items, augments, runes, matchups, allies)
function RateRow({
  icon,
  name,
  games,
  wins,
}: {
  icon: ReactNode;
  name: string;
  games: number;
  wins: number;
}) {
  return (
    <div className="flex h-9 items-center gap-2.5">
      <div className="shrink-0">{icon}</div>
      <span className="min-w-0 flex-1 truncate text-[13px] text-lol-text-bright">{name}</span>
      <span className="shrink-0 text-[11px] tabular-nums text-lol-text">{games}x</span>
      <div className="shrink-0">
        <WinRateBar wins={wins} total={games} />
      </div>
    </div>
  );
}

function Empty({ text = "Not enough data" }: { text?: string }) {
  return <p className="py-4 text-center text-xs text-lol-text/70">{text}</p>;
}

function rateOf(row: { games: number; wins: number }): number {
  return row.games > 0 ? row.wins / row.games : 0;
}

export function ChampionDetailRedesign() {
  const { championId = "" } = useParams<{ championId: string }>();
  const id = Number(championId);
  const navigate = useNavigate();
  const champData = useChampionData();
  const [patch] = useViewState<string | undefined>("champions.patch", undefined);
  const [timePeriod, setTimePeriod] = useViewState<HomeTimePeriod>("champions.timePeriod", "full");
  const [queue, setQueue] = useViewState<number | undefined>("champions.queue", undefined);
  const scopedQueue = queue ?? useHistoryScopeQueue();
  const [activeAccountRaw] = useActiveAccount();
  const account = activeAccountRaw === ALL_ACCOUNTS_SENTINEL ? "all" : activeAccountRaw;

  const augmentData = useAugmentData(patch);
  const itemData = useItemData(patch);
  const runeData = useRuneData();

  const { data: allStats, loading: allStatsLoading } = useIpc<ChampionStats[]>(
    () => window.api.getChampionStats(patch, scopedQueue, account, timePeriod),
    [patch, scopedQueue, account, timePeriod],
  );
  const { data: detail } = useIpc<ChampionDetailStats>(
    () => window.api.getChampionDetailStats(id, patch, scopedQueue, account, timePeriod),
    [id, patch, scopedQueue, account, timePeriod],
  );
  const { data: globalDetail } = useIpc<GlobalChampionDetail | null>(
    () => window.api.getGlobalChampionDetail(id, patch, scopedQueue, account, timePeriod),
    [id, patch, scopedQueue, account, timePeriod],
  );
  const { data: weekly } = useIpc<ChampionWeeklyWinRate[]>(
    () => window.api.getChampionWeeklyWinRate(id, account),
    [id, account],
  );
  const { data: roles } = useIpc<ChampionRoleStat[]>(
    () => window.api.getChampionRoleStats(id, patch, scopedQueue, account, timePeriod),
    [id, patch, scopedQueue, account, timePeriod],
  );
  const { data: queues } = useIpc<ChampionQueueStat[]>(
    () => window.api.getChampionQueueStats(id, account),
    [id, account],
  );
  const { data: keystones } = useIpc<ChampionKeystoneStat[]>(
    () => window.api.getChampionKeystones(id, account, timePeriod),
    [id, account, timePeriod],
  );
  const { data: augments } = useIpc<AugmentStats[]>(
    () => window.api.getAugmentStats(id, patch, scopedQueue, account, timePeriod),
    [id, patch, scopedQueue, account, timePeriod],
  );
  const { data: matchups } = useIpc<ChampionMatchupRow[] | null>(
    () => window.api.getChampionMatchupList(id, patch, scopedQueue, account, timePeriod),
    [id, patch, scopedQueue, account, timePeriod],
  );
  const { data: allies } = useIpc<ChampionAllyRow[] | null>(
    () => window.api.getChampionAllyStats(id, patch, scopedQueue, account, timePeriod),
    [id, patch, scopedQueue, account, timePeriod],
  );
  const { data: records } = useIpc<ChampionRecordsResult | null>(
    () => window.api.getChampionRecords(id, patch, scopedQueue, account, timePeriod),
    [id, patch, scopedQueue, account, timePeriod],
  );
  const { data: history } = useIpc<{ matches: MatchListItem[]; total: number }>(
    () => window.api.getChampionMatchHistory(id, 8, 0, patch, scopedQueue, account, timePeriod),
    [id, patch, scopedQueue, account, timePeriod],
  );

  const stats = useMemo(
    () => allStats?.find((item) => item.champion_id === id) ?? null,
    [allStats, id],
  );
  const name = getChampionName(champData, id);

  const streak = useMemo(() => {
    const matches = history?.matches ?? [];
    if (matches.length === 0) return null;
    const type = matches[0].win === 1 ? "W" : "L";
    const idx = matches.findIndex((m) => (m.win === 1 ? "W" : "L") !== type);
    return { type, count: idx === -1 ? matches.length : idx };
  }, [history]);

  const series = useMemo(() => {
    const entries = (weekly ?? []).slice().sort((a, b) => a.weekStart - b.weekStart);
    const values = entries.map((e) => (e.games > 0 ? (e.wins / e.games) * 100 : 0));
    const labels = entries.map((e) =>
      new Date(e.weekStart).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
    );
    const tooltips = entries.map(
      (e, i) => `${labels[i]} · ${values[i].toFixed(1)}% · ${e.games} games`,
    );
    const lo = values.length ? Math.max(0, Math.floor((Math.min(...values) - 5) / 10) * 10) : 0;
    const hi = values.length ? Math.min(100, Math.ceil((Math.max(...values) + 5) / 10) * 10) : 100;
    return { values, labels, tooltips, lo, hi };
  }, [weekly]);

  // Best / worst opponents and allies need a minimum sample or a 1-0 looks like a trend
  const rated = (rows: Array<{ games: number; wins: number }> | null | undefined) =>
    (rows ?? []).filter((r) => r.games >= MIN_MATCHUP_GAMES);
  const bestMatchups = rated(matchups)
    .slice()
    .sort((a, b) => rateOf(b) - rateOf(a))
    .slice(0, 5) as ChampionMatchupRow[];
  const worstMatchups = rated(matchups)
    .slice()
    .sort((a, b) => rateOf(a) - rateOf(b))
    .slice(0, 5) as ChampionMatchupRow[];
  const bestAllies = rated(allies)
    .slice()
    .sort((a, b) => rateOf(b) - rateOf(a))
    .slice(0, 5) as ChampionAllyRow[];

  const topItems = (globalDetail?.items ?? [])
    .filter((item) => !item.isTrinket)
    .slice()
    .sort((a, b) => b.picks - a.picks)
    .slice(0, 6);
  const topAugments = (augments ?? [])
    .slice()
    .sort((a, b) => b.picks - a.picks)
    .slice(0, 6);
  const topKeystones = (keystones ?? [])
    .slice()
    .sort((a, b) => b.picks - a.picks)
    .slice(0, 5);

  const shownRecords = RECORD_KEYS.map((key) => records?.records.find((r) => r.key === key)).filter(
    (r): r is NonNullable<typeof r> => r != null && r.value > 0,
  );

  const backButton = (
    <button
      type="button"
      onClick={() => navigate("/champions")}
      className="self-start rounded-lg border border-lol-border bg-[var(--theme-card)] px-3 py-1.5 text-sm font-medium text-lol-text-bright transition-colors hover:border-lol-crimson/70"
    >
      ← All champions
    </button>
  );

  if (allStatsLoading && !allStats) {
    return (
      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-5">
        {backButton}
        <p className="py-10 text-center text-sm text-lol-text">Loading…</p>
      </div>
    );
  }
  if (!stats || stats.games === 0) {
    return (
      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-5">
        {backButton}
        <p className="py-10 text-center text-sm text-lol-text">
          No games with this champion for the selected filters.
        </p>
      </div>
    );
  }

  const games = stats.games;
  const wins = stats.wins;
  const wr = (wins / games) * 100;
  const kda = stats.deaths > 0 ? (stats.kills + stats.assists) / stats.deaths : null;
  const pct = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-5">
      {backButton}

      <div className="relative overflow-hidden rounded-[14px] border border-lol-border bg-[var(--theme-card)] p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(229,72,63,0.16),transparent_55%)]" />
        <div className="relative flex flex-wrap items-center gap-6">
          <ChampionIcon
            championId={id}
            size={96}
            className="rounded-2xl border border-lol-border"
          />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[34px] font-bold leading-tight text-lol-text-bright">
              {name}
            </h1>
            <p className="mt-1 text-[14px] text-lol-text">
              {formatNumber(games)} games · {formatNumber(wins)}W {formatNumber(games - wins)}L
              {streak && (
                <span
                  className={`ml-3 rounded-md px-2 py-0.5 text-xs font-bold ${
                    streak.type === "W"
                      ? "bg-lol-win/15 text-lol-win"
                      : "bg-lol-crimson/15 text-lol-crimson"
                  }`}
                >
                  {streak.type}
                  {streak.count} streak
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-8">
            <div className="text-right">
              <div className="text-[10.5px] font-bold uppercase tracking-widest text-lol-text/80">
                Win rate
              </div>
              <div
                className={`font-display text-[44px] font-bold leading-none ${wr >= 50 ? "text-lol-win" : "text-lol-loss"}`}
              >
                {wr.toFixed(1)}%
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10.5px] font-bold uppercase tracking-widest text-lol-text/80">
                KDA
              </div>
              <div className="font-display text-[44px] font-bold leading-none text-lol-text-bright">
                {kda != null ? kda.toFixed(2) : "∞"}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          value={queue != null ? String(queue) : undefined}
          onChange={(v) => setQueue(v === undefined ? undefined : Number(v))}
          placeholder="All queues"
          allowClear
          title="Queue"
          options={[
            { value: "420", label: "Ranked Solo" },
            { value: "440", label: "Ranked Flex" },
            { value: "450", label: "ARAM" },
            { value: "400", label: "Normal" },
            { value: "1700", label: "Arena" },
          ]}
        />
        <div className="inline-flex h-9 items-center rounded-md border border-lol-border/60 bg-lol-card/40 p-[3px]">
          {(["24h", "7d", "30d", "full"] as const).map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => setTimePeriod(period)}
              className={`h-full rounded px-2.5 text-xs font-semibold transition-colors ${
                period === timePeriod
                  ? "bg-lol-crimson text-white"
                  : "text-lol-text hover:text-lol-text-bright"
              }`}
            >
              {period === "full" ? "Full" : period}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Kpi
          label="Avg K / D / A"
          value={`${stats.avg_kills.toFixed(1)} / ${stats.avg_deaths.toFixed(1)} / ${stats.avg_assists.toFixed(1)}`}
          sub="per game"
          valueClass="!text-[22px] text-lol-text-bright"
        />
        <Kpi
          label="Score"
          value={stats.avg_score != null ? stats.avg_score.toFixed(1) : "—"}
          sub={`${stats.mvps} MVP · ${stats.aces} ACE`}
          valueClass={stats.avg_score != null ? scoreColor(stats.avg_score) : "text-lol-text"}
        />
        <Kpi
          label="CS / min"
          value={stats.avg_cs_per_min != null ? stats.avg_cs_per_min.toFixed(1) : "—"}
        />
        <Kpi
          label="Avg damage"
          value={formatNumber(stats.avg_damage)}
          sub={`${pct(detail?.damageShare)} share`}
        />
        <Kpi label="Avg gold" value={formatNumber(stats.avg_gold)} valueClass="text-lol-gold" />
        <Kpi
          label="Kill participation"
          value={pct(detail?.killParticipation)}
          valueClass="text-lol-assist"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Section title="Win rate over time" hint="weekly" className="xl:col-span-2">
          {series.values.length >= 2 ? (
            <LineChartExp
              values={series.values}
              format={(v) => `${v.toFixed(1)}%`}
              color="var(--theme-win)"
              xLabels={series.labels}
              tooltips={series.tooltips}
              yFormat={(v) => `${v.toFixed(0)}%`}
              min={series.lo}
              max={series.hi}
              baseline={
                globalDetail && globalDetail.games > 0
                  ? (globalDetail.wins / globalDetail.games) * 100
                  : 50
              }
              height={200}
            />
          ) : (
            <Empty text="Play across at least two weeks to see a trend" />
          )}
        </Section>

        <Section title="Details">
          <MiniStat
            label="Avg game length"
            value={detail ? formatDuration(Math.round(detail.avgGameLength)) : "—"}
          />
          <MiniStat
            label="Total time played"
            value={detail ? formatPlaytime(detail.totalTimePlayed) : "—"}
          />
          <MiniStat label="Gold / min" value={detail ? formatPlain(detail.goldPerMin, 0) : "—"} />
          <MiniStat
            label="Avg damage taken"
            value={detail ? formatNumber(detail.avgDamageTaken) : "—"}
          />
          <MiniStat label="Avg heal" value={detail ? formatNumber(detail.avgHeal) : "—"} />
          <MiniStat
            label="Total K / D / A"
            value={`${formatNumber(stats.kills)} / ${formatNumber(stats.deaths)} / ${formatNumber(stats.assists)}`}
          />
          <MiniStat label="Double kills" value={formatNumber(stats.double_kills)} />
          <MiniStat label="Triple kills" value={formatNumber(stats.triple_kills)} />
          <MiniStat label="Quadra kills" value={formatNumber(stats.quadra_kills)} />
          <MiniStat label="Penta kills" value={formatNumber(stats.penta_kills)} />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Section title="Roles">
          {(roles ?? []).length > 0 ? (
            (roles ?? [])
              .slice()
              .sort((a, b) => b.games - a.games)
              .map((r) => (
                <RateRow
                  key={r.role}
                  icon={<span className="block w-0" />}
                  name={r.role}
                  games={r.games}
                  wins={r.wins}
                />
              ))
          ) : (
            <Empty />
          )}
        </Section>
        <Section title="Queues">
          {(queues ?? []).length > 0 ? (
            (queues ?? [])
              .slice()
              .sort((a, b) => b.games - a.games)
              .map((q) => (
                <RateRow
                  key={q.queueId}
                  icon={<span className="block w-0" />}
                  name={QUEUE_LABELS[q.queueId] ?? `Queue ${q.queueId}`}
                  games={q.games}
                  wins={q.wins}
                />
              ))
          ) : (
            <Empty />
          )}
        </Section>
        <Section title="Keystones">
          {topKeystones.length > 0 ? (
            topKeystones.map((k) => (
              <RateRow
                key={k.runeId}
                icon={<RuneIcon runeId={k.runeId} path={runeData[k.runeId]?.icon} size={26} />}
                name={runeData[k.runeId]?.name ?? `Rune ${k.runeId}`}
                games={k.picks}
                wins={k.wins}
              />
            ))
          ) : (
            <Empty />
          )}
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Section title="Most built items">
          {topItems.length > 0 ? (
            topItems.map((item) => (
              <RateRow
                key={item.item_id}
                icon={<ItemIcon itemId={item.item_id} size={26} patch={patch} />}
                name={getItemName(itemData, item.item_id)}
                games={item.picks}
                wins={item.wins}
              />
            ))
          ) : (
            <Empty />
          )}
        </Section>
        <Section title="Most picked augments">
          {topAugments.length > 0 ? (
            topAugments.map((a) => (
              <RateRow
                key={a.augment_id}
                icon={<AugmentIcon augmentId={a.augment_id} size={26} />}
                name={getAugmentName(augmentData, a.augment_id)}
                games={a.picks}
                wins={a.wins}
              />
            ))
          ) : (
            <Empty />
          )}
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {(
          [
            ["Best matchups", bestMatchups],
            ["Worst matchups", worstMatchups],
            ["Best duo partners", bestAllies],
          ] as Array<[string, Array<ChampionMatchupRow | ChampionAllyRow>]>
        ).map(([title, rows]) => (
          <Section key={title} title={title} hint={`min ${MIN_MATCHUP_GAMES} games`}>
            {rows.length > 0 ? (
              rows.map((r) => (
                <RateRow
                  key={r.championId}
                  icon={<ChampionIcon championId={r.championId} size={26} className="rounded-md" />}
                  name={getChampionName(champData, r.championId)}
                  games={r.games}
                  wins={r.wins}
                />
              ))
            ) : (
              <Empty />
            )}
          </Section>
        ))}
      </div>

      {shownRecords.length > 0 && (
        <Section title="Personal records">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {shownRecords.map((r) => (
              <button
                key={r.key}
                type="button"
                disabled={r.gameId == null}
                onClick={() => r.gameId != null && navigate(`/match/${r.gameId}`)}
                className="rounded-[10px] border border-lol-border bg-black/10 px-3 py-2.5 text-left transition-colors enabled:hover:border-lol-crimson/70"
              >
                <div className="text-[10.5px] font-bold uppercase tracking-widest text-lol-text/80">
                  {r.label}
                </div>
                <div className="mt-0.5 font-display text-[20px] font-bold text-lol-gold">
                  {DURATION_RECORDS.has(r.key) ? formatDuration(r.value) : formatPlain(r.value, 2)}
                </div>
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title="Recent games" hint={`${history?.total ?? 0} total`}>
        {(history?.matches ?? []).length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {history?.matches.map((match) => (
              <MatchRowExperiment
                key={match.game_id}
                match={match}
                championName={name}
                champData={champData}
                polishRows
              />
            ))}
          </div>
        ) : (
          <Empty text="No games" />
        )}
      </Section>
    </div>
  );
}
