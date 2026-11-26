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
import { useScopedQueue } from "../lib/historyScope";
import { useActiveMode } from "../hooks/useActiveMode";
import AugmentIcon from "../components/AugmentIcon";
import ChampionIcon from "../components/ChampionIcon";
import ItemIcon from "../components/ItemIcon";
import { LineChart } from "../components/LineChart";
import { MatchRow } from "../components/MatchRow";
import RuneIcon from "../components/RuneIcon";
import { FilterSelect } from "../components/FilterSelect";
import PatchSelect from "../components/PatchSelect";
import WinRateBar from "../components/WinRateBar";
import { HeroTile, SplashHero } from "../components/SplashHero";
import { Title } from "../components/live/shared";
import { mergeItemsByName } from "../../shared/item-merge";

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
    <section className={`app-tile min-w-0 ${className}`}>
      <Title aside={hint && <span className="text-[12px] text-lol-text">{hint}</span>}>
        {title}
      </Title>
      {children}
    </section>
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
    <div className="mb-1.5 flex h-10 items-center gap-2.5 rounded-lg border border-lol-border/40 bg-black/25 px-2.5 last:mb-0">
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

// Riot's position codes; ARAM-style queues report none
const ROLE_LABELS: Record<string, string> = {
  TOP: "Top",
  JUNGLE: "Jungle",
  MIDDLE: "Mid",
  BOTTOM: "Bot",
  UTILITY: "Support",
  UNKNOWN: "No role",
};

// One line over every champion. Per-game averages are weighted by each champion's game count.
function sumChampionStats(rows: ChampionStats[]): ChampionStats {
  const sum = (pick: (r: ChampionStats) => number) => rows.reduce((s, r) => s + pick(r), 0);
  const games = sum((r) => r.games);
  const mean = (pick: (r: ChampionStats) => number | null) => {
    const known = rows.filter((r) => pick(r) != null);
    const weight = known.reduce((s, r) => s + r.games, 0);
    return weight > 0
      ? known.reduce((s, r) => s + (pick(r) as number) * r.games, 0) / weight
      : null;
  };
  return {
    champion_id: 0,
    games,
    wins: sum((r) => r.wins),
    kills: sum((r) => r.kills),
    deaths: sum((r) => r.deaths),
    assists: sum((r) => r.assists),
    avg_kills: games > 0 ? sum((r) => r.kills) / games : 0,
    avg_deaths: games > 0 ? sum((r) => r.deaths) / games : 0,
    avg_assists: games > 0 ? sum((r) => r.assists) / games : 0,
    avg_damage: Math.round(mean((r) => r.avg_damage) ?? 0),
    avg_gold: Math.round(mean((r) => r.avg_gold) ?? 0),
    avg_cs_per_min: mean((r) => r.avg_cs_per_min),
    avg_score: mean((r) => r.avg_score),
    mvps: sum((r) => r.mvps),
    aces: sum((r) => r.aces),
    double_kills: sum((r) => r.double_kills),
    triple_kills: sum((r) => r.triple_kills),
    quadra_kills: sum((r) => r.quadra_kills),
    penta_kills: sum((r) => r.penta_kills),
  };
}

