import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type {
  AugmentStats,
  ChampionDetailStats,
  ChampionKeystoneStat,
  ChampionRoleStat,
  ChampionStats,
  ChampionWeeklyWinRate,
  GlobalChampionDetail,
  ItemStats,
  MatchListItem,
} from "../../shared/api";
import { QUEUE_LABELS } from "../../shared/queues";
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
import { formatDuration, formatNumber, formatPlaytime } from "../lib/format";
import { useHistoryScopeQueue } from "../lib/historyScope";
import AugmentIcon from "./AugmentIcon";
import ChampionIcon from "./ChampionIcon";
import { FilterSelect } from "./FilterSelect";
import { LineChartExp } from "./LineChartExp";
import { MatchRowExperiment } from "./MatchRowExperiment";
import { Panel } from "./Panel";
import PatchSelect from "./PatchSelect";
import RuneIcon from "./RuneIcon";
import { TabStrip, type TabStripItem } from "./TabStrip";
import WinRateBar from "./WinRateBar";
import ItemIcon from "./ItemIcon";

const TAB_ITEMS: TabStripItem[] = [
  { key: "ov", label: "Overview" },
  { key: "cb", label: "Combat", disabled: true },
  { key: "ec", label: "Economy", disabled: true },
  { key: "fa", label: "Farm", disabled: true },
  { key: "ob", label: "Objectives", disabled: true },
  { key: "vi", label: "Vision", disabled: true },
  { key: "ab", label: "Abilities", disabled: true },
  { key: "it", label: "Items", disabled: true },
  { key: "ru", label: "Runes", disabled: true },
  { key: "mu", label: "Matchups", disabled: true },
  { key: "sy", label: "Synergies", disabled: true },
  { key: "tl", label: "Timeline", disabled: true },
  { key: "tr", label: "Trends", disabled: true },
  { key: "rc", label: "Records", disabled: true },
  { key: "ma", label: "Matches", disabled: true },
  { key: "ms", label: "Mastery", disabled: true },
];

type RateSort = "count" | "winRate";

