import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";
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
  ChampionRecordsResult,
  TimelineBucket,
  GlobalChampionDetail,
  ItemStats,
  MasteryChampion,
  MatchListItem,
  ProfileExtras,
  AccountSnapshot,
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
import type { ChampionData } from "../lib/types";
import { useIpc } from "../hooks/useIpc";
import { useViewState } from "../hooks/useViewState";
import { ALL_ACCOUNTS_SENTINEL } from "../lib/accountsEvent";
import { formatDuration, formatNumber, formatPlaytime, formatTimeAgo } from "../lib/format";
import { useHistoryScopeQueue } from "../lib/historyScope";
import AugmentIcon from "./AugmentIcon";
import ChampionIcon from "./ChampionIcon";
import { DonutChart } from "./DonutChart";
import { FilterSelect } from "./FilterSelect";
import { LineChartExp } from "./LineChartExp";
import { MatchRowExperiment } from "./MatchRowExperiment";
import { Panel } from "./Panel";
import PatchSelect from "./PatchSelect";
import { RadarChart } from "./RadarChart";
import RuneIcon from "./RuneIcon";
import SummonerIcon from "./SummonerIcon";
import SummonerSpellIcon from "./SummonerSpellIcon";
import { TabStrip, type TabStripItem } from "./TabStrip";
import WinRateBar from "./WinRateBar";
import ItemIcon from "./ItemIcon";

const TAB_ITEMS: TabStripItem[] = [
  { key: "ov", label: "Overview", accent: "var(--theme-assist)" },
  { key: "cb", label: "Combat", accent: "var(--theme-loss)" },
  { key: "ec", label: "Economy", accent: "var(--theme-gold)" },
  { key: "fa", label: "Farm", accent: "var(--theme-win)" },
  { key: "ob", label: "Objectives", accent: "var(--theme-crimson)" },
  { key: "vi", label: "Vision", accent: "var(--theme-assist)" },
  { key: "ab", label: "Abilities", accent: "var(--theme-gold)" },
  { key: "it", label: "Items", accent: "var(--theme-gold)" },
  { key: "ru", label: "Runes", accent: "var(--theme-violet)" },
  { key: "mu", label: "Matchups", accent: "var(--theme-loss)" },
  { key: "sy", label: "Synergies", accent: "var(--theme-win)" },
  { key: "tl", label: "Timeline", accent: "var(--theme-assist)" },
  { key: "tr", label: "Trends", accent: "var(--theme-gold)" },
  { key: "rc", label: "Records", accent: "var(--theme-crimson)" },
  { key: "ma", label: "Matches", accent: "var(--theme-text)" },
  { key: "ms", label: "Mastery", accent: "var(--theme-violet)" },
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
  const recordsActive = activeTab === "rc";
  const matchesActive = activeTab === "ma";
  const masteryActive = activeTab === "ms";
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
  const { data: timelineAverages, loading: timelineAveragesLoading } = useIpc<TimelineBucket[]>(
    () =>
      economyActive || farmActive
        ? window.api.getChampionTimelineAverages(id, patch, scopedQueue, account)
        : Promise.resolve([]),
    [economyActive, farmActive, id, patch, scopedQueue, account],
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
  const { data: records, loading: recordsLoading } = useIpc<ChampionRecordsResult | null>(
    () =>
      recordsActive
        ? window.api.getChampionRecords(id, patch, scopedQueue, account)
        : Promise.resolve(null),
    [recordsActive, id, patch, scopedQueue, account],
  );
  const { data: masterySource, loading: masteryLoading } = useIpc<
    ProfileExtras | AccountSnapshot | null
  >(
    () =>
      masteryActive
        ? account === "all"
          ? window.api.getProfileExtras()
          : window.api.getAccountSnapshot(account)
        : Promise.resolve(null),
    [masteryActive, account],
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
      overviewActive || economyActive || farmActive
        ? window.api.getChampionQueueStats(id, account)
        : Promise.resolve([] as Array<{ queueId: number; games: number; wins: number }>),
    [overviewActive, economyActive, farmActive, id, account],
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
  const mastery = useMemo<MasteryChampion | null>(() => {
    return masterySource?.topMasteryChampions.find((item) => item.championId === id) ?? null;
  }, [id, masterySource]);
  const masteryAccountName =
    masterySource && "gameName" in masterySource ? masterySource.gameName : null;
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
        <EconomyTab
          detail={detailStats}
          detailLoading={detailLoading}
          timeline={timelineAverages}
          timelineLoading={timelineAveragesLoading}
          queueStats={queueStats}
          queueStatsLoading={queueStatsLoading}
        />
      ) : activeTab === "fa" ? (
        <FarmTab
          detail={detailStats}
          detailLoading={detailLoading}
          timeline={timelineAverages}
          timelineLoading={timelineAveragesLoading}
          queueStats={queueStats}
          queueStatsLoading={queueStatsLoading}
        />
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
      ) : activeTab === "rc" ? (
        <RecordsTab records={records} recordsLoading={recordsLoading} matchHistory={matchHistory} />
      ) : matchesActive ? (
        <MatchesTab
          championId={id}
          patch={patch}
          queue={scopedQueue}
          account={account}
          championName={name}
          champData={champData}
        />
      ) : activeTab === "ms" ? (
        <MasteryTab
          mastery={mastery}
          masteryLoading={masteryLoading}
          accountName={masteryAccountName}
        />
      ) : (
        <Panel>
          <p className="py-8 text-center text-sm text-lol-text">This tab lands in a later phase.</p>
        </Panel>
      )}
    </div>
  );
}

const RECORD_GROUPS: Array<[string, string[]]> = [
  [
    "Combat",
    [
      "kills",
      "deaths",
      "assists",
      "kda",
      "damage",
      "damageTaken",
      "healing",
      "longestAlive",
      "firstBloodKills",
    ],
  ],
  ["Multikills", ["doubleKills", "tripleKills", "quadraKills", "pentaKills"]],
  ["Economy", ["gold"]],
  ["Farm", ["cs"]],
  ["Objectives", ["turretKills", "objectivesStolen"]],
  ["Time", ["longestGame", "shortestWin"]],
];