// Shown only on the all-champions summary
function SummaryPanels({ detail }: { detail: ChampionDetailStats }) {
  const num = (v: number | null | undefined) => formatNumber(Math.round(v ?? 0));
  const dec = (v: number | null | undefined) => (v ?? 0).toFixed(2);
  const secs = (v: number | null | undefined) => formatDuration(Math.round(v ?? 0));
  const panels: Array<[string, Array<[string, string]>]> = [
    [
      "Damage dealt (avg)",
      [
        ["Physical", num(detail.avgPhysicalDamageDealt)],
        ["Magic", num(detail.avgMagicDamageDealt)],
        ["True", num(detail.avgTrueDamageDealt)],
        ["CC time on others (s)", num(detail.avgTimeCcOthers)],
        ["CC per minute", dec(detail.avgCcPerMin)],
      ],
    ],
    [
      "Damage taken (avg)",
      [
        ["Physical", num(detail.avgPhysicalDamageTaken)],
        ["Magic", num(detail.avgMagicDamageTaken)],
        ["True", num(detail.avgTrueDamageTaken)],
        ["Self mitigated", num(detail.avgDamageSelfMitigated)],
        ["Healing", num(detail.avgHeal)],
      ],
    ],
    [
      "Survival and streaks",
      [
        ["Avg longest life", secs(detail.avgLongestAlive)],
        ["Longest life", secs(detail.maxLongestAlive)],
        ["Killing sprees / game", dec(detail.avgKillingSprees)],
        ["First blood kills", num(detail.totalFirstBloodKill)],
        ["First blood assists", num(detail.totalFirstBloodAssist)],
      ],
    ],
    [
      "Economy (avg)",
      [
        ["Gold earned", num(detail.avgGoldEarned)],
        ["Gold spent", num(detail.avgGoldSpent)],
        ["CS", num(detail.avgTotalMinionsKilled + detail.avgNeutralMinionsKilled)],
      ],
    ],
    [
      "Turrets and inhibitors",
      [
        ["Turrets / game", dec(detail.avgTurretKills)],
        ["Turrets total", num(detail.totalTurretKills)],
        ["Inhibitors / game", dec(detail.avgInhibitorKills)],
        ["Inhibitors total", num(detail.totalInhibitorKills)],
        ["Damage to turrets", num(detail.avgDamageToTurrets)],
        ["First towers", num(detail.totalFirstTowerKill)],
      ],
    ],
  ];
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
      {panels.map(([title, rows]) => (
        <Section key={title} title={title}>
          {rows.map(([label, value]) => (
            <MiniStat key={label} label={label} value={value} />
          ))}
        </Section>
      ))}
    </div>
  );
}

