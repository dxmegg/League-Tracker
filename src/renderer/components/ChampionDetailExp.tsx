import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type {
  AugmentStats,
  ChampionAllyRow,
  ChampionDetailStats,
  ChampionKeystoneStat,
  ChampionMatchupRow,
  ChampionRuneStatsResult,
  ChampionRoleStat,
  ChampionStats,
  ChampionSkillOrdersResult,
  ChampionTeammateRow,
  ChampionTimelineGame,
  ChampionTrendsData,
  ChampionWeeklyWinRate,
  GlobalChampionDetail,
  ItemStats,
  MatchListItem,
  TimelineData,
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
  useSummonerSpellData,
} from "../hooks/useChampions";
import { useIpc } from "../hooks/useIpc";
import { useViewState } from "../hooks/useViewState";
import { ALL_ACCOUNTS_SENTINEL } from "../lib/accountsEvent";
import { formatDuration, formatNumber, formatPlaytime, formatTimeAgo } from "../lib/format";
import { useHistoryScopeQueue } from "../lib/historyScope";
import AugmentIcon from "./AugmentIcon";
import ChampionIcon from "./ChampionIcon";
import { FilterSelect } from "./FilterSelect";
import { LineChartExp } from "./LineChartExp";
import { MatchRowExperiment } from "./MatchRowExperiment";
import { Panel } from "./Panel";
import PatchSelect from "./PatchSelect";
import RuneIcon from "./RuneIcon";
import SummonerIcon from "./SummonerIcon";
import SummonerSpellIcon from "./SummonerSpellIcon";
import { TabStrip, type TabStripItem } from "./TabStrip";
import WinRateBar from "./WinRateBar";
import ItemIcon from "./ItemIcon";

const TAB_ITEMS: TabStripItem[] = [
  { key: "ov", label: "Overview" },
  { key: "cb", label: "Combat" },
  { key: "ec", label: "Economy" },
  { key: "fa", label: "Farm" },
  { key: "ob", label: "Objectives" },
  { key: "vi", label: "Vision" },
  { key: "ab", label: "Abilities" },
  { key: "it", label: "Items" },
  { key: "ru", label: "Runes" },
  { key: "mu", label: "Matchups" },
  { key: "sy", label: "Synergies" },
  { key: "tl", label: "Timeline" },
  { key: "tr", label: "Trends" },
  { key: "rc", label: "Records", disabled: true },
  { key: "ma", label: "Matches", disabled: true },
  { key: "ms", label: "Mastery", disabled: true },
];

type RateSort = "count" | "winRate";