export function RecordsTab({
  records,
  recordsLoading,
  matchHistory,
}: {
  records: ChampionRecordsResult | null;
  recordsLoading: boolean;
  matchHistory: { matches: MatchListItem[]; total: number } | null;
}) {
  const champData = useChampionData();
  if (recordsLoading) return <SectionLoading />;
  if (!records || records.records.length === 0) return <NoData />;

  const podium = (matchHistory?.matches ?? [])
    .slice()
    .sort(
      (a, b) =>
        (b.score ?? Number.NEGATIVE_INFINITY) - (a.score ?? Number.NEGATIVE_INFINITY) ||
        b.game_creation - a.game_creation,
    )
    .slice(0, 3);
  const byKey = new Map(records.records.map((record) => [record.key, record]));
  const almostRecords = records.records
    .filter((record) => record.secondValue != null && record.value > 0)
    .map((record) => {
      const gap = record.value - record.secondValue!;
      return { record, gap, gapPct: gap / record.value };
    })
    .sort((a, b) => a.gapPct - b.gapPct)
    .slice(0, 5);
  const formatRecordValue = (record: ChampionRecordsResult["records"][number], value: number) =>
    ["longestGame", "shortestWin", "longestAlive"].includes(record.key)
      ? formatSeconds(value)
      : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return (
    <div className="flex flex-col gap-5">
      <InsightsPanel
        insights={[
          {
            kind: "info",
            text: "Personal bests for this champion — the specific game that holds each record is shown on the card.",
          },
        ]}
      />
      <Panel>
        <SectionHeading title="Podium — best games" />
        {podium.length === 0 ? (
          <NoData text="No games to rank" />
        ) : (
          <div className="flex flex-col gap-2">
            {podium.map((match, index) => (
              <div
                key={match.game_id}
                className="flex items-center gap-3 rounded-lg border border-lol-border/40 bg-black/10 px-3 py-2"
              >
                <span aria-label={`Place ${index + 1}`} className="text-base">
                  {["🥇", "🥈", "🥉"][index]}
                </span>
                <ChampionIcon championId={match.champion_id} size={28} className="rounded-md" />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-lol-text-bright">
                  {getChampionName(champData, match.champion_id)}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-lol-text-bright">
                  {match.kills}/{match.deaths}/{match.assists}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-lol-gold">
                  {match.score == null ? "—" : match.score.toFixed(1)}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-lol-text">
                  {formatSeconds(match.game_duration)}
                </span>
                <span className="shrink-0 text-xs text-lol-text">
                  {formatTimeAgo(match.game_creation)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <Panel>
        <SectionHeading title="Almost records" source="d" />
        {almostRecords.length === 0 ? (
          <NoData text="Not enough games to compare records" />
        ) : (
          <div className="flex flex-col gap-3">
            {almostRecords.map(({ record, gapPct }) => (
              <div key={record.key} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate text-lol-text">{record.label}</span>
                  <span className="shrink-0 font-display tabular-nums text-lol-gold">
                    {formatRecordValue(record, record.value)}
                  </span>
                  <span className="shrink-0 tabular-nums text-lol-text">
                    2nd: {formatRecordValue(record, record.secondValue!)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-lol-border/50">
                  <div
                    className="h-full rounded-full bg-lol-gold"
                    style={{ width: `${(1 - gapPct) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
      {RECORD_GROUPS.map(([group, keys]) => {
        const groupRecords = keys
          .map((key) => byKey.get(key))
          .filter((record): record is ChampionRecordsResult["records"][number] => record != null);
        if (groupRecords.length === 0) return null;
        return (
          <Panel key={group}>
            <SectionHeading title={group} />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {groupRecords.map((record) => (
                <div
                  key={record.key}
                  className="rounded-lg border border-lol-border bg-black/10 p-3"
                >
                  <span className="text-xs text-lol-text">{record.label}</span>
                  <b className="mt-1 block font-display text-2xl text-lol-text-bright">
                    {formatRecordValue(record, record.value)}
                  </b>
                  <span className="mt-1 block text-[11px] text-lol-text">
                    Game {record.gameId ?? "—"}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        );
      })}
      <p className="text-xs text-lol-text">Longest win streak: not implemented.</p>
    </div>
  );
}

export function MatchesTab({
  championId,
  patch,
  queue,
  account,
  championName,
  champData,
}: {
  championId: number;
  patch?: string;
  queue?: number;
  account: string;
  championName: string;
  champData: ChampionData;
}) {
  const [page, setPage] = useState(0);
  const [matches, setMatches] = useState<MatchListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "wins" | "losses">("all");
  const [sort, setSort] = useState<"newest" | "score">("newest");

  useEffect(() => {
    let cancelled = false;
    setPage(0);
    setMatches([]);
    setTotal(0);
    setLoading(true);
    window.api
      .getChampionMatchHistory(championId, 50, 0, patch, queue, account)
      .then((result) => {
        if (cancelled) return;
        setMatches(result.matches);
        setTotal(result.total);
      })
      .catch((error) => {
        if (!cancelled) console.error("[champion-matches] load failed:", error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [championId, patch, queue, account]);

  const visibleMatches = matches
    .filter((match) => filter === "all" || (filter === "wins" ? match.win === 1 : match.win === 0))
    .slice()
    .sort((a, b) =>
      sort === "score"
        ? (b.score ?? Number.NEGATIVE_INFINITY) - (a.score ?? Number.NEGATIVE_INFINITY) ||
          b.game_creation - a.game_creation
        : b.game_creation - a.game_creation,
    );

  const loadMore = () => {
    const nextPage = page + 1;
    setLoading(true);
    window.api
      .getChampionMatchHistory(championId, 50, nextPage * 50, patch, queue, account)
      .then((result) => {
        setMatches((current) => [...current, ...result.matches]);
        setTotal(result.total);
        setPage(nextPage);
      })
      .catch((error) => console.error("[champion-matches] load more failed:", error))
      .finally(() => setLoading(false));
  };

  return (
    <Panel>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SectionHeading title="Matches" aside={`Loaded ${matches.length} of ${total}`} />
        <div className="flex flex-wrap items-center gap-2">
          <SortButtons
            value={filter}
            options={[
              ["all", "All"],
              ["wins", "Wins"],
              ["losses", "Losses"],
            ]}
            onChange={setFilter}
          />
          <SortButtons
            value={sort}
            options={[
              ["newest", "Newest"],
              ["score", "Best score"],
            ]}
            onChange={setSort}
          />
        </div>
      </div>
      {loading && matches.length === 0 ? (
        <SectionLoading />
      ) : visibleMatches.length === 0 ? (
        <NoData />
      ) : (
        <div
          className="match-list-exp flex flex-col gap-2.5"
          style={{ containerType: "inline-size" }}
        >
          {visibleMatches.map((match) => (
            <MatchRowExperiment
              key={match.game_id}
              match={match}
              championName={championName}
              champData={champData}
            />
          ))}
        </div>
      )}
      {matches.length < total && (
        <button
          type="button"
          className="mt-5 w-full rounded-md border border-lol-border px-3 py-2 text-sm font-semibold text-lol-text-bright hover:border-lol-crimson disabled:opacity-50"
          onClick={loadMore}
          disabled={loading}
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </Panel>
  );
}

export function MasteryTab({
  mastery,
  masteryLoading,
  accountName,
}: {
  mastery: MasteryChampion | null;
  masteryLoading: boolean;
  accountName: string | null;
}) {
  if (masteryLoading) return <SectionLoading />;
  if (!mastery) {
    return <NoData text="No mastery data" />;
  }

  return (
    <div className="flex flex-col gap-5">
      <Panel>
        <SectionHeading title="Mastery" aside={accountName ?? undefined} />
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Level" value={mastery.level.toLocaleString()} sub="Current champion level" />
          <Stat
            label="Points"
            value={mastery.points.toLocaleString()}
            sub="Current champion points"
          />
        </div>
        <p className="mt-4 text-xs text-lol-text">Progress bar unavailable</p>
      </Panel>
      <Panel>
        <SectionHeading title="Milestones" />
        <div className="flex flex-col gap-2">
          {[5, 7, 10].map((level) => (
            <div
              key={level}
              className="flex items-center justify-between rounded-md border border-lol-border/60 px-3 py-2 text-sm"
            >
              <span className="text-lol-text-bright">Level {level}</span>
              <span className={mastery.level >= level ? "text-lol-win" : "text-lol-text"}>
                {mastery.level >= level ? "✓ Reached" : "Not reached"}
              </span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel>
        <SectionHeading title="Level thresholds" source="l" />
        <table className="w-full text-xs">
          <thead className="border-b border-lol-border/50 text-left text-lol-text">
            <tr>
              <th className="pb-2 font-semibold">Level</th>
              <th className="pb-2 text-right font-semibold">Points needed</th>
              <th className="pb-2 text-right font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {[
              [5, 10_000],
              [6, 13_000],
              [7, 21_600],
              [8, 33_000],
              [9, 47_000],
              [10, 63_000],
              [11, 80_000],
              [12, 101_600],
            ].map(([level, points], index, thresholds) => {
              const reached = mastery.points >= points;
              const next =
                !reached &&
                thresholds.slice(0, index).every(([, threshold]) => mastery.points >= threshold);
              return (
                <tr key={level} className="border-b border-lol-border/50 last:border-0">
                  <td className="py-2 text-lol-text-bright">Level {level}</td>
                  <td className="py-2 text-right tabular-nums text-lol-text-bright">
                    {points.toLocaleString()}
                  </td>
                  <td
                    className={`py-2 text-right tabular-nums ${
                      reached ? "text-lol-win" : next ? "text-lol-text" : "text-lol-text"
                    }`}
                  >
                    {reached
                      ? "Reached"
                      : next
                        ? `${(points - mastery.points).toLocaleString()} to go`
                        : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
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
      <InsightsPanel
        insights={[
          {
            kind: detail.avgVisionScore >= 1 ? "good" : "info",
            text: `${detail.avgVisionScore.toFixed(1)} average vision score over ${detail.games.toLocaleString()} games.`,
          },
        ]}
      />
      <div className="grid grid-cols-2 gap-3 xl:col-span-2 xl:grid-cols-4">
        <CombatTile
          label="Vision score"
          value={detail.avgVisionScore}
          subtitle={`best ${formatCombatNumber(detail.maxVisionScore)}`}
        />
        <CombatTile
          label="Wards placed"
          value={detail.avgWardsPlaced}
          subtitle={`best ${formatCombatNumber(detail.maxWardsPlaced)}`}
        />
        <CombatTile
          label="Wards killed"
          value={detail.avgWardsKilled}
          subtitle={`best ${formatCombatNumber(detail.maxWardsKilled)}`}
        />
        <CombatTile
          label="Control ward share"
          value={wardShareTotal > 0 ? (detail.avgVisionWardsBought / wardShareTotal) * 100 : null}
          subtitle="of purchased wards"
        />
      </div>
      <Panel className="xl:col-span-2">
        <SectionHeading title="Vision score" source="m" />
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
        <SectionHeading title="Per minute" source="d" />
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
        <SectionHeading title="Ratio" source="d" />
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
        <SectionHeading title="Recent games" source="m" />
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
  const buildVariants = new Map<string, { items: number[]; games: number; wins: number }>();
  const itemPairs = new Map<string, number>();
  for (const match of recentMatches) {
    const itemIds = [match.item0, match.item1, match.item2, match.item3, match.item4, match.item5]
      .filter((itemId): itemId is number => itemId != null && itemId > 0)
      .sort((a, b) => a - b);
    if (itemIds.length > 0) {
      const key = itemIds.join(",");
      const variant = buildVariants.get(key) ?? { items: itemIds, games: 0, wins: 0 };
      variant.games += 1;
      variant.wins += match.win ? 1 : 0;
      buildVariants.set(key, variant);
    }
    for (let index = 0; index < itemIds.length; index += 1) {
      for (let next = index + 1; next < itemIds.length; next += 1) {
        const key = `${itemIds[index]}:${itemIds[next]}`;
        itemPairs.set(key, (itemPairs.get(key) ?? 0) + 1);
      }
    }
  }
  const topBuildVariants = [...buildVariants.values()]
    .sort((a, b) => b.games - a.games || b.wins - a.wins)
    .slice(0, 5);
  const topItemPairs = [...itemPairs.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5);

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <InsightsPanel
        insights={[
          {
            kind: items.length > 0 ? "good" : "info",
            text: `${items.length.toLocaleString()} item aggregates available for this champion.`,
          },
        ]}
      />
      <div className="grid grid-cols-2 gap-3 xl:col-span-2 xl:grid-cols-4">
        <CombatTile label="Tracked games" value={detail?.games} subtitle="champion aggregate" />
        <CombatTile label="Unique items" value={items.length} subtitle="item aggregates" />
        <CombatTile
          label="Most built"
          value={items.reduce((max, item) => Math.max(max, item.picks), 0)}
          subtitle="highest pick count"
        />
        <CombatTile
          label="Recent builds"
          value={recentMatches.length}
          subtitle="match history rows"
        />
      </div>
      <RatePanel
        title="Top items"
        source="m"
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

      <Panel>
        <SectionHeading title="Item categories" source="m" />
        <NoData text="Item category metadata is not stored in match aggregates." />
      </Panel>

      <Panel>
        <SectionHeading title="Item pairs" source="d" aside="Recent games" />
        {topItemPairs.length === 0 ? (
          <NoData text="Not enough recent builds" />
        ) : (
          <div className="flex flex-col gap-2 text-xs">
            {topItemPairs.map(([key, count]) => {
              const [first, second] = key.split(":").map(Number);
              return (
                <div key={key} className="flex items-center gap-2">
                  <ItemIcon itemId={first} size={26} patch={patch} />
                  <ItemIcon itemId={second} size={26} patch={patch} />
                  <span className="min-w-0 flex-1 truncate text-lol-text-bright">
                    {getItemName(itemData, first)} + {getItemName(itemData, second)}
                  </span>
                  <span className="tabular-nums text-lol-text">{count}x</span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel className="xl:col-span-2">
        <SectionHeading title="Build variants" source="d" aside="Recent games" />
        {topBuildVariants.length === 0 ? (
          <NoData text="Not enough recent builds" />
        ) : (
          <div className="flex flex-col gap-2">
            {topBuildVariants.map((variant) => (
              <div
                key={variant.items.join(",")}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-lol-border/50 bg-black/10 px-3 py-2"
              >
                <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                  {variant.items.map((itemId) => (
                    <ItemIcon key={itemId} itemId={itemId} size={28} patch={patch} />
                  ))}
                </div>
                <span className="text-xs tabular-nums text-lol-text">
                  {variant.games} games · {formatPercent(variant.wins, variant.games)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel className="xl:col-span-2">
        <SectionHeading title="Build slots" source="m" aside="Last 20 games" />
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
        <SectionHeading title="Recent builds" source="m" aside="Last 10 games" />
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

  const totalPicks = keystones.reduce((sum, row) => sum + row.picks, 0);
  const totalWins = keystones.reduce((sum, row) => sum + row.wins, 0);
  const primaryTreeCount = detail.primaryTrees.length;
  const secondaryTreeCount = detail.secondaryTrees.length;

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <InsightsPanel
        insights={[
          {
            kind: totalPicks > 0 ? "good" : "info",
            text: `${totalPicks.toLocaleString()} keystone selections with ${formatPercent(totalWins, totalPicks)} win rate.`,
          },
        ]}
      />
      <div className="grid grid-cols-2 gap-3 xl:col-span-2 xl:grid-cols-4">
        <CombatTile label="Keystone picks" value={totalPicks} subtitle="aggregate selections" />
        <CombatTile
          label="Keystone win rate"
          value={totalPicks > 0 ? (totalWins / totalPicks) * 100 : null}
          subtitle="all tracked pages"
        />
        <CombatTile label="Primary trees" value={primaryTreeCount} subtitle="seen in data" />
        <CombatTile label="Secondary trees" value={secondaryTreeCount} subtitle="seen in data" />
      </div>
      <RatePanel
        title="Keystones"
        source="m"
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
        source="m"
        trees={treeRows(detail.primaryTrees)}
        runeData={runeData}
      />
      <RuneTreePanel
        title="Secondary trees"
        source="m"
        trees={treeRows(detail.secondaryTrees)}
        runeData={runeData}
      />

      <Panel className="xl:col-span-2">
        <SectionHeading title="Rune pages" source="m" />
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
  source,
}: {
  title: string;
  trees: Array<{ styleId: number; picks: number; wins: number }>;
  runeData: ReturnType<typeof useRuneData>;
  source?: keyof typeof SOURCE_LABELS;
}) {
  return (
    <Panel>
      <SectionHeading title={title} source={source} />
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
  const tierDefinitions = [
    { label: "S", color: "#C9A45C", min: 0.7 },
    { label: "A", color: "#b8b8c4", min: 0.6 },
    { label: "B", color: "#7FA6CC", min: 0.5 },
    { label: "C", color: "#A58CC4", min: 0.4 },
    { label: "D", color: "#E5483F", min: Number.NEGATIVE_INFINITY },
  ];
  const tierRows = tierDefinitions
    .map((tier, index) => ({
      ...tier,
      entries: (matchups ?? [])
        .filter((row) => row.games >= 2)
        .filter((row) => {
          const winRate = row.wins / row.games;
          const nextMin = tierDefinitions[index - 1]?.min ?? Number.POSITIVE_INFINITY;
          return winRate >= tier.min && winRate < nextMin;
        })
        .sort((a, b) => b.wins / b.games - a.wins / a.games),
    }))
    .filter((tier) => tier.entries.length > 0);
  const qualifiedMatchups = (matchups ?? []).filter((row) => row.games >= 2);
  const bestMatchup = qualifiedMatchups
    .slice()
    .sort((a, b) => b.wins / b.games - a.wins / a.games || b.games - a.games)[0];
  const worstMatchup = qualifiedMatchups
    .slice()
    .sort((a, b) => a.wins / a.games - b.wins / b.games || b.games - a.games)[0];
  const classStats = new Map<string, { games: number; wins: number }>();
  for (const row of qualifiedMatchups) {
    const enemyClass = champData[row.championId]?.class?.trim() || "Other";
    const current = classStats.get(enemyClass) ?? { games: 0, wins: 0 };
    current.games += row.games;
    current.wins += row.wins;
    classStats.set(enemyClass, current);
  }
  const classRows = [...classStats.entries()].sort((a, b) => b[1].games - a[1].games).slice(0, 6);

  return [
    <InsightsPanel
      key="matchup-insights"
      insights={[
        bestMatchup
          ? {
              kind: "good",
              text: `Best matchup: ${getChampionName(champData, bestMatchup.championId)} at ${formatPercent(bestMatchup.wins, bestMatchup.games)}.`,
            }
          : { kind: "info", text: "Not enough matchup games for a best result." },
        worstMatchup
          ? {
              kind: "warn",
              text: `Hardest matchup: ${getChampionName(champData, worstMatchup.championId)} at ${formatPercent(worstMatchup.wins, worstMatchup.games)}.`,
            }
          : { kind: "info", text: "Not enough matchup games for a hardest result." },
      ]}
    />,
    <Panel className="xl:col-span-2" key="matchup-tier-list">
      <SectionHeading title="Matchup tier list" source="d" />
      {tierRows.length === 0 ? (
        <NoData text="Not enough games for a tier list" />
      ) : (
        <div className="flex flex-col gap-3">
          {tierRows.map((tier) => (
            <div key={tier.label} className="flex items-center gap-3">
              <span
                className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md font-display text-sm font-bold"
                style={{ backgroundColor: tier.color, color: "#150c33" }}
              >
                {tier.label}
              </span>
              <div className="flex flex-wrap gap-2">
                {tier.entries.map((row) => {
                  const winRate = row.wins / row.games;
                  const name = getChampionName(champData, row.championId);
                  return (
                    <span
                      key={row.championId}
                      title={`${name} · ${row.games} games · ${(winRate * 100).toFixed(0)}% WR`}
                    >
                      <ChampionIcon championId={row.championId} size={28} className="rounded-md" />
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>,
    <Panel className="xl:col-span-2" key="matchups">
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
    </Panel>,
    <Panel className="xl:col-span-2" key="enemy-class">
      <SectionHeading title="Performance by enemy class" source="d" />
      {classRows.length === 0 ? (
        <NoData text="Not enough matchup games for enemy classes" />
      ) : (
        <div className="flex flex-col gap-3">
          <RadarChart
            axes={classRows.map(([label]) => label)}
            series={[
              {
                values: classRows.map(([, stats]) => (stats.wins / stats.games) * 100),
                color: "var(--theme-crimson)",
                label: "Your win rate by class",
              },
            ]}
          />
          <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            {classRows.map(([label, stats]) => (
              <div key={label} className="flex items-center gap-3">
                <span className="w-24 truncate text-lol-text">{label}</span>
                <div className="min-w-0 flex-1">
                  <WinRateBar wins={stats.wins} total={stats.games} showPercent={false} />
                </div>
                <span className="w-12 text-right tabular-nums text-lol-text-bright">
                  {formatPercent(stats.wins, stats.games)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>,
  ];
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
  source,
  values,
  labels,
  color,
  format,
  min,
  max,
  baseline,
}: {
  title: string;
  source?: keyof typeof SOURCE_LABELS;
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
      <SectionHeading title={title} source={source} />
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
      <InsightsPanel
        insights={[
          {
            kind: "info",
            text: "Placeholder — trend insights land in a follow-up phase.",
          },
        ]}
      />
      <Panel className="xl:col-span-2">
        <div className="mb-4 flex items-center justify-between gap-3">
          <SectionHeading title="Win rate over time" source="m" />
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
        <SectionHeading title="Average KDA over time" source="m" />
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
        source="m"
        values={scores}
        labels={labels}
        color="var(--theme-gold)"
        format={(value) => value.toFixed(1)}
        min={0}
        max={10}
      />
      <TrendChartPanel
        title="Average CS per game"
        source="m"
        values={averageCs}
        labels={labels}
        color="var(--theme-violet)"
        format={(value) => value.toFixed(1)}
      />
      <Panel className="xl:col-span-2">
        <SectionHeading title="Win rate by patch" source="m" />
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
        <SectionHeading title="By day of week" source="m" />
        <TrendBars
          rows={weekdays.map((row, index) => ({
            label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index],
            games: row?.games ?? 0,
            wins: row?.wins ?? 0,
          }))}
        />
      </Panel>
      <Panel>
        <SectionHeading title="By hour of day" source="m" />
        <TrendBars rows={hours} />
      </Panel>
      <Panel className="xl:col-span-2">
        <SectionHeading title="Skill profile" source="d" />
        {/* Placeholder data; backend skill-profile metrics land in a follow-up phase. */}
        <RadarChart
          axes={["Combat", "Farm", "Objectives", "Vision", "Survival", "Teamplay"]}
          series={[
            {
              values: [72, 68, 55, 41, 63, 58],
              color: "var(--theme-foreground-muted)",
              label: "All time",
            },
            {
              values: [75, 66, 60, 48, 61, 62],
              color: "var(--theme-crimson)",
              label: "Last 30 days",
            },
          ]}
        />
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
      <InsightsPanel
        insights={[
          {
            kind: "info",
            text: "Timeline data is available for a subset of games (those fetched while logged in).",
          },
        ]}
      />
      <Panel>
        <SectionHeading title="Game picker" source="t" />
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
            <SectionHeading title="Gold and CS curves" source="t" />
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
            <SectionHeading title="Level and XP" source="t" />
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
            <SectionHeading title="Events" source="t" />
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
      <InsightsPanel
        insights={[
          {
            kind: "info",
            text: "Per-ability damage is not exposed by any Riot API. Skill orders are shown from timeline data when available.",
          },
        ]}
      />
      <Panel className="xl:col-span-2">
        <SectionHeading title="Skill order" source="t" />
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
        <SectionHeading title="Cast distribution" source="t" />
        {/* Placeholder data; backend ability-cast distribution lands in a follow-up phase. */}
        <DonutChart
          segments={[
            { label: "Q", value: 32, color: "var(--theme-assist)" },
            { label: "W", value: 22, color: "var(--theme-win)" },
            { label: "E", value: 38, color: "var(--theme-gold)" },
            { label: "R", value: 8, color: "var(--theme-crimson)" },
          ]}
        />
      </Panel>

      <Panel>
        <SectionHeading
          title="R rank timing"
          source="t"
          aside={`Based on ${rTiming.sampleSize} games`}
        />
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
        <SectionHeading title="Summoner spells" source="m" />
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
        <SectionHeading title="Per-ability damage" source="d" />
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
  timeline,
  timelineLoading,
  queueStats,
  queueStatsLoading,
}: {
  detail: ChampionDetailStats | null;
  detailLoading: boolean;
  timeline: TimelineBucket[] | null;
  timelineLoading: boolean;
  queueStats: Array<{ queueId: number; games: number; wins: number }> | null;
  queueStatsLoading: boolean;
}) {
  if (detailLoading) return <SectionLoading />;
  if (!detail || detail.games === 0) return <NoData text="No data" />;
  if (timelineLoading) return <SectionLoading />;

  const buckets = timeline ?? [];
  const bucketAt = (minute: number) => buckets.find((bucket) => bucket.minute === minute);
  const goldValues = buckets.flatMap((bucket) => (bucket.avgGold == null ? [] : [bucket.avgGold]));
  const goldLabels = buckets
    .filter((bucket) => bucket.avgGold != null)
    .map((bucket) => `${bucket.minute}m`);
  const goldLead = buckets.flatMap((bucket) =>
    bucket.avgGoldDiffVsLaneOpponent == null ? [] : [bucket.avgGoldDiffVsLaneOpponent],
  );
  const xpLead = buckets.flatMap((bucket) =>
    bucket.avgXpDiffVsLaneOpponent == null ? [] : [bucket.avgXpDiffVsLaneOpponent],
  );
  const timelineGames = buckets.reduce((sum, bucket) => sum + bucket.sampleGames, 0);
  const damagePerGold =
    detail.avgGoldSpent > 0
      ? (detail.avgPhysicalDamageDealt + detail.avgMagicDamageDealt) / detail.avgGoldSpent
      : null;
  const value = (number: number | null | undefined, digits = 0) =>
    number == null ? "—" : number.toLocaleString(undefined, { maximumFractionDigits: digits });
  const queueRows = queueStats ?? [];

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <InsightsPanel
        insights={[
          {
            kind: "good",
            text: `Gold timeline averages are based on ${timelineGames} game-minute samples.`,
          },
          {
            kind: "info",
            text:
              goldLead.length > 0
                ? "Lane gold lead is shown at the nearest available timeline minute."
                : "Lane gold lead is not available without a matching opponent timeline.",
          },
        ]}
      />
      <Panel className="xl:col-span-2">
        <SectionHeading title="Economy snapshot" source="d" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat
            label="Gold/min"
            value={detail.goldPerMin.toFixed(0)}
            sub="Average earned per minute"
          />
          <Stat label="Ahead @10" value="—" sub="Percentage unavailable" />
          <Stat
            label="Gold lead @15"
            value={value(bucketAt(15)?.avgGoldDiffVsLaneOpponent)}
            sub="Versus lane opponent"
          />
          <Stat
            label="Gold efficiency"
            value={value(damagePerGold, 2)}
            sub="Damage per gold spent"
          />
          <Stat label="Items bought" value="—" sub="Not stored in aggregate stats" />
          <Stat label="Comebacks" value="—" sub="Not available from current data" />
        </div>
      </Panel>
      <Panel>
        <SectionHeading title="Gold over time" source="d" />
        {goldValues.length < 2 ? (
          <NoData text="Not enough timeline data" />
        ) : (
          <LineChartExp
            values={goldValues}
            xLabels={goldLabels}
            format={(item) => value(item)}
            color="var(--theme-gold)"
          />
        )}
      </Panel>
      <Panel>
        <SectionHeading title="Gold" source="m" />
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
      </Panel>
      <Panel>
        <SectionHeading title="Lead vs lane opponent" source="d" />
        <div className="flex flex-col gap-2 text-xs">
          <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-lol-border/50 pb-2 font-semibold text-lol-text">
            <span>Stat</span>
            <span>Avg</span>
          </div>
          {[
            ["Gold diff @5", bucketAt(5)?.avgGoldDiffVsLaneOpponent],
            ["Gold diff @10", bucketAt(10)?.avgGoldDiffVsLaneOpponent],
            ["Gold diff @15", bucketAt(15)?.avgGoldDiffVsLaneOpponent],
            ["Gold diff @20", bucketAt(20)?.avgGoldDiffVsLaneOpponent],
            ["XP diff @10", bucketAt(10)?.avgXpDiffVsLaneOpponent],
            ["XP diff @15", bucketAt(15)?.avgXpDiffVsLaneOpponent],
          ].map(([label, stat]) => (
            <div key={label} className="grid grid-cols-[1fr_auto] gap-3 text-lol-text-bright">
              <span>{label}</span>
              <span className="tabular-nums">{value(stat as number | null | undefined)}</span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel>
        <SectionHeading title="Levels & XP" source="d" />
        <div className="flex flex-col gap-2 text-xs">
          {[
            ["Final level", detail.maxChampLevel],
            ["Level @5", bucketAt(5)?.avgLevel],
            ["Level @10", bucketAt(10)?.avgLevel],
            ["Level @15", bucketAt(15)?.avgLevel],
            ["Level @20", bucketAt(20)?.avgLevel],
          ].map(([label, stat]) => (
            <div key={label} className="flex items-center justify-between text-lol-text-bright">
              <span className="text-lol-text">{label}</span>
              <span className="tabular-nums">{value(stat as number | null | undefined, 1)}</span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel>
        <SectionHeading title="Gold lead curve" source="d" />
        {goldLead.length < 2 ? (
          <NoData text="Not enough lane timeline data" />
        ) : (
          <LineChartExp
            values={goldLead}
            format={(item) => value(item)}
            color="var(--theme-gold)"
          />
        )}
      </Panel>
      <Panel>
        <SectionHeading title="XP lead curve" source="d" />
        {xpLead.length < 2 ? (
          <NoData text="Not enough lane timeline data" />
        ) : (
          <LineChartExp
            values={xpLead}
            format={(item) => value(item)}
            color="var(--theme-violet)"
          />
        )}
      </Panel>
      <Panel>
        <SectionHeading title="Gold spending" source="m" />
        <div className="flex flex-col gap-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-lol-text">Gold spent average</span>
            <span className="tabular-nums text-lol-text-bright">{value(detail.avgGoldSpent)}</span>
          </div>
        </div>
      </Panel>
      <Panel>
        <SectionHeading title="Economy by queue" source="m" />
        {queueStatsLoading ? (
          <SectionLoading />
        ) : queueRows.length === 0 ? (
          <NoData text="No queue data" />
        ) : (
          <div className="flex flex-col gap-2 text-xs">
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-2 border-b border-lol-border/50 pb-2 font-semibold text-lol-text">
              <span>Queue</span>
              <span>Games</span>
              <span>Gold/min</span>
              <span>Avg gold</span>
              <span>CS/min</span>
              <span>KDA</span>
            </div>
            {queueRows.map((row) => (
              <div
                key={row.queueId}
                className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-2 text-lol-text-bright"
              >
                <span>{QUEUE_LABELS[row.queueId] ?? row.queueId}</span>
                <span className="tabular-nums">{row.games}</span>
                <span>—</span>
                <span>—</span>
                <span>—</span>
                <span>—</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
      {[
        ["Gold sources", "Gold-source split not available"],
        ["WR by gold lead @15", "Gold lead outcomes are not available"],
        ["Gold lead distribution", "Per-game lead distribution is not available"],
        ["Spending timeline", "Item purchase timeline is not available"],
      ].map(([title, text]) => (
        <Panel key={title}>
          <SectionHeading title={title} source="d" />
          <NoData text={text} />
        </Panel>
      ))}
    </div>
  );
}

function FarmTab({
  detail,
  detailLoading,
  timeline,
  timelineLoading,
  queueStats,
  queueStatsLoading,
}: {
  detail: ChampionDetailStats | null;
  detailLoading: boolean;
  timeline: TimelineBucket[] | null;
  timelineLoading: boolean;
  queueStats: Array<{ queueId: number; games: number; wins: number }> | null;
  queueStatsLoading: boolean;
}) {
  if (detailLoading) return <SectionLoading />;
  if (!detail || detail.games === 0) return <NoData text="No data" />;
  if (timelineLoading) return <SectionLoading />;

  const buckets = timeline ?? [];
  const bucketAt = (minute: number) => buckets.find((bucket) => bucket.minute === minute);
  const csValues = buckets.flatMap((bucket) => (bucket.avgCs == null ? [] : [bucket.avgCs]));
  const csLead = buckets.flatMap((bucket) =>
    bucket.avgCsDiffVsLaneOpponent == null ? [] : [bucket.avgCsDiffVsLaneOpponent],
  );
  const timelineGames = buckets.reduce((sum, bucket) => sum + bucket.sampleGames, 0);
  const value = (number: number | null | undefined, digits = 1) =>
    number == null ? "—" : number.toLocaleString(undefined, { maximumFractionDigits: digits });

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <InsightsPanel
        insights={[
          {
            kind: "good",
            text: `CS pace is based on ${timelineGames} game-minute samples with timeline data.`,
          },
          {
            kind: "info",
            text:
              csLead.length > 0
                ? "The CS curve can be compared with the nearest available lane-opponent frame."
                : "Lane CS lead is not available without a matching opponent timeline.",
          },
        ]}
      />
      <Panel className="xl:col-span-2">
        <SectionHeading title="Farm snapshot" source="d" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat
            label="CS/min"
            value={
              detail.avgGameLength > 0
                ? (detail.avgTotalMinionsKilled / (detail.avgGameLength / 60)).toFixed(1)
                : "—"
            }
            sub="Average minions per minute"
          />
          <Stat label="CS @10" value={value(bucketAt(10)?.avgCs)} sub="Timeline average" />
          <Stat
            label="CS diff @15"
            value={value(bucketAt(15)?.avgCsDiffVsLaneOpponent)}
            sub="Versus lane opponent"
          />
          <Stat label="8+ CS/min games" value="—" sub="Not available from current data" />
          <Stat label="Jungle share" value="—" sub="Percentage unavailable" />
          <Stat label="Possible CS @10" value="—" sub="Not available from current data" />
        </div>
      </Panel>
      <Panel>
        <SectionHeading title="Minion split" source="m" />
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
        <SectionHeading title="CS pace" source="d" />
        <div className="flex flex-col gap-2 text-xs">
          <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-lol-border/50 pb-2 font-semibold text-lol-text">
            <span>Stat</span>
            <span>Avg</span>
          </div>
          {[5, 10, 15, 20, 25, 30].map((minute) => (
            <div key={minute} className="grid grid-cols-[1fr_auto] gap-3 text-lol-text-bright">
              <span>CS @{minute}</span>
              <span className="tabular-nums">{value(bucketAt(minute)?.avgCs)}</span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel>
        <SectionHeading title="CS curve" source="d" />
        {csValues.length < 2 ? (
          <NoData text="Not enough timeline data" />
        ) : (
          <LineChartExp
            values={csValues}
            format={(item) => value(item)}
            color="var(--theme-violet)"
          />
        )}
      </Panel>
      <Panel>
        <SectionHeading title="CS lead vs lane opponent" source="d" />
        {csLead.length < 2 ? (
          <NoData text="Not enough lane timeline data" />
        ) : (
          <LineChartExp values={csLead} format={(item) => value(item)} color="var(--theme-win)" />
        )}
      </Panel>
      <Panel>
        <SectionHeading title="Jungle share" source="m" />
        <div className="flex flex-col gap-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-lol-text">Allied jungle</span>
            <span className="tabular-nums text-lol-text-bright">
              {value(detail.avgNeutralMinionsTeamJungle)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-lol-text">Enemy jungle</span>
            <span className="tabular-nums text-lol-text-bright">
              {value(detail.avgNeutralMinionsEnemyJungle)}
            </span>
          </div>
        </div>
      </Panel>
      <Panel>
        <SectionHeading title="Farm by queue" source="m" />
        {queueStatsLoading ? (
          <SectionLoading />
        ) : (queueStats ?? []).length === 0 ? (
          <NoData text="No queue data" />
        ) : (
          <div className="flex flex-col gap-2 text-xs">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 border-b border-lol-border/50 pb-2 font-semibold text-lol-text">
              <span>Queue</span>
              <span>Games</span>
              <span>CS/min</span>
              <span>Avg CS</span>
            </div>
            {(queueStats ?? []).map((row) => (
              <div
                key={row.queueId}
                className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-lol-text-bright"
              >
                <span>{QUEUE_LABELS[row.queueId] ?? row.queueId}</span>
                <span className="tabular-nums">{row.games}</span>
                <span>—</span>
                <span>—</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
      {[
        ["CS per game histogram", "Per-game CS distribution is not available"],
        ["WR by CS @10", "CS-at-10 outcomes are not available per game"],
        ["CS by game phase", "Phase-specific CS aggregation is not available"],
        ["Where CS comes from", "Lane/jungle source split is not available"],
      ].map(([title, text]) => (
        <Panel key={title}>
          <SectionHeading title={title} source="d" />
          <NoData text={text} />
        </Panel>
      ))}
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

  const objectiveTotal =
    detail.totalTurretKills +
    detail.totalInhibitorKills +
    detail.totalBaronKills +
    detail.totalObjectivesStolen;
  const objectiveDamagePerGame = detail.avgDamageToObjectives + detail.avgDamageToTurrets;

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <InsightsPanel
        insights={[
          {
            kind: objectiveTotal > detail.games ? "good" : "info",
            text: `${objectiveTotal.toLocaleString()} objective events across ${detail.games.toLocaleString()} games.`,
          },
        ]}
      />
      <div className="grid grid-cols-2 gap-3 xl:col-span-2 xl:grid-cols-4">
        <CombatTile
          label="Objective events / game"
          value={objectiveTotal / detail.games}
          subtitle="turrets, inhibitors, barons and steals"
        />
        <CombatTile
          label="Objective damage / game"
          value={objectiveDamagePerGame}
          subtitle="combined objective and turret damage"
        />
        <CombatTile
          label="First tower rate"
          value={(detail.totalFirstTowerKill / detail.games) * 100}
          subtitle={`${detail.totalFirstTowerKill.toLocaleString()} first towers`}
        />
        <CombatTile
          label="First inhibitor rate"
          value={(detail.totalFirstInhibitorKill / detail.games) * 100}
          subtitle={`${detail.totalFirstInhibitorKill.toLocaleString()} first inhibitors`}
        />
      </div>
      <Panel>
        <SectionHeading title="Turrets & inhibitors" source="m" />
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
        <SectionHeading title="Damage to objectives" source="m" />
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
        <SectionHeading title="First blood objectives" source="m" />
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
        <SectionHeading title="Stolen objectives" source="m" />
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
      <Panel>
        <SectionHeading title="Unavailable objective detail" source="d" />
        <NoData text="Objective timing, dragon types, and team control are not stored." />
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
  source,
  sort,
  options,
  onSortChange,
  loading,
  empty,
  children,
}: {
  title: string;
  source?: keyof typeof SOURCE_LABELS;
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
        <SectionHeading title={title} source={source} />
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

const SOURCE_LABELS = {
  m: "Match-V5",
  t: "Timeline",
  d: "Derived",
  l: "LCU",
  dd: "Data Dragon",
} as const;

function SourceBadge({ kind }: { kind: keyof typeof SOURCE_LABELS }): ReactElement {
  return (
    <span className="rounded border border-lol-border/60 px-2 py-0.5 font-display text-[10px] font-semibold uppercase tracking-wider text-lol-text">
      {SOURCE_LABELS[kind]}
    </span>
  );
}

export interface Insight {
  kind: "good" | "warn" | "info" | "bad";
  text: string;
}

// Placeholder copy is temporary; the next phase replaces it with computed stats.
function InsightsPanel({ insights }: { insights: Insight[] }): ReactElement {
  const borderColors: Record<Insight["kind"], string> = {
    good: "var(--theme-win)",
    warn: "var(--theme-gold)",
    info: "var(--theme-assist)",
    bad: "var(--theme-loss)",
  };

  return (
    <div className="flex flex-col gap-2">
      {insights.map((insight, index) => (
        <div
          key={`${insight.kind}-${index}`}
          className="rounded-r-lg bg-white/[0.02] px-3 py-2 text-xs text-lol-text-bright"
          style={{ borderLeft: `3px solid ${borderColors[insight.kind]}` }}
        >
          {insight.text}
        </div>
      ))}
    </div>
  );
}

function SectionHeading({
  title,
  aside,
  source,
}: {
  title: string;
  aside?: string;
  source?: keyof typeof SOURCE_LABELS;
}) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="flex items-center gap-2 font-display text-[16px] font-semibold text-lol-text-bright">
        {title}
        {source && <SourceBadge kind={source} />}
      </h2>
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