export default function ChampionDetail() {
  const { championId = "" } = useParams<{ championId: string }>();
  // "/champions/all" is the same page over every champion; the queries read null as "no champion filter"
  const id = championId === "all" ? null : Number(championId);
  const navigate = useNavigate();
  const champData = useChampionData();
  const [patch, setPatch] = useViewState<string | undefined>("champions.patch", undefined);
  const [timePeriod, setTimePeriod] = useViewState<HomeTimePeriod>("champions.timePeriod", "full");
  const [queue, setQueue] = useViewState<number | undefined>("champions.queue", undefined);
  const scopedQueue = useScopedQueue(queue);
  const [dataMode] = useActiveMode();
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
    () => window.api.getChampionWeeklyWinRate(id, account, scopedQueue),
    [id, account, scopedQueue],
  );
  const { data: roles } = useIpc<ChampionRoleStat[]>(
    () => window.api.getChampionRoleStats(id, patch, scopedQueue, account, timePeriod),
    [id, patch, scopedQueue, account, timePeriod],
  );
  const { data: queues } = useIpc<ChampionQueueStat[]>(
    () => window.api.getChampionQueueStats(id, account, scopedQueue),
    [id, account, scopedQueue],
  );
  const { data: keystones } = useIpc<ChampionKeystoneStat[]>(
    () => window.api.getChampionKeystones(id, account, timePeriod, scopedQueue),
    [id, account, timePeriod, scopedQueue],
  );
  const { data: augments } = useIpc<AugmentStats[]>(
    () => window.api.getAugmentStats(id ?? undefined, patch, scopedQueue, account, timePeriod),
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

  const stats = useMemo(() => {
    if (id !== null) return allStats?.find((item) => item.champion_id === id) ?? null;
    return allStats ? sumChampionStats(allStats) : null;
  }, [allStats, id]);
  const name = id === null ? "All champions" : getChampionName(champData, id);
  const mostPlayedId = allStats?.[0]?.champion_id;

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

  const topItems = mergeItemsByName(
    (globalDetail?.items ?? []).filter((item) => !item.isTrinket),
    (itemId) => getItemName(itemData, itemId),
  ).slice(0, 6);
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
      <div className="flex w-full flex-col gap-5">
        {backButton}
        <p className="py-10 text-center text-sm text-lol-text">Loading…</p>
      </div>
    );
  }
  if (!stats || stats.games === 0) {
    return (
      <div className="flex w-full flex-col gap-5">
        {backButton}
        <p className="py-10 text-center text-sm text-lol-text">
          {id === null ? "No games" : "No games with this champion"} for the selected filters.
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
    <div className="flex w-full flex-col gap-5">
      {backButton}

      <SplashHero championId={id ?? mostPlayedId}>
        <div className="flex items-center gap-5">
          {id !== null && (
            <ChampionIcon
              championId={id}
              size={96}
              className="shrink-0 rounded-2xl border border-lol-crimson/50 shadow-[0_0_28px_var(--theme-crimson-glow)]"
            />
          )}
          <div className="min-w-0">
            <h1 className="font-display text-[34px] font-bold leading-none text-lol-text-bright">
              {name}
            </h1>
            <p className="mt-2 text-[13px] text-lol-text">
              {formatNumber(games)} games ·{" "}
              <span className="text-lol-win">{formatNumber(wins)}W</span>{" "}
              <span className="text-lol-loss">{formatNumber(games - wins)}L</span>
              {streak && (
                <span
                  className={`ml-3 rounded-md px-2 py-0.5 text-xs font-bold ${
                    streak.type === "W"
                      ? "bg-lol-win/15 text-lol-win"
                      : "bg-lol-loss/15 text-lol-loss"
                  }`}
                >
                  {streak.type}
                  {streak.count} streak
                </span>
              )}
            </p>
            <div className="mt-3 font-display text-[26px] font-bold leading-none tabular-nums">
              <span className="text-lol-gold">{stats.avg_kills.toFixed(1)}</span>
              <span className="text-lol-text/40"> / </span>
              <span className="text-lol-loss">{stats.avg_deaths.toFixed(1)}</span>
              <span className="text-lol-text/40"> / </span>
              <span className="text-lol-assist">{stats.avg_assists.toFixed(1)}</span>
            </div>
            <div className="mt-1 text-[11px] text-lol-text">average K / D / A per game</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <HeroTile
            label="Win rate"
            value={`${wr.toFixed(1)}%`}
            valueClass={wr >= 50 ? "text-lol-win" : "text-lol-loss"}
          />
          <HeroTile label="KDA" value={kda != null ? kda.toFixed(2) : "∞"} />
          <HeroTile
            label="Score"
            value={stats.avg_score != null ? stats.avg_score.toFixed(1) : "—"}
            valueClass={stats.avg_score != null ? scoreColor(stats.avg_score) : "text-lol-text"}
          />
          {/* Career totals are too wide for one tile, so the summary puts ACE on the second line */}
          <HeroTile
            label={id === null ? "MVP" : "MVP / ACE"}
            value={id === null ? formatNumber(stats.mvps) : `${stats.mvps} / ${stats.aces}`}
            sub={id === null ? `${formatNumber(stats.aces)} ACE` : undefined}
          />
          <HeroTile
            label="CS / min"
            value={stats.avg_cs_per_min != null ? stats.avg_cs_per_min.toFixed(1) : "—"}
          />
          <HeroTile
            label="Avg damage"
            value={formatNumber(stats.avg_damage)}
            sub={`${pct(detail?.damageShare)} share`}
          />
          <HeroTile
            label="Avg gold"
            value={formatNumber(stats.avg_gold)}
            valueClass="text-lol-gold"
          />
          <HeroTile
            label="Kill participation"
            value={pct(detail?.killParticipation)}
            valueClass="text-lol-assist"
          />
        </div>
      </SplashHero>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {dataMode !== "mayhem" && (
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
        )}
        <PatchSelect value={patch} onChange={setPatch} />
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

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Section title="Win rate over time" hint="weekly" className="xl:col-span-2">
          {series.values.length >= 2 ? (
            <LineChart
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

      {id === null && detail && <SummaryPanels detail={detail} />}

      {id !== null && (
        <div
          className={`grid grid-cols-1 gap-5 ${dataMode === "mayhem" ? "xl:grid-cols-2" : "xl:grid-cols-3"}`}
        >
          <Section title="Roles">
            {(roles ?? []).length > 0 ? (
              (roles ?? [])
                .slice()
                .sort((a, b) => b.games - a.games)
                .map((r) => (
                  <RateRow
                    key={r.role}
                    icon={<span className="block w-0" />}
                    name={ROLE_LABELS[r.role] ?? r.role}
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
          {/* ARAM Mayhem has no runes */}
          {dataMode !== "mayhem" && (
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
          )}
        </div>
      )}

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
              <MatchRow
                key={match.game_id}
                match={match}
                championName={getChampionName(champData, match.champion_id)}
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