type CombatMatch = MatchListItem & {
  physical_damage_dealt: number | null;
  magic_damage_dealt: number | null;
  physical_damage_taken: number | null;
  magic_damage_taken: number | null;
  true_damage_taken: number | null;
  damage_self_mitigated: number | null;
  damage_to_objectives: number | null;
  damage_to_turrets: number | null;
  time_cc_others: number | null;
  total_cc_dealt: number | null;
  longest_alive: number | null;
  killing_sprees: number | null;
  first_blood_kill: number | null;
  first_blood_assist: number | null;
};

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
  const [selectedTimelineGameId, setSelectedTimelineGameId] = useState<number | null>(null);
  const scopedQueue = queue ?? useHistoryScopeQueue();
  const [activeAccountRaw] = useActiveAccount();
  const account = activeAccountRaw === ALL_ACCOUNTS_SENTINEL ? "all" : activeAccountRaw;
  const overviewActive = activeTab === "ov";
  const combatActive = activeTab === "cb";
  const economyActive = activeTab === "ec";
  const farmActive = activeTab === "fa";
  const objectivesActive = activeTab === "ob";
  const visionActive = activeTab === "vi";
  const itemsActive = activeTab === "it";
  const abilitiesActive = activeTab === "ab";
  const runesActive = activeTab === "ru";
  const matchupsActive = activeTab === "mu";
  const synergiesActive = activeTab === "sy";
  const trendsActive = activeTab === "tr";
  const timelineActive = activeTab === "tl";
  const detailActive =
    overviewActive ||
    combatActive ||
    economyActive ||
    farmActive ||
    objectivesActive ||
    visionActive ||
    itemsActive ||
    abilitiesActive ||
    runesActive;

  const { data: allStats } = useIpc<ChampionStats[]>(
    () => window.api.getChampionStats(patch, scopedQueue, account),
    [patch, scopedQueue, account],
  );
  const {
    data: detailStats,
    loading: detailLoading,
    error: detailStatsError,
  } = useIpc<ChampionDetailStats>(
    () => window.api.getChampionDetailStats(id, patch, scopedQueue, account),
    [id, patch, scopedQueue, account],
  );
  const { data: skillOrders, loading: skillOrdersLoading } = useIpc<ChampionSkillOrdersResult>(
    () =>
      abilitiesActive
        ? window.api.getChampionSkillOrders(id, patch, scopedQueue, account)
        : Promise.resolve({
            topOrders: [],
            rTiming: { avgR1Min: null, avgR2Min: null, avgR3Min: null, sampleSize: 0 },
            summonerSpells: [],
            timelineCoverage: { gamesWithTimeline: 0, totalGames: 0 },
          }),
    [abilitiesActive, id, patch, scopedQueue, account],
  );
  const { data: runeStats, loading: runeStatsLoading } = useIpc<ChampionRuneStatsResult | null>(
    () =>
      runesActive
        ? window.api.getChampionRuneStats(id, patch, scopedQueue, account)
        : Promise.resolve(null),
    [runesActive, id, patch, scopedQueue, account],
  );
  const { data: matchupList, loading: matchupListLoading } = useIpc<ChampionMatchupRow[] | null>(
    () =>
      matchupsActive
        ? window.api.getChampionMatchupList(id, patch, scopedQueue, account)
        : Promise.resolve(null),
    [matchupsActive, id, patch, scopedQueue, account],
  );
  const { data: allyStats, loading: allyStatsLoading } = useIpc<ChampionAllyRow[] | null>(
    () =>
      synergiesActive
        ? window.api.getChampionAllyStats(id, patch, scopedQueue, account)
        : Promise.resolve(null),
    [synergiesActive, id, patch, scopedQueue, account],
  );
  const { data: teammateStats, loading: teammateStatsLoading } = useIpc<
    ChampionTeammateRow[] | null
  >(
    () =>
      synergiesActive
        ? window.api.getChampionTeammateStats(id, patch, scopedQueue, account)
        : Promise.resolve(null),
    [synergiesActive, id, patch, scopedQueue, account],
  );
  const { data: trends, loading: trendsLoading } = useIpc<ChampionTrendsData | null>(
    () =>
      trendsActive
        ? window.api.getChampionTrendsData(id, patch, scopedQueue, account)
        : Promise.resolve(null),
    [trendsActive, id, patch, scopedQueue, account],
  );
  const { data: timelineGames, loading: timelineGamesLoading } = useIpc<
    ChampionTimelineGame[] | null
  >(
    () =>
      timelineActive
        ? window.api.getChampionTimelineGames(id, 20, patch, scopedQueue, account)
        : Promise.resolve(null),
    [timelineActive, id, patch, scopedQueue, account],
  );
  const { data: timelineData, loading: timelineLoading } = useIpc<TimelineData | null>(
    () =>
      timelineActive && selectedTimelineGameId != null
        ? window.api.getTimeline(selectedTimelineGameId)
        : Promise.resolve(null),
    [timelineActive, selectedTimelineGameId],
  );
  const { data: matchHistory } = useIpc<{ matches: MatchListItem[]; total: number }>(
    () =>
      detailActive
        ? window.api.getChampionMatchHistory(
            id,
            combatActive || itemsActive ? 20 : 8,
            0,
            patch,
            scopedQueue,
            account,
          )
        : Promise.resolve({ matches: [], total: 0 }),
    [detailActive, combatActive, itemsActive, id, patch, scopedQueue, account],
  );
  const { data: globalDetail, loading: globalDetailLoading } = useIpc<GlobalChampionDetail | null>(
    () =>
      detailActive
        ? window.api.getGlobalChampionDetail(id, patch, scopedQueue, account)
        : Promise.resolve(null),
    [detailActive, id, patch, scopedQueue, account],
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
  useEffect(() => {
    if (
      timelineActive &&
      timelineGames != null &&
      timelineGames.length > 0 &&
      (selectedTimelineGameId == null ||
        !timelineGames.some((game) => game.gameId === selectedTimelineGameId))
    ) {
      setSelectedTimelineGameId(timelineGames[0].gameId);
    }
  }, [timelineActive, timelineGames, selectedTimelineGameId]);
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
      const tooltips: string[] = [];
      const cumulativeGameCounts: number[] = [];
      for (const entry of sortedEntries) {
        cumulativeGames += entry.games;
        cumulativeWins += entry.wins;
        cumulativeGameCounts.push(cumulativeGames);
        const wr = cumulativeGames > 0 ? (cumulativeWins / cumulativeGames) * 100 : 0;
        const label = new Date(entry.weekStart).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        });
        values.push(wr);
        labels.push(label);
        tooltips.push(`${label} · ${wr.toFixed(1)}% cumulative · ${cumulativeGames} games total`);
      }
      const totalGames = cumulativeGameCounts.at(-1) ?? 0;
      const hasQualifiedSeries = values.length >= 2 && totalGames >= 3;
      return {
        values,
        labels,
        tooltips,
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
          : date.toLocaleDateString("en-US", {
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            });
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
    const tooltips = bucketValues.map((bucket, index) => {
      const wr = values[index];
      const gameLabel = bucket.games === 1 ? "game" : "games";
      return `${bucket.label} · ${wr.toFixed(1)}% · ${bucket.games} ${gameLabel}`;
    });
    const qualifyingValues = bucketValues
      .filter((bucket) => bucket.games >= 3)
      .map((bucket) => (bucket.wins / bucket.games) * 100);
    return {
      values,
      labels,
      tooltips,
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
      ) : activeTab === "cb" ? (
        <CombatTab
          detail={detailStats}
          detailLoading={detailLoading}
          matchHistory={matchHistory}
          globalDetail={globalDetail}
        />
      ) : activeTab === "ec" ? (
        <EconomyTab detail={detailStats} detailLoading={detailLoading} />
      ) : activeTab === "fa" ? (
        <FarmTab detail={detailStats} detailLoading={detailLoading} />
      ) : activeTab === "ob" ? (
        <ObjectivesTab detail={detailStats} detailLoading={detailLoading} />
      ) : activeTab === "vi" ? (
        <VisionTab detail={detailStats} detailLoading={detailLoading} matchHistory={matchHistory} />
      ) : activeTab === "it" ? (
        <ItemsTab
          detail={globalDetail}
          detailLoading={globalDetailLoading}
          itemData={itemData}
          matchHistory={matchHistory}
          patch={patch}
        />
      ) : activeTab === "ab" ? (
        <AbilitiesTab
          detail={detailStats}
          detailLoading={detailLoading}
          skillOrders={skillOrders}
          skillOrdersLoading={skillOrdersLoading}
        />
      ) : activeTab === "ru" ? (
        <RunesTab
          detail={runeStats}
          detailLoading={runeStatsLoading}
          runeData={runeData}
          championId={id}
        />
      ) : activeTab === "mu" ? (
        <MatchupsTab
          matchups={matchupList}
          matchupsLoading={matchupListLoading}
          champData={champData}
          account={account}
        />
      ) : activeTab === "sy" ? (
        <SynergiesTab
          allies={allyStats}
          alliesLoading={allyStatsLoading}
          teammates={teammateStats}
          teammatesLoading={teammateStatsLoading}
          champData={champData}
          account={account}
        />
      ) : activeTab === "tr" ? (
        <TrendsTab trends={trends} trendsLoading={trendsLoading} />
      ) : activeTab === "tl" ? (
        <TimelineTab
          games={timelineGames}
          gamesLoading={timelineGamesLoading}
          selectedGameId={selectedTimelineGameId}
          onSelectGame={setSelectedTimelineGameId}
          timeline={timelineData}
          timelineLoading={timelineLoading}
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
    tooltips: string[];
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
                tooltips={wrSeries.tooltips}
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

function VisionTab({
  detail,
  detailLoading,
  matchHistory,
}: {
  detail: ChampionDetailStats | null;
  detailLoading: boolean;
  matchHistory: { matches: MatchListItem[]; total: number } | null;
}) {
  const champData = useChampionData();
  if (detailLoading) return <SectionLoading />;
  if (!detail || detail.games === 0) return <NoData text="No vision data" />;

  const minutes = detail.avgGameLength > 0 ? detail.avgGameLength / 60 : 0;
  const perMinute = (value: number) => (minutes > 0 ? (value / minutes).toFixed(2) : "—");
  const wardKillRatio =
    detail.avgWardsPlaced > 0
      ? `${((detail.avgWardsKilled / detail.avgWardsPlaced) * 100).toFixed(1)}%`
      : "—";
  const wardShareTotal = detail.avgVisionWardsBought + detail.avgSightWardsBought;
  const controlWardShare =
    wardShareTotal > 0
      ? `${((detail.avgVisionWardsBought / wardShareTotal) * 100).toFixed(1)}%`
      : "—";
  const recentMatches = (matchHistory?.matches ?? [])
    .filter((match) => match.vision_score != null)
    .slice()
    .sort((a, b) => b.game_creation - a.game_creation)
    .slice(0, 8);

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Panel className="xl:col-span-2">
        <SectionHeading title="Vision score" />
        <CombatStatTable
          rows={[
            [
              "Vision score",
              detail.avgVisionScore,
              detail.maxVisionScore,
              detail.totalVisionScore,
              formatCombatNumber,
            ],
            [
              "Wards placed",
              detail.avgWardsPlaced,
              detail.maxWardsPlaced,
              detail.totalWardsPlaced,
              formatCombatNumber,
            ],
            [
              "Wards killed",
              detail.avgWardsKilled,
              detail.maxWardsKilled,
              detail.totalWardsKilled,
              formatCombatNumber,
            ],
            [
              "Control wards bought",
              detail.avgVisionWardsBought,
              detail.maxVisionWardsBought,
              detail.totalVisionWardsBought,
              formatCombatNumber,
            ],
            [
              "Sight wards bought",
              detail.avgSightWardsBought,
              detail.maxSightWardsBought,
              detail.totalSightWardsBought,
              formatCombatNumber,
            ],
          ]}
        />
      </Panel>

      <Panel>
        <SectionHeading title="Per minute" />
        <div className="flex flex-col gap-3 text-xs">
          {[
            ["Vision score / min", perMinute(detail.avgVisionScore)],
            ["Wards placed / min", perMinute(detail.avgWardsPlaced)],
            ["Wards killed / min", perMinute(detail.avgWardsKilled)],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-lol-text">{label}</span>
              <b className="tabular-nums text-lol-text-bright">{value}</b>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Ratio" />
        <div className="flex flex-col gap-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-lol-text">Ward kill ratio</span>
            <b className="tabular-nums text-lol-text-bright">{wardKillRatio}</b>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-lol-text">Control ward share</span>
            <b className="tabular-nums text-lol-text-bright">{controlWardShare}</b>
          </div>
        </div>
      </Panel>

      <Panel className="xl:col-span-2">
        <SectionHeading title="Recent games" />
        {recentMatches.length === 0 ? (
          <NoData />
        ) : (
          <div className="flex flex-col gap-2 text-xs">
            <div className="grid grid-cols-[minmax(8rem,1fr)_auto_auto_auto_auto] gap-3 border-b border-lol-border/50 pb-2 font-semibold text-lol-text">
              <span>Champion</span>
              <span>Vision</span>
              <span>Placed</span>
              <span>Killed</span>
              <span>Duration</span>
            </div>
            {recentMatches.map((match) => (
              <div
                key={match.game_id}
                className="grid grid-cols-[minmax(8rem,1fr)_auto_auto_auto_auto] items-center gap-3 text-lol-text-bright"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ChampionIcon championId={match.champion_id} size={24} className="rounded-md" />
                  <span className="truncate">{getChampionName(champData, match.champion_id)}</span>
                </span>
                <span className="tabular-nums">{formatCombatNumber(match.vision_score)}</span>
                <span className="tabular-nums">{formatCombatNumber(match.wards_placed)}</span>
                <span className="tabular-nums">{formatCombatNumber(match.wards_killed)}</span>
                <span className="tabular-nums">{formatSeconds(match.game_duration)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function ItemsTab({
  detail,
  detailLoading,
  itemData,
  matchHistory,
  patch,
}: {
  detail: GlobalChampionDetail | null;
  detailLoading: boolean;
  itemData: ReturnType<typeof useItemData>;
  matchHistory: { matches: MatchListItem[]; total: number } | null;
  patch?: string;
}) {
  const [sort, setSort] = useState<RateSort>("count");
  const items = detail?.items ?? [];
  const sortedItems = items.slice().sort((a, b) => {
    const aRate = a.picks > 0 ? a.wins / a.picks : 0;
    const bRate = b.picks > 0 ? b.wins / b.picks : 0;
    return sort === "winRate"
      ? bRate - aRate || b.picks - a.picks
      : b.picks - a.picks || bRate - aRate;
  });
  const recentMatches = (matchHistory?.matches ?? [])
    .slice()
    .sort((a, b) => b.game_creation - a.game_creation);
  const slotCounts = Array.from({ length: 7 }, () => new Map<number, number>());
  for (const match of recentMatches.slice(0, 20)) {
    const slots = [
      match.item0,
      match.item1,
      match.item2,
      match.item3,
      match.item4,
      match.item5,
      match.item6,
    ];
    slots.forEach((itemId, slot) => {
      if (itemId == null || itemId <= 0) return;
      const counts = slotCounts[slot];
      counts.set(itemId, (counts.get(itemId) ?? 0) + 1);
    });
  }
  const slotItems = slotCounts.map((counts) =>
    [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 3),
  );

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <RatePanel
        title="Top items"
        sort={sort}
        options={[
          ["count", "Most built"],
          ["winRate", "Best win rate"],
        ]}
        onSortChange={setSort}
        loading={detailLoading}
        empty={items.length === 0}
      >
        {sortedItems.map((item) => (
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

      <Panel className="xl:col-span-2">
        <SectionHeading title="Build slots" aside="Last 20 games" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
          {slotItems.map((slot, index) => (
            <div
              key={index}
              className="min-w-0 rounded-lg border border-lol-border/50 bg-black/10 p-2.5"
            >
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-lol-text">
                {index === 6 ? "Trinket" : `Slot ${index + 1}`}
              </div>
              {slot.length === 0 ? (
                <span className="text-xs text-lol-text">—</span>
              ) : (
                <div className="flex flex-col gap-2">
                  {slot.map(([itemId, count]) => (
                    <div key={itemId} className="flex items-center justify-between gap-2">
                      <ItemIcon itemId={itemId} size={28} patch={patch} />
                      <span className="text-xs tabular-nums text-lol-text-bright">{count}x</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="xl:col-span-2">
        <SectionHeading title="Recent builds" aside="Last 10 games" />
        {recentMatches.length === 0 ? (
          <NoData />
        ) : (
          <div className="flex flex-col gap-2">
            {recentMatches.slice(0, 10).map((match) => {
              const itemIds = [
                match.item0,
                match.item1,
                match.item2,
                match.item3,
                match.item4,
                match.item5,
                match.item6,
              ].filter((itemId): itemId is number => itemId != null && itemId > 0);
              return (
                <div
                  key={match.game_id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-lol-border/50 bg-black/10 px-3 py-2"
                >
                  <ChampionIcon championId={match.champion_id} size={30} className="rounded-md" />
                  <span
                    className={`w-10 text-xs font-semibold ${match.win ? "text-lol-win" : "text-lol-loss"}`}
                  >
                    {match.win ? "Win" : "Loss"}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                    {itemIds.length === 0 ? (
                      <span className="text-xs text-lol-text">No items</span>
                    ) : (
                      itemIds.map((itemId) => (
                        <ItemIcon key={itemId} itemId={itemId} size={28} patch={patch} />
                      ))
                    )}
                  </div>
                  <span className="text-xs tabular-nums text-lol-text">
                    {formatSeconds(match.game_duration)}
                  </span>
                  <span className="w-20 text-right text-xs text-lol-text">
                    {formatTimeAgo(match.game_creation)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

function RunesTab({
  detail,
  detailLoading,
  runeData,
  championId: _championId,
}: {
  detail: ChampionRuneStatsResult | null;
  detailLoading: boolean;
  runeData: ReturnType<typeof useRuneData>;
  championId: number;
}) {
  const [keystoneSort, setKeystoneSort] = useState<RateSort>("count");
  const keystones = detail?.keystones ?? [];
  const sortedKeystones = sortRates(keystones, keystoneSort);
  const treeRows = (trees: Array<{ styleId: number; picks: number; wins: number }>) =>
    trees.slice().sort((a, b) => b.picks - a.picks || b.wins / b.picks - a.wins / a.picks);

  if (detailLoading) return <SectionLoading />;
  if (!detail) return <NoData text="No rune data" />;

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <RatePanel
        title="Keystones"
        sort={keystoneSort}
        options={[
          ["count", "Most played"],
          ["winRate", "Best win rate"],
        ]}
        onSortChange={setKeystoneSort}
        loading={detailLoading}
        empty={keystones.length === 0}
      >
        {sortedKeystones.map((keystone) => (
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

      <RuneTreePanel
        title="Primary trees"
        trees={treeRows(detail.primaryTrees)}
        runeData={runeData}
      />
      <RuneTreePanel
        title="Secondary trees"
        trees={treeRows(detail.secondaryTrees)}
        runeData={runeData}
      />

      <Panel className="xl:col-span-2">
        <SectionHeading title="Rune pages" />
        {detail.pages.length === 0 ? (
          <NoData />
        ) : (
          <div className="flex flex-col gap-3">
            {detail.pages.map((page) => (
              <div
                key={page.runes}
                className="grid grid-cols-[minmax(0,auto)_auto_minmax(6rem,1fr)] items-center gap-3 rounded-lg border border-lol-border/50 bg-black/10 px-3 py-2"
              >
                <div className="flex min-w-0 flex-wrap gap-1.5">
                  {page.runes.split(",").map((runeId) => {
                    const id = Number(runeId);
                    return (
                      <RuneIcon
                        key={`${page.runes}-${runeId}`}
                        runeId={id}
                        path={runeData[id]?.icon}
                        size={24}
                      />
                    );
                  })}
                </div>
                <span className="text-xs tabular-nums text-lol-text">{page.picks}x</span>
                <WinRateBar wins={page.wins} total={page.picks} />
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function RuneTreePanel({
  title,
  trees,
  runeData,
}: {
  title: string;
  trees: Array<{ styleId: number; picks: number; wins: number }>;
  runeData: ReturnType<typeof useRuneData>;
}) {
  return (
    <Panel>
      <SectionHeading title={title} />
      {trees.length === 0 ? (
        <NoData />
      ) : (
        <div className="flex flex-col gap-2.5">
          {trees.map((tree) => (
            <div key={tree.styleId} className="flex items-center gap-2">
              <RuneIcon runeId={tree.styleId} path={runeData[tree.styleId]?.icon} size={22} />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-lol-text-bright">
                {runeData[tree.styleId]?.name ?? `Tree ${tree.styleId}`}
              </span>
              <span className="shrink-0 text-[11px] text-lol-text">{tree.picks}x</span>
              <div className="w-20 shrink-0">
                <WinRateBar wins={tree.wins} total={tree.picks} showPercent={false} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function MatchupsTab({
  matchups,
  matchupsLoading,
  champData,
  account: _account,
}: {
  matchups: ChampionMatchupRow[] | null;
  matchupsLoading: boolean;
  champData: ReturnType<typeof useChampionData>;
  account: string;
}) {
  const [sort, setSort] = useState<"games" | "winRate" | "kda" | "cs" | "gold">("games");
  const sortedMatchups = (matchups ?? []).slice().sort((a, b) => {
    const value = (row: ChampionMatchupRow) => {
      const games = Math.max(1, row.games);
      if (sort === "winRate") return row.wins / games;
      if (sort === "kda") return (row.kills + row.assists) / Math.max(1, row.deaths);
      if (sort === "cs") return row.cs / games;
      if (sort === "gold") return row.goldEarned / games;
      return row.games;
    };
    return value(b) - value(a) || a.championId - b.championId;
  });

  return (
    <Panel className="xl:col-span-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SectionHeading
          title="Matchups"
          aside={`Faced ${matchups?.length ?? 0} distinct opponents`}
        />
        <SortButtons
          value={sort}
          options={[
            ["games", "Most faced"],
            ["winRate", "Best win rate"],
            ["kda", "Best KDA"],
            ["cs", "Most CS"],
            ["gold", "Most gold"],
          ]}
          onChange={setSort}
        />
      </div>
      {matchupsLoading ? (
        <SectionLoading />
      ) : sortedMatchups.length === 0 ? (
        <NoData />
      ) : (
        <div className="flex flex-col gap-2 overflow-x-auto text-xs">
          <div className="grid min-w-[760px] grid-cols-[minmax(10rem,1fr)_auto_auto_minmax(7rem,auto)_minmax(8rem,auto)_auto_auto_auto] gap-3 border-b border-lol-border/50 pb-2 font-semibold text-lol-text">
            <span>Opponent</span>
            <span>Games</span>
            <span>W-L</span>
            <span>Win rate</span>
            <span>K/D/A</span>
            <span>KDA</span>
            <span>Avg CS</span>
            <span>Avg gold</span>
          </div>
          {sortedMatchups.map((row) => {
            const games = Math.max(1, row.games);
            const kda = (row.kills + row.assists) / Math.max(1, row.deaths);
            return (
              <div
                key={row.championId}
                className="grid min-w-[760px] grid-cols-[minmax(10rem,1fr)_auto_auto_minmax(7rem,auto)_minmax(8rem,auto)_auto_auto_auto] items-center gap-3 text-lol-text-bright"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ChampionIcon championId={row.championId} size={24} className="rounded-md" />
                  <span className="truncate">{getChampionName(champData, row.championId)}</span>
                </span>
                <span className="tabular-nums">{row.games}</span>
                <span className="tabular-nums">
                  <span className="text-lol-win">{row.wins}W</span>-
                  <span className="text-lol-loss">{row.games - row.wins}L</span>
                </span>
                <span className="flex min-w-[7rem] items-center gap-2">
                  <WinRateBar wins={row.wins} total={row.games} showPercent={false} />
                  <span className="w-10 text-right tabular-nums">
                    {formatPercent(row.wins, row.games)}
                  </span>
                </span>
                <span className="whitespace-nowrap tabular-nums">
                  {(row.kills / games).toFixed(1)} / {(row.deaths / games).toFixed(1)} /{" "}
                  {(row.assists / games).toFixed(1)}
                </span>
                <span className="tabular-nums">{kda.toFixed(2)}</span>
                <span className="tabular-nums">{(row.cs / games).toFixed(0)}</span>
                <span className="tabular-nums">{(row.goldEarned / games).toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

type SynergySort = "games" | "winRate" | "kda";

type TrendBucket = {
  label: string;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  scoreSum: number;
  scoredGames: number;
  csSum: number;
};

function bucketTrendDays(
  days: ChampionTrendsData["daily"],
  mode: "weekly" | "monthly",
): TrendBucket[] {
  const buckets = new Map<string, TrendBucket>();
  for (const day of days) {
    const date = new Date(`${day.day}T00:00:00`);
    const key =
      mode === "monthly"
        ? day.day.slice(0, 7)
        : (() => {
            const weekStart = new Date(date);
            const dayOfWeek = weekStart.getDay();
            weekStart.setDate(weekStart.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
            return weekStart.toISOString().slice(0, 10);
          })();
    const current = buckets.get(key) ?? {
      label: key,
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      scoreSum: 0,
      scoredGames: 0,
      csSum: 0,
    };
    current.games += day.games;
    current.wins += day.wins;
    current.kills += day.kills;
    current.deaths += day.deaths;
    current.assists += day.assists;
    current.scoreSum += day.score_sum ?? 0;
    current.scoredGames += day.scored_games;
    current.csSum += day.cs_sum ?? 0;
    buckets.set(key, current);
  }
  return [...buckets.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function shortTrendDate(label: string, mode: "weekly" | "monthly") {
  const date = new Date(`${label}${mode === "monthly" ? "-01" : "T00:00:00"}`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function TrendChartPanel({
  title,
  values,
  labels,
  color,
  format,
  min,
  max,
  baseline,
}: {
  title: string;
  values: number[];
  labels: string[];
  color: string;
  format: (value: number) => string;
  min?: number;
  max?: number;
  baseline?: number;
}) {
  return (
    <Panel>
      <SectionHeading title={title} />
      <LineChartExp
        values={values}
        format={format}
        color={color}
        xLabels={labels}
        min={min}
        max={max}
        baseline={baseline}
        height={200}
      />
    </Panel>
  );
}

function TrendsTab({
  trends,
  trendsLoading,
}: {
  trends: ChampionTrendsData | null;
  trendsLoading: boolean;
}) {
  const [period, setPeriod] = useState<"weekly" | "monthly">("weekly");
  const buckets = useMemo(
    () => (trends ? bucketTrendDays(trends.daily, period) : []),
    [trends, period],
  );
  const labels = buckets.map((bucket) => shortTrendDate(bucket.label, period));
  const winRates = buckets.map((bucket) => (bucket.wins / Math.max(1, bucket.games)) * 100);
  const kdas = buckets.map(
    (bucket) => (bucket.kills + bucket.assists) / Math.max(1, bucket.deaths),
  );
  const scores = buckets.map((bucket) => bucket.scoreSum / Math.max(1, bucket.scoredGames));
  const averageCs = buckets.map((bucket) => bucket.csSum / Math.max(1, bucket.games));
  const patches = trends?.patches.slice(-12) ?? [];
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    trends?.weekdays.find((row) => row.weekday === (index + 1) % 7),
  );
  const hours = Array.from({ length: 8 }, (_, index) => {
    const rows =
      trends?.hours.filter((row) => row.hour >= index * 3 && row.hour < index * 3 + 3) ?? [];
    return {
      games: rows.reduce((sum, row) => sum + row.games, 0),
      wins: rows.reduce((sum, row) => sum + row.wins, 0),
      label: `${String(index * 3).padStart(2, "0")}-${String(index * 3 + 3).padStart(2, "0")}`,
    };
  });

  if (trendsLoading) return <SectionLoading />;
  if (trends == null) return <NoData text="No trends data yet" />;

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Panel className="xl:col-span-2">
        <div className="mb-4 flex items-center justify-between gap-3">
          <SectionHeading title="Win rate over time" />
          <div className="flex gap-1 rounded border border-lol-border p-0.5 text-xs">
            {(["weekly", "monthly"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`rounded px-2 py-1 ${period === value ? "bg-lol-crimson text-white" : "text-lol-text"}`}
                onClick={() => setPeriod(value)}
              >
                {value[0].toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <LineChartExp
          values={winRates}
          format={(value) => `${value.toFixed(1)}%`}
          color="var(--theme-win)"
          xLabels={labels}
          min={0}
          max={100}
          baseline={50}
          height={200}
        />
      </Panel>
      <Panel className="xl:col-span-2">
        <SectionHeading title="Average KDA over time" />
        <LineChartExp
          values={kdas}
          format={(value) => value.toFixed(2)}
          color="var(--theme-assist)"
          xLabels={labels}
          height={200}
        />
      </Panel>
      <TrendChartPanel
        title="Average score over time"
        values={scores}
        labels={labels}
        color="var(--theme-gold)"
        format={(value) => value.toFixed(1)}
        min={0}
        max={10}
      />
      <TrendChartPanel
        title="Average CS per game"
        values={averageCs}
        labels={labels}
        color="var(--theme-violet)"
        format={(value) => value.toFixed(1)}
      />
      <Panel className="xl:col-span-2">
        <SectionHeading title="Win rate by patch" />
        <div className="flex flex-col gap-2 text-xs">
          {patches.map((row) => (
            <div
              key={row.patch}
              className="grid grid-cols-[1fr_auto_auto_minmax(8rem,1fr)] items-center gap-3"
            >
              <span className="font-semibold text-lol-text-bright">{row.patch}</span>
              <span className="tabular-nums">{row.games}</span>
              <span className="tabular-nums">
                <span className="text-lol-win">{row.wins}W</span>-
                <span className="text-lol-loss">{row.games - row.wins}L</span>
              </span>
              <span className="flex items-center gap-2">
                <WinRateBar wins={row.wins} total={row.games} showPercent={false} />
                <span className="w-11 text-right tabular-nums">
                  {formatPercent(row.wins, row.games)}
                </span>
              </span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel>
        <SectionHeading title="By day of week" />
        <TrendBars
          rows={weekdays.map((row, index) => ({
            label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index],
            games: row?.games ?? 0,
            wins: row?.wins ?? 0,
          }))}
        />
      </Panel>
      <Panel>
        <SectionHeading title="By hour of day" />
        <TrendBars rows={hours} />
      </Panel>
    </div>
  );
}

function TrendBars({ rows }: { rows: Array<{ label: string; games: number; wins: number }> }) {
  return (
    <div className="flex h-40 items-end gap-2">
      {rows.map((row) => {
        const rate = row.games > 0 ? (row.wins / row.games) * 100 : 0;
        return (
          <div key={row.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="text-[10px] tabular-nums text-lol-text">
              {row.games ? `${rate.toFixed(0)}%` : "—"}
            </span>
            <div className="flex h-24 w-full items-end rounded-sm bg-lol-border/30">
              <div className="w-full rounded-sm bg-lol-win" style={{ height: `${rate}%` }} />
            </div>
            <span className="truncate text-[10px] text-lol-text">{row.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function TimelineTab({
  games,
  gamesLoading,
  selectedGameId,
  onSelectGame,
  timeline,
  timelineLoading,
  champData,
}: {
  games: ChampionTimelineGame[] | null;
  gamesLoading: boolean;
  selectedGameId: number | null;
  onSelectGame: (gameId: number) => void;
  timeline: TimelineData | null;
  timelineLoading: boolean;
  champData: ReturnType<typeof useChampionData>;
}) {
  const itemData = useItemData();
  const selectedGame = games?.find((game) => game.gameId === selectedGameId) ?? null;
  const ownerFrames =
    selectedGame && timeline
      ? timeline.frames.filter((frame) => frame.puuid === selectedGame.ownerPuuid)
      : [];
  const labels = ownerFrames.map((frame) => `${Math.round(frame.timestamp_ms / 60000)}m`);
  const events =
    timeline?.events
      .filter((event) =>
        [
          "CHAMPION_KILL",
          "ELITE_MONSTER_KILL",
          "BUILDING_KILL",
          "TURRET_PLATE_DESTROYED",
          "ITEM_PURCHASED",
        ].includes(event.event_type),
      )
      .slice(0, 60) ?? [];

  if (gamesLoading) return <SectionLoading />;
  if (games == null || games.length === 0)
    return <NoData text="No timeline data for this champion" />;

  return (
    <div className="grid grid-cols-1 gap-5">
      <Panel>
        <SectionHeading title="Game picker" />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {games.map((game) => (
            <button
              key={game.gameId}
              type="button"
              className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-left ${
                game.gameId === selectedGameId
                  ? "border-lol-crimson bg-lol-crimson/15"
                  : "border-lol-border bg-black/10"
              }`}
              onClick={() => onSelectGame(game.gameId)}
            >
              <ChampionIcon championId={game.championId} size={24} className="rounded-md" />
              <span className="flex flex-col text-xs">
                <span className={game.win ? "text-lol-win" : "text-lol-loss"}>
                  {game.win ? "W" : "L"} · {game.kills}/{game.deaths}/{game.assists}
                </span>
                <span className="text-lol-text">{formatTimeAgo(game.gameCreation)}</span>
              </span>
            </button>
          ))}
        </div>
      </Panel>
      {timelineLoading ? (
        <Panel>
          <SectionLoading />
        </Panel>
      ) : timeline == null || ownerFrames.length === 0 ? (
        <Panel>
          <NoData text="No timeline selected" />
        </Panel>
      ) : (
        <>
          <Panel className="xl:col-span-2">
            <SectionHeading title="Gold and CS curves" />
            <LineChartExp
              values={ownerFrames.map((frame) => frame.gold ?? 0)}
              series={[
                {
                  values: ownerFrames.map((frame) => frame.gold ?? 0),
                  color: "var(--theme-gold)",
                  label: "Gold",
                },
                {
                  values: ownerFrames.map((frame) => (frame.cs ?? 0) * 10),
                  color: "var(--theme-violet)",
                  label: "CS (×10)",
                },
              ]}
              format={(value) => value.toLocaleString()}
              xLabels={labels}
              min={0}
              height={200}
            />
          </Panel>
          <Panel className="xl:col-span-2">
            <SectionHeading title="Level and XP" />
            <LineChartExp
              values={ownerFrames.map((frame) => (frame.level ?? 0) * 100)}
              series={[
                {
                  values: ownerFrames.map((frame) => (frame.level ?? 0) * 100),
                  color: "var(--theme-assist)",
                  label: "Level (×100)",
                },
                {
                  values: ownerFrames.map((frame) => (frame.xp ?? 0) / 10),
                  color: "var(--theme-win)",
                  label: "XP (÷10)",
                },
              ]}
              format={(value) => value.toFixed(0)}
              xLabels={labels}
              min={0}
              height={200}
            />
          </Panel>
          <Panel>
            <SectionHeading title="Events" />
            <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto text-xs">
              {events.length === 0 ? (
                <NoData text="No timeline events" />
              ) : (
                events.map((event) => (
                  <div
                    key={event.event_index}
                    className="flex gap-3 border-b border-lol-border/40 pb-2"
                  >
                    <span className="w-12 shrink-0 tabular-nums text-lol-text">
                      {formatSeconds(event.timestamp_ms / 1000)}
                    </span>
                    <span className="text-lol-text-bright">
                      {timelineEventDescription(event, itemData, champData)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function timelineEventDescription(
  event: TimelineData["events"][number],
  itemData: ReturnType<typeof useItemData>,
  _champData: ReturnType<typeof useChampionData>,
) {
  if (event.event_type === "ITEM_PURCHASED" && event.item_id != null) {
    return `Participant ${event.participant_id ?? "?"} purchased ${getItemName(itemData, event.item_id)}`;
  }
  if (event.event_type === "CHAMPION_KILL") {
    return `Participant ${event.killer_id ?? "?"} killed participant ${event.victim_id ?? "?"}`;
  }
  if (event.event_type === "ELITE_MONSTER_KILL") {
    return `${event.monster_type ?? "Monster"} defeated by participant ${event.killer_id ?? "?"}`;
  }
  if (event.event_type === "BUILDING_KILL") {
    return `${event.building_type ?? "Building"} destroyed`;
  }
  return "Turret plate destroyed";
}

function SynergiesTab({
  allies,
  alliesLoading,
  teammates,
  teammatesLoading,
  champData,
  account: _account,
}: {
  allies: ChampionAllyRow[] | null;
  alliesLoading: boolean;
  teammates: ChampionTeammateRow[] | null;
  teammatesLoading: boolean;
  champData: ReturnType<typeof useChampionData>;
  account: string;
}) {
  const [allySort, setAllySort] = useState<SynergySort>("games");
  const [teammateSort, setTeammateSort] = useState<SynergySort>("games");

  const sortRows = <T extends ChampionAllyRow | ChampionTeammateRow>(
    rows: T[],
    sort: SynergySort,
  ) =>
    rows.slice().sort((a, b) => {
      const value = (row: T) => {
        const games = Math.max(1, row.games);
        if (sort === "winRate") return row.wins / games;
        if (sort === "kda") return (row.kills + row.assists) / Math.max(1, row.deaths);
        return row.games;
      };
      return value(b) - value(a);
    });

  const sortedAllies = sortRows(allies ?? [], allySort);
  const sortedTeammates = sortRows(teammates ?? [], teammateSort);

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SectionHeading title="Best allies" />
          <SortButtons
            value={allySort}
            options={[
              ["games", "Most games"],
              ["winRate", "Best win rate"],
              ["kda", "Best KDA"],
            ]}
            onChange={setAllySort}
          />
        </div>
        {alliesLoading ? (
          <SectionLoading />
        ) : sortedAllies.length === 0 ? (
          <NoData text="No ally data yet" />
        ) : (
          <>
            <div className="flex max-h-[520px] flex-col gap-2 overflow-y-auto text-xs">
              {sortedAllies.slice(0, 30).map((row) => {
                const games = Math.max(1, row.games);
                const kda = (row.kills + row.assists) / Math.max(1, row.deaths);
                return (
                  <div
                    key={row.championId}
                    className="grid min-w-[540px] grid-cols-[minmax(10rem,1fr)_auto_minmax(8rem,auto)_minmax(9rem,auto)] items-center gap-3 text-lol-text-bright"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <ChampionIcon championId={row.championId} size={24} className="rounded-md" />
                      <span className="truncate">{getChampionName(champData, row.championId)}</span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-lol-text">
                      {row.games} games
                    </span>
                    <span className="shrink-0 whitespace-nowrap">
                      <span className="text-lol-win">{row.wins}W</span>-
                      <span className="text-lol-loss">{row.games - row.wins}L</span>
                    </span>
                    <span className="flex items-center justify-end gap-2 whitespace-nowrap">
                      <span className="w-16">
                        <WinRateBar wins={row.wins} total={row.games} showPercent={false} />
                      </span>
                      <span className="w-11 text-right tabular-nums">
                        {formatPercent(row.wins, row.games)}
                      </span>
                      <span className="w-28 text-right tabular-nums text-lol-text">
                        {(row.kills / games).toFixed(1)} / {(row.deaths / games).toFixed(1)} /{" "}
                        {(row.assists / games).toFixed(1)} · {kda.toFixed(2)}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
            {sortedAllies.length > 30 && (
              <p className="mt-3 text-xs text-lol-text">+{sortedAllies.length - 30} more allies</p>
            )}
          </>
        )}
      </Panel>

      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SectionHeading title="Best duo partners" />
          <SortButtons
            value={teammateSort}
            options={[
              ["games", "Most games"],
              ["winRate", "Best win rate"],
              ["kda", "Best KDA"],
            ]}
            onChange={setTeammateSort}
          />
        </div>
        {teammatesLoading ? (
          <SectionLoading />
        ) : sortedTeammates.length === 0 ? (
          <NoData text="No duo data yet" />
        ) : (
          <>
            <div className="flex max-h-[520px] flex-col gap-2 overflow-y-auto text-xs">
              {sortedTeammates.slice(0, 30).map((row) => {
                const games = Math.max(1, row.games);
                const kda = (row.kills + row.assists) / Math.max(1, row.deaths);
                const initials = row.name.slice(0, 2).toUpperCase();
                return (
                  <div
                    key={row.puuid}
                    className="grid min-w-[540px] grid-cols-[minmax(10rem,1fr)_auto_minmax(8rem,auto)_minmax(9rem,auto)] items-center gap-3 text-lol-text-bright"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {row.profileIcon != null ? (
                        <SummonerIcon iconId={row.profileIcon} size={24} />
                      ) : (
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lol-border/60 text-[9px] font-semibold text-lol-text-bright">
                          {initials}
                        </span>
                      )}
                      <span className="min-w-0 truncate">
                        <span className="block truncate">{row.name}</span>
                        {row.topChampionId != null && (
                          <span className="block truncate text-[10px] text-lol-text">
                            Most played with: {getChampionName(champData, row.topChampionId)}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-lol-text">
                      {row.games} games
                    </span>
                    <span className="shrink-0 whitespace-nowrap">
                      <span className="text-lol-win">{row.wins}W</span>-
                      <span className="text-lol-loss">{row.games - row.wins}L</span>
                    </span>
                    <span className="flex items-center justify-end gap-2 whitespace-nowrap">
                      <span className="w-16">
                        <WinRateBar wins={row.wins} total={row.games} showPercent={false} />
                      </span>
                      <span className="w-11 text-right tabular-nums">
                        {formatPercent(row.wins, row.games)}
                      </span>
                      <span className="w-28 text-right tabular-nums text-lol-text">
                        {(row.kills / games).toFixed(1)} / {(row.deaths / games).toFixed(1)} /{" "}
                        {(row.assists / games).toFixed(1)} · {kda.toFixed(2)}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
            {sortedTeammates.length > 30 && (
              <p className="mt-3 text-xs text-lol-text">
                +{sortedTeammates.length - 30} more duo partners
              </p>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}

const SKILL_LABELS: Record<number, { label: string; className: string }> = {
  1: { label: "Q", className: "bg-blue-400/20 text-blue-400" },
  2: { label: "W", className: "bg-green-400/20 text-green-400" },
  3: { label: "E", className: "bg-red-400/20 text-red-400" },
  4: { label: "R", className: "bg-amber-400/20 text-amber-400" },
};

function AbilitiesTab({
  detail,
  detailLoading,
  skillOrders,
  skillOrdersLoading,
}: {
  detail: ChampionDetailStats | null;
  detailLoading: boolean;
  skillOrders: ChampionSkillOrdersResult | null;
  skillOrdersLoading: boolean;
}) {
  const spells = useSummonerSpellData();

  if (detailLoading || skillOrdersLoading) return <SectionLoading />;
  if (!detail || detail.games === 0) return <NoData text="No ability data" />;

  const orders = skillOrders?.topOrders.slice(0, 5) ?? [];
  const timelineCoverage = skillOrders?.timelineCoverage ?? {
    gamesWithTimeline: 0,
    totalGames: 0,
  };
  const rTiming = skillOrders?.rTiming ?? {
    avgR1Min: null,
    avgR2Min: null,
    avgR3Min: null,
    sampleSize: 0,
  };
  const sampleSize = timelineCoverage.gamesWithTimeline;
  const formatRankTiming = (value: number | null) =>
    value == null ? "—" : `${value.toFixed(1)} min`;

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Panel className="xl:col-span-2">
        <SectionHeading title="Skill order" />
        {orders.length === 0 ? (
          <NoData text="No skill data yet (requires timeline)" />
        ) : (
          <>
            <p className="mb-3 text-xs text-lol-text">
              Based on {timelineCoverage.gamesWithTimeline} of {timelineCoverage.totalGames} games
              with timeline data
            </p>
            <div className="flex flex-col gap-2 text-xs">
              <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto_auto] gap-3 border-b border-lol-border/50 pb-2 font-semibold text-lol-text">
                <span>#</span>
                <span>Order</span>
                <span>Picks</span>
                <span>Sample</span>
              </div>
              {orders.map((entry, index) => (
                <div
                  key={entry.order}
                  className="grid grid-cols-[2rem_minmax(0,1fr)_auto_auto] items-center gap-3 text-lol-text-bright"
                >
                  <span className="tabular-nums text-lol-text">{index + 1}</span>
                  <div className="flex flex-wrap gap-1">
                    {entry.order.split(",").map((slot, slotIndex) => {
                      const skill = SKILL_LABELS[Number(slot)];
                      return skill ? (
                        <span
                          key={`${entry.order}-${slotIndex}`}
                          className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${skill.className}`}
                        >
                          {skill.label}
                        </span>
                      ) : null;
                    })}
                  </div>
                  <span className="tabular-nums">{entry.picks}</span>
                  <span className="tabular-nums">{formatPercent(entry.picks, sampleSize)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>

      <Panel>
        <SectionHeading title="R rank timing" aside={`Based on ${rTiming.sampleSize} games`} />
        <div className="flex flex-col gap-3 text-xs">
          {[
            ["R rank 1", formatRankTiming(rTiming.avgR1Min)],
            ["R rank 2", formatRankTiming(rTiming.avgR2Min)],
            ["R rank 3", formatRankTiming(rTiming.avgR3Min)],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-lol-text">{label}</span>
              <b className="tabular-nums text-lol-text-bright">{value}</b>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Summoner spells" />
        {(skillOrders?.summonerSpells ?? []).length === 0 ? (
          <NoData />
        ) : (
          <div className="flex flex-col gap-3 text-xs">
            {(skillOrders?.summonerSpells ?? []).map((spellPair) => {
              const ids = spellPair.pair.split(",").map(Number);
              const names = ids.map((id) => spells[id]?.name ?? `Spell ${id}`);
              return (
                <div
                  key={spellPair.pair}
                  className="grid grid-cols-[minmax(8rem,1fr)_auto_minmax(5rem,1fr)] items-center gap-3"
                >
                  <span
                    className="flex items-center gap-2 text-lol-text-bright"
                    title={names.join(" + ")}
                  >
                    <SummonerSpellIcon spellId={ids[0] ?? null} size={24} />
                    <SummonerSpellIcon spellId={ids[1] ?? null} size={24} />
                    <span className="truncate">{names.join(" + ")}</span>
                  </span>
                  <span className="tabular-nums text-lol-text">{spellPair.picks}</span>
                  <WinRateBar wins={spellPair.wins} total={spellPair.picks} />
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel className="xl:col-span-2">
        <SectionHeading title="Per-ability damage" />
        <div className="rounded-lg border border-dashed border-amber-400/40 bg-amber-400/5 p-4 text-sm text-lol-text">
          Per-ability damage (Q/W/E/R breakdown) is not available in any public Riot API. This
          section is intentionally empty.
        </div>
      </Panel>
    </div>
  );
}

function CombatTab({
  detail,
  detailLoading,
  matchHistory,
  globalDetail,
}: {
  detail: ChampionDetailStats | null;
  detailLoading: boolean;
  matchHistory: { matches: MatchListItem[]; total: number } | null;
  globalDetail: GlobalChampionDetail | null;
}) {
  if (detailLoading) return <SectionLoading />;
  if (!detail || detail.games === 0) return <NoData text="No combat data" />;

  const matches = (matchHistory?.matches as CombatMatch[] | undefined) ?? [];
  const chartMatches = matches
    .slice()
    .sort((a, b) => a.game_creation - b.game_creation)
    .slice(-20);
  const labels = chartMatches.map((match) =>
    new Date(match.game_creation).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  );
  const chart = (title: string, values: number[], color: string) => (
    <div className="min-w-0 flex-1">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-lol-text">{title}</p>
      <LineChartExp
        values={values}
        format={(value) => value.toLocaleString()}
        color={color}
        xLabels={labels}
        yFormat={(value) => value.toLocaleString()}
        yTicks={[0, Math.max(...values, 1)]}
      />
    </div>
  );
  const dealtTrueAvg = Math.max(
    0,
    (globalDetail?.avgDamage ?? 0) - detail.avgPhysicalDamageDealt - detail.avgMagicDamageDealt,
  );
  const dealtTrueValues = matches.map((match) =>
    Math.max(
      0,
      match.total_damage_dealt -
        (match.physical_damage_dealt ?? 0) -
        (match.magic_damage_dealt ?? 0),
    ),
  );
  const dealtTrueBest = dealtTrueValues.length > 0 ? Math.max(...dealtTrueValues) : null;
  const dealtTrueTotal =
    dealtTrueValues.length > 0 ? dealtTrueValues.reduce((sum, value) => sum + value, 0) : null;

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Panel className="xl:col-span-2">
        <SectionHeading title="K/D/A over the last 20 games" />
        {chartMatches.length === 0 ? (
          <NoData />
        ) : (
          <div className="flex flex-col gap-5 lg:flex-row">
            {chart(
              "Kills",
              chartMatches.map((match) => match.kills),
              "var(--theme-win)",
            )}
            {chart(
              "Deaths",
              chartMatches.map((match) => match.deaths),
              "var(--theme-loss)",
            )}
            {chart(
              "Assists",
              chartMatches.map((match) => match.assists),
              "var(--theme-text)",
            )}
          </div>
        )}
      </Panel>

      <CombatDamagePanel
        title="Damage dealt"
        segments={[
          ["Physical", detail.avgPhysicalDamageDealt, "var(--theme-win)"],
          ["Magic", detail.avgMagicDamageDealt, "var(--theme-gold)"],
          ["True", dealtTrueAvg, "var(--theme-loss)"],
        ]}
        rows={[
          [
            "Physical",
            detail.avgPhysicalDamageDealt,
            detail.maxPhysicalDamageDealt,
            detail.totalPhysicalDamageDealt,
          ],
          [
            "Magic",
            detail.avgMagicDamageDealt,
            detail.maxMagicDamageDealt,
            detail.totalMagicDamageDealt,
          ],
          ["True", dealtTrueAvg, dealtTrueBest, dealtTrueTotal],
        ]}
      />

      <CombatDamagePanel
        title="Damage taken"
        segments={[
          ["Physical", detail.avgPhysicalDamageTaken, "var(--theme-win)"],
          ["Magic", detail.avgMagicDamageTaken, "var(--theme-gold)"],
          ["True", detail.avgTrueDamageTaken, "var(--theme-loss)"],
        ]}
        rows={[
          [
            "Physical",
            detail.avgPhysicalDamageTaken,
            detail.maxPhysicalDamageTaken,
            detail.totalPhysicalDamageTaken,
          ],
          [
            "Magic",
            detail.avgMagicDamageTaken,
            detail.maxMagicDamageTaken,
            detail.totalMagicDamageTaken,
          ],
          [
            "True",
            detail.avgTrueDamageTaken,
            detail.maxTrueDamageTaken,
            detail.totalTrueDamageTaken,
          ],
        ]}
      />

      <Panel>
        <SectionHeading title="Crowd control" />
        <CombatStatTable
          rows={[
            [
              "Time CCing others (sec)",
              detail.avgTimeCcOthers,
              detail.maxTimeCcOthers,
              detail.totalTimeCcOthers,
              formatSeconds,
            ],
            [
              "Total CC dealt (sec)",
              detail.avgTotalCcDealt,
              detail.maxTotalCcDealt,
              detail.totalTotalCcDealt,
              formatSeconds,
            ],
          ]}
        />
        <div className="mt-3 flex items-center justify-between border-t border-lol-border/50 pt-3 text-xs">
          <span className="text-lol-text">CC per minute</span>
          <b className="tabular-nums text-lol-text-bright">
            {formatCombatNumber(detail.avgCcPerMin)}
          </b>
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Objectives & turrets" />
        <CombatStatTable
          rows={[
            [
              "Damage to objectives",
              detail.avgDamageToObjectives,
              detail.maxDamageToObjectives,
              detail.totalDamageToObjectives,
              formatCombatNumber,
            ],
            [
              "Damage to turrets",
              detail.avgDamageToTurrets,
              detail.maxDamageToTurrets,
              detail.totalDamageToTurrets,
              formatCombatNumber,
            ],
          ]}
        />
      </Panel>

      <Panel>
        <SectionHeading title="Longevity & sprees" />
        <CombatStatTable
          rows={[
            [
              "Longest alive (sec)",
              detail.avgLongestAlive,
              detail.maxLongestAlive,
              detail.totalLongestAlive,
              formatSeconds,
            ],
            [
              "Killing sprees",
              detail.avgKillingSprees,
              detail.maxKillingSprees,
              detail.totalKillingSprees,
              formatCombatNumber,
            ],
            [
              "Damage self-mitigated",
              detail.avgDamageSelfMitigated,
              detail.maxDamageSelfMitigated,
              detail.totalDamageSelfMitigated,
              formatCombatNumber,
            ],
          ]}
        />
      </Panel>

      <Panel>
        <SectionHeading title="First blood" />
        <div className="grid grid-cols-2 gap-3">
          <CombatTile
            label="First blood kills"
            value={detail.totalFirstBloodKill}
            subtitle={`across ${formatCombatNumber(detail.games)} games (${formatPercent(detail.totalFirstBloodKill, detail.games)})`}
          />
          <CombatTile
            label="First blood assists"
            value={detail.totalFirstBloodAssist}
            subtitle={`across ${formatCombatNumber(detail.games)} games (${formatPercent(detail.totalFirstBloodAssist, detail.games)})`}
          />
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Multikills" />
        <div className="flex flex-col gap-2 text-xs">
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-lol-border/50 pb-2 font-semibold text-lol-text">
            <span>Multikill type</span>
            <span>Total</span>
            <span>Per game (%)</span>
          </div>
          {[
            { label: "Double kills", value: globalDetail?.doubleKills },
            { label: "Triple kills", value: globalDetail?.tripleKills },
            { label: "Quadra kills", value: globalDetail?.quadraKills },
            { label: "Penta kills", value: globalDetail?.pentaKills },
          ].map(({ label, value }) => (
            <div key={label} className="grid grid-cols-[1fr_auto_auto] gap-3 text-lol-text-bright">
              <span>{label}</span>
              <span className="tabular-nums">{formatCombatNumber(value)}</span>
              <span className="tabular-nums">{formatPercent(value, detail.games)}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function EconomyTab({
  detail,
  detailLoading,
}: {
  detail: ChampionDetailStats | null;
  detailLoading: boolean;
}) {
  if (detailLoading) return <SectionLoading />;
  if (!detail || detail.games === 0) return <NoData text="No data" />;

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Panel>
        <SectionHeading title="Gold" />
        <CombatStatTable
          rows={[
            [
              "Gold spent",
              detail.avgGoldSpent,
              detail.maxGoldSpent,
              detail.totalGoldSpent,
              formatCombatNumber,
            ],
          ]}
        />
        <div className="mt-3 flex items-center justify-between border-t border-lol-border/50 pt-3 text-xs">
          <span className="text-lol-text">Gold per minute</span>
          <b className="tabular-nums text-lol-text-bright">{detail.goldPerMin.toFixed(0)}</b>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-lol-text">Max champion level reached</span>
          <b className="tabular-nums text-lol-text-bright">{detail.maxChampLevel}</b>
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Time" />
        <CombatStatTable
          rows={[
            ["Avg game length", detail.avgGameLength, null, null, formatSeconds],
            ["Total time played", null, null, detail.totalTimePlayed, formatSeconds],
          ]}
        />
        <div className="mt-3 flex items-center justify-between border-t border-lol-border/50 pt-3 text-xs">
          <span className="text-lol-text">Longest win streak</span>
          <b className="tabular-nums text-lol-text-bright">{detail.longestWinStreak}</b>
        </div>
      </Panel>
    </div>
  );
}

function FarmTab({
  detail,
  detailLoading,
}: {
  detail: ChampionDetailStats | null;
  detailLoading: boolean;
}) {
  if (detailLoading) return <SectionLoading />;
  if (!detail || detail.games === 0) return <NoData text="No data" />;

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Panel>
        <SectionHeading title="Minion split" />
        <CombatStatTable
          rows={[
            [
              "Lane minions",
              detail.avgTotalMinionsKilled,
              detail.maxTotalMinionsKilled,
              detail.totalTotalMinionsKilled,
            ],
            [
              "Jungle minions (all)",
              detail.avgNeutralMinionsKilled,
              detail.maxNeutralMinionsKilled,
              detail.totalNeutralMinionsKilled,
            ],
            [
              "Jungle minions (enemy)",
              detail.avgNeutralMinionsEnemyJungle,
              detail.maxNeutralMinionsEnemyJungle,
              detail.totalNeutralMinionsEnemyJungle,
            ],
            [
              "Jungle minions (team)",
              detail.avgNeutralMinionsTeamJungle,
              detail.maxNeutralMinionsTeamJungle,
              detail.totalNeutralMinionsTeamJungle,
            ],
          ]}
        />
      </Panel>

      <Panel>
        <SectionHeading title="Per minute" />
        <div className="flex flex-col gap-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-lol-text">Games played</span>
            <b className="tabular-nums text-lol-text-bright">{detail.games}</b>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-lol-text">Avg game length</span>
            <b className="tabular-nums text-lol-text-bright">
              {formatSeconds(detail.avgGameLength)}
            </b>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function ObjectivesTab({
  detail,
  detailLoading,
}: {
  detail: ChampionDetailStats | null;
  detailLoading: boolean;
}) {
  if (detailLoading) return <SectionLoading />;
  if (!detail || detail.games === 0) return <NoData text="No data" />;

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Panel>
        <SectionHeading title="Turrets & inhibitors" />
        <CombatStatTable
          rows={[
            ["Turret kills", detail.avgTurretKills, detail.maxTurretKills, detail.totalTurretKills],
            [
              "Inhibitor kills",
              detail.avgInhibitorKills,
              detail.maxInhibitorKills,
              detail.totalInhibitorKills,
            ],
            [
              "Turret plates taken",
              detail.avgTurretPlatesTaken,
              detail.maxTurretPlatesTaken,
              detail.totalTurretPlatesTaken,
            ],
            ["Baron kills", detail.avgBaronKills, detail.maxBaronKills, detail.totalBaronKills],
          ]}
        />
      </Panel>

      <Panel>
        <SectionHeading title="Damage to objectives" />
        <CombatStatTable
          rows={[
            [
              "Damage to objectives",
              detail.avgDamageToObjectives,
              detail.maxDamageToObjectives,
              detail.totalDamageToObjectives,
            ],
            [
              "Damage to turrets",
              detail.avgDamageToTurrets,
              detail.maxDamageToTurrets,
              detail.totalDamageToTurrets,
            ],
          ]}
        />
      </Panel>

      <Panel className="xl:col-span-2">
        <SectionHeading title="First blood objectives" />
        <div className="grid grid-cols-2 gap-3">
          <CombatTile
            label="First tower kills"
            value={detail.totalFirstTowerKill}
            subtitle={`across ${formatCombatNumber(detail.games)} games (${formatPercent(detail.totalFirstTowerKill, detail.games)})`}
          />
          <CombatTile
            label="First tower assists"
            value={detail.totalFirstTowerAssist}
            subtitle={`across ${formatCombatNumber(detail.games)} games (${formatPercent(detail.totalFirstTowerAssist, detail.games)})`}
          />
          <CombatTile
            label="First inhibitor kills"
            value={detail.totalFirstInhibitorKill}
            subtitle={`across ${formatCombatNumber(detail.games)} games (${formatPercent(detail.totalFirstInhibitorKill, detail.games)})`}
          />
          <CombatTile
            label="First inhibitor assists"
            value={detail.totalFirstInhibitorAssist}
            subtitle={`across ${formatCombatNumber(detail.games)} games (${formatPercent(detail.totalFirstInhibitorAssist, detail.games)})`}
          />
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Stolen objectives" />
        <CombatStatTable
          rows={[
            [
              "Objectives stolen",
              detail.avgObjectivesStolen,
              detail.maxObjectivesStolen,
              detail.totalObjectivesStolen,
            ],
            [
              "Objectives stolen assists",
              detail.avgObjectivesStolenAssists,
              detail.maxObjectivesStolenAssists,
              detail.totalObjectivesStolenAssists,
            ],
          ]}
        />
      </Panel>
    </div>
  );
}

function CombatDamagePanel({
  title,
  segments,
  rows,
}: {
  title: string;
  segments: [string, number, string][];
  rows: CombatStatTableRow[];
}) {
  const total = segments.reduce((sum, [, value]) => sum + Math.max(value, 0), 0);
  return (
    <Panel>
      <SectionHeading title={title} />
      <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-black/20">
        {segments.map(([label, value, color]) => (
          <div
            key={label}
            title={`${label}: ${formatCombatNumber(value)}`}
            className="h-full"
            style={{
              width: `${total > 0 ? (Math.max(value, 0) / total) * 100 : 0}%`,
              backgroundColor: color,
            }}
          />
        ))}
      </div>
      <CombatStatTable rows={rows} />
    </Panel>
  );
}

type CombatStatTableRow = [
  string,
  number | null | undefined,
  number | null | undefined,
  number | null | undefined,
  ((value: number | null | undefined) => string)?,
];

function CombatStatTable({ rows }: { rows: CombatStatTableRow[] }) {
  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-b border-lol-border/50 pb-2 font-semibold text-lol-text">
        <span>Stat</span>
        <span>Avg</span>
        <span>Best</span>
        <span>Total</span>
      </div>
      {rows.map(([label, avg, best, total, formatter]) => {
        const format = formatter ?? formatCombatNumber;
        return (
          <div
            key={label}
            className="grid grid-cols-[1fr_auto_auto_auto] gap-3 text-lol-text-bright"
          >
            <span>{label}</span>
            <span className="tabular-nums">{format(avg)}</span>
            <span className="tabular-nums">{format(best)}</span>
            <span className="tabular-nums">{format(total)}</span>
          </div>
        );
      })}
    </div>
  );
}

function CombatTile({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: number | null | undefined;
  subtitle: string;
}) {
  return (
    <div className="rounded-lg border border-lol-border bg-black/10 p-3">
      <span className="text-xs text-lol-text">{label}</span>
      <b className="mt-1 block font-display text-2xl text-lol-text-bright">
        {formatCombatNumber(value)}
      </b>
      <span className="mt-1 block text-[11px] text-lol-text">{subtitle}</span>
    </div>
  );
}

function formatCombatNumber(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : value.toLocaleString();
}

function formatSeconds(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  const seconds = Math.max(0, Math.round(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatPercent(value: number | null | undefined, total: number) {
  if (value == null || total <= 0) return "—";
  return `${((value / total) * 100).toFixed(1)}%`;
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