export function ChampionDetailExp() {
  const { championId = "" } = useParams<{ championId: string }>();
  const id = Number(championId);
  const navigate = useNavigate();
  const champData = useChampionData();
  const [patch, setPatch] = useViewState<string | undefined>("champions.patch", undefined);
  const [queue, setQueue] = useViewState<number | undefined>("champions.queue", undefined);
  const [activeTab, setActiveTab] = useState("ov");
  const [wrTab, setWrTab] = useState<"weekly" | "monthly" | "full">("weekly");
  const [augmentSort, setAugmentSort] = useState<RateSort>("count");
  const [itemSort, setItemSort] = useState<RateSort>("count");
  const [keystoneSort, setKeystoneSort] = useState<RateSort>("count");
  const scopedQueue = queue ?? useHistoryScopeQueue();
  const [activeAccountRaw] = useActiveAccount();
  const account = activeAccountRaw === ALL_ACCOUNTS_SENTINEL ? "all" : activeAccountRaw;
  const overviewActive = activeTab === "ov";

  const { data: allStats } = useIpc<ChampionStats[]>(
    () => window.api.getChampionStats(patch, scopedQueue, account),
    [patch, scopedQueue, account],
  );
  const { data: detailStats, error: detailStatsError } = useIpc<ChampionDetailStats>(
    () => window.api.getChampionDetailStats(id, patch, scopedQueue, account),
    [id, patch, scopedQueue, account],
  );
  const { data: matchHistory } = useIpc<{ matches: MatchListItem[]; total: number }>(
    () =>
      overviewActive
        ? window.api.getChampionMatchHistory(id, 8, 0, patch, scopedQueue, account)
        : Promise.resolve({ matches: [], total: 0 }),
    [overviewActive, id, patch, scopedQueue, account],
  );
  const { data: globalDetail, loading: globalDetailLoading } = useIpc<GlobalChampionDetail | null>(
    () =>
      overviewActive
        ? window.api.getGlobalChampionDetail(id, patch, scopedQueue, account)
        : Promise.resolve(null),
    [overviewActive, id, patch, scopedQueue, account],
  );
  const { data: keystones, loading: keystonesLoading } = useIpc<ChampionKeystoneStat[]>(
    () =>
      overviewActive
        ? window.api.getChampionKeystones(id, account)
        : Promise.resolve([] as ChampionKeystoneStat[]),
    [overviewActive, id, account],
  );
  const { data: queueStats, loading: queueStatsLoading } = useIpc<
    Array<{ queueId: number; games: number; wins: number }>
  >(
    () =>
      overviewActive
        ? window.api.getChampionQueueStats(id, account)
        : Promise.resolve([] as Array<{ queueId: number; games: number; wins: number }>),
    [overviewActive, id, account],
  );
  const { data: roleStats, loading: roleStatsLoading } = useIpc<ChampionRoleStat[]>(
    () =>
      overviewActive
        ? window.api.getChampionRoleStats(id, patch, scopedQueue)
        : Promise.resolve([] as ChampionRoleStat[]),
    [overviewActive, id, patch, scopedQueue],
  );
  const { data: weeklyWinRate, loading: weeklyWinRateLoading } = useIpc<ChampionWeeklyWinRate[]>(
    () =>
      overviewActive
        ? window.api.getChampionWeeklyWinRate(id, account)
        : Promise.resolve([] as ChampionWeeklyWinRate[]),
    [overviewActive, id, account],
  );

  const stats = useMemo(
    () => allStats?.find((item) => item.champion_id === id) ?? null,
    [allStats, id],
  );
  const streak = useMemo(() => {
    const matches = matchHistory?.matches;
    if (!matches || matches.length === 0) return null;
    const type = matches[0].win === 1 ? "W" : "L";
    const count = matches.findIndex((match) => (match.win === 1 ? "W" : "L") !== type);
    return { type, count: count === -1 ? matches.length : count };
  }, [matchHistory]);

  useEffect(() => {
    if (detailStatsError) {
      console.error("[CH-8] getChampionDetailStats failed:", detailStatsError);
    }
  }, [detailStatsError]);

  const augmentData = useAugmentData(patch);
  const itemData = useItemData(patch);
  const runeData = useRuneData();
  const name = getChampionName(champData, id);
  const games = stats?.games ?? 0;
  const wins = stats?.wins ?? 0;
  const losses = games - wins;
  const wr = games > 0 ? (wins / games) * 100 : 0;
  const kda = stats && stats.deaths > 0 ? (stats.kills + stats.assists) / stats.deaths : null;

  const wrSeries = useMemo(() => {
    const entries = weeklyWinRate ?? [];
    if (wrTab === "full") {
      const sortedEntries = entries
        .slice()
        .sort((a, b) => new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime());
      let cumulativeGames = 0;
      let cumulativeWins = 0;
      const values: number[] = [];
      const labels: string[] = [];
      const cumulativeGameCounts: number[] = [];
      for (const entry of sortedEntries) {
        cumulativeGames += entry.games;
        cumulativeWins += entry.wins;
        cumulativeGameCounts.push(cumulativeGames);
        values.push(cumulativeGames > 0 ? (cumulativeWins / cumulativeGames) * 100 : 0);
        labels.push(
          new Date(entry.weekStart).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          }),
        );
      }
      const totalGames = cumulativeGameCounts.at(-1) ?? 0;
      const hasQualifiedSeries = values.length >= 2 && totalGames >= 3;
      return {
        values,
        labels,
        last: totalGames >= 3 ? (values.at(-1) ?? null) : null,
        peak: hasQualifiedSeries ? Math.max(...values) : null,
        low: hasQualifiedSeries ? Math.min(...values) : null,
      };
    }

    const buckets = new Map<string, { games: number; wins: number; label: string }>();
    for (const entry of entries) {
      const date = new Date(entry.weekStart);
      const key =
        wrTab === "weekly"
          ? String(entry.weekStart)
          : `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      const label =
        wrTab === "weekly"
          ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
          : date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).slice(0, 3);
      const current = buckets.get(key) ?? { games: 0, wins: 0, label };
      current.games += entry.games;
      current.wins += entry.wins;
      buckets.set(key, current);
    }
    const bucketValues = [...buckets.values()];
    const values = bucketValues.map((bucket) =>
      bucket.games > 0 ? (bucket.wins / bucket.games) * 100 : 0,
    );
    const labels = bucketValues.map((bucket) => bucket.label);
    const qualifyingValues = bucketValues
      .filter((bucket) => bucket.games >= 3)
      .map((bucket) => (bucket.wins / bucket.games) * 100);
    return {
      values,
      labels,
      last: qualifyingValues.at(-1) ?? null,
      peak: qualifyingValues.length > 0 ? Math.max(...qualifyingValues) : null,
      low: qualifyingValues.length > 0 ? Math.min(...qualifyingValues) : null,
    };
  }, [weeklyWinRate, wrTab]);

  if (!stats || games === 0) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
        <button
          type="button"
          onClick={() => navigate("/champions")}
          className="self-start rounded-lg border border-lol-border bg-lol-card px-3 py-1.5 text-sm font-medium text-lol-text-bright transition-colors hover:border-lol-crimson"
        >
          ← All champions
        </button>
        <Panel>
          <p className="py-8 text-center text-sm text-lol-text">
            No games with this champion for the selected filters.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
      <button
        type="button"
        onClick={() => navigate("/champions")}
        className="self-start rounded-lg border border-lol-border bg-lol-card px-3 py-1.5 text-sm font-medium text-lol-text-bright transition-colors hover:border-lol-crimson"
      >
        ← All champions
      </button>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-lol-border bg-[linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] p-5">
        <div className="flex min-w-0 items-center gap-4">
          <ChampionIcon championId={id} size={76} className="rounded-2xl" />
          <div className="min-w-0">
            <h1 className="font-display text-[28px] font-bold leading-tight text-lol-text-bright">
              {name}
            </h1>
            <p className="mt-1 text-lol-text">
              {formatNumber(games)} games · {formatNumber(wins)}W {formatNumber(losses)}L
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            value={queue != null ? String(queue) : undefined}
            onChange={(value) => setQueue(value === undefined ? undefined : Number(value))}
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
          <PatchSelect value={patch} onChange={setPatch} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat
          label="Games"
          value={formatNumber(games)}
          sub={`${formatNumber(wins)}W · ${formatNumber(losses)}L`}
        />
        <Stat
          label="Win rate"
          value={`${wr.toFixed(1)}%`}
          sub=""
          valueClass={wr >= 50 ? "text-lol-win" : "text-lol-loss"}
        />
        <Stat
          label="KDA"
          value={kda != null ? kda.toFixed(2) : "Perfect"}
          sub={`${stats.avg_kills.toFixed(1)} / ${stats.avg_deaths.toFixed(1)} / ${stats.avg_assists.toFixed(1)}`}
          valueClass={
            kda != null && kda >= 4
              ? "text-lol-gold"
              : kda != null && kda >= 3
                ? "text-lol-win"
                : ""
          }
        />
        <Stat
          label="CS / min"
          value={stats.avg_cs_per_min != null ? stats.avg_cs_per_min.toFixed(1) : "—"}
          sub=""
        />
        <Stat
          label="Score"
          value={stats.avg_score != null ? stats.avg_score.toFixed(1) : "—"}
          sub=""
          valueClass="text-lol-gold"
        />
        <Stat
          label="MVP / ACE"
          value={`${formatNumber(stats.mvps)} / ${formatNumber(stats.aces)}`}
          sub=""
        />
        <Stat label="Avg damage" value={formatNumber(stats.avg_damage)} sub="" />
        <Stat label="Avg gold" value={formatNumber(stats.avg_gold)} sub="" />
        <Stat
          label="Kill participation"
          value={detailStats ? `${(detailStats.killParticipation * 100).toFixed(1)}%` : "—"}
          sub=""
        />
        <Stat
          label="Damage share"
          value={detailStats ? `${(detailStats.damageShare * 100).toFixed(1)}%` : "—"}
          sub=""
        />
        <Stat
          label="Avg damage taken"
          value={detailStats ? formatNumber(Math.round(detailStats.avgDamageTaken)) : "—"}
          sub=""
        />
        <Stat
          label="Avg heal"
          value={detailStats ? formatNumber(Math.round(detailStats.avgHeal)) : "—"}
          sub=""
        />
        <Stat
          label="Gold / min"
          value={detailStats ? Math.round(detailStats.goldPerMin).toString() : "—"}
          sub=""
        />
        <Stat
          label="Avg game length"
          value={detailStats ? formatDuration(Math.round(detailStats.avgGameLength)) : "—"}
          sub=""
        />
        <Stat
          label="Total time played"
          value={detailStats ? formatPlaytime(Math.round(detailStats.totalTimePlayed)) : "—"}
          sub=""
        />
        <Stat
          label="Streak"
          value={streak ? `${streak.type}${streak.count}` : "—"}
          sub={
            streak && detailStats && detailStats.longestWinStreak > 0
              ? `max W${detailStats.longestWinStreak}`
              : ""
          }
          valueClass={
            streak?.type === "W" ? "text-lol-win" : streak?.type === "L" ? "text-lol-loss" : ""
          }
        />
      </div>

      <TabStrip items={TAB_ITEMS} active={activeTab} onChange={setActiveTab} />

      {activeTab === "ov" ? (
        <OverviewTab
          globalDetail={globalDetail}
          globalDetailLoading={globalDetailLoading}
          weeklyWinRate={weeklyWinRate}
          weeklyWinRateLoading={weeklyWinRateLoading}
          wrSeries={wrSeries}
          wrTab={wrTab}
          setWrTab={setWrTab}
          roleStats={roleStats}
          roleStatsLoading={roleStatsLoading}
          augments={globalDetail?.augments ?? []}
          augmentData={augmentData}
          augmentSort={augmentSort}
          setAugmentSort={setAugmentSort}
          items={globalDetail?.items ?? []}
          itemData={itemData}
          patch={patch}
          itemSort={itemSort}
          setItemSort={setItemSort}
          keystones={keystones}
          keystonesLoading={keystonesLoading}
          runeData={runeData}
          keystoneSort={keystoneSort}
          setKeystoneSort={setKeystoneSort}
          queueStats={queueStats}
          queueStatsLoading={queueStatsLoading}
          matchHistory={matchHistory}
          championName={name}
          champData={champData}
        />
      ) : (
        <Panel>
          <p className="py-8 text-center text-sm text-lol-text">This tab lands in a later phase.</p>
        </Panel>
      )}
    </div>
  );
}

function OverviewTab({
  globalDetail,
  globalDetailLoading,
  weeklyWinRate,
  weeklyWinRateLoading,
  wrSeries,
  wrTab,
  setWrTab,
  roleStats,
  roleStatsLoading,
  augments,
  augmentData,
  augmentSort,
  setAugmentSort,
  items,
  itemData,
  patch,
  itemSort,
  setItemSort,
  keystones,
  keystonesLoading,
  runeData,
  keystoneSort,
  setKeystoneSort,
  queueStats,
  queueStatsLoading,
  matchHistory,
  championName,
  champData,
}: {
  globalDetail: GlobalChampionDetail | null;
  globalDetailLoading: boolean;
  weeklyWinRate: ChampionWeeklyWinRate[] | null;
  weeklyWinRateLoading: boolean;
  wrSeries: {
    values: number[];
    labels: string[];
    last: number | null;
    peak: number | null;
    low: number | null;
  };
  wrTab: "weekly" | "monthly" | "full";
  setWrTab: (tab: "weekly" | "monthly" | "full") => void;
  roleStats: ChampionRoleStat[] | null;
  roleStatsLoading: boolean;
  augments: AugmentStats[];
  augmentData: ReturnType<typeof useAugmentData>;
  augmentSort: RateSort;
  setAugmentSort: (sort: RateSort) => void;
  items: ItemStats[];
  itemData: ReturnType<typeof useItemData>;
  patch?: string;
  itemSort: RateSort;
  setItemSort: (sort: RateSort) => void;
  keystones: ChampionKeystoneStat[] | null;
  keystonesLoading: boolean;
  runeData: ReturnType<typeof useRuneData>;
  keystoneSort: RateSort;
  setKeystoneSort: (sort: RateSort) => void;
  queueStats: Array<{ queueId: number; games: number; wins: number }> | null;
  queueStatsLoading: boolean;
  matchHistory: { matches: MatchListItem[]; total: number } | null;
  championName: string;
  champData: ReturnType<typeof useChampionData>;
}) {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Panel className="xl:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading title="Win rate over time" />
          <SortButtons
            value={wrTab}
            options={[
              ["weekly", "Weekly"],
              ["monthly", "Monthly"],
              ["full", "Full"],
            ]}
            onChange={setWrTab}
          />
        </div>
        {weeklyWinRateLoading || globalDetailLoading || !weeklyWinRate || !globalDetail ? (
          <SectionLoading />
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-lol-text">
              <span>
                Now:{" "}
                <b className="text-lol-text-bright">
                  {wrSeries.last != null ? `${wrSeries.last.toFixed(1)}%` : "—"}
                </b>
              </span>
              <span>
                Peak:{" "}
                <b className="text-lol-win">
                  {wrSeries.peak != null ? `${wrSeries.peak.toFixed(1)}%` : "—"}
                </b>{" "}
                / Low:{" "}
                <b className="text-lol-loss">
                  {wrSeries.low != null ? `${wrSeries.low.toFixed(1)}%` : "—"}
                </b>
              </span>
            </div>
            {wrSeries.values.length < 2 ? (
              <div className="flex flex-col items-center justify-center py-6">
                <div
                  className={`font-display text-4xl font-bold ${
                    (wrSeries.values[0] ?? 0) >= 50 ? "text-lol-win" : "text-lol-loss"
                  }`}
                >
                  {wrSeries.values[0] != null ? `${wrSeries.values[0].toFixed(1)}%` : "—"}
                </div>
                <span className="mt-1 text-xs text-lol-text">
                  {wrTab === "full"
                    ? `Overall win rate across ${globalDetail.games} games`
                    : `from ${wrSeries.values.length} bucket${wrSeries.values.length === 1 ? "" : "s"}`}
                </span>
              </div>
            ) : (
              <LineChartExp
                values={wrSeries.values}
                format={(value) => `${value.toFixed(1)}%`}
                color="var(--theme-win)"
                min={0}
                max={100}
                baseline={50}
                xLabels={wrSeries.labels}
                yFormat={(value) => `${value.toFixed(0)}%`}
                yTicks={[0, 25, 50, 75, 100]}
              />
            )}
            <p className="mt-2 text-xs text-lol-text">
              Weeks with fewer than 3 games are shown in the chart but excluded from Now / Peak /
              Low.
            </p>
          </>
        )}
      </Panel>

      <Panel>
        <SectionHeading title="Role split" aside="Games and win rate" />
        {roleStatsLoading || !roleStats ? (
          <SectionLoading />
        ) : roleStats.length === 0 ? (
          <NoData text="No role data" />
        ) : (
          <div className="flex flex-col gap-2.5">
            {roleStats.map((role) => (
              <RoleRow key={role.role} role={role.role} games={role.games} wins={role.wins} />
            ))}
          </div>
        )}
      </Panel>

      <RatePanel
        title="Top augments"
        sort={augmentSort}
        options={[
          ["count", "Most picked"],
          ["winRate", "Best win rate"],
        ]}
        onSortChange={setAugmentSort}
        loading={globalDetailLoading}
        empty={augments.length === 0}
      >
        {sortRates(augments, augmentSort).map((augment) => (
          <RateRow
            key={augment.augment_id}
            icon={<AugmentIcon augmentId={augment.augment_id} size={24} />}
            name={getAugmentName(augmentData, augment.augment_id)}
            wins={augment.wins}
            total={augment.picks}
            count={`${augment.picks}x`}
          />
        ))}
      </RatePanel>

      <RatePanel
        title="Top items"
        sort={itemSort}
        options={[
          ["count", "Most built"],
          ["winRate", "Best win rate"],
        ]}
        onSortChange={setItemSort}
        loading={globalDetailLoading}
        empty={items.length === 0}
      >
        {sortRates(items, itemSort).map((item) => (
          <RateRow
            key={item.item_id}
            icon={<ItemIcon itemId={item.item_id} size={24} patch={patch} />}
            name={getItemName(itemData, item.item_id)}
            wins={item.wins}
            total={item.picks}
            count={`${item.picks}x`}
          />
        ))}
      </RatePanel>

      <RatePanel
        title="Keystones"
        sort={keystoneSort}
        options={[
          ["count", "Most played"],
          ["winRate", "Best win rate"],
        ]}
        onSortChange={setKeystoneSort}
        loading={keystonesLoading}
        empty={!keystones || keystones.length === 0}
      >
        {sortRates(keystones ?? [], keystoneSort).map((keystone) => (
          <RateRow
            key={keystone.runeId}
            icon={
              <RuneIcon runeId={keystone.runeId} path={runeData[keystone.runeId]?.icon} size={22} />
            }
            name={runeData[keystone.runeId]?.name ?? `Rune ${keystone.runeId}`}
            wins={keystone.wins}
            total={keystone.picks}
            count={`${keystone.picks}x`}
          />
        ))}
      </RatePanel>

      <Panel>
        <SectionHeading title="Games by queue" />
        {queueStatsLoading || !queueStats ? (
          <SectionLoading />
        ) : queueStats.length === 0 ? (
          <NoData />
        ) : (
          <div className="flex flex-col gap-1.5">
            {queueStats.map((queueStat) => (
              <div
                key={queueStat.queueId}
                className="flex items-center gap-3 rounded-lg bg-black/10 px-3 py-2 text-[12px]"
              >
                <span className="min-w-0 flex-1 truncate text-lol-text-bright">
                  {QUEUE_LABELS[queueStat.queueId] ?? `Queue ${queueStat.queueId}`}
                </span>
                <span className="shrink-0 text-lol-text">{queueStat.games}</span>
                <span className="shrink-0 text-lol-text">
                  <span className="text-lol-win">{queueStat.wins}W</span>{" "}
                  <span className="text-lol-loss">{queueStat.games - queueStat.wins}L</span>
                </span>
                <div className="w-20 shrink-0">
                  <WinRateBar wins={queueStat.wins} total={queueStat.games} showPercent={false} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel className="xl:col-span-2">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-[16px] font-semibold text-lol-text-bright">
            Recent games
          </h2>
          <span className="text-[13px] text-lol-text">
            {matchHistory?.matches.length ?? 0} loaded
          </span>
        </div>
        <div
          className="match-list-exp flex flex-col gap-2.5"
          style={{ containerType: "inline-size" }}
        >
          {!matchHistory || matchHistory.matches.length === 0 ? (
            <p className="py-6 text-center text-sm text-lol-text">No games</p>
          ) : (
            matchHistory.matches.map((match) => (
              <MatchRowExperiment
                key={match.game_id}
                match={match}
                championName={championName}
                champData={champData}
              />
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}

function RatePanel({
  title,
  sort,
  options,
  onSortChange,
  loading,
  empty,
  children,
}: {
  title: string;
  sort: RateSort;
  options: [RateSort, string][];
  onSortChange: (sort: RateSort) => void;
  loading: boolean;
  empty: boolean;
  children: ReactNode;
}) {
  return (
    <Panel>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SectionHeading title={title} />
        <SortButtons value={sort} options={options} onChange={onSortChange} />
      </div>
      {loading ? (
        <SectionLoading />
      ) : empty ? (
        <NoData />
      ) : (
        <div className="flex max-h-[340px] flex-col gap-2 overflow-y-auto">{children}</div>
      )}
    </Panel>
  );
}

function SortButtons<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-lol-border/60 bg-lol-card/40 p-0.5">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
            value === key
              ? "bg-lol-crimson text-lol-text-bright"
              : "text-lol-text hover:text-lol-text-bright"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function sortRates<T extends { picks: number; wins: number }>(items: T[], sort: RateSort) {
  return items
    .slice()
    .sort((a, b) => {
      if (sort === "winRate") {
        const aRate = a.picks > 0 ? a.wins / a.picks : 0;
        const bRate = b.picks > 0 ? b.wins / b.picks : 0;
        return bRate - aRate || b.picks - a.picks;
      }
      return b.picks - a.picks;
    })
    .slice(0, 15);
}

function Stat({
  label,
  value,
  sub,
  valueClass = "",
}: {
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-lol-border bg-black/10 px-3.5 py-3">
      <span className="text-[12.5px] uppercase tracking-wider text-lol-text">{label}</span>
      <b
        className={`my-0.5 block font-display text-[24px] font-bold leading-tight text-lol-text-bright ${valueClass}`}
      >
        {value}
      </b>
      {sub && <div className="text-[12px] text-lol-text">{sub}</div>}
    </div>
  );
}

function SectionHeading({ title, aside }: { title: string; aside?: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="font-display text-[16px] font-semibold text-lol-text-bright">{title}</h2>
      {aside && <span className="text-[12px] text-lol-text">{aside}</span>}
    </div>
  );
}

function SectionLoading() {
  return <p className="py-3 text-sm text-lol-text">Loading…</p>;
}

function NoData({ text = "No data" }: { text?: string }) {
  return <span className="text-[12.5px] text-lol-text">{text}</span>;
}

function RoleRow({ role, games, wins }: ChampionRoleStat) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-xs font-semibold text-lol-text-bright">{role}</span>
      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-lol-text">{games}</span>
      <div className="min-w-0 flex-1">
        <WinRateBar wins={wins} total={games} />
      </div>
    </div>
  );
}

function RateRow({
  icon,
  name,
  wins,
  total,
  count,
}: {
  icon: ReactNode;
  name: string;
  wins: number;
  total: number;
  count: string;
}) {
  const rate = total > 0 ? (wins / total) * 100 : 0;
  return (
    <div className="flex min-w-0 items-center gap-2">
      {icon}
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-lol-text-bright">{name}</span>
      <span className="shrink-0 text-[11px] text-lol-text">{count}</span>
      <div className="w-20 shrink-0">
        <WinRateBar wins={wins} total={total} showPercent={false} />
      </div>
      <span
        className={`w-11 shrink-0 text-right text-[11px] tabular-nums ${rate >= 50 ? "text-lol-win" : "text-lol-loss"}`}
      >
        {rate.toFixed(1)}%
      </span>
    </div>
  );
}
