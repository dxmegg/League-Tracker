import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type {
  AugmentStats,
  ChampionAllyRow,
  ChampionDetailStats,
  ChampionKillDeathPosition,
  ChampionKeystoneStat,
  ChampionMatchupRow,
  ChampionRuneStatsResult,
  ChampionRoleStat,
  ChampionQueueStat,
  ChampionStats,
  ChampionStatBaseline,
  ChampionSkillOrdersResult,
  ChampionTeammateRow,
  ChampionTimelineGame,
  ChampionTrendsData,
  ChampionWeeklyWinRate,
  ChampionWeeklyMetrics,
  ChampionRecordsResult,
  ChampionTimelineAverages,
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
import {
  formatDuration,
  formatNumber,
  formatPlain,
  formatPlaytime,
  formatTimeAgo,
} from "../lib/format";
import { useHistoryScopeQueue } from "../lib/historyScope";
import AugmentIcon from "./AugmentIcon";
import ChampionIcon from "./ChampionIcon";
import { DonutChart } from "./DonutChart";
import { LineChartExp } from "./LineChartExp";
import { MatchRowExperiment } from "./MatchRowExperiment";
import { Panel } from "./Panel";
import PatchSelect from "./PatchSelect";
import { RadarChart } from "./RadarChart";
import RiftMapScatter from "./RiftMapScatter";
import RuneIcon from "./RuneIcon";
import { SegmentedControl } from "./SegmentedControl";
import Sparkline from "./Sparkline";
import SummonerIcon from "./SummonerIcon";
import SummonerSpellIcon from "./SummonerSpellIcon";
import { TabStrip, type TabStripItem } from "./TabStrip";
import WinRateBar from "./WinRateBar";
import ItemIcon from "./ItemIcon";

const TAB_ITEMS: TabStripItem[] = [
  { key: "ov", label: "Overview", accent: "#E5483F" },
  { key: "cb", label: "Combat", accent: "#E5483F" },
  { key: "ec", label: "Economy", accent: "#E5483F" },
  { key: "fa", label: "Farm", accent: "#E5483F" },
  { key: "ob", label: "Objectives", accent: "#3B82F6" },
  { key: "vi", label: "Vision", accent: "#3B82F6" },
  { key: "ab", label: "Abilities", accent: "#3B82F6" },
  { key: "it", label: "Items", accent: "#3B82F6" },
  { key: "ru", label: "Runes", accent: "#3B82F6" },
  { key: "mu", label: "Matchups", accent: "#C9A45C" },
  { key: "sy", label: "Synergies", accent: "#C9A45C" },
  { key: "tl", label: "Timeline", accent: "#C9A45C" },
  { key: "tr", label: "Trends", accent: "#C9A45C" },
  { key: "rc", label: "Records", accent: "#C9A45C" },
  { key: "ma", label: "Matches", accent: "#22C55E" },
  { key: "ms", label: "Mastery", accent: "#22C55E" },
];

type RateSort = "count" | "winRate";

const CHART_PALETTE = ["#E5483F", "#C9A45C", "#22C55E", "#3B82F6", "#A855F7", "#94A3B8"] as const;

const RUNE_TREE_ACCENTS: Record<string, string> = {
  Precision: "#C9A45C",
  Domination: "#E5483F",
  Sorcery: "#3B82F6",
  Resolve: "#22C55E",
  Inspiration: "#A855F7",
};

const AUGMENT_ACCENTS: Record<string, string> = {
  kSilver: "#94A3B8",
  kGold: "#EAB308",
  kPrismatic: "#D946EF",
};

const STAT_LABEL_ORDER = [
  "Games",
  "Win rate",
  "KDA",
  "CS / min",
  "Score",
  "MVP / ACE",
  "Avg damage",
  "Avg gold",
  "Kill participation",
  "Damage share",
  "Avg damage taken",
  "Avg heal",
  "Gold / min",
  "Avg game length",
  "Total time played",
  "Streak",
] as const;

const TAB_PANEL_CLASSES = {
  crimson:
    "border-t-[3px] border-t-[#E5483F] bg-[radial-gradient(circle_at_top_right,#E5483F14,transparent_55%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]",
  gold: "border-t-[3px] border-t-[#C9A45C] bg-[radial-gradient(circle_at_top_right,#C9A45C14,transparent_55%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]",
  emerald:
    "border-t-[3px] border-t-[#22C55E] bg-[radial-gradient(circle_at_top_right,#22C55E14,transparent_55%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]",
  sapphire:
    "border-t-[3px] border-t-[#3B82F6] bg-[radial-gradient(circle_at_top_right,#3B82F614,transparent_55%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]",
  violet:
    "border-t-[3px] border-t-[#A855F7] bg-[radial-gradient(circle_at_top_right,#A855F714,transparent_55%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]",
  steel:
    "border-t-[3px] border-t-[#94A3B8] bg-[radial-gradient(circle_at_top_right,#94A3B814,transparent_55%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]",
} as const;

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
  const isSummary = championId === "summary";
  const id = isSummary ? null : Number(championId);
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
  const { data: statBaseline } = useIpc<ChampionStatBaseline>(
    () =>
      combatActive || farmActive || objectivesActive || visionActive
        ? id === null
          ? Promise.resolve({})
          : window.api.getChampionStatBaseline(id, patch, scopedQueue, account)
        : Promise.resolve({}),
    [combatActive, farmActive, objectivesActive, visionActive, id, patch, scopedQueue, account],
  );
  const {
    data: timelineAverages,
    loading: timelineAveragesLoading,
    error: timelineAveragesError,
  } = useIpc<ChampionTimelineAverages>(
    () =>
      economyActive || farmActive || timelineActive
        ? window.api.getChampionTimelineAverages(id, patch, scopedQueue, account)
        : Promise.resolve({
            buckets: [],
            ahead10: null,
            itemsBought: null,
            comebacks: null,
            winrateByGoldLead15: null,
            goldLeadDistribution15: null,
            spendingTimeline: null,
          }),
    [economyActive, farmActive, timelineActive, id, patch, scopedQueue, account],
  );
  const { data: skillOrders, loading: skillOrdersLoading } = useIpc<ChampionSkillOrdersResult>(
    () =>
      abilitiesActive && !isSummary
        ? window.api.getChampionSkillOrders(id ?? 0, patch, scopedQueue, account)
        : Promise.resolve({
            topOrders: [],
            rTiming: { avgR1Min: null, avgR2Min: null, avgR3Min: null, sampleSize: 0 },
            summonerSpells: [],
            timelineCoverage: { gamesWithTimeline: 0, totalGames: 0 },
          }),
    [abilitiesActive, isSummary, id, patch, scopedQueue, account],
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
  const { data: killDeathPositions, loading: killDeathPositionsLoading } = useIpc<
    ChampionKillDeathPosition[]
  >(
    () =>
      timelineActive && !isSummary && id != null
        ? window.api.getChampionKillDeathPositions(id, 500, account)
        : Promise.resolve([]),
    [timelineActive, isSummary, id, account],
  );
  const { data: matchHistory } = useIpc<{ matches: MatchListItem[]; total: number }>(
    () =>
      detailActive && !isSummary
        ? window.api.getChampionMatchHistory(
            id ?? 0,
            combatActive || itemsActive ? 20 : 8,
            0,
            patch,
            scopedQueue,
            account,
          )
        : Promise.resolve({ matches: [], total: 0 }),
    [detailActive, isSummary, combatActive, itemsActive, id, patch, scopedQueue, account],
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
  const { data: augmentStats, loading: augmentStatsLoading } = useIpc<AugmentStats[]>(
    () =>
      overviewActive
        ? window.api.getAugmentStats(id ?? undefined, patch, scopedQueue, account)
        : Promise.resolve([] as AugmentStats[]),
    [overviewActive, id, patch, scopedQueue],
  );
  const { data: keystones, loading: keystonesLoading } = useIpc<ChampionKeystoneStat[]>(
    () =>
      overviewActive
        ? window.api.getChampionKeystones(id, account)
        : Promise.resolve([] as ChampionKeystoneStat[]),
    [overviewActive, id, account],
  );
  const { data: queueStats, loading: queueStatsLoading } = useIpc<ChampionQueueStat[]>(
    () =>
      overviewActive || economyActive || farmActive
        ? window.api.getChampionQueueStats(id, account)
        : Promise.resolve([] as ChampionQueueStat[]),
    [overviewActive, economyActive, farmActive, id, account],
  );
  const { data: roleStats, loading: roleStatsLoading } = useIpc<ChampionRoleStat[]>(
    () =>
      overviewActive
        ? window.api.getChampionRoleStats(id, patch, scopedQueue, account)
        : Promise.resolve([] as ChampionRoleStat[]),
    [overviewActive, id, patch, scopedQueue, account],
  );
  const { data: weeklyWinRate, loading: weeklyWinRateLoading } = useIpc<ChampionWeeklyWinRate[]>(
    () =>
      overviewActive
        ? window.api.getChampionWeeklyWinRate(id, account)
        : Promise.resolve([] as ChampionWeeklyWinRate[]),
    [overviewActive, id, account],
  );
  const { data: weeklyMetrics } = useIpc<ChampionWeeklyMetrics[]>(
    () =>
      id != null
        ? window.api.getChampionWeeklyMetrics(
            id,
            patch,
            scopedQueue == null ? undefined : String(scopedQueue),
            account,
          )
        : Promise.resolve([] as ChampionWeeklyMetrics[]),
    [id, patch, scopedQueue, account],
  );

  const championStats = useMemo<ChampionStats | null>(
    () => (id == null ? null : (allStats?.find((item) => item.champion_id === id) ?? null)),
    [allStats, id],
  );
  const stats = useMemo<ChampionStats>(() => {
    if (championStats) return championStats;
    const aggregate = allStats?.reduce(
      (total, item) => ({
        games: total.games + item.games,
        wins: total.wins + item.wins,
        kills: total.kills + item.kills,
        deaths: total.deaths + item.deaths,
        assists: total.assists + item.assists,
        damage: total.damage + item.avg_damage * item.games,
        gold: total.gold + item.avg_gold * item.games,
        avgScoreTotal: total.avgScoreTotal + (item.avg_score ?? 0) * item.games,
        avgScoreGames: total.avgScoreGames + (item.avg_score != null ? item.games : 0),
        mvps: total.mvps + item.mvps,
        aces: total.aces + item.aces,
        avgCsPerMinTotal: total.avgCsPerMinTotal + (item.avg_cs_per_min ?? 0) * item.games,
        avgCsPerMinGames: total.avgCsPerMinGames + (item.avg_cs_per_min != null ? item.games : 0),
      }),
      {
        games: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        damage: 0,
        gold: 0,
        avgScoreTotal: 0,
        avgScoreGames: 0,
        mvps: 0,
        aces: 0,
        avgCsPerMinTotal: 0,
        avgCsPerMinGames: 0,
      },
    );
    const aggregateGames = aggregate?.games ?? 0;
    return {
      champion_id: 0,
      games: globalDetail?.games ?? aggregateGames,
      wins: globalDetail?.wins ?? aggregate?.wins ?? 0,
      kills: globalDetail?.kills ?? aggregate?.kills ?? 0,
      deaths: globalDetail?.deaths ?? aggregate?.deaths ?? 0,
      assists: globalDetail?.assists ?? aggregate?.assists ?? 0,
      avg_kills: aggregateGames > 0 ? (aggregate?.kills ?? 0) / aggregateGames : 0,
      avg_deaths: aggregateGames > 0 ? (aggregate?.deaths ?? 0) / aggregateGames : 0,
      avg_assists: aggregateGames > 0 ? (aggregate?.assists ?? 0) / aggregateGames : 0,
      avg_damage:
        globalDetail?.avgDamage ??
        (aggregateGames > 0 ? (aggregate?.damage ?? 0) / aggregateGames : 0),
      avg_gold:
        globalDetail?.avgGold ?? (aggregateGames > 0 ? (aggregate?.gold ?? 0) / aggregateGames : 0),
      avg_score:
        aggregate && aggregate.avgScoreGames > 0
          ? aggregate.avgScoreTotal / aggregate.avgScoreGames
          : null,
      mvps: aggregate?.mvps ?? 0,
      aces: aggregate?.aces ?? 0,
      double_kills: globalDetail?.doubleKills ?? 0,
      triple_kills: globalDetail?.tripleKills ?? 0,
      quadra_kills: globalDetail?.quadraKills ?? 0,
      penta_kills: globalDetail?.pentaKills ?? 0,
      avg_cs_per_min:
        aggregate && aggregate.avgCsPerMinGames > 0
          ? aggregate.avgCsPerMinTotal / aggregate.avgCsPerMinGames
          : null,
    };
  }, [allStats, championStats, globalDetail]);
  const streak = useMemo(() => {
    const matches = matchHistory?.matches;
    if (!matches || matches.length === 0) {
      return isSummary && detailStats && detailStats.longestWinStreak > 0
        ? { type: "W" as const, count: detailStats.longestWinStreak }
        : null;
    }
    const type = matches[0].win === 1 ? "W" : "L";
    const count = matches.findIndex((match) => (match.win === 1 ? "W" : "L") !== type);
    return { type, count: count === -1 ? matches.length : count };
  }, [detailStats, isSummary, matchHistory]);

  useEffect(() => {
    if (detailStatsError) {
      console.error("[CH-8] getChampionDetailStats failed:", detailStatsError);
    }
  }, [detailStatsError]);

  const augmentData = useAugmentData(patch);
  const itemData = useItemData(patch);
  const runeData = useRuneData();
  const name = isSummary ? "All champions summary" : getChampionName(champData, id ?? 0);
  const mastery = useMemo<MasteryChampion | null>(() => {
    return masterySource?.topMasteryChampions.find((item) => item.championId === id) ?? null;
  }, [id, masterySource]);
  const masteryAccountName =
    masterySource && "gameName" in masterySource ? masterySource.gameName : null;
  useEffect(() => {
    const firstGame = timelineGames?.[0];
    if (!timelineActive || !firstGame) return;
    if (
      selectedTimelineGameId == null ||
      !timelineGames.some((game) => game.gameId === selectedTimelineGameId)
    ) {
      setSelectedTimelineGameId(firstGame.gameId);
    }
  }, [timelineActive, timelineGames, selectedTimelineGameId]);
  const games = stats?.games ?? detailStats?.games ?? 0;
  const wins = stats?.wins ?? globalDetail?.wins ?? 0;
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
        games: cumulativeGameCounts,
        labels,
        tooltips,
        last: totalGames >= 3 ? (values.at(-1) ?? null) : null,
        lastGames: totalGames >= 3 ? (cumulativeGameCounts.at(-1) ?? null) : null,
        peak: hasQualifiedSeries ? Math.max(...values) : null,
        low: hasQualifiedSeries ? Math.min(...values) : null,
        peakGames: hasQualifiedSeries
          ? (cumulativeGameCounts[values.indexOf(Math.max(...values))] ?? null)
          : null,
        lowGames: hasQualifiedSeries
          ? (cumulativeGameCounts[values.indexOf(Math.min(...values))] ?? null)
          : null,
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
      games: bucketValues.map((bucket) => bucket.games),
      labels,
      tooltips,
      last: qualifyingValues.at(-1) ?? null,
      lastGames: bucketValues.filter((bucket) => bucket.games >= 3).at(-1)?.games ?? null,
      peak: qualifyingValues.length > 0 ? Math.max(...qualifyingValues) : null,
      low: qualifyingValues.length > 0 ? Math.min(...qualifyingValues) : null,
      peakGames:
        qualifyingValues.length > 0
          ? (bucketValues.filter((bucket) => bucket.games >= 3)[
              qualifyingValues.indexOf(Math.max(...qualifyingValues))
            ]?.games ?? null)
          : null,
      lowGames:
        qualifyingValues.length > 0
          ? (bucketValues.filter((bucket) => bucket.games >= 3)[
              qualifyingValues.indexOf(Math.min(...qualifyingValues))
            ]?.games ?? null)
          : null,
    };
  }, [weeklyWinRate, wrTab]);

  const overviewInsights = useMemo<Insight[]>(() => {
    const items: Insight[] = [];
    const baseline =
      globalDetail && globalDetail.games > 0
        ? (globalDetail.wins / globalDetail.games) * 100
        : null;
    if (baseline != null && stats.games > 0) {
      const delta = wr - baseline;
      if (Math.abs(delta) >= 0.1) {
        items.push({
          kind: delta > 0 ? "good" : "warn",
          text: `Current win rate is ${Math.abs(delta).toFixed(1)} points ${delta > 0 ? "above" : "below"} the overall baseline.`,
        });
      }
    }

    const mostPlayedRole = roleStats?.slice().sort((a, b) => b.games - a.games)[0];
    if (mostPlayedRole && mostPlayedRole.games > 0) {
      items.push({
        kind: "info",
        text: `Most played role is ${mostPlayedRole.role} at ${formatPercent(mostPlayedRole.wins, mostPlayedRole.games)} win rate.`,
      });
    }

    const bestAugment = (augmentStats ?? [])
      .filter((augment) => augment.picks > 0)
      .slice()
      .sort((a, b) => b.wins / b.picks - a.wins / a.picks)[0];
    if (bestAugment && baseline != null) {
      const delta = (bestAugment.wins / bestAugment.picks) * 100 - baseline;
      if (Math.abs(delta) >= 5) {
        items.push({
          kind: delta > 0 ? "good" : "warn",
          text: `Best augment win rate is ${Math.abs(delta).toFixed(1)} points ${delta > 0 ? "above" : "below"} baseline.`,
        });
      }
    }
    return items;
  }, [augmentStats, globalDetail, roleStats, stats, wr]);

  if ((!isSummary && !championStats) || games === 0) {
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
            {isSummary
              ? "No games for the selected filters."
              : "No games with this champion for the selected filters."}
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

      <div className="rounded-[14px] border border-lol-border border-l-2 border-l-[#E5483F] bg-[radial-gradient(circle_at_top_right,rgba(229,72,63,0.18),transparent_60%),linear-gradient(to_bottom,rgba(229,72,63,0.10),transparent_40%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] px-5 py-[22px]">
        <div className="flex min-w-0 items-center gap-4">
          {isSummary ? (
            <div className="flex h-[76px] w-[76px] items-center justify-center rounded-2xl border border-lol-gold/40 bg-lol-gold/10 text-center font-display text-xs font-bold text-lol-gold">
              ALL
            </div>
          ) : (
            <ChampionIcon championId={id ?? 0} size={76} className="rounded-2xl" />
          )}
          <div className="min-w-0">
            <h1 className="font-display text-[28px] font-bold leading-tight text-lol-text-bright">
              {name}
            </h1>
            <p className="mt-1 text-lol-text">
              {isSummary
                ? "Aggregated across every champion you've played"
                : `${formatNumber(games)} games · ${formatNumber(wins)}W ${formatNumber(losses)}L`}
            </p>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          value={queue}
          onChange={setQueue}
          label="Queue"
          options={[
            { value: undefined, label: "All queues" },
            { value: 420, label: "Ranked Solo" },
            { value: 440, label: "Ranked Flex" },
            { value: 450, label: "ARAM" },
            { value: 400, label: "Normal" },
            { value: 1700, label: "Arena" },
          ]}
        />
        <PatchSelect value={patch} onChange={setPatch} />
      </div>

      {overviewActive && (
        <IntroBox legend="Badges show where a number comes from: Match-V5 = Riot match data · Timeline = minute-by-minute data · Derived = calculated by the app · LCU = game client.">
          Your results with this champion at a glance: trend, roles, favourite items and runes, and
          latest games.
        </IntroBox>
      )}

      {overviewActive && <SectionHeading title="Key metrics" />}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat
          label="Games"
          value={formatNumber(games)}
          sub={`${formatNumber(wins)}W · ${formatNumber(losses)}L`}
          sparkValues={weeklyMetrics?.map((entry) => entry.metrics.games ?? null)}
        />
        <Stat
          label="Win rate"
          value={`${wr.toFixed(1)}%`}
          sub=""
          valueClass={wr >= 50 ? "text-lol-win" : "text-lol-loss"}
          sparkValues={weeklyMetrics?.map((entry) => entry.metrics.winRate ?? null)}
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
          sparkValues={weeklyMetrics?.map((entry) => entry.metrics.kda ?? null)}
        />
        <Stat
          label="CS / min"
          value={stats.avg_cs_per_min != null ? stats.avg_cs_per_min.toFixed(1) : "—"}
          sub=""
          sparkValues={weeklyMetrics?.map((entry) => entry.metrics.csPerMin ?? null)}
        />
        <Stat
          label="Score"
          value={stats.avg_score != null ? stats.avg_score.toFixed(1) : "—"}
          sub=""
          valueClass="text-lol-gold"
          sparkValues={weeklyMetrics?.map((entry) => entry.metrics.score ?? null)}
        />
        <Stat
          label="MVP / ACE"
          value={
            isSummary && (!allStats || allStats.length === 0)
              ? "—"
              : `${formatNumber(stats.mvps)} / ${formatNumber(stats.aces)}`
          }
          sub=""
        />
        <Stat
          label="Avg damage"
          value={formatNumber(stats.avg_damage)}
          sub=""
          sparkValues={weeklyMetrics?.map((entry) => entry.metrics.avgDamage ?? null)}
        />
        <Stat
          label="Avg gold"
          value={formatNumber(stats.avg_gold)}
          sub=""
          sparkValues={weeklyMetrics?.map((entry) => entry.metrics.avgGold ?? null)}
        />
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
          sparkValues={weeklyMetrics?.map((entry) => entry.metrics.avgDamageTaken ?? null)}
        />
        <Stat
          label="Avg heal"
          value={detailStats ? formatNumber(Math.round(detailStats.avgHeal)) : "—"}
          sub=""
          sparkValues={weeklyMetrics?.map((entry) => entry.metrics.avgHeal ?? null)}
        />
        <Stat
          label="Gold / min"
          value={detailStats ? formatPlain(detailStats.goldPerMin, 1) : "—"}
          sub=""
          sparkValues={weeklyMetrics?.map((entry) => entry.metrics.goldPerMin ?? null)}
        />
        <Stat
          label="Avg game length"
          value={detailStats ? formatDuration(Math.round(detailStats.avgGameLength)) : "—"}
          sub=""
          sparkValues={weeklyMetrics?.map((entry) => entry.metrics.avgGameLength ?? null)}
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
      {overviewActive && overviewInsights.length > 0 && <InsightsPanel items={overviewInsights} />}

      <TabStrip items={TAB_ITEMS} active={activeTab} onChange={setActiveTab} />

      {activeTab === "ov" ? (
        <OverviewTab
          globalDetail={globalDetail}
          globalDetailLoading={globalDetailLoading}
          weeklyWinRate={weeklyWinRate}
          weeklyWinRateLoading={weeklyWinRateLoading}
          wrSeries={wrSeries}
          isSummary={isSummary}
          wrTab={wrTab}
          setWrTab={setWrTab}
          roleStats={roleStats}
          roleStatsLoading={roleStatsLoading}
          augments={augmentStats ?? []}
          augmentsLoading={augmentStatsLoading}
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
          baseline={statBaseline}
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
          weeklyMetrics={weeklyMetrics}
          queueStats={queueStats}
          queueStatsLoading={queueStatsLoading}
        />
      ) : activeTab === "fa" ? (
        <FarmTab
          detail={detailStats}
          baseline={statBaseline}
          detailLoading={detailLoading}
          timeline={timelineAverages?.buckets ?? null}
          timelineLoading={timelineAveragesLoading}
          queueStats={queueStats}
          queueStatsLoading={queueStatsLoading}
        />
      ) : activeTab === "ob" ? (
        <ObjectivesTab detail={detailStats} baseline={statBaseline} detailLoading={detailLoading} />
      ) : activeTab === "vi" ? (
        <VisionTab
          detail={detailStats}
          baseline={statBaseline}
          detailLoading={detailLoading}
          matchHistory={matchHistory}
          weeklyMetrics={weeklyMetrics}
        />
      ) : activeTab === "it" ? (
        <ItemsTab
          detail={globalDetail}
          detailLoading={globalDetailLoading}
          itemData={itemData}
          matchHistory={matchHistory}
          patch={patch}
        />
      ) : activeTab === "ab" ? (
        isSummary ? (
          <Panel>
            <NoData text="Abilities are champion-specific." />
          </Panel>
        ) : (
          <AbilitiesTab
            detail={detailStats}
            detailLoading={detailLoading}
            skillOrders={skillOrders}
            skillOrdersLoading={skillOrdersLoading}
          />
        )
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
          timelineAverages={timelineAverages}
          timelineAveragesLoading={timelineAveragesLoading}
          timelineAveragesError={timelineAveragesError}
          champData={champData}
          isSummary={isSummary}
          killDeathPositions={killDeathPositions}
          killDeathPositionsLoading={killDeathPositionsLoading}
        />
      ) : activeTab === "rc" ? (
        <RecordsTab records={records} recordsLoading={recordsLoading} matchHistory={matchHistory} />
      ) : matchesActive ? (
        isSummary ? (
          <Panel>
            <NoData text="Match list is champion-specific. Open a champion to see their matches." />
          </Panel>
        ) : (
          <MatchesTab
            championId={id ?? 0}
            patch={patch}
            queue={scopedQueue}
            account={account}
            championName={name}
            champData={champData}
          />
        )
      ) : activeTab === "ms" ? (
        isSummary ? (
          <Panel>
            <NoData text="Mastery is champion-specific." />
          </Panel>
        ) : (
          <MasteryTab
            mastery={mastery}
            masteryLoading={masteryLoading}
            accountName={masteryAccountName}
          />
        )
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
      : formatPlain(value, 2);
  const recordsInsights: Insight[] = [
    ...(podium[0]?.score != null
      ? [
          {
            kind: "good" as const,
            text: `Best game scored ${podium[0].score.toFixed(1)} with a ${podium[0].kills}/${podium[0].deaths}/${podium[0].assists} K/D/A.`,
          },
        ]
      : []),
    {
      kind: "info",
      text: `${formatPlain(records.records.length, 0)} personal records are in scope across the tracked categories.`,
    },
    ...(almostRecords.length > 0
      ? [
          {
            kind: "info" as const,
            text: `${formatPlain(almostRecords.length, 0)} near-miss record${almostRecords.length === 1 ? "" : "s"} are within the comparison window.`,
          },
        ]
      : []),
  ];
  return (
    <div className="flex flex-col gap-5">
      <IntroBox legend="Badges show where a number comes from: Match-V5 = Riot match data · Timeline = minute-by-minute data · Derived = calculated by the app · LCU = game client.">
        Your personal bests with this champion, plus near-misses and rare achievements.
      </IntroBox>
      <SectionHeading title="Key metrics" />
      <Panel className={TAB_PANEL_CLASSES.violet}>
        <SectionHeading title="Podium — best games" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Your highest-scoring games with this champion, ranked by performance.
        </p>
        {podium.length === 0 ? (
          <NoData text="No games to rank" />
        ) : (
          <div className="flex flex-col gap-2">
            {podium.map((match, index) => (
              <div
                key={match.game_id}
                className={`flex items-center gap-3 rounded-lg border border-lol-border/40 px-3 py-2 text-right transition-colors duration-[120ms] hover:bg-white/[0.025] last:border-b-0 ${
                  index === 0
                    ? "bg-[linear-gradient(to_right,rgba(201,164,92,0.08),transparent_40%)]"
                    : index === 1
                      ? "bg-[linear-gradient(to_right,rgba(148,163,184,0.05),transparent_40%)]"
                      : "bg-[linear-gradient(to_right,rgba(180,116,58,0.05),transparent_40%)]"
                }`}
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
      <InsightsPanel items={recordsInsights} />
      <SectionHeading title="Detailed statistics" />
      <Panel className={TAB_PANEL_CLASSES.violet}>
        <SectionHeading title="Almost records" source="d" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Personal bests you nearly matched, with the gap to each record.
        </p>
        {almostRecords.length === 0 ? (
          <NoData text="Not enough games to compare records" />
        ) : (
          <div className="flex flex-col gap-3">
            {almostRecords.map(({ record, gapPct }) => (
              <div
                key={record.key}
                className="flex flex-col gap-1.5 border-b border-l-[3px] border-b-white/[0.04] border-l-[#C9A45C] bg-[rgba(201,164,92,0.05)] px-3 py-2 transition-colors duration-[120ms] hover:bg-white/[0.025] last:border-b-0"
              >
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
      {RECORD_GROUPS.map(([group, keys], groupIndex) => {
        const groupRecords = keys
          .map((key) => byKey.get(key))
          .filter((record): record is ChampionRecordsResult["records"][number] => record != null);
        if (groupRecords.length === 0) return null;
        return (
          <Panel className={TAB_PANEL_CLASSES.violet} key={group}>
            <SectionHeading title={group} />
            <p className="mb-3 text-[11px] text-lol-text/70">
              Personal bests recorded for this champion in the {group.toLowerCase()} category.
            </p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {groupRecords.map((record) => (
                <div
                  key={record.key}
                  className="rounded-lg border border-lol-border border-t-[3px] bg-black/10 p-3 transition-colors duration-[120ms] hover:bg-white/[0.02]"
                  style={{
                    borderTopColor: CHART_PALETTE[groupIndex % CHART_PALETTE.length],
                    backgroundImage: `radial-gradient(circle at top right, ${CHART_PALETTE[groupIndex % CHART_PALETTE.length]}0f, transparent 65%)`,
                  }}
                >
                  <span className="text-xs text-lol-text">{record.label}</span>
                  <b className="mt-1 block font-display text-2xl tabular-nums text-lol-text-bright">
                    {formatRecordValue(record, record.value)}
                  </b>
                  <span className="mt-1 block text-[11px] tabular-nums text-lol-text">
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
  const scoredMatches = visibleMatches.filter((match) => match.score != null);
  const averageScore =
    scoredMatches.length > 0
      ? scoredMatches.reduce((sum, match) => sum + match.score!, 0) / scoredMatches.length
      : null;
  const matchInsights: Insight[] = [
    {
      kind: "info",
      text: `Loaded ${formatPlain(matches.length, 0)} of ${formatPlain(total, 0)} matches.`,
    },
    {
      kind: "info",
      text: `Showing ${filter === "all" ? "all" : filter} matches, sorted by ${sort === "newest" ? "newest" : "best score"}.`,
    },
    ...(averageScore != null
      ? [
          {
            kind: "info" as const,
            text: `Visible matches average ${averageScore.toFixed(1)} score across ${formatPlain(scoredMatches.length, 0)} scored games.`,
          },
        ]
      : []),
  ];

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
    <div className="flex flex-col gap-5">
      <IntroBox legend="Badges show where a number comes from: Match-V5 = Riot match data · Timeline = minute-by-minute data · Derived = calculated by the app · LCU = game client.">
        Every match with this champion; filter by result and sort by score, damage or KDA.
      </IntroBox>
      <SectionHeading title="Key metrics" />
      <Panel className={TAB_PANEL_CLASSES.steel}>
        <div className="flex flex-wrap items-center justify-between gap-3">
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
        <p className="mb-3 text-[11px] text-lol-text/70">
          Every recorded game, with filters for result and performance sorting.
        </p>
      </Panel>
      <InsightsPanel items={matchInsights} />
      <SectionHeading title="Detailed statistics" />
      <Panel className={TAB_PANEL_CLASSES.steel}>
        {loading && matches.length === 0 ? (
          <SectionLoading />
        ) : visibleMatches.length === 0 ? (
          <NoData />
        ) : (
          <div
            className="match-list-exp flex flex-col gap-2.5 [&_.m-cs]:tabular-nums [&_.m-kda]:tabular-nums [&_.m-score]:tabular-nums [&_.m-time]:tabular-nums last:[&>article]:border-b-0"
            style={{ containerType: "inline-size" }}
          >
            {visibleMatches.map((match) => (
              <MatchRowExperiment
                key={match.game_id}
                match={match}
                championName={championName}
                champData={champData}
                polishRows
              />
            ))}
          </div>
        )}
        {matches.length < total && (
          <button
            type="button"
            className="mt-5 w-full rounded-md border border-lol-border px-3 py-2 text-sm font-semibold text-lol-text-bright transition-colors duration-[120ms] hover:border-lol-crimson hover:bg-white/[0.04] disabled:opacity-50"
            onClick={loadMore}
            disabled={loading}
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        )}
      </Panel>
    </div>
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

  const masteryInsights: Insight[] = [
    {
      kind: "info",
      text: `Level ${formatPlain(mastery.level, 0)} with ${formatPlain(mastery.points, 0)} points.`,
    },
    {
      kind: "info",
      text: `${formatPlain(mastery.points, 0)} mastery points recorded for ${accountName ?? "this account"}.`,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <IntroBox legend="Badges show where a number comes from: Match-V5 = Riot match data · Timeline = minute-by-minute data · Derived = calculated by the app · LCU = game client.">
        Champion mastery progress, level thresholds, Eternals and owned skins.
      </IntroBox>
      <SectionHeading title="Key metrics" />
      <Panel className={TAB_PANEL_CLASSES.gold}>
        <SectionHeading title="Mastery" aside={accountName ?? undefined} />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Current mastery level and points earned on this champion.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Stat
            label="Level"
            value={formatPlain(mastery.level, 0)}
            sub="Current champion level"
            accent={CHART_PALETTE[1]}
            glow
            valueClass="drop-shadow-[0_0_12px_rgba(201,164,92,0.25)]"
          />
          <Stat
            label="Points"
            value={formatPlain(mastery.points, 0)}
            sub="Current champion points"
          />
        </div>
        <p className="mt-4 text-xs text-lol-text">Progress bar unavailable</p>
      </Panel>
      <InsightsPanel items={masteryInsights} />
      <SectionHeading title="Detailed statistics" />
      <Panel className={TAB_PANEL_CLASSES.gold}>
        <SectionHeading title="Milestones" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Milestone levels reached and the next champion mastery goals.
        </p>
        <div className="flex flex-col divide-y divide-white/[0.04]">
          {[5, 7, 10].map((level) => (
            <div
              key={level}
              className={`flex items-center justify-between rounded-md border border-lol-border/60 border-l-[3px] px-3 py-2 text-sm transition-colors duration-[120ms] hover:bg-white/[0.025] ${
                mastery.level >= level ? "border-l-[#C9A45C]" : "border-l-white/[0.15]"
              }`}
            >
              <span className="text-lol-text-bright">Level {level}</span>
              <span className={mastery.level >= level ? "text-lol-win" : "text-lol-text"}>
                {mastery.level >= level ? "✓ Reached" : "Not reached"}
              </span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel className={TAB_PANEL_CLASSES.gold}>
        <SectionHeading title="Level thresholds" source="l" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Points required for each mastery level and your current progress.
        </p>
        <table className="w-full text-xs">
          <thead className="border-b border-lol-border/50 text-left text-lol-text">
            <tr>
              <th className="whitespace-nowrap pb-2 font-semibold">Level</th>
              <th className="whitespace-nowrap pb-2 text-right font-semibold">Points needed</th>
              <th className="whitespace-nowrap pb-2 text-right font-semibold">Status</th>
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
                <tr
                  key={level}
                  className={`border-b border-white/[0.04] transition-colors duration-[120ms] hover:bg-white/[0.025] last:border-b-0 ${
                    mastery.level === level ? "bg-[rgba(201,164,92,0.06)]" : ""
                  }`}
                >
                  <td className="py-2 text-lol-text-bright">Level {level}</td>
                  <td className="py-2 text-right tabular-nums text-lol-text-bright">
                    {formatPlain(points, 0)}
                  </td>
                  <td
                    className={`py-2 text-right tabular-nums ${
                      reached ? "text-lol-win" : next ? "text-lol-text" : "text-lol-text"
                    }`}
                  >
                    {reached
                      ? "Reached"
                      : next
                        ? `${formatPlain(points - mastery.points, 0)} to go`
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
  isSummary,
  wrTab,
  setWrTab,
  roleStats,
  roleStatsLoading,
  augments,
  augmentsLoading,
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
    games: number[];
    lastGames: number | null;
    peak: number | null;
    low: number | null;
    peakGames: number | null;
    lowGames: number | null;
  };
  isSummary: boolean;
  wrTab: "weekly" | "monthly" | "full";
  setWrTab: (tab: "weekly" | "monthly" | "full") => void;
  roleStats: ChampionRoleStat[] | null;
  roleStatsLoading: boolean;
  augments: AugmentStats[];
  augmentsLoading: boolean;
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
  queueStats: ChampionQueueStat[] | null;
  queueStatsLoading: boolean;
  matchHistory: { matches: MatchListItem[]; total: number } | null;
  championName: string;
  champData: ReturnType<typeof useChampionData>;
}) {
  const baseline =
    globalDetail && globalDetail.games > 0 ? (globalDetail.wins / globalDetail.games) * 100 : null;
  const arenaRows = (queueStats ?? []).filter((row) =>
    (QUEUE_LABELS[row.queueId] ?? `Queue ${row.queueId}`).startsWith("Arena"),
  );
  const weightedArenaValue = (
    key: "kills" | "deaths" | "assists" | "avgScore" | "avgGameLength",
  ) => {
    const rowsWithValue = arenaRows.filter((row) => row[key] != null);
    const games = rowsWithValue.reduce((sum, row) => sum + row.games, 0);
    return games > 0
      ? rowsWithValue.reduce((sum, row) => sum + row[key]! * row.games, 0) / games
      : undefined;
  };
  const mergedQueueStats = [
    ...(queueStats ?? [])
      .filter((row) => !arenaRows.includes(row))
      .map((stat) => ({
        stat,
        label: QUEUE_LABELS[stat.queueId] ?? `Queue ${stat.queueId}`,
      })),
    ...(arenaRows.length > 0
      ? [
          {
            stat: {
              ...arenaRows[0],
              games: arenaRows.reduce((sum, row) => sum + row.games, 0),
              wins: arenaRows.reduce((sum, row) => sum + row.wins, 0),
              kills: weightedArenaValue("kills"),
              deaths: weightedArenaValue("deaths"),
              assists: weightedArenaValue("assists"),
              avgScore: weightedArenaValue("avgScore") ?? null,
              avgGameLength: weightedArenaValue("avgGameLength") ?? null,
            },
            label: "Arena",
          },
        ]
      : []),
  ].sort((a, b) => b.stat.games - a.stat.games);
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <div className="xl:col-span-2">
        <SectionHeading title="Detailed statistics" />
      </div>
      <Panel className={`xl:col-span-2 ${TAB_PANEL_CLASSES.crimson}`}>
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
              {isSummary ? (
                <>
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
                </>
              ) : (
                <>
                  <span>
                    Now:{" "}
                    <b className="text-lol-text-bright">
                      {wrSeries.last != null ? `${wrSeries.last.toFixed(1)}%` : "—"}
                    </b>{" "}
                    ({wrSeries.lastGames ?? 0} games)
                  </span>
                  <span>
                    Peak:{" "}
                    <b className="text-lol-win">
                      {wrSeries.peak != null ? `${wrSeries.peak.toFixed(1)}%` : "—"}
                    </b>{" "}
                    ({wrSeries.peakGames ?? 0}) / Low:{" "}
                    <b className="text-lol-loss">
                      {wrSeries.low != null ? `${wrSeries.low.toFixed(1)}%` : "—"}
                    </b>{" "}
                    ({wrSeries.lowGames ?? 0})
                  </span>
                </>
              )}
              {!isSummary && (
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                    wrSeries.last != null && globalDetail.games > 0
                      ? wrSeries.last - (globalDetail.wins / globalDetail.games) * 100 >= 0
                        ? "border-lol-win/40 bg-lol-win/10 text-lol-win"
                        : "border-lol-loss/40 bg-lol-loss/10 text-lol-loss"
                      : "border-lol-border/60 text-lol-text"
                  }`}
                >
                  {wrSeries.last != null && globalDetail.games > 0
                    ? `${wrSeries.last - (globalDetail.wins / globalDetail.games) * 100 >= 0 ? "+" : ""}${(wrSeries.last - (globalDetail.wins / globalDetail.games) * 100).toFixed(1)} pts`
                    : "— pts"}
                </span>
              )}
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
                xLabels={wrSeries.labels}
                tooltips={wrSeries.tooltips}
                yFormat={(value) => `${value.toFixed(0)}%`}
                yTicks={[0, 25, 50, 75, 100]}
                baseline={isSummary ? 50 : (globalDetail.wins / globalDetail.games) * 100}
                secondaryValues={isSummary ? undefined : wrSeries.games}
                hollowIndices={
                  isSummary
                    ? []
                    : wrSeries.games.flatMap((games, index) => (games < 3 ? [index] : []))
                }
              />
            )}
            <p className="mt-2 text-xs text-lol-text">
              Weeks with fewer than 3 games are shown in the chart but excluded from Now / Peak /
              Low.
            </p>
          </>
        )}
      </Panel>

      <Panel className={TAB_PANEL_CLASSES.crimson}>
        <SectionHeading title="Role split" aside="Games and win rate" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Which positions you played this champion in, with KDA and win rate per role.
        </p>
        <p className="mb-3 text-[10px] uppercase tracking-wider text-lol-text/50">
          Games · KDA · Win rate · vs baseline
        </p>
        {roleStatsLoading || !roleStats ? (
          <SectionLoading />
        ) : roleStats.length === 0 ? (
          <NoData text="No role data" />
        ) : isSummary ? (
          <div className="flex flex-col divide-y divide-white/[0.04]">
            {roleStats.map((role) => (
              <RoleRow
                key={role.role}
                role={role.role}
                games={role.games}
                wins={role.wins}
                kills={role.kills}
                deaths={role.deaths}
                assists={role.assists}
                avgScore={role.avgScore}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-white/[0.04]">
            {roleStats
              .slice()
              .sort((a, b) => Number(a.role === "UNKNOWN") - Number(b.role === "UNKNOWN"))
              .map((role) => (
                <RoleRow
                  key={role.role}
                  role={role.role}
                  games={role.games}
                  wins={role.wins}
                  kills={role.kills}
                  deaths={role.deaths}
                  assists={role.assists}
                  avgScore={role.avgScore}
                  baseline={
                    globalDetail && globalDetail.games > 0
                      ? (globalDetail.wins / globalDetail.games) * 100
                      : null
                  }
                  detailed
                />
              ))}
          </div>
        )}
        {roleStats && roleStats.length > 0 && (
          <p className="mt-2 text-[11px] text-lol-text/60">
            — = not tracked in the current data scope
          </p>
        )}
      </Panel>

      <RatePanel
        title="Top augments"
        className={TAB_PANEL_CLASSES.crimson}
        hint="Augments you pick most often, with average KDA and pick rate per augment."
        sort={augmentSort}
        options={[
          ["count", "Most picked"],
          ["winRate", "Best win rate"],
        ]}
        onSortChange={setAugmentSort}
        loading={globalDetailLoading || augmentsLoading}
        empty={augments.length === 0}
        legend="Picks · KDA · Pick % · Win rate · vs baseline"
        placeholderNote
        unifiedRows
      >
        {sortRates(augments, augmentSort).map((augment, index) => (
          <RateRow
            key={augment.augment_id}
            icon={<AugmentIcon augmentId={augment.augment_id} size={24} />}
            iconAccent={
              AUGMENT_ACCENTS[augmentData[augment.augment_id]?.rarity ?? ""] ??
              CHART_PALETTE[index % CHART_PALETTE.length]
            }
            iconSize={24}
            name={getAugmentName(augmentData, augment.augment_id)}
            wins={augment.wins}
            total={augment.picks}
            count={`${augment.picks}x`}
            baseline={isSummary ? undefined : baseline}
            sampleSize={augment.picks}
            secondary={
              !isSummary
                ? `KDA ${formatOptionalKda(augment.kills, augment.deaths, augment.assists)} · score ${formatSmallMetric(augment.avgScore)} · ${globalDetail?.games ? ((augment.picks / globalDetail.games) * 100).toFixed(1) : "—"}% pick`
                : undefined
            }
          />
        ))}
      </RatePanel>

      <div
        className={isSummary ? "contents" : "grid grid-cols-1 gap-5 xl:col-span-2 xl:grid-cols-2"}
      >
        <RatePanel
          title="Top items"
          className={TAB_PANEL_CLASSES.crimson}
          hint="Items you build most often, with the most common build position."
          sort={itemSort}
          options={[
            ["count", "Most built"],
            ["winRate", "Best win rate"],
          ]}
          onSortChange={setItemSort}
          loading={globalDetailLoading}
          empty={items.length === 0}
          legend="Builds · Avg buy · Win rate · vs baseline"
          placeholderNote
          unifiedRows
        >
          {sortRates(items, itemSort).map((item, index) => (
            <RateRow
              key={item.item_id}
              icon={<ItemIcon itemId={item.item_id} size={28} patch={patch} />}
              iconAccent={CHART_PALETTE[index % CHART_PALETTE.length]}
              iconSize={28}
              name={getItemName(itemData, item.item_id)}
              wins={item.wins}
              total={item.picks}
              count={`${item.picks}x`}
              baseline={isSummary ? undefined : baseline}
              sampleSize={item.picks}
              secondary={
                !isSummary && item.avgBuyTime != null
                  ? `avg buy ${formatBuyTime(item.avgBuyTime)}`
                  : undefined
              }
            />
          ))}
        </RatePanel>

        <RatePanel
          title="Keystones"
          className={TAB_PANEL_CLASSES.crimson}
          hint="Keystone runes you play, with average KDA and win rate."
          sort={keystoneSort}
          options={[
            ["count", "Most played"],
            ["winRate", "Best win rate"],
          ]}
          onSortChange={setKeystoneSort}
          loading={keystonesLoading}
          empty={!keystones || keystones.length === 0}
          legend="Picks · KDA · Win rate · vs baseline"
          placeholderNote
          unifiedRows
        >
          {sortRates(keystones ?? [], keystoneSort).map((keystone, index) => (
            <RateRow
              key={keystone.runeId}
              icon={
                <RuneIcon
                  runeId={keystone.runeId}
                  path={runeData[keystone.runeId]?.icon}
                  size={24}
                />
              }
              iconAccent={
                runeData[keystone.runeId]?.name === "First Strike"
                  ? "#C9A45C"
                  : CHART_PALETTE[index % CHART_PALETTE.length]
              }
              iconSize={24}
              name={runeData[keystone.runeId]?.name ?? `Rune ${keystone.runeId}`}
              wins={keystone.wins}
              total={keystone.picks}
              count={`${keystone.picks}x`}
              baseline={isSummary ? undefined : baseline}
              sampleSize={keystone.picks}
              secondary={
                !isSummary
                  ? `KDA ${formatOptionalKda(keystone.kills, keystone.deaths, keystone.assists)} · score ${formatSmallMetric(keystone.avgScore)}`
                  : undefined
              }
            />
          ))}
        </RatePanel>
      </div>

      <Panel className={TAB_PANEL_CLASSES.crimson}>
        <SectionHeading title="Games by queue" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Games and win rate in each queue, with average KDA per queue.
        </p>
        <p className="mb-3 text-[10px] uppercase tracking-wider text-lol-text/50">
          Games · KDA · Score · Win rate
        </p>
        {queueStatsLoading || !queueStats ? (
          <SectionLoading />
        ) : queueStats.length === 0 ? (
          <NoData />
        ) : (
          <div className="flex flex-col divide-y divide-white/[0.04]">
            {mergedQueueStats.map(({ stat: queueStat, label }) => (
              <div
                key={queueStat.queueId}
                className="grid grid-cols-[28px_minmax(180px,1fr)_180px_100px_72px] items-center gap-2 rounded-lg px-3 py-2.5 text-[12px] transition-colors duration-[120ms] hover:bg-white/[0.025]"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-lol-card text-[9px] font-bold text-lol-text-bright">
                  {label.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 truncate text-lol-text-bright">{label}</span>
                <div className="flex w-[180px] flex-col items-end text-right tabular-nums text-lol-text">
                  <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                    <span>{queueStat.games}</span>
                    <span
                      className="text-sm"
                      title={
                        queueStat.games < 3 ||
                        queueStat.kills == null ||
                        queueStat.deaths == null ||
                        queueStat.assists == null
                          ? "Not tracked yet"
                          : undefined
                      }
                    >
                      {formatRowKda(queueStat)}
                    </span>
                  </div>
                  <span
                    className="text-[11px] text-lol-text"
                    title={queueStat.avgScore == null ? "Not tracked yet" : undefined}
                  >
                    score {formatSmallMetric(queueStat.avgScore)}
                  </span>
                </div>
                <div className="flex h-2.5 w-[100px] min-w-0 overflow-hidden rounded-full bg-lol-loss/20">
                  <span
                    className="rounded-l-[1px] bg-[linear-gradient(to_right,#22C55E,#10B981)]"
                    style={{
                      width: `${queueStat.games > 0 ? (queueStat.wins / queueStat.games) * 100 : 0}%`,
                    }}
                  />
                  <span
                    className="rounded-r-[1px] bg-[linear-gradient(to_right,#E5483F,#B91C1C)]"
                    style={{
                      width: `${queueStat.games > 0 ? ((queueStat.games - queueStat.wins) / queueStat.games) * 100 : 0}%`,
                    }}
                  />
                </div>
                <div className="flex w-[72px] flex-col items-end justify-center gap-0.5">
                  <span
                    className={`text-right text-sm font-semibold tabular-nums ${
                      queueStat.games > 0 && queueStat.wins / queueStat.games >= 0.5
                        ? "text-lol-win"
                        : "text-lol-loss"
                    }`}
                    title={queueStat.games === 0 ? "Not tracked yet" : undefined}
                  >
                    {queueStat.games > 0
                      ? `${((queueStat.wins / queueStat.games) * 100).toFixed(1)}%`
                      : "—"}
                  </span>
                  <span
                    className="text-right text-xs font-semibold text-lol-text"
                    title="Not tracked yet"
                  >
                    —
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        {queueStats && queueStats.length > 0 && (
          <p className="mt-2 text-[11px] text-lol-text/60">
            — = not tracked in the current data scope
          </p>
        )}
      </Panel>

      <Panel className={`xl:col-span-2 ${TAB_PANEL_CLASSES.crimson}`}>
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
  baseline,
  detailLoading,
  matchHistory,
  weeklyMetrics,
}: {
  detail: ChampionDetailStats | null;
  baseline: ChampionStatBaseline | null;
  detailLoading: boolean;
  matchHistory: { matches: MatchListItem[]; total: number } | null;
  weeklyMetrics: ChampionWeeklyMetrics[] | null;
}) {
  const champData = useChampionData();
  if (detailLoading) return <SectionLoading />;
  if (!detail || detail.games === 0) return <NoData text="No vision data" />;
  const vsOther = (value: number | null | undefined, key: string) =>
    value == null || baseline?.[key] == null ? null : value - baseline[key]!;

  const minutes = detail.avgGameLength > 0 ? detail.avgGameLength / 60 : 0;
  const perMinute = (value: number) => (minutes > 0 ? value / minutes : null);
  const wardKillRatio =
    detail.avgWardsPlaced > 0
      ? `${((detail.avgWardsKilled / detail.avgWardsPlaced) * 100).toFixed(1)}%`
      : "—";
  const wardShareTotal = detail.avgVisionWardsBought + detail.avgSightWardsBought;
  const controlWardShare =
    wardShareTotal > 0
      ? `${((detail.avgVisionWardsBought / wardShareTotal) * 100).toFixed(1)}%`
      : "—";
  const controlWardShareValue =
    wardShareTotal > 0 ? (detail.avgVisionWardsBought / wardShareTotal) * 100 : null;
  const weeklyVisionScoreKey = [
    ...new Set(weeklyMetrics?.flatMap((entry) => Object.keys(entry.metrics)) ?? []),
  ].find((key) => /vision.*score/i.test(key));
  const weeklyVisionScoreSeries = weeklyVisionScoreKey
    ? weeklyMetrics?.map((entry) => entry.metrics[weeklyVisionScoreKey] ?? null)
    : undefined;
  const visionRows: CombatStatTableRow[] = [];
  if (Number.isFinite(detail.avgVisionScore)) {
    visionRows.push([
      "Vision score",
      detail.avgVisionScore,
      detail.maxVisionScore,
      detail.totalVisionScore,
      formatCombatNumber,
      detail.avgVisionScoreInWins,
      detail.avgVisionScoreInLosses,
      vsOther(detail.avgVisionScore, "avgVisionScoreOther"),
    ]);
  }
  if (Number.isFinite(detail.avgWardsPlaced)) {
    visionRows.push([
      "Wards placed",
      detail.avgWardsPlaced,
      detail.maxWardsPlaced,
      detail.totalWardsPlaced,
      formatCombatNumber,
      detail.avgWardsPlacedInWins,
      detail.avgWardsPlacedInLosses,
      vsOther(detail.avgWardsPlaced, "avgWardsPlacedOther"),
    ]);
  }
  if (Number.isFinite(detail.avgWardsKilled)) {
    visionRows.push([
      "Wards killed",
      detail.avgWardsKilled,
      detail.maxWardsKilled,
      detail.totalWardsKilled,
      formatCombatNumber,
      detail.avgWardsKilledInWins,
      detail.avgWardsKilledInLosses,
      vsOther(detail.avgWardsKilled, "avgWardsKilledOther"),
    ]);
  }
  if (Number.isFinite(detail.avgVisionWardsBought)) {
    visionRows.push([
      "Control wards bought",
      detail.avgVisionWardsBought,
      detail.maxVisionWardsBought,
      detail.totalVisionWardsBought,
      formatCombatNumber,
      detail.avgVisionWardsBoughtInWins,
      detail.avgVisionWardsBoughtInLosses,
      vsOther(detail.avgVisionWardsBought, "avgVisionWardsBoughtOther"),
    ]);
  }
  if (Number.isFinite(detail.avgSightWardsBought)) {
    visionRows.push([
      "Sight wards bought",
      detail.avgSightWardsBought,
      detail.maxSightWardsBought,
      detail.totalSightWardsBought,
      formatCombatNumber,
      detail.avgSightWardsBoughtInWins,
      detail.avgSightWardsBoughtInLosses,
      vsOther(detail.avgSightWardsBought, "avgSightWardsBoughtOther"),
    ]);
  }
  const recentMatches = (matchHistory?.matches ?? [])
    .filter((match) => match.vision_score != null)
    .slice()
    .sort((a, b) => b.game_creation - a.game_creation)
    .slice(0, 8);

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <div className="xl:col-span-2">
        <IntroBox legend="Badges show where a number comes from: Match-V5 = Riot match data · Timeline = minute-by-minute data · Derived = calculated by the app · LCU = game client.">
          Wards, vision score and pings: how you scout, deny vision and communicate.
        </IntroBox>
      </div>
      <div className="xl:col-span-2">
        <SectionHeading title="Key metrics" />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Stat
            label="Vision score"
            value={formatCombatNumber(detail.avgVisionScore)}
            sub={`best ${formatCombatNumber(detail.maxVisionScore)}`}
            accent={CHART_PALETTE[0]}
            sparkValues={weeklyVisionScoreSeries}
          />
          <Stat
            label="Wards placed"
            value={formatCombatNumber(detail.avgWardsPlaced)}
            sub={`best ${formatCombatNumber(detail.maxWardsPlaced)}`}
            accent={CHART_PALETTE[1]}
            miniViz={
              detail.maxWardsPlaced > 0 ? (
                <span
                  aria-hidden="true"
                  className="mt-1 block h-2 w-[72px] overflow-hidden rounded-full bg-lol-border/60"
                >
                  <span
                    className="block h-full rounded-full bg-lol-win"
                    style={{
                      width: `${Math.min(100, (detail.avgWardsPlaced / detail.maxWardsPlaced) * 100)}%`,
                    }}
                  />
                </span>
              ) : undefined
            }
          />
          <Stat
            label="Wards killed"
            value={formatCombatNumber(detail.avgWardsKilled)}
            sub={`best ${formatCombatNumber(detail.maxWardsKilled)}`}
            accent={CHART_PALETTE[2]}
            miniViz={
              detail.maxWardsKilled > 0 ? (
                <span
                  aria-hidden="true"
                  className="mt-1 block h-2 w-[72px] overflow-hidden rounded-full bg-lol-border/60"
                >
                  <span
                    className="block h-full rounded-full bg-lol-gold"
                    style={{
                      width: `${Math.min(100, (detail.avgWardsKilled / detail.maxWardsKilled) * 100)}%`,
                    }}
                  />
                </span>
              ) : undefined
            }
          />
          <Stat
            label="Control ward share"
            value={controlWardShareValue == null ? "—" : `${controlWardShareValue.toFixed(1)}%`}
            sub="of purchased wards"
            accent={CHART_PALETTE[3]}
            miniViz={
              controlWardShareValue == null ? undefined : (
                <svg aria-hidden="true" className="h-11 w-11 -rotate-90" viewBox="0 0 44 44">
                  <circle
                    cx="22"
                    cy="22"
                    r="17"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="text-lol-border/60"
                  />
                  <circle
                    cx="22"
                    cy="22"
                    r="17"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${Math.max(0, Math.min(100, controlWardShareValue)).toFixed(1)} 100`}
                    pathLength="100"
                    className="text-lol-gold"
                  />
                </svg>
              )
            }
          />
        </div>
      </div>
      <div className="xl:col-span-2">
        <InsightsPanel
          insights={[
            {
              kind: detail.avgVisionScore >= 1 ? "good" : "info",
              text: `${detail.avgVisionScore.toFixed(1)} average vision score over ${formatPlain(detail.games, 0)} games.`,
            },
          ]}
        />
      </div>
      <div className="xl:col-span-2">
        <SectionHeading title="Detailed statistics" />
      </div>
      <Panel className={`${TAB_PANEL_CLASSES.violet} `}>
        <SectionHeading title="Vision score" source="m" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Vision score, wards placed, wards cleared, and purchased ward totals.
        </p>
        <CombatStatTable rows={visionRows} deltaIndicators />
      </Panel>

      <Panel className={TAB_PANEL_CLASSES.violet}>
        <SectionHeading title="Per minute" source="d" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Vision activity normalized by the average length of your games.
        </p>
        <CombatStatTable
          rows={[
            ["Vision score / min", perMinute(detail.avgVisionScore), null, null],
            ["Wards placed / min", perMinute(detail.avgWardsPlaced), null, null],
            ["Wards killed / min", perMinute(detail.avgWardsKilled), null, null],
          ]}
        />
      </Panel>

      <Panel className={TAB_PANEL_CLASSES.violet}>
        <SectionHeading title="Ratio" source="d" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Ward clearing efficiency and the share of control wards purchased.
        </p>
        <CombatStatTable
          rows={[
            [
              "Ward kill ratio",
              wardKillRatio === "—" ? null : Number.parseFloat(wardKillRatio),
              null,
              null,
              (value) => (value == null ? "—" : `${value.toFixed(1)}%`),
            ],
            [
              "Control ward share",
              controlWardShare === "—" ? null : Number.parseFloat(controlWardShare),
              null,
              null,
              (value) => (value == null ? "—" : `${value.toFixed(1)}%`),
            ],
          ]}
        />
      </Panel>

      <Panel className={`${TAB_PANEL_CLASSES.violet} `}>
        <SectionHeading title="Recent games" source="m" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Recent matches showing your vision score and ward activity.
        </p>
        {recentMatches.length === 0 ? (
          <NoData />
        ) : (
          <div className="flex flex-col gap-2 text-xs">
            <div className="grid grid-cols-[minmax(8rem,1fr)_auto_auto_auto_auto] gap-3 border-b border-lol-border/50 pb-2 font-semibold text-lol-text">
              <span>Champion</span>
              <span className="text-right">Vision</span>
              <span className="text-right">Placed</span>
              <span className="text-right">Killed</span>
              <span className="text-right">Duration</span>
            </div>
            {recentMatches.map((match) => (
              <div
                key={match.game_id}
                className={`grid grid-cols-[minmax(8rem,1fr)_auto_auto_auto_auto] items-center gap-3 border-b border-white/[0.04] border-l-2 py-2 text-lol-text-bright transition-colors duration-[120ms] hover:bg-white/[0.025] hover:border-l-[3px] last:border-b-0 ${
                  match.win ? "border-l-lol-win" : "border-l-lol-loss"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ChampionIcon championId={match.champion_id} size={24} className="rounded-md" />
                  <span className="truncate">{getChampionName(champData, match.champion_id)}</span>
                </span>
                <span className="text-right tabular-nums">
                  {formatCombatNumber(match.vision_score)}
                </span>
                <span className="text-right tabular-nums">
                  {formatCombatNumber(match.wards_placed)}
                </span>
                <span className="text-right tabular-nums">
                  {formatCombatNumber(match.wards_killed)}
                </span>
                <span className="text-right tabular-nums">
                  {formatSeconds(match.game_duration)}
                </span>
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
      <div className="xl:col-span-2">
        <IntroBox legend="Badges show where a number comes from: Match-V5 = Riot match data · Timeline = minute-by-minute data · Derived = calculated by the app · LCU = game client.">
          What you build, when you finish each item, and which builds win.
        </IntroBox>
      </div>
      <div className="xl:col-span-2">
        <SectionHeading title="Key metrics" />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
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
      </div>
      <div className="xl:col-span-2">
        <InsightsPanel
          insights={[
            {
              kind: items.length > 0 ? "good" : "info",
              text: `${formatPlain(items.length, 0)} item aggregates available for this champion.`,
            },
          ]}
        />
      </div>
      <div className="xl:col-span-2">
        <SectionHeading title="Detailed statistics" />
      </div>
      <RatePanel
        title="Top items"
        className={TAB_PANEL_CLASSES.violet}
        source="m"
        hint="Items you build most often, with pick counts and win rates."
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

      <Panel className={TAB_PANEL_CLASSES.gold}>
        <SectionHeading title="Item categories" source="m" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Item category metadata is not available in the stored aggregates.
        </p>
        <NoData text="Item category metadata is not stored in match aggregates." />
      </Panel>

      <Panel className={TAB_PANEL_CLASSES.gold}>
        <SectionHeading title="Item pairs" source="d" aside="Recent games" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Item combinations that appear most often in recent completed builds.
        </p>
        {topItemPairs.length === 0 ? (
          <NoData text="Not enough recent builds" />
        ) : (
          <div className="flex flex-col gap-2 text-xs">
            {topItemPairs.map(([key, count]) => {
              const [first, second] = key.split(":").map(Number);
              return (
                <div
                  key={key}
                  className="flex items-center gap-2 border-b border-white/[0.04] py-2 transition-colors duration-[120ms] hover:bg-white/[0.025] last:border-b-0"
                >
                  <ItemIcon itemId={first} size={26} patch={patch} />
                  <ItemIcon itemId={second} size={26} patch={patch} />
                  <span className="min-w-0 flex-1 truncate text-lol-text-bright">
                    {getItemName(itemData, first)} + {getItemName(itemData, second)}
                  </span>
                  <span className="text-right tabular-nums text-lol-text">{count}x</span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel className={`${TAB_PANEL_CLASSES.gold} `}>
        <SectionHeading title="Build variants" source="d" aside="Recent games" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Complete item builds and their results across recent matches.
        </p>
        {topBuildVariants.length === 0 ? (
          <NoData text="Not enough recent builds" />
        ) : (
          <div className="flex flex-col gap-2">
            {topBuildVariants.map((variant) => (
              <div
                key={variant.items.join(",")}
                className="flex flex-wrap items-center gap-2 rounded-lg border-b border-white/[0.04] border-lol-border/50 bg-black/10 px-3 py-2 transition-colors duration-[120ms] hover:bg-white/[0.025] last:border-b-0"
              >
                <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                  {variant.items.map((itemId) => (
                    <ItemIcon key={itemId} itemId={itemId} size={28} patch={patch} />
                  ))}
                </div>
                <span className="text-right text-xs tabular-nums text-lol-text">
                  {variant.games} games · {formatPercent(variant.wins, variant.games)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel className={`${TAB_PANEL_CLASSES.gold} `}>
        <SectionHeading title="Build slots" source="m" aside="Last 20 games" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Most common items in each inventory slot over recent games.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
          {slotItems.map((slot, index) => (
            <div
              key={index}
              className="min-w-0 rounded-lg border-b border-white/[0.04] border-lol-border/50 bg-black/10 p-2.5 transition-colors duration-[120ms] hover:bg-white/[0.025] last:border-b-0"
            >
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-lol-text">
                {index === 6 ? "Trinket" : `Slot ${index + 1}`}
              </div>
              {slot.length === 0 ? (
                <span className="text-xs text-lol-text">—</span>
              ) : (
                <div className="flex flex-col gap-2">
                  {slot.map(([itemId, count]) => (
                    <div
                      key={itemId}
                      className="flex items-center justify-between gap-2 border-b border-white/[0.04] py-1 transition-colors duration-[120ms] hover:bg-white/[0.025] last:border-b-0"
                    >
                      <ItemIcon itemId={itemId} size={28} patch={patch} />
                      <span className="text-right text-xs tabular-nums text-lol-text-bright">
                        {count}x
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Panel>

      <Panel className={`${TAB_PANEL_CLASSES.gold} `}>
        <SectionHeading title="Recent builds" source="m" aside="Last 10 games" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Items purchased in your ten most recent games on this champion.
        </p>
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
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-b-white/[0.04] border-lol-border/50 border-l-[#3B82F6] border-l-[3px] bg-black/10 px-3 py-2 transition-colors duration-[120ms] hover:bg-white/[0.025] last:border-b-0"
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
                  <span className="text-right text-xs tabular-nums text-lol-text">
                    {formatSeconds(match.game_duration)}
                  </span>
                  <span className="w-20 text-right text-xs tabular-nums text-lol-text">
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
  championId: number | null;
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
      <div className="xl:col-span-2">
        <IntroBox legend="Badges show where a number comes from: Match-V5 = Riot match data · Timeline = minute-by-minute data · Derived = calculated by the app · LCU = game client.">
          Your rune pages, trees and keystones, and how each one performs.
        </IntroBox>
      </div>
      <div className="xl:col-span-2">
        <SectionHeading title="Key metrics" />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <CombatTile label="Keystone picks" value={totalPicks} subtitle="aggregate selections" />
          <CombatTile
            label="Keystone win rate"
            value={totalPicks > 0 ? (totalWins / totalPicks) * 100 : null}
            subtitle="all tracked pages"
          />
          <CombatTile label="Primary trees" value={primaryTreeCount} subtitle="seen in data" />
          <CombatTile label="Secondary trees" value={secondaryTreeCount} subtitle="seen in data" />
        </div>
      </div>
      <div className="xl:col-span-2">
        <InsightsPanel
          insights={[
            {
              kind: totalPicks > 0 ? "good" : "info",
              text: `${formatPlain(totalPicks, 0)} keystone selections with ${formatPercent(totalWins, totalPicks)} win rate.`,
            },
          ]}
        />
      </div>
      <div className="xl:col-span-2">
        <SectionHeading title="Detailed statistics" />
      </div>
      <RatePanel
        title="Keystones"
        className={TAB_PANEL_CLASSES.violet}
        source="m"
        hint="Keystone runes you play most often, with pick counts and win rates."
        sort={keystoneSort}
        options={[
          ["count", "Most played"],
          ["winRate", "Best win rate"],
        ]}
        onSortChange={setKeystoneSort}
        loading={detailLoading}
        empty={keystones.length === 0}
        unifiedRows
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

      <Panel className={`${TAB_PANEL_CLASSES.violet} `}>
        <SectionHeading title="Rune pages" source="m" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Full rune pages, selection counts, and win rates from your games.
        </p>
        {detail.pages.length === 0 ? (
          <NoData />
        ) : (
          <div className="flex flex-col gap-3">
            {detail.pages.map((page) => (
              <div
                key={page.runes}
                className="grid grid-cols-[minmax(0,auto)_auto_minmax(6rem,1fr)] items-center gap-3 rounded-lg border-b border-b-white/[0.04] border-lol-border/50 bg-black/10 px-3 py-2 transition-colors duration-[120ms] hover:bg-white/[0.03]"
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
    <Panel className={TAB_PANEL_CLASSES.violet}>
      <SectionHeading title={title} source={source} />
      <p className="mb-3 text-[11px] text-lol-text/70">
        Rune tree selections, pick counts, and win rates across matches.
      </p>
      {trees.length === 0 ? (
        <NoData />
      ) : (
        <div className="flex flex-col gap-2.5">
          {trees.map((tree) => {
            const treeName = runeData[tree.styleId]?.name ?? `Tree ${tree.styleId}`;
            const accent = RUNE_TREE_ACCENTS[treeName] ?? "#94A3B8";
            return (
              <div
                key={tree.styleId}
                className="flex items-center gap-2 border-b border-white/[0.04] border-l-[3px] py-2 pl-2 transition-colors duration-[120ms] hover:bg-white/[0.025] last:border-b-0"
                style={{ borderLeftColor: accent }}
              >
                <RuneIcon runeId={tree.styleId} path={runeData[tree.styleId]?.icon} size={22} />
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-lol-text-bright">
                  {treeName}
                </span>
                <span className="shrink-0 text-right text-[11px] tabular-nums text-lol-text">
                  {tree.picks}x
                </span>
                <div className="w-20 shrink-0">
                  <WinRateBar wins={tree.wins} total={tree.picks} showPercent={false} />
                </div>
              </div>
            );
          })}
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
    { label: "A", color: "#94A3B8", min: 0.6 },
    { label: "B", color: "#3B82F6", min: 0.5 },
    { label: "C", color: "#A855F7", min: 0.4 },
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
  const matchupInsights: Insight[] = [];
  if (bestMatchup) {
    matchupInsights.push({
      kind: "good",
      text: `Best matchup: ${getChampionName(champData, bestMatchup.championId)} at ${formatPercent(bestMatchup.wins, bestMatchup.games)}.`,
    });
  }
  if (worstMatchup) {
    matchupInsights.push({
      kind: "warn",
      text: `Hardest matchup: ${getChampionName(champData, worstMatchup.championId)} at ${formatPercent(worstMatchup.wins, worstMatchup.games)}.`,
    });
  }
  if (qualifiedMatchups.length > 0) {
    matchupInsights.push({
      kind: "info",
      text: `Faced ${qualifiedMatchups.length} opponents across ${qualifiedMatchups.reduce((total, row) => total + row.games, 0)} matchup games.`,
    });
  }
  const classStats = new Map<string, { games: number; wins: number }>();
  for (const row of qualifiedMatchups) {
    const enemyClass = champData[row.championId]?.class?.trim() || "Other";
    const current = classStats.get(enemyClass) ?? { games: 0, wins: 0 };
    current.games += row.games;
    current.wins += row.wins;
    classStats.set(enemyClass, current);
  }
  const classRows = [...classStats.entries()].sort((a, b) => b[1].games - a[1].games).slice(0, 6);
  const mostFaced = qualifiedMatchups
    .slice()
    .sort((a, b) => b.games - a.games || b.wins - a.wins)[0];
  const totalMatchupGames = qualifiedMatchups.reduce((total, row) => total + row.games, 0);
  const untracked = (
    <span className="text-lol-text/40" title="Not tracked yet">
      —
    </span>
  );

  return [
    <div className="xl:col-span-2" key="matchup-intro">
      <IntroBox legend="Badges show where a number comes from: Match-V5 = Riot match data · Timeline = minute-by-minute data · Derived = calculated by the app · LCU = game client.">
        How you do against every opponent, by lane, with your best and worst matchups highlighted.
      </IntroBox>
    </div>,
    <div className="xl:col-span-2" key="matchup-key-metrics">
      <SectionHeading title="Key metrics" />
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Best matchup"
          value={bestMatchup ? getChampionName(champData, bestMatchup.championId) : "—"}
          sub={
            bestMatchup ? formatPercent(bestMatchup.wins, bestMatchup.games) : "No matchup marker"
          }
          accent="#22C55E"
          large
          miniViz={
            bestMatchup ? (
              <span
                aria-hidden="true"
                className="mt-1 block h-2 w-[72px] overflow-hidden rounded-full bg-lol-border/60"
              >
                <span
                  className="block h-full rounded-full bg-lol-win"
                  style={{
                    width: `${Math.min(100, (bestMatchup.wins / bestMatchup.games) * 100)}%`,
                  }}
                />
              </span>
            ) : undefined
          }
        />
        <Stat
          label="Worst matchup"
          value={worstMatchup ? getChampionName(champData, worstMatchup.championId) : "—"}
          sub={
            worstMatchup
              ? formatPercent(worstMatchup.wins, worstMatchup.games)
              : "No matchup marker"
          }
          accent="#E5483F"
          large
          miniViz={
            worstMatchup ? (
              <span
                aria-hidden="true"
                className="mt-1 block h-2 w-[72px] overflow-hidden rounded-full bg-lol-border/60"
              >
                <span
                  className="block h-full rounded-full bg-lol-loss"
                  style={{
                    width: `${Math.min(100, (worstMatchup.wins / worstMatchup.games) * 100)}%`,
                  }}
                />
              </span>
            ) : undefined
          }
        />
        <Stat
          label="Most faced"
          value={mostFaced ? getChampionName(champData, mostFaced.championId) : "—"}
          sub={mostFaced ? `${mostFaced.games} games` : "No matchup data"}
          accent="#C9A45C"
          large
          miniViz={
            mostFaced && totalMatchupGames > 0 ? (
              <span
                aria-hidden="true"
                className="mt-1 block h-2 w-[72px] overflow-hidden rounded-full bg-lol-border/60"
              >
                <span
                  className="block h-full rounded-full bg-lol-gold"
                  style={{
                    width: `${Math.min(100, (mostFaced.games / totalMatchupGames) * 100)}%`,
                  }}
                />
              </span>
            ) : undefined
          }
        />
        <Stat
          label="Opponents"
          value={formatPlain(qualifiedMatchups.length, 0)}
          sub="Qualified opponents"
          accent="#3B82F6"
          large
          miniViz={
            qualifiedMatchups.length > 0 ? (
              <svg aria-hidden="true" className="h-11 w-11 -rotate-90" viewBox="0 0 44 44">
                <circle
                  cx="22"
                  cy="22"
                  r="17"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  className="text-lol-border/60"
                />
                <circle
                  cx="22"
                  cy="22"
                  r="17"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeDasharray="106.8"
                  strokeDashoffset="0"
                  className="text-[#3B82F6]"
                />
              </svg>
            ) : undefined
          }
        />
      </div>
    </div>,
    <Panel className={`xl:col-span-2 ${TAB_PANEL_CLASSES.crimson}`} key="matchup-tier-list">
      <SectionHeading title="Matchup tier list" source="d" />
      <p className="mb-3 text-[11px] text-lol-text/70">
        Opponents grouped into tiers by your observed win rate.
      </p>
      {tierRows.length === 0 ? (
        <NoData text="Not enough games for a tier list" />
      ) : (
        <div className="flex flex-col">
          {tierRows.map((tier) => (
            <div
              key={tier.label}
              className="flex items-center gap-3 border-b border-white/[0.04] border-l-[3px] px-2 py-2 transition-colors duration-[120ms] hover:bg-white/[0.025] last:border-b-0"
              style={{ borderLeftColor: tier.color }}
            >
              <span
                className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md font-display text-sm font-bold"
                style={{ backgroundColor: tier.color, color: "#150c33" }}
              >
                {tier.label}
              </span>
              <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                {tier.entries.map((row) => {
                  const winRate = row.wins / row.games;
                  const name = getChampionName(champData, row.championId);
                  return (
                    <span
                      key={row.championId}
                      title={`${name} · ${row.games} games · ${(winRate * 100).toFixed(0)}% WR`}
                      className="rounded-md border border-transparent transition-shadow duration-[120ms]"
                      style={{
                        borderColor: `${tier.color}66`,
                        boxShadow: `0 0 8px ${tier.color}33`,
                      }}
                    >
                      <ChampionIcon championId={row.championId} size={28} className="rounded-md" />
                    </span>
                  );
                })}
              </div>
              <span className="ml-auto shrink-0 text-right tabular-nums text-xs text-lol-text/70">
                {tier.entries.length}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>,
    ...(matchupInsights.length > 0
      ? [<InsightsPanel key="matchup-insights" insights={matchupInsights} />]
      : []),
    <div className="xl:col-span-2" key="matchup-detailed-statistics">
      <SectionHeading title="Detailed statistics" />
    </div>,
    <Panel className={`xl:col-span-2 ${TAB_PANEL_CLASSES.crimson}`} key="matchups">
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
      <p className="mb-3 text-[11px] text-lol-text/70">
        Results against each opponent, with lane performance and sorting controls.
      </p>
      {matchupsLoading ? (
        <SectionLoading />
      ) : sortedMatchups.length === 0 ? (
        <NoData />
      ) : (
        <div className="flex flex-col overflow-x-auto text-xs">
          <div className="grid min-w-[900px] grid-cols-[minmax(10rem,1fr)_auto_auto_minmax(7rem,auto)_minmax(8rem,auto)_auto_auto] gap-3 border-b border-lol-border/50 pb-2 font-semibold text-lol-text">
            <span>Opponent</span>
            <span className="text-right">Games</span>
            <span className="text-right">W / L</span>
            <span className="text-right">Win rate</span>
            <span className="text-right">KDA</span>
            <span className="text-right">CS diff @15</span>
            <span className="text-right">Gold diff @15</span>
          </div>
          {sortedMatchups.map((row) => {
            const kda = (row.kills + row.assists) / Math.max(1, row.deaths);
            const winLossDelta = row.wins - (row.games - row.wins);
            return (
              <div
                key={row.championId}
                className="grid min-w-[900px] grid-cols-[minmax(10rem,1fr)_auto_auto_minmax(7rem,auto)_minmax(8rem,auto)_auto_auto] items-center gap-3 border-b border-white/[0.04] py-2 text-lol-text-bright transition-colors duration-[120ms] hover:bg-white/[0.025] last:border-b-0"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ChampionIcon championId={row.championId} size={24} className="rounded-md" />
                  <span className="truncate">{getChampionName(champData, row.championId)}</span>
                </span>
                <span className="text-right tabular-nums">{row.games}</span>
                <span className="text-right tabular-nums">
                  <span className="text-lol-win">{row.wins}W</span> /{" "}
                  <span className="text-lol-loss">{row.games - row.wins}L</span>
                  <span
                    className={`ml-2 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      winLossDelta >= 0
                        ? "bg-[rgba(34,197,94,0.12)] text-[#22C55E]"
                        : "bg-[rgba(229,72,63,0.12)] text-[#E5483F]"
                    }`}
                  >
                    <DeltaIndicator positive={winLossDelta >= 0} />
                    {winLossDelta >= 0 ? "+" : ""}
                    {winLossDelta}
                  </span>
                </span>
                <span className="flex min-w-[7rem] items-center justify-end gap-2">
                  <WinRateBar wins={row.wins} total={row.games} showPercent={false} />
                  <span className="w-10 text-right tabular-nums">
                    {formatPercent(row.wins, row.games)}
                  </span>
                </span>
                <span className="text-right tabular-nums">{kda.toFixed(2)}</span>
                <span
                  className={`text-right tabular-nums ${
                    row.avgCsDiffAt15 == null
                      ? ""
                      : row.avgCsDiffAt15 > 0
                        ? "text-lol-win"
                        : row.avgCsDiffAt15 < 0
                          ? "text-lol-loss"
                          : ""
                  }`}
                >
                  {row.avgCsDiffAt15 == null ? untracked : formatPlain(row.avgCsDiffAt15, 1)}
                </span>
                <span
                  className={`text-right tabular-nums ${
                    row.avgGoldDiffAt15 == null
                      ? ""
                      : row.avgGoldDiffAt15 > 0
                        ? "text-lol-win"
                        : row.avgGoldDiffAt15 < 0
                          ? "text-lol-loss"
                          : ""
                  }`}
                >
                  {row.avgGoldDiffAt15 == null ? untracked : formatPlain(row.avgGoldDiffAt15, 0)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>,
    <Panel className={`xl:col-span-2 ${TAB_PANEL_CLASSES.crimson}`} key="enemy-class">
      <SectionHeading title="Performance by enemy class" source="d" />
      <p className="mb-3 text-[11px] text-lol-text/70">
        Win rate grouped by the broad class of your lane opponents.
      </p>
      {classRows.length === 0 ? (
        <NoData text="Not enough matchup games for enemy classes" />
      ) : (
        <div className="flex flex-col gap-3">
          <RadarChart
            axes={classRows.map(([label]) => label)}
            series={[
              {
                values: classRows.map(([, stats]) => (stats.wins / stats.games) * 100),
                color: CHART_PALETTE[0],
                label: "Your win rate by class",
              },
            ]}
          />
          <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            {classRows.map(([label, stats]) => (
              <div
                key={label}
                className="flex items-center gap-3 border-b border-white/[0.04] py-2 transition-colors duration-[120ms] hover:bg-white/[0.025] last:border-b-0"
              >
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
  className,
  values,
  labels,
  color,
  format,
  min,
  max,
  baseline,
  hint,
}: {
  title: string;
  source?: keyof typeof SOURCE_LABELS;
  className?: string;
  values: number[];
  labels: string[];
  color: string;
  format: (value: number) => string;
  min?: number;
  max?: number;
  baseline?: number;
  hint?: string;
}) {
  return (
    <Panel className={className}>
      <SectionHeading title={title} source={source} />
      <p className="mb-3 text-[11px] text-lol-text/70">
        {hint ?? "Performance changes across the selected time periods."}
      </p>
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

  const overallGames = trends.daily.reduce((sum, day) => sum + day.games, 0);
  const overallWins = trends.daily.reduce((sum, day) => sum + day.wins, 0);
  const overallWinRate = overallGames > 0 ? (overallWins / overallGames) * 100 : null;
  const overallScoreGames = trends.daily.reduce((sum, day) => sum + day.scored_games, 0);
  const overallScoreTotal = trends.daily.reduce((sum, day) => sum + (day.score_sum ?? 0), 0);
  const overallScore = overallScoreGames > 0 ? overallScoreTotal / overallScoreGames : null;
  const latestBucket = buckets.at(-1);
  const trendInsights: Insight[] = [
    ...(latestBucket && overallWinRate != null
      ? [
          {
            kind:
              winRates.at(-1)! > overallWinRate
                ? ("good" as const)
                : winRates.at(-1)! < overallWinRate
                  ? ("warn" as const)
                  : ("info" as const),
            text: `Latest ${period} win rate is ${winRates.at(-1)!.toFixed(1)}%, ${winRates.at(-1)! > overallWinRate ? "above" : winRates.at(-1)! < overallWinRate ? "below" : "at"} the ${overallWinRate.toFixed(1)}% overall rate.`,
          },
        ]
      : []),
    ...(latestBucket && overallScore != null && latestBucket.scoredGames > 0
      ? [
          {
            kind:
              scores.at(-1)! > overallScore
                ? ("good" as const)
                : scores.at(-1)! < overallScore
                  ? ("warn" as const)
                  : ("info" as const),
            text: `Latest ${period} score is ${scores.at(-1)!.toFixed(1)}, ${scores.at(-1)! > overallScore ? "above" : scores.at(-1)! < overallScore ? "below" : "at"} the ${overallScore.toFixed(1)} overall score.`,
          },
        ]
      : []),
    ...(buckets.length > 0 || patches.length > 0
      ? [
          {
            kind: "info" as const,
            text: `${formatPlain(buckets.length, 0)} ${period} performance bucket${buckets.length === 1 ? "" : "s"} and ${formatPlain(patches.length, 0)} patch${patches.length === 1 ? "" : "es"} observed.`,
          },
        ]
      : []),
  ];

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <IntroBox legend="Badges show where a number comes from: Match-V5 = Riot match data · Timeline = minute-by-minute data · Derived = calculated by the app · LCU = game client.">
        How your performance changes over time, per patch and over your last games.
      </IntroBox>
      <div className="xl:col-span-2">
        <SectionHeading title="Key metrics" />
      </div>
      <Panel className={`${TAB_PANEL_CLASSES.gold} `}>
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
        <p className="mb-3 text-[11px] text-lol-text/70">
          Win rate changes across weekly, monthly, or full-history periods.
        </p>
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
      <Panel className={`${TAB_PANEL_CLASSES.gold} `}>
        <SectionHeading title="Average KDA over time" source="m" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Average kills, deaths, and assists across each performance period.
        </p>
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
        className="bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.06),transparent_50%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]"
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
        className="bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.06),transparent_50%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]"
        values={averageCs}
        labels={labels}
        color="var(--theme-violet)"
        format={(value) => value.toFixed(1)}
      />
      <div className="xl:col-span-2">
        <InsightsPanel items={trendInsights} />
      </div>
      <div className="xl:col-span-2">
        <SectionHeading title="Detailed statistics" />
      </div>
      <Panel className={`${TAB_PANEL_CLASSES.gold} `}>
        <SectionHeading title="Win rate by patch" source="m" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Win rate and game count for each League patch in your history.
        </p>
        <div className="flex flex-col gap-2 text-xs">
          {patches.map((row) => (
            <div
              key={row.patch}
              className="grid grid-cols-[1fr_auto_auto_minmax(8rem,1fr)] items-center gap-3 border-b border-white/[0.04] py-2 transition-colors duration-[120ms] hover:bg-white/[0.025] last:border-b-0"
            >
              <span className="font-semibold text-lol-text-bright">{row.patch}</span>
              <span className="text-right tabular-nums">{row.games}</span>
              <span className="text-right tabular-nums">
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
      <Panel className={TAB_PANEL_CLASSES.gold}>
        <SectionHeading title="By day of week" source="m" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Games played and win rate grouped by day of the week.
        </p>
        <TrendBars
          color={CHART_PALETTE[0]}
          rows={weekdays.map((row, index) => ({
            label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index],
            games: row?.games ?? 0,
            wins: row?.wins ?? 0,
          }))}
        />
      </Panel>
      <Panel className={TAB_PANEL_CLASSES.gold}>
        <SectionHeading title="By hour of day" source="m" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Games played and win rate grouped into three-hour time windows.
        </p>
        <TrendBars rows={hours} color={CHART_PALETTE[1]} />
      </Panel>
      <Panel className={`${TAB_PANEL_CLASSES.gold} `}>
        <SectionHeading title="Skill profile" source="d" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          A broad profile of combat, farming, objectives, vision, and teamwork.
        </p>
        {/* Placeholder data; backend skill-profile metrics land in a follow-up phase. */}
        <RadarChart
          axes={["Combat", "Farm", "Objectives", "Vision", "Survival", "Teamplay"]}
          series={[
            {
              values: [72, 68, 55, 41, 63, 58],
              color: CHART_PALETTE[5],
              label: "All time",
            },
            {
              values: [75, 66, 60, 48, 61, 62],
              color: CHART_PALETTE[0],
              label: "Last 30 days",
            },
          ]}
        />
      </Panel>
    </div>
  );
}

function TrendBars({
  rows,
  color,
}: {
  rows: Array<{ label: string; games: number; wins: number }>;
  color: string;
}) {
  return (
    <div className="flex h-40 items-end gap-2">
      {rows.map((row) => {
        const rate = row.games > 0 ? (row.wins / row.games) * 100 : 0;
        return (
          <div key={row.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="text-right text-[10px] tabular-nums text-lol-text">
              {row.games ? `${rate.toFixed(0)}%` : "—"}
            </span>
            <div className="flex h-24 w-full items-end rounded-sm bg-lol-border/30">
              <div
                className="w-full rounded-sm"
                style={{ height: `${rate}%`, backgroundColor: color }}
              />
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
  timelineAverages,
  timelineAveragesLoading,
  timelineAveragesError,
  champData,
  isSummary,
  killDeathPositions,
  killDeathPositionsLoading,
}: {
  games: ChampionTimelineGame[] | null;
  gamesLoading: boolean;
  selectedGameId: number | null;
  onSelectGame: (gameId: number) => void;
  timeline: TimelineData | null;
  timelineLoading: boolean;
  timelineAverages: ChampionTimelineAverages | null;
  timelineAveragesLoading: boolean;
  timelineAveragesError: string | null;
  champData: ReturnType<typeof useChampionData>;
  isSummary: boolean;
  killDeathPositions: ChampionKillDeathPosition[] | null;
  killDeathPositionsLoading: boolean;
}) {
  const [timelinePhase, setTimelinePhase] = useState<"all" | "early" | "mid" | "late">("all");
  const [mapMode, setMapMode] = useState<"dots" | "heatmap">("dots");
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
  const timelineEvents = timeline?.events ?? [];
  const championKillEvents = timelineEvents.filter((event) => event.event_type === "CHAMPION_KILL");
  const timelineGameKills = games?.reduce((sum, game) => sum + game.kills, 0) ?? 0;
  const timelineGameDeaths = games?.reduce((sum, game) => sum + game.deaths, 0) ?? 0;
  const averageKda =
    timelineGameDeaths > 0
      ? timelineGameKills / timelineGameDeaths
      : timelineGameKills > 0
        ? Number.POSITIVE_INFINITY
        : null;
  const goldDiffBuckets =
    timelineAverages?.buckets.filter((bucket) => bucket.avgGoldDiffVsLaneOpponent != null) ?? [];
  const eventSummary = [
    {
      label: "Dragons",
      count: timelineEvents.filter(
        (event) =>
          event.event_type === "ELITE_MONSTER_KILL" &&
          event.monster_type?.toUpperCase().includes("DRAGON"),
      ).length,
    },
    {
      label: "Barons",
      count: timelineEvents.filter(
        (event) =>
          event.event_type === "ELITE_MONSTER_KILL" &&
          event.monster_type?.toUpperCase().includes("BARON"),
      ).length,
    },
    {
      label: "Towers",
      count: timelineEvents.filter(
        (event) =>
          event.event_type === "BUILDING_KILL" &&
          event.building_type?.toUpperCase().includes("TURRET"),
      ).length,
    },
    {
      label: "Turret plates",
      count: timelineEvents.filter((event) => event.event_type === "TURRET_PLATE_DESTROYED").length,
    },
  ];
  const filteredKillDeathPositions = useMemo(() => {
    if (!killDeathPositions || timelinePhase === "all") return killDeathPositions;
    return killDeathPositions.filter((position) => {
      if (timelinePhase === "early") return position.timestampMs < 900_000;
      if (timelinePhase === "mid") {
        return position.timestampMs >= 900_000 && position.timestampMs <= 1_800_000;
      }
      return position.timestampMs > 1_800_000;
    });
  }, [killDeathPositions, timelinePhase]);

  if (gamesLoading) return <SectionLoading />;
  if (games == null || games.length === 0)
    return <NoData text="No timeline data for this champion" />;

  const timelineInsights: Insight[] = [
    {
      kind: "info",
      text: `${formatPlain(games.length, 0)} timeline game${games.length === 1 ? "" : "s"} available for this champion.`,
    },
    ...(selectedGame
      ? (() => {
          const selectedRatio =
            selectedGame.deaths > 0
              ? selectedGame.kills / selectedGame.deaths
              : selectedGame.kills > 0
                ? Number.POSITIVE_INFINITY
                : 0;
          const totalKills = games.reduce((sum, game) => sum + game.kills, 0);
          const totalDeaths = games.reduce((sum, game) => sum + game.deaths, 0);
          const baselineRatio =
            totalDeaths > 0
              ? totalKills / totalDeaths
              : totalKills > 0
                ? Number.POSITIVE_INFINITY
                : 0;
          const selectedAboveBaseline = selectedRatio > baselineRatio;
          const selectedBelowBaseline = selectedRatio < baselineRatio;
          return [
            {
              kind: selectedAboveBaseline ? "good" : selectedBelowBaseline ? "warn" : "info",
              text: `Selected game K/D is ${selectedAboveBaseline ? "above" : selectedBelowBaseline ? "below" : "at"} the loaded champion baseline.`,
            } satisfies Insight,
          ];
        })()
      : []),
    ...(timeline
      ? [
          {
            kind: "info" as const,
            text: `${formatPlain(timeline.events.filter((event) => event.event_type === "CHAMPION_KILL").length, 0)} champion kill events recorded in the selected match.`,
          },
        ]
      : []),
  ];

  return (
    <div className="grid grid-cols-1 gap-5">
      <IntroBox legend="Badges show where a number comes from: Match-V5 = Riot match data · Timeline = minute-by-minute data · Derived = calculated by the app · LCU = game client.">
        One match, minute by minute: events, fights, power spikes and stat growth.
      </IntroBox>
      <SectionHeading title="Key metrics" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Timeline games"
          value={formatPlain(games.length, 0)}
          sub="Loaded timeline matches"
          accent={CHART_PALETTE[0]}
          large
        />
        <Stat
          label="Selected match K/D"
          value={selectedGame ? `${selectedGame.kills} / ${selectedGame.deaths}` : "—"}
          sub={selectedGame ? "Kills / deaths" : "No selected match"}
          accent={CHART_PALETTE[1]}
          large
        />
        <Stat
          label="Champion kills"
          value={formatPlain(championKillEvents.length, 0)}
          sub={timeline ? "Selected match" : "No selected match"}
          accent={CHART_PALETTE[2]}
          large
        />
        <Stat
          label="Avg K/D"
          value={
            averageKda == null ? "—" : Number.isFinite(averageKda) ? averageKda.toFixed(2) : "∞"
          }
          sub="Across loaded games"
          accent={CHART_PALETTE[3]}
          large
          sparkValues={games.map((game) =>
            game.deaths > 0 ? game.kills / game.deaths : game.kills > 0 ? game.kills : 0,
          )}
        />
      </div>
      <Panel className={TAB_PANEL_CLASSES.sapphire}>
        <SectionHeading title="Game picker" source="t" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Choose a tracked match to inspect its timeline details.
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {games.map((game) => (
            <button
              key={game.gameId}
              type="button"
              className={`flex shrink-0 items-center gap-2 rounded-lg border border-b-white/[0.04] border-l-[3px] px-3 py-2 text-left transition-colors duration-[120ms] hover:bg-white/[0.025] last:border-b-0 ${
                game.gameId === selectedGameId
                  ? "border-lol-crimson bg-lol-crimson/15"
                  : "border-lol-border bg-black/10"
              }`}
              style={{ borderLeftColor: game.win ? "#22C55E" : "#E5483F" }}
              onClick={() => onSelectGame(game.gameId)}
            >
              <ChampionIcon championId={game.championId} size={24} className="rounded-md" />
              <span className="flex flex-col text-xs">
                <span
                  className={`text-right tabular-nums ${game.win ? "text-lol-win" : "text-lol-loss"}`}
                >
                  {game.win ? "W" : "L"} · {game.kills}/{game.deaths}/{game.assists}
                </span>
                <span className="text-lol-text">{formatTimeAgo(game.gameCreation)}</span>
              </span>
            </button>
          ))}
        </div>
      </Panel>
      <SectionHeading title="Detailed statistics" />
      {!isSummary && (
        <Panel className={`${TAB_PANEL_CLASSES.sapphire} `}>
          <SectionHeading title="Kill and death map" source="t" />
          <p className="mb-3 text-[11px] text-lol-text/70">
            Kill and death locations across the selected match timeline.
          </p>
          {killDeathPositionsLoading ? (
            <SectionLoading />
          ) : killDeathPositions && killDeathPositions.length > 0 ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {(
                  [
                    ["all", "All"],
                    ["early", "Early (0-15)"],
                    ["mid", "Mid (15-30)"],
                    ["late", "Late (30+)"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={timelinePhase === value}
                    className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                      timelinePhase === value
                        ? "border-lol-crimson bg-lol-crimson/15 text-lol-text-bright"
                        : "border-lol-border bg-black/10 text-lol-text hover:border-lol-crimson/60"
                    }`}
                    onClick={() => setTimelinePhase(value)}
                  >
                    {label}
                  </button>
                ))}
                <span className="mx-1 h-4 border-l border-lol-border" aria-hidden="true" />
                <div className="flex items-center gap-1" aria-label="Map render mode">
                  {(
                    [
                      ["dots", "Dots"],
                      ["heatmap", "Heatmap"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={mapMode === value}
                      className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                        mapMode === value
                          ? "border-lol-crimson bg-lol-crimson/15 text-lol-text-bright"
                          : "border-lol-border bg-black/10 text-lol-text hover:border-lol-crimson/60"
                      }`}
                      onClick={() => setMapMode(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {filteredKillDeathPositions && filteredKillDeathPositions.length > 0 ? (
                <RiftMapScatter positions={filteredKillDeathPositions} mode={mapMode} />
              ) : (
                <NoData text="No kill positions recorded in this phase." />
              )}
            </>
          ) : (
            <NoData text="No kill positions recorded for this champion yet." />
          )}
        </Panel>
      )}
      <InsightsPanel items={timelineInsights} />
      {timelineLoading ? (
        <Panel className={TAB_PANEL_CLASSES.sapphire}>
          <SectionLoading />
        </Panel>
      ) : timeline == null || ownerFrames.length === 0 ? (
        <Panel className={TAB_PANEL_CLASSES.sapphire}>
          <NoData text="No timeline selected" />
        </Panel>
      ) : (
        <>
          <Panel className={`xl:col-span-2 ${TAB_PANEL_CLASSES.sapphire}`}>
            <SectionHeading title="Gold and CS curves" source="t" />
            <p className="mb-3 text-[11px] text-lol-text/70">
              Gold and minion progress minute by minute through the selected game.
            </p>
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
              format={(value) => formatPlain(value, 2)}
              xLabels={labels}
              min={0}
              height={200}
              showStats
            />
          </Panel>
          <Panel className={`xl:col-span-2 ${TAB_PANEL_CLASSES.sapphire}`}>
            <SectionHeading title="Level and XP" source="t" />
            <p className="mb-3 text-[11px] text-lol-text/70">
              Champion level and experience growth across the selected game.
            </p>
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
              showStats
            />
          </Panel>
          <Panel className={`xl:col-span-2 ${TAB_PANEL_CLASSES.sapphire}`}>
            <SectionHeading title="Gold diff vs lane opponent" source="t" />
            <p className="mb-3 text-[11px] text-lol-text/70">
              Average owner gold difference against the lane opponent at each timeline minute.
            </p>
            {timelineAveragesLoading ? (
              <SectionLoading />
            ) : timelineAveragesError || goldDiffBuckets.length === 0 ? (
              <NoData text="No lane-opponent timeline data" />
            ) : (
              <LineChartExp
                values={goldDiffBuckets.map((bucket) => bucket.avgGoldDiffVsLaneOpponent ?? 0)}
                format={(value) => formatPlain(value, 0)}
                xLabels={goldDiffBuckets.map((bucket) => `${bucket.minute}m`)}
                color="var(--theme-gold)"
                baseline={0}
                showStats
              />
            )}
          </Panel>
          <Panel className={TAB_PANEL_CLASSES.sapphire}>
            <SectionHeading title="Events" source="t" />
            <p className="mb-3 text-[11px] text-lol-text/70">
              Major kills, objectives, purchases, and structures from the match.
            </p>
            <div className="mb-3 grid grid-cols-4 gap-2 border-y border-white/[0.04] py-2 text-xs">
              {eventSummary.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-2">
                  <span className="truncate text-lol-text">{item.label}</span>
                  <span className="tabular-nums text-lol-text-bright">{item.count}</span>
                </div>
              ))}
            </div>
            <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto text-xs">
              {events.length === 0 ? (
                <NoData text="No timeline events" />
              ) : (
                events.map((event) => (
                  <div
                    key={event.event_index}
                    className="flex gap-3 border-b border-white/[0.04] py-2 transition-colors duration-[120ms] hover:bg-white/[0.025] last:border-b-0"
                  >
                    <span className="w-12 shrink-0 text-right tabular-nums text-lol-text">
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
  const qualifiedAllies = (allies ?? []).filter((row) => row.games >= 2);
  const bestAlly = qualifiedAllies
    .slice()
    .sort((a, b) => b.wins / b.games - a.wins / a.games || b.games - a.games)[0];
  const teammateRows = teammates ?? [];
  const totalTeammateGames = teammateRows.reduce((total, row) => total + row.games, 0);
  const qualifiedTeammates = teammateRows.filter((row) => row.games >= 2);
  const duoGames = qualifiedTeammates.reduce((total, row) => total + row.games, 0);
  const duoWins = qualifiedTeammates.reduce((total, row) => total + row.wins, 0);
  const allyGames = (allies ?? []).reduce((total, row) => total + row.games, 0);
  const allyWins = (allies ?? []).reduce((total, row) => total + row.wins, 0);
  const allyWinRate = allyGames > 0 ? (allyWins / allyGames) * 100 : null;
  const duoWinRate = duoGames > 0 ? (duoWins / duoGames) * 100 : null;
  const synergyInsights: Insight[] = [];
  if (bestAlly) {
    synergyInsights.push({
      kind: "good",
      text: `Best ally: ${getChampionName(champData, bestAlly.championId)} at ${formatPercent(bestAlly.wins, bestAlly.games)}.`,
    });
  }
  if (teammateRows.length > 0 && totalTeammateGames > 0) {
    synergyInsights.push({
      kind: "info",
      text: `Observed ${teammateRows.length} duo partners across ${totalTeammateGames} games.`,
    });
  }
  if (duoGames > 0) {
    const duoWinRate = duoWins / duoGames;
    if (duoWinRate >= 0.55 || duoWinRate <= 0.45) {
      synergyInsights.push({
        kind: duoWinRate >= 0.55 ? "good" : "warn",
        text: `Duo pattern is ${duoWinRate >= 0.55 ? "favorable" : "unfavorable"} at ${formatPercent(duoWins, duoGames)} across ${duoGames} games.`,
      });
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <div className="xl:col-span-2">
        <IntroBox legend="Badges show where a number comes from: Match-V5 = Riot match data · Timeline = minute-by-minute data · Derived = calculated by the app · LCU = game client.">
          Which teammates and team types work best with this champion.
        </IntroBox>
      </div>
      <div className="xl:col-span-2">
        <SectionHeading title="Key metrics" />
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            label="Ally win rate"
            value={allyWinRate == null ? "—" : `${allyWinRate.toFixed(1)}%`}
            sub={allyGames > 0 ? `${allyGames} ally games` : "No ally data"}
            accent={CHART_PALETTE[0]}
            miniViz={
              allyWinRate == null ? undefined : (
                <svg aria-hidden="true" className="h-11 w-11 -rotate-90" viewBox="0 0 44 44">
                  <circle
                    cx="22"
                    cy="22"
                    r="17"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="text-lol-border/60"
                  />
                  <circle
                    cx="22"
                    cy="22"
                    r="17"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${allyWinRate.toFixed(1)} 100`}
                    pathLength="100"
                    className="text-lol-win"
                  />
                </svg>
              )
            }
          />
          <Stat
            label="Ally games"
            value={formatPlain(allyGames, 0)}
            sub="Across observed allies"
            accent={CHART_PALETTE[1]}
            miniViz={
              allyGames > 0 ? (
                <span
                  aria-hidden="true"
                  className="mt-1 block h-2 w-[72px] overflow-hidden rounded-full bg-lol-border/60"
                >
                  <span className="block h-full w-full rounded-full bg-lol-gold" />
                </span>
              ) : undefined
            }
          />
          <Stat
            label="Duo win rate"
            value={duoWinRate == null ? "—" : `${duoWinRate.toFixed(1)}%`}
            sub={duoGames > 0 ? `${duoGames} qualified games` : "No duo data"}
            accent={CHART_PALETTE[2]}
            miniViz={
              duoWinRate == null ? undefined : (
                <svg aria-hidden="true" className="h-11 w-11 -rotate-90" viewBox="0 0 44 44">
                  <circle
                    cx="22"
                    cy="22"
                    r="17"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="text-lol-border/60"
                  />
                  <circle
                    cx="22"
                    cy="22"
                    r="17"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${duoWinRate.toFixed(1)} 100`}
                    pathLength="100"
                    className="text-lol-win"
                  />
                </svg>
              )
            }
          />
          <Stat
            label="Duo partners"
            value={formatPlain(teammateRows.length, 0)}
            sub="Observed summoners"
            accent={CHART_PALETTE[3]}
            miniViz={
              teammateRows.length > 0 ? (
                <span
                  aria-hidden="true"
                  className="mt-1 block h-2 w-[72px] overflow-hidden rounded-full bg-lol-border/60"
                >
                  <span className="block h-full w-full rounded-full bg-[#3B82F6]" />
                </span>
              ) : undefined
            }
          />
        </div>
      </div>
      <Panel className={TAB_PANEL_CLASSES.emerald}>
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
        <p className="mb-3 text-[11px] text-lol-text/70">
          Teammate champions that pair best with this champion across games.
        </p>
        {alliesLoading ? (
          <SectionLoading />
        ) : sortedAllies.length === 0 ? (
          <NoData text="No ally data yet" />
        ) : (
          <>
            <div className="flex max-h-[520px] flex-col overflow-x-auto overflow-y-auto text-xs">
              <div className="grid min-w-[680px] grid-cols-[minmax(12rem,1.6fr)_72px_72px_72px_72px_96px] gap-3 border-b border-lol-border/50 pb-2 font-semibold text-lol-text">
                <span>Stat</span>
                <span className="text-right whitespace-nowrap">Avg / game</span>
                <span className="text-right whitespace-nowrap">Best</span>
                <span className="text-right whitespace-nowrap">Wins</span>
                <span className="text-right whitespace-nowrap">Losses</span>
                <span className="text-right whitespace-nowrap">vs others</span>
              </div>
              {sortedAllies.slice(0, 30).map((row, index) => {
                const games = Math.max(1, row.games);
                const kda = (row.kills + row.assists) / Math.max(1, row.deaths);
                const winRate = (row.wins / games) * 100;
                return (
                  <div
                    key={row.championId}
                    className="grid min-w-[680px] grid-cols-[minmax(12rem,1.6fr)_72px_72px_72px_72px_96px] items-center gap-3 border-b border-white/[0.04] py-2.5 text-lol-text-bright transition-colors duration-[120ms] hover:bg-white/[0.025] last:border-b-0"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="flex shrink-0 items-center justify-center overflow-hidden rounded-md border"
                        style={{
                          width: 24,
                          height: 24,
                          borderColor: `${CHART_PALETTE[index % CHART_PALETTE.length]}59`,
                          boxShadow: `0 0 8px 0 ${CHART_PALETTE[index % CHART_PALETTE.length]}33`,
                        }}
                      >
                        <ChampionIcon
                          championId={row.championId}
                          size={24}
                          className="rounded-md"
                        />
                      </span>
                      <span className="min-w-0 truncate">
                        <span className="block truncate">
                          {getChampionName(champData, row.championId)}
                        </span>
                        <span className="block text-[10px] text-lol-text">
                          KDA {kda.toFixed(2)} · {winRate.toFixed(1)}%
                        </span>
                      </span>
                    </span>
                    <span className="text-right tabular-nums text-lol-text">{row.games}</span>
                    <span className="text-right tabular-nums text-lol-text" title="Not tracked yet">
                      —
                    </span>
                    <span className="text-right tabular-nums text-lol-win">{row.wins}</span>
                    <span className="text-right tabular-nums text-lol-loss">
                      {row.games - row.wins}
                    </span>
                    <span className="text-right tabular-nums text-lol-text" title="Not tracked yet">
                      —
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

      {synergyInsights.length > 0 && <InsightsPanel insights={synergyInsights} />}
      <div className="xl:col-span-2">
        <SectionHeading title="Detailed statistics" />
      </div>
      <Panel className={TAB_PANEL_CLASSES.emerald}>
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
        <p className="mb-3 text-[11px] text-lol-text/70">
          Summoners and team compositions that perform best alongside this champion.
        </p>
        {teammatesLoading ? (
          <SectionLoading />
        ) : sortedTeammates.length === 0 ? (
          <NoData text="No duo data yet" />
        ) : (
          <>
            <div className="flex max-h-[520px] flex-col overflow-x-auto overflow-y-auto text-xs">
              <div className="grid min-w-[680px] grid-cols-[minmax(12rem,1.6fr)_72px_72px_72px_72px_96px] gap-3 border-b border-lol-border/50 pb-2 font-semibold text-lol-text">
                <span>Stat</span>
                <span className="text-right whitespace-nowrap">Avg / game</span>
                <span className="text-right whitespace-nowrap">Best</span>
                <span className="text-right whitespace-nowrap">Wins</span>
                <span className="text-right whitespace-nowrap">Losses</span>
                <span className="text-right whitespace-nowrap">vs others</span>
              </div>
              {sortedTeammates.slice(0, 30).map((row, index) => {
                const games = Math.max(1, row.games);
                const kda = (row.kills + row.assists) / Math.max(1, row.deaths);
                const initials = row.name.slice(0, 2).toUpperCase();
                const winRate = (row.wins / games) * 100;
                return (
                  <div
                    key={row.puuid}
                    className="grid min-w-[680px] grid-cols-[minmax(12rem,1.6fr)_72px_72px_72px_72px_96px] items-center gap-3 border-b border-white/[0.04] py-2.5 text-lol-text-bright transition-colors duration-[120ms] hover:bg-white/[0.025] last:border-b-0"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="flex shrink-0 items-center justify-center overflow-hidden rounded-md border"
                        style={{
                          width: 24,
                          height: 24,
                          borderColor: `${CHART_PALETTE[index % CHART_PALETTE.length]}59`,
                          boxShadow: `0 0 8px 0 ${CHART_PALETTE[index % CHART_PALETTE.length]}33`,
                        }}
                      >
                        {row.profileIcon != null ? (
                          <SummonerIcon iconId={row.profileIcon} size={24} />
                        ) : (
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-lol-border/60 text-[9px] font-semibold text-lol-text-bright">
                            {initials}
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 truncate">
                        <span className="block truncate">{row.name}</span>
                        {row.topChampionId != null && (
                          <span className="block truncate text-[10px] text-lol-text">
                            Most played with: {getChampionName(champData, row.topChampionId)}
                          </span>
                        )}
                        <span className="block text-[10px] text-lol-text">
                          KDA {kda.toFixed(2)} · {winRate.toFixed(1)}%
                        </span>
                      </span>
                    </span>
                    <span className="text-right tabular-nums text-lol-text">{row.games}</span>
                    <span className="text-right tabular-nums text-lol-text" title="Not tracked yet">
                      —
                    </span>
                    <span className="text-right tabular-nums text-lol-win">{row.wins}</span>
                    <span className="text-right tabular-nums text-lol-loss">
                      {row.games - row.wins}
                    </span>
                    <span className="text-right tabular-nums text-lol-text" title="Not tracked yet">
                      —
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
  const formatSkillOrder = (order: string | undefined) =>
    order
      ? order
          .split(",")
          .map((slot) => SKILL_LABELS[Number(slot)]?.label ?? slot)
          .join(" > ")
      : "—";
  const commonOrder = skillOrders?.topOrders[0];
  const commonSpellPair = skillOrders?.summonerSpells[0];
  const commonSpellNames = commonSpellPair
    ? commonSpellPair.pair
        .split(",")
        .map((id) => spells[Number(id)]?.name ?? `Spell ${id}`)
        .join(" + ")
    : "—";
  const commonOrderShare =
    commonOrder && sampleSize > 0 ? (commonOrder.picks / sampleSize) * 100 : null;
  const commonSpellShare =
    commonSpellPair && detail.games > 0 ? (commonSpellPair.picks / detail.games) * 100 : null;

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <div className="xl:col-span-2">
        <IntroBox legend="Badges show where a number comes from: Match-V5 = Riot match data · Timeline = minute-by-minute data · Derived = calculated by the app · LCU = game client.">
          How you use your abilities and summoner spells, and how you level them.
        </IntroBox>
      </div>
      <div className="xl:col-span-2">
        <SectionHeading title="Key metrics" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            label="Common max order"
            value={formatSkillOrder(commonOrder?.order)}
            sub={commonOrder ? `${commonOrder.picks} picks` : "No timeline data"}
            accent={CHART_PALETTE[0]}
            glow
            miniViz={
              commonOrderShare == null ? undefined : (
                <span
                  aria-hidden="true"
                  className="mt-1 block h-2 w-[72px] overflow-hidden rounded-full bg-lol-border/60"
                >
                  <span
                    className="block h-full rounded-full bg-[#3B82F6]"
                    style={{ width: `${Math.min(100, commonOrderShare)}%` }}
                  />
                </span>
              )
            }
          />
          <Stat
            label="Spell pair"
            value={commonSpellNames}
            sub={commonSpellPair ? `${commonSpellPair.picks} picks` : "No spell data"}
            accent={CHART_PALETTE[1]}
            glow
            miniViz={
              commonSpellShare == null ? undefined : (
                <span
                  aria-hidden="true"
                  className="mt-1 block h-2 w-[72px] overflow-hidden rounded-full bg-lol-border/60"
                >
                  <span
                    className="block h-full rounded-full bg-lol-gold"
                    style={{ width: `${Math.min(100, commonSpellShare)}%` }}
                  />
                </span>
              )
            }
          />
          <Stat
            label="Average R rank 1"
            value={formatRankTiming(rTiming.avgR1Min)}
            sub={`Based on ${rTiming.sampleSize} games`}
            accent={CHART_PALETTE[2]}
            glow
          />
          <Stat
            label="Skill orders"
            value={formatPlain(skillOrders?.topOrders.length ?? 0, 0)}
            sub="Orders in available payload"
            accent={CHART_PALETTE[3]}
            glow
          />
        </div>
      </div>
      <div className="xl:col-span-2">
        <InsightsPanel
          insights={[
            ...(commonOrder
              ? [
                  {
                    kind: "info" as const,
                    text: `Most common max order is ${formatSkillOrder(commonOrder.order)}.`,
                  },
                ]
              : []),
            ...(commonSpellPair
              ? [
                  {
                    kind: "info" as const,
                    text: `Top summoner spell pair is ${commonSpellNames} (${commonSpellPair.picks} games).`,
                  },
                ]
              : []),
          ]}
        />
      </div>
      <div className="xl:col-span-2">
        <SectionHeading title="Detailed statistics" />
      </div>
      <Panel className={`${TAB_PANEL_CLASSES.sapphire} `}>
        <SectionHeading title="Skill order" source="t" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Most common ability leveling sequences from games with timeline data.
        </p>
        {orders.length === 0 ? (
          <NoData text="No skill data yet (requires timeline)" />
        ) : (
          <>
            <p className="mb-3 text-xs text-lol-text">
              Based on {timelineCoverage.gamesWithTimeline} of {timelineCoverage.totalGames} games
              with timeline data
            </p>
            <div className="flex flex-col gap-2 text-xs">
              <div className="grid grid-cols-[2rem_minmax(0,1fr)_72px_72px] gap-3 border-b border-lol-border/50 pb-2 font-semibold text-lol-text">
                <span>#</span>
                <span>Order</span>
                <span className="text-right whitespace-nowrap">Picks</span>
                <span className="text-right whitespace-nowrap">Sample</span>
              </div>
              {orders.map((entry, index) => (
                <div
                  key={entry.order}
                  className="grid grid-cols-[2rem_minmax(0,1fr)_72px_72px] items-center gap-3 border-b border-white/[0.04] py-2.5 text-lol-text-bright transition-colors duration-[120ms] hover:bg-white/[0.025] last:border-b-0"
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
                  <span className="text-right tabular-nums">{entry.picks}</span>
                  <span className="text-right tabular-nums">
                    {formatPercent(entry.picks, sampleSize)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>

      <Panel className={TAB_PANEL_CLASSES.sapphire}>
        <SectionHeading title="Cast distribution" source="t" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Relative ability cast frequency across the available timeline sample.
        </p>
        {/* Placeholder data; backend ability-cast distribution lands in a follow-up phase. */}
        <DonutChart
          segments={[
            { label: "Q", value: 32, color: CHART_PALETTE[3] },
            { label: "W", value: 22, color: CHART_PALETTE[2] },
            { label: "E", value: 38, color: CHART_PALETTE[1] },
            { label: "R", value: 8, color: CHART_PALETTE[0] },
          ]}
        />
      </Panel>

      <Panel className={TAB_PANEL_CLASSES.sapphire}>
        <SectionHeading
          title="R rank timing"
          source="t"
          aside={`Based on ${rTiming.sampleSize} games`}
        />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Average minute when each ultimate rank was learned in timeline games.
        </p>
        <div className="flex flex-col gap-3 text-xs">
          {[
            ["R rank 1", formatRankTiming(rTiming.avgR1Min)],
            ["R rank 2", formatRankTiming(rTiming.avgR2Min)],
            ["R rank 3", formatRankTiming(rTiming.avgR3Min)],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between border-b border-white/[0.04] py-2 transition-colors duration-[120ms] hover:bg-white/[0.025] last:border-b-0"
            >
              <span className="text-lol-text">{label}</span>
              <b className="text-right tabular-nums text-lol-text-bright">{value}</b>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className={TAB_PANEL_CLASSES.sapphire}>
        <SectionHeading title="Summoner spells" source="m" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Summoner spell pairs, pick counts, and win rates across your games.
        </p>
        {(skillOrders?.summonerSpells ?? []).length === 0 ? (
          <NoData />
        ) : (
          <div className="flex flex-col text-xs">
            <div className="grid grid-cols-[minmax(8rem,1fr)_72px_112px] gap-3 border-b border-lol-border/50 pb-2 font-semibold text-lol-text">
              <span>Spell pair</span>
              <span className="text-right whitespace-nowrap">Picks</span>
              <span className="text-right whitespace-nowrap">Win rate</span>
            </div>
            {(skillOrders?.summonerSpells ?? []).map((spellPair) => {
              const ids = spellPair.pair.split(",").map(Number);
              const names = ids.map((id) => spells[id]?.name ?? `Spell ${id}`);
              return (
                <div
                  key={spellPair.pair}
                  className="grid grid-cols-[minmax(8rem,1fr)_72px_112px] items-center gap-3 border-b border-white/[0.04] py-2.5 text-lol-text-bright transition-colors duration-[120ms] hover:bg-white/[0.025] last:border-b-0"
                >
                  <span
                    className="flex items-center gap-2 text-lol-text-bright"
                    title={names.join(" + ")}
                  >
                    <SummonerSpellIcon spellId={ids[0] ?? null} size={24} />
                    <SummonerSpellIcon spellId={ids[1] ?? null} size={24} />
                    <span className="truncate">{names.join(" + ")}</span>
                  </span>
                  <span className="text-right tabular-nums text-lol-text">{spellPair.picks}</span>
                  <span className="flex items-center justify-end gap-2">
                    <span className="w-14">
                      <WinRateBar wins={spellPair.wins} total={spellPair.picks} />
                    </span>
                    <span className="w-11 text-right tabular-nums text-lol-text">
                      {formatPercent(spellPair.wins, spellPair.picks)}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel className={`${TAB_PANEL_CLASSES.sapphire} `}>
        <SectionHeading title="Per-ability damage" source="d" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Ability-specific damage details are unavailable from the stored match data.
        </p>
        <EmptyState text="Per-ability damage (Q/W/E/R breakdown) is not available in any public Riot API. This section is intentionally empty." />
      </Panel>
    </div>
  );
}

function CombatTab({
  detail,
  baseline,
  detailLoading,
  matchHistory,
  globalDetail,
}: {
  detail: ChampionDetailStats | null;
  baseline: ChampionStatBaseline | null;
  detailLoading: boolean;
  matchHistory: { matches: MatchListItem[]; total: number } | null;
  globalDetail: GlobalChampionDetail | null;
}) {
  if (detailLoading) return <SectionLoading />;
  if (!detail || detail.games === 0) return <NoData text="No combat data" />;
  const vsOther = (value: number | null | undefined, key: string) =>
    value == null || baseline?.[key] == null ? null : value - baseline[key]!;

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
        format={(value) => formatPlain(value, 2)}
        color={color}
        xLabels={labels}
        yFormat={(value) => formatPlain(value, 2)}
        yTicks={[0, Math.max(...values, 1)]}
      />
    </div>
  );
  const dealtTrueAvg = Math.max(
    0,
    (globalDetail?.avgDamage ?? 0) - detail.avgPhysicalDamageDealt - detail.avgMagicDamageDealt,
  );
  const combatInsights: Insight[] = [];
  if (globalDetail && matches.length > 0) {
    const recentDamage =
      matches.reduce((sum, match) => sum + match.total_damage_dealt, 0) / matches.length;
    const damageDelta = recentDamage - globalDetail.avgDamage;
    if (Math.abs(damageDelta) >= 1) {
      combatInsights.push({
        kind: damageDelta > 0 ? "good" : "warn",
        text: `Recent damage dealt is ${Math.abs(damageDelta).toFixed(0)} ${damageDelta > 0 ? "above" : "below"} the champion baseline.`,
      });
    }
  }
  const multikills = [
    ["Double kills", globalDetail?.doubleKills ?? 0],
    ["Triple kills", globalDetail?.tripleKills ?? 0],
    ["Quadra kills", globalDetail?.quadraKills ?? 0],
    ["Penta kills", globalDetail?.pentaKills ?? 0],
  ] as const;
  const maxMultikill = multikills[0]?.[1] ?? 0;
  const mostCommonMultikill = multikills.slice().sort((a, b) => b[1] - a[1])[0];
  if (mostCommonMultikill && mostCommonMultikill[1] > 0) {
    combatInsights.push({
      kind: "info",
      text: `Most common multikill: ${mostCommonMultikill[0]} (${mostCommonMultikill[1]}).`,
    });
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <div className="xl:col-span-2">
        <IntroBox legend="Badges show where a number comes from: Match-V5 = Riot match data · Timeline = minute-by-minute data · Derived = calculated by the app · LCU = game client.">
          Damage dealt and taken, kills and deaths, crowd control, healing and fighting habits.
        </IntroBox>
      </div>
      <div className="xl:col-span-2">
        <SectionHeading title="Key metrics" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <CombatTile
            label="Damage dealt"
            value={
              globalDetail?.avgDamage ?? detail.avgPhysicalDamageDealt + detail.avgMagicDamageDealt
            }
            subtitle="Average per game"
            accent={CHART_PALETTE[0]}
          />
          <CombatTile
            label="Damage taken"
            value={detail.avgDamageTaken}
            subtitle="Average per game"
            accent={CHART_PALETTE[1]}
          />
          <CombatTile
            label="CC / min"
            value={detail.avgCcPerMin}
            subtitle="Average crowd control"
            accent={CHART_PALETTE[2]}
          />
          <CombatTile
            label="Healing"
            value={globalDetail?.avgHeal}
            subtitle="Average per game"
            accent={CHART_PALETTE[3]}
          />
        </div>
      </div>
      {combatInsights.length > 0 && (
        <div className="xl:col-span-2">
          <InsightsPanel items={combatInsights} />
        </div>
      )}
      <div className="xl:col-span-2">
        <SectionHeading title="Detailed statistics" />
      </div>
      <Panel className={`xl:col-span-2 ${TAB_PANEL_CLASSES.crimson}`}>
        <SectionHeading title="K/D/A over the last 20 games" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Kills, deaths, and assists across your twenty most recent games.
        </p>
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
        accentClass={TAB_PANEL_CLASSES.gold}
        segments={[
          ["Physical", detail.avgPhysicalDamageDealt, "#FF8C00"],
          ["Magic", detail.avgMagicDamageDealt, "#00D9FF"],
          ["True", dealtTrueAvg, "#FFFFFF"],
        ]}
        rows={[
          [
            "Physical",
            detail.avgPhysicalDamageDealt,
            detail.maxPhysicalDamageDealt,
            detail.totalPhysicalDamageDealt,
            formatCombatNumber,
            detail.avgPhysicalDamageDealtInWins,
            detail.avgPhysicalDamageDealtInLosses,
            vsOther(detail.avgPhysicalDamageDealt, "avgPhysicalDamageDealtOther"),
          ],
          [
            "Magic",
            detail.avgMagicDamageDealt,
            detail.maxMagicDamageDealt,
            detail.totalMagicDamageDealt,
            formatCombatNumber,
            detail.avgMagicDamageDealtInWins,
            detail.avgMagicDamageDealtInLosses,
            vsOther(detail.avgMagicDamageDealt, "avgMagicDamageDealtOther"),
          ],
          [
            "True",
            detail.avgTrueDamageDealt,
            detail.maxTrueDamageDealt,
            undefined,
            formatCombatNumber,
            detail.avgTrueDamageDealtInWins,
            detail.avgTrueDamageDealtInLosses,
            vsOther(detail.avgTrueDamageDealt, "avgTrueDamageDealtOther"),
          ],
        ]}
      />

      <CombatDamagePanel
        title="Damage taken"
        accentClass={TAB_PANEL_CLASSES.emerald}
        segments={[
          ["Physical", detail.avgPhysicalDamageTaken, "#FF8C00"],
          ["Magic", detail.avgMagicDamageTaken, "#00D9FF"],
          ["True", detail.avgTrueDamageTaken, "#FFFFFF"],
        ]}
        rows={[
          [
            "Physical",
            detail.avgPhysicalDamageTaken,
            detail.maxPhysicalDamageTaken,
            detail.totalPhysicalDamageTaken,
            formatCombatNumber,
            detail.avgPhysicalDamageTakenInWins,
            detail.avgPhysicalDamageTakenInLosses,
            vsOther(detail.avgPhysicalDamageTaken, "avgPhysicalDamageTakenOther"),
          ],
          [
            "Magic",
            detail.avgMagicDamageTaken,
            detail.maxMagicDamageTaken,
            detail.totalMagicDamageTaken,
            formatCombatNumber,
            detail.avgMagicDamageTakenInWins,
            detail.avgMagicDamageTakenInLosses,
            vsOther(detail.avgMagicDamageTaken, "avgMagicDamageTakenOther"),
          ],
          [
            "True",
            detail.avgTrueDamageTaken,
            detail.maxTrueDamageTaken,
            detail.totalTrueDamageTaken,
            formatCombatNumber,
            detail.avgTrueDamageTakenInWins,
            detail.avgTrueDamageTakenInLosses,
            vsOther(detail.avgTrueDamageTaken, "avgTrueDamageTakenOther"),
          ],
        ]}
      />

      <Panel className={TAB_PANEL_CLASSES.sapphire}>
        <SectionHeading title="Crowd control" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Crowd control time and totals, compared across wins and losses.
        </p>
        <CombatStatTable
          rows={[
            [
              "Time CCing others (sec)",
              detail.avgTimeCcOthers,
              detail.maxTimeCcOthers,
              detail.totalTimeCcOthers,
              formatSeconds,
              detail.avgTimeCcOthersInWins,
              detail.avgTimeCcOthersInLosses,
              vsOther(detail.avgTimeCcOthers, "avgTimeCcOthersOther"),
            ],
            [
              "Total CC dealt (sec)",
              detail.avgTotalCcDealt,
              detail.maxTotalCcDealt,
              detail.totalTotalCcDealt,
              formatSeconds,
              detail.avgTotalCcDealtInWins,
              detail.avgTotalCcDealtInLosses,
              vsOther(detail.avgTotalCcDealt, "avgTotalCcDealtOther"),
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

      <Panel className={TAB_PANEL_CLASSES.violet}>
        <SectionHeading title="Objectives & turrets" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Damage dealt to objectives and turrets throughout your games.
        </p>
        <CombatStatTable
          rows={[
            [
              "Damage to objectives",
              detail.avgDamageToObjectives,
              detail.maxDamageToObjectives,
              detail.totalDamageToObjectives,
              formatCombatNumber,
              detail.avgDamageToObjectivesInWins,
              detail.avgDamageToObjectivesInLosses,
              vsOther(detail.avgDamageToObjectives, "avgDamageToObjectivesOther"),
            ],
            [
              "Damage to turrets",
              detail.avgDamageToTurrets,
              detail.maxDamageToTurrets,
              detail.totalDamageToTurrets,
              formatCombatNumber,
              detail.avgDamageToTurretsInWins,
              detail.avgDamageToTurretsInLosses,
              vsOther(detail.avgDamageToTurrets, "avgDamageToTurretsOther"),
            ],
          ]}
        />
      </Panel>

      <Panel className={TAB_PANEL_CLASSES.steel}>
        <SectionHeading title="Longevity & sprees" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Survival time, killing sprees, and damage mitigation performance.
        </p>
        <CombatStatTable
          rows={[
            [
              "Longest alive (sec)",
              detail.avgLongestAlive,
              detail.maxLongestAlive,
              detail.totalLongestAlive,
              formatSeconds,
              detail.avgLongestAliveInWins,
              detail.avgLongestAliveInLosses,
              vsOther(detail.avgLongestAlive, "avgLongestAliveOther"),
            ],
            [
              "Killing sprees",
              detail.avgKillingSprees,
              detail.maxKillingSprees,
              detail.totalKillingSprees,
              formatCombatNumber,
              detail.avgKillingSpreesInWins,
              detail.avgKillingSpreesInLosses,
              vsOther(detail.avgKillingSprees, "avgKillingSpreesOther"),
            ],
            [
              "Damage self-mitigated",
              detail.avgDamageSelfMitigated,
              detail.maxDamageSelfMitigated,
              detail.totalDamageSelfMitigated,
              formatCombatNumber,
              detail.avgDamageSelfMitigatedInWins,
              detail.avgDamageSelfMitigatedInLosses,
              vsOther(detail.avgDamageSelfMitigated, "avgDamageSelfMitigatedOther"),
            ],
          ]}
        />
      </Panel>

      <Panel className={TAB_PANEL_CLASSES.crimson}>
        <SectionHeading title="First blood" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          First blood kills and assists, including their rate across games.
        </p>
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

      <Panel className={TAB_PANEL_CLASSES.gold}>
        <SectionHeading title="Multikills" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Total and per-game counts for every recorded multikill type.
        </p>
        <div className="flex flex-col gap-3">
          {[
            { label: "Double", value: globalDetail?.doubleKills, color: "#3B82F6" },
            { label: "Triple", value: globalDetail?.tripleKills, color: "#C9A45C" },
            { label: "Quadra", value: globalDetail?.quadraKills, color: "#A855F7" },
            { label: "Penta", value: globalDetail?.pentaKills, color: "#E5483F" },
          ].map(({ label, value, color }) => {
            const ratio = detail.games > 0 && value != null ? value / detail.games : null;
            const width = maxMultikill
              ? `${Math.min(100, ((value ?? 0) / maxMultikill) * 100)}%`
              : "0%";
            return (
              <div
                key={label}
                className="grid grid-cols-[72px_auto_minmax(0,1fr)] items-center gap-3 border-b border-white/[0.04] pb-3 transition-colors duration-[120ms] hover:bg-white/[0.025]"
              >
                <span
                  className="w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ backgroundColor: `${color}26`, color }}
                >
                  {label}
                </span>
                <div className="min-w-[100px]">
                  <div className="font-display text-[20px] leading-none text-lol-text-bright tabular-nums">
                    {formatCombatNumber(value)}
                  </div>
                  <div className="mt-1 text-[11px] text-lol-text tabular-nums">
                    {ratio != null ? `${ratio.toFixed(2)} / game` : "—"}
                  </div>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-black/20">
                  <div
                    className="h-full rounded-full"
                    style={{ width, backgroundColor: color, opacity: 0.4 }}
                  />
                </div>
              </div>
            );
          })}
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
  weeklyMetrics,
  queueStats,
  queueStatsLoading,
}: {
  detail: ChampionDetailStats | null;
  detailLoading: boolean;
  timeline: ChampionTimelineAverages | null;
  timelineLoading: boolean;
  weeklyMetrics: ChampionWeeklyMetrics[] | null;
  queueStats: ChampionQueueStat[] | null;
  queueStatsLoading: boolean;
}) {
  if (detailLoading) return <SectionLoading />;
  if (!detail || detail.games === 0) return <NoData text="No data" />;
  if (timelineLoading) return <SectionLoading />;

  const buckets = timeline?.buckets ?? [];
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
  const leadPoints = [5, 10, 15, 20].map((minute) => ({
    minute,
    value: bucketAt(minute)?.avgGoldDiffVsLaneOpponent ?? null,
  }));
  const leadScale = Math.max(1, ...leadPoints.map((point) => Math.abs(point.value ?? 0)));
  const levelPoints = [5, 10, 15, 20].map((minute) => ({
    minute,
    value: bucketAt(minute)?.avgLevel ?? null,
  }));
  const goldLeadBuckets: Array<[string, number, string]> = timeline?.goldLeadDistribution15
    ? [
        ["Behind 1000+", timeline.goldLeadDistribution15.behind1000plus, "#E5483F"],
        ["Behind 0–1000", timeline.goldLeadDistribution15.behind0to1000, "#C9A45C"],
        ["Ahead 0–1000", timeline.goldLeadDistribution15.ahead0to1000, "#22C55E"],
        ["Ahead 1000+", timeline.goldLeadDistribution15.ahead1000plus, "#3B82F6"],
      ]
    : [];
  const goldLeadMax = Math.max(1, ...goldLeadBuckets.map(([, count]) => count));
  const timelineGames = buckets.reduce((sum, bucket) => sum + bucket.sampleGames, 0);
  const goldLead15 = timeline?.goldLeadDistribution15;
  const gamesAhead15 =
    goldLead15 == null
      ? null
      : (() => {
          const total =
            goldLead15.behind1000plus +
            goldLead15.behind0to1000 +
            goldLead15.ahead0to1000 +
            goldLead15.ahead1000plus;
          return total > 0
            ? ((goldLead15.ahead0to1000 + goldLead15.ahead1000plus) / total) * 100
            : null;
        })();
  const damagePerGold =
    detail.avgGoldSpent > 0
      ? (detail.avgPhysicalDamageDealt + detail.avgMagicDamageDealt) / detail.avgGoldSpent
      : null;
  const value = (number: number | null | undefined, digits = 0) => formatPlain(number, digits);
  const queueRows = queueStats ?? [];
  const formatQueueKda = (kills?: number, deaths?: number, assists?: number) => {
    if (kills == null && deaths == null && assists == null) return "—";
    if (deaths == null || deaths === 0) return "∞";
    return (((kills ?? 0) + (assists ?? 0)) / deaths).toFixed(2);
  };

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <div className="xl:col-span-2">
        <IntroBox legend="Badges show where a number comes from: Match-V5 = Riot match data · Timeline = minute-by-minute data · Derived = calculated by the app · LCU = game client.">
          How much gold and experience you earn, how you spend it, and how it changes your games.
        </IntroBox>
      </div>
      <div className="xl:col-span-2">
        <SectionHeading title="Key metrics" />
      </div>
      <Panel className={`${TAB_PANEL_CLASSES.gold} `}>
        <SectionHeading title="Economy snapshot" source="d" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Gold earned, spent, and efficiency measures for this champion.
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat
            label="Gold/min"
            value={detail.goldPerMin.toFixed(0)}
            valueClass="text-right tabular-nums"
            sub="Average earned per minute"
            sparkValues={weeklyMetrics?.map((entry) => entry.metrics.goldPerMin ?? null)}
          />
          <Stat
            label="Ahead @10"
            value={timeline?.ahead10 == null ? "—" : `${(timeline.ahead10 * 100).toFixed(1)}%`}
            sub={timeline?.ahead10 == null ? "Percentage unavailable" : "of your games"}
            emptySub={timeline?.ahead10 == null}
            valueClass="text-right tabular-nums"
            miniViz={
              timeline?.ahead10 == null ? undefined : (
                <svg aria-hidden="true" className="h-11 w-11 -rotate-90" viewBox="0 0 44 44">
                  <circle
                    cx="22"
                    cy="22"
                    r="17"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="text-lol-border/60"
                  />
                  <circle
                    cx="22"
                    cy="22"
                    r="17"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${(timeline.ahead10 * 100).toFixed(1)} 100`}
                    pathLength="100"
                    className="text-lol-win"
                  />
                </svg>
              )
            }
          />
          <Stat
            label="Gold lead @15"
            value={value(bucketAt(15)?.avgGoldDiffVsLaneOpponent)}
            sub="Versus lane opponent"
            valueClass="text-right tabular-nums"
            miniViz={
              bucketAt(15)?.avgGoldDiffVsLaneOpponent == null ? undefined : (
                <span
                  aria-hidden="true"
                  className={`mt-1 block h-2 w-[72px] rounded-full ${
                    (bucketAt(15)?.avgGoldDiffVsLaneOpponent ?? 0) >= 0
                      ? "bg-lol-win"
                      : "bg-lol-loss"
                  }`}
                />
              )
            }
          />
          <Stat
            label="Gold efficiency"
            value={value(damagePerGold, 2)}
            sub="Damage per gold spent"
            valueClass="text-right tabular-nums"
          />
          <Stat
            label="Items bought"
            value={value(timeline?.itemsBought, 1)}
            sub={timeline?.itemsBought == null ? "Not available" : "items per game"}
            emptySub={timeline?.itemsBought == null}
            valueClass="text-right tabular-nums"
          />
          <Stat
            label="Comebacks"
            value={timeline?.comebacks == null ? "—" : String(timeline.comebacks)}
            sub={timeline?.comebacks == null ? "Not available" : "wins from behind"}
            emptySub={timeline?.comebacks == null}
            valueClass="text-right tabular-nums"
          />
        </div>
      </Panel>
      <div className="xl:col-span-2">
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
      </div>
      <div className="xl:col-span-2">
        <SectionHeading title="Detailed statistics" />
      </div>
      <Panel className={TAB_PANEL_CLASSES.gold}>
        <SectionHeading title="Gold over time" source="d" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Average gold progression at each available minute of the game.
        </p>
        {goldValues.length < 2 ? (
          <NoData text="Not enough timeline data" />
        ) : (
          <div className="[&_polyline]:[filter:drop-shadow(0_0_4px_currentColor)]">
            <LineChartExp
              values={goldValues}
              xLabels={goldLabels}
              format={(item) => value(item)}
              color="var(--theme-gold)"
              showStats
            />
          </div>
        )}
      </Panel>
      <Panel className={TAB_PANEL_CLASSES.gold}>
        <SectionHeading title="Gold" source="m" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Gold spent totals and per-game averages from match data.
        </p>
        <CombatStatTable
          rows={[
            [
              "Gold earned",
              detail.avgGoldEarned,
              detail.maxGoldEarned,
              detail.totalGoldEarned,
              formatCombatNumber,
              detail.avgGoldEarnedInWins,
              detail.avgGoldEarnedInLosses,
              undefined,
            ],
            [
              "Gold spent",
              detail.avgGoldSpent,
              detail.maxGoldSpent,
              detail.totalGoldSpent,
              formatCombatNumber,
              detail.avgGoldSpentInWins,
              detail.avgGoldSpentInLosses,
              undefined,
            ],
          ]}
        />
      </Panel>
      <Panel className={TAB_PANEL_CLASSES.gold}>
        <SectionHeading title="Lead vs lane opponent" source="d" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Gold and experience differences against your lane opponent.
        </p>
        <div className="grid min-h-40 gap-4 text-xs md:grid-cols-2">
          <div className="min-w-0 overflow-x-auto">
            <EconomyStatTable
              rows={[
                { label: "Gold diff @5", avg: bucketAt(5)?.avgGoldDiffVsLaneOpponent },
                { label: "Gold diff @10", avg: bucketAt(10)?.avgGoldDiffVsLaneOpponent },
                { label: "Gold diff @15", avg: bucketAt(15)?.avgGoldDiffVsLaneOpponent },
                {
                  label: "Gold diff @20",
                  avg: bucketAt(20)?.avgGoldDiffVsLaneOpponent,
                  highlight: (bucketAt(20)?.avgGoldDiffVsLaneOpponent ?? 0) > 0,
                },
                { label: "XP diff @10", avg: bucketAt(10)?.avgXpDiffVsLaneOpponent },
                { label: "XP diff @15", avg: bucketAt(15)?.avgXpDiffVsLaneOpponent },
                {
                  label: "Games ahead @10",
                  avg: timeline?.ahead10 == null ? null : timeline.ahead10 * 100,
                  suffix: "%",
                },
                { label: "Games ahead @15", avg: gamesAhead15, suffix: "%" },
              ]}
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="border-b border-lol-border/50 pb-2 font-semibold text-lol-text">
              Gold diff by minute
            </div>
            <svg
              aria-label="Gold difference at five, ten, fifteen, and twenty minutes"
              className="h-full min-h-32 w-full"
              role="img"
              viewBox="0 0 160 120"
              preserveAspectRatio="none"
            >
              <line x1="80" x2="80" y1="8" y2="112" stroke="currentColor" strokeOpacity="0.25" />
              {leadPoints.map((point, index) => {
                const valueAtPoint = point.value;
                const width = valueAtPoint == null ? 0 : (Math.abs(valueAtPoint) / leadScale) * 68;
                const y = 14 + index * 26;
                return (
                  <g key={point.minute}>
                    <text x="2" y={y + 4} fill="currentColor" fillOpacity="0.7" fontSize="9">
                      {point.minute}m
                    </text>
                    {valueAtPoint != null && (
                      <rect
                        x={valueAtPoint >= 0 ? 80 : 80 - width}
                        y={y - 5}
                        width={width}
                        height="10"
                        rx="3"
                        fill={valueAtPoint >= 0 ? "#22C55E" : "#E5483F"}
                        fillOpacity="0.8"
                      />
                    )}
                    <text
                      x="158"
                      y={y + 4}
                      fill="currentColor"
                      fillOpacity="0.7"
                      fontSize="9"
                      textAnchor="end"
                    >
                      {value(valueAtPoint)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </Panel>
      <Panel className={TAB_PANEL_CLASSES.gold}>
        <SectionHeading title="Levels & XP" source="d" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Final level and average level progression through the game.
        </p>
        <div className="grid min-h-40 gap-4 text-xs md:grid-cols-2">
          <div className="min-w-0 overflow-x-auto">
            <EconomyStatTable
              rows={[
                {
                  label: "Final level",
                  avg: null,
                  best: detail.maxChampLevel,
                  wins: detail.maxChampLevelInWins,
                  losses: detail.maxChampLevelInLosses,
                  digits: 1,
                },
                { label: "Level @5", avg: bucketAt(5)?.avgLevel, digits: 1 },
                { label: "Level @10", avg: bucketAt(10)?.avgLevel, digits: 1 },
                { label: "Level @15", avg: bucketAt(15)?.avgLevel, digits: 1 },
                { label: "Level @20", avg: bucketAt(20)?.avgLevel, digits: 1 },
              ]}
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="border-b border-lol-border/50 pb-2 font-semibold text-lol-text">
              Level progression
            </div>
            <svg
              aria-label="Average level progression from five to twenty minutes"
              className="h-full min-h-32 w-full"
              role="img"
              viewBox="0 0 160 80"
              preserveAspectRatio="none"
            >
              <line x1="14" x2="146" y1="42" y2="42" stroke="currentColor" strokeOpacity="0.25" />
              {levelPoints.map((point, index) => {
                const x = 14 + index * 44;
                const y = point.value == null ? 42 : 66 - (point.value / 18) * 48;
                return (
                  <g key={point.minute}>
                    {index > 0 && levelPoints[index - 1].value != null && point.value != null && (
                      <line
                        x1={x - 44}
                        x2={x}
                        y1={66 - (levelPoints[index - 1].value! / 18) * 48}
                        y2={y}
                        stroke="#C9A45C"
                        strokeOpacity="0.65"
                        strokeWidth="2"
                      />
                    )}
                    {point.value != null && (
                      <circle cx={x} cy={y} r="5" fill="#C9A45C" fillOpacity="0.9" />
                    )}
                    <text
                      x={x}
                      y="76"
                      fill="currentColor"
                      fillOpacity="0.7"
                      fontSize="9"
                      textAnchor="middle"
                    >
                      {point.minute}m
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </Panel>
      <Panel className={TAB_PANEL_CLASSES.gold}>
        <SectionHeading title="Gold lead curve" source="d" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Gold lead progression compared with your lane opponent over time.
        </p>
        {goldLead.length < 2 ? (
          <NoData text="Not enough lane timeline data" />
        ) : (
          <div className="[&_polyline]:[filter:drop-shadow(0_0_4px_currentColor)]">
            <LineChartExp
              values={goldLead}
              format={(item) => value(item)}
              color="var(--theme-gold)"
              showStats
            />
          </div>
        )}
      </Panel>
      <Panel className={TAB_PANEL_CLASSES.gold}>
        <SectionHeading title="XP lead curve" source="d" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Experience lead progression compared with your lane opponent over time.
        </p>
        {xpLead.length < 2 ? (
          <NoData text="Not enough lane timeline data" />
        ) : (
          <div className="[&_polyline]:[filter:drop-shadow(0_0_4px_currentColor)]">
            <LineChartExp
              values={xpLead}
              format={(item) => value(item)}
              color="var(--theme-violet)"
              showStats
            />
          </div>
        )}
      </Panel>
      <Panel className={TAB_PANEL_CLASSES.gold}>
        <SectionHeading title="Gold spending" source="m" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Average gold spent per game from the available match aggregates.
        </p>
        <div className="grid min-h-40 gap-4 md:grid-cols-2">
          <CombatStatTable
            rows={[
              [
                "Gold spent",
                detail.avgGoldSpent,
                detail.maxGoldSpent,
                detail.totalGoldSpent,
                formatCombatNumber,
              ],
              [
                "Gold spent in wins",
                detail.avgGoldSpentInWins,
                detail.maxGoldSpentInWins,
                detail.totalGoldSpentInWins,
                formatCombatNumber,
              ],
              [
                "Gold spent in losses",
                detail.avgGoldSpentInLosses,
                detail.maxGoldSpentInLosses,
                detail.totalGoldSpentInLosses,
                formatCombatNumber,
              ],
            ]}
          />
          <div className="grid grid-cols-2 gap-3 self-start">
            <div className="rounded-md border border-lol-border/50 bg-black/10 p-3">
              <div className="text-[11px] text-lol-text/70">Gold per minute</div>
              <div className="mt-2 text-right text-lg font-semibold tabular-nums text-lol-text-bright">
                {detail.goldPerMin.toFixed(0)}
              </div>
            </div>
            <div className="rounded-md border border-lol-border/50 bg-black/10 p-3">
              <div className="text-[11px] text-lol-text/70">Items per game</div>
              <div className="mt-2 text-right text-lg font-semibold tabular-nums text-lol-text-bright">
                {value(timeline?.itemsBought, 1)}
              </div>
            </div>
          </div>
        </div>
      </Panel>
      <Panel className={TAB_PANEL_CLASSES.gold}>
        <SectionHeading title="Economy by queue" source="m" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Economy-related match counts grouped by queue.
        </p>
        {queueStatsLoading ? (
          <SectionLoading />
        ) : queueRows.length === 0 ? (
          <NoData text="No queue data" />
        ) : (
          <div className="flex flex-col gap-2 text-xs">
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-2 border-b border-lol-border/50 pb-2 font-semibold text-lol-text">
              <span>Queue</span>
              <span className="whitespace-nowrap">Games</span>
              <span className="whitespace-nowrap">Gold/min</span>
              <span className="whitespace-nowrap">Avg gold</span>
              <span className="whitespace-nowrap">CS/min</span>
              <span className="whitespace-nowrap">KDA</span>
            </div>
            {queueRows.map(
              ({ queueId, games, goldPerMin, avgGold, csPerMin, kills, deaths, assists }) => (
                <div
                  key={queueId}
                  className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-2 border-b border-white/[0.04] py-2 text-lol-text-bright transition-colors duration-[120ms] hover:bg-white/[0.025] last:border-b-0"
                >
                  <span>{QUEUE_LABELS[queueId] ?? queueId}</span>
                  <span className="text-right tabular-nums">{games}</span>
                  <span className="text-right tabular-nums">{formatSmallMetric(goldPerMin)}</span>
                  <span className="text-right tabular-nums">{formatSmallMetric(avgGold)}</span>
                  <span className="text-right tabular-nums">{formatSmallMetric(csPerMin)}</span>
                  <span className="text-right tabular-nums">
                    {formatQueueKda(kills, deaths, assists)}
                  </span>
                </div>
              ),
            )}
          </div>
        )}
      </Panel>
      <Panel className={TAB_PANEL_CLASSES.gold}>
        <SectionHeading title="WR by gold lead @15" source="d" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Win rate by your gold lead at 15 minutes.
        </p>
        {timeline?.winrateByGoldLead15 == null ? (
          <EmptyState text="Gold lead outcomes are not available" />
        ) : (
          <div className="grid grid-cols-4 gap-3 text-xs">
            {[
              ["Behind 1000+", timeline.winrateByGoldLead15.behind1000plus, "#E5483F"],
              ["Behind 0–1000", timeline.winrateByGoldLead15.behind0to1000, "#C9A45C"],
              ["Ahead 0–1000", timeline.winrateByGoldLead15.ahead0to1000, "#22C55E"],
              ["Ahead 1000+", timeline.winrateByGoldLead15.ahead1000plus, "#3B82F6"],
            ].map(([label, rate, color]) => (
              <div key={label} className="min-w-0">
                <div className="mb-1 truncate text-center text-[10px] text-lol-text">{label}</div>
                {rate == null ? (
                  <EmptyState text="No games" />
                ) : (
                  <div className="relative pt-4">
                    <span className="absolute inset-x-0 top-0 text-center text-[10px] font-semibold tabular-nums text-lol-text-bright">
                      {(rate as number).toFixed(1)}%
                    </span>
                    <div className="relative h-2 rounded-full bg-black/20">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(0, Math.min(100, rate as number))}%`,
                          backgroundColor: color as string,
                        }}
                      />
                      <div className="absolute bottom-[-3px] left-1/2 top-[-3px] border-l border-lol-text/40" />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
      <Panel className={TAB_PANEL_CLASSES.gold}>
        <SectionHeading title="Gold lead distribution" source="d" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Games in each 15-minute gold-lead bucket.
        </p>
        {timeline?.goldLeadDistribution15 == null ? (
          <EmptyState text="Per-game lead distribution is not available" />
        ) : (
          <div className="grid grid-cols-4 gap-3 text-xs">
            {goldLeadBuckets.map(([label, count, color]) => (
              <div
                key={label}
                className="flex min-w-0 flex-col items-center gap-1 border-b border-white/[0.04] pb-2"
              >
                <span className="w-full truncate text-center text-[10px] text-lol-text">
                  {label}
                </span>
                <div className="flex h-24 w-full items-end overflow-hidden rounded bg-black/20">
                  <div
                    className="w-full rounded-t"
                    style={{
                      height: `${(count / goldLeadMax) * 100}%`,
                      backgroundColor: color,
                      opacity: count === 0 ? 0.2 : 0.9,
                    }}
                  />
                </div>
                <span
                  className={`tabular-nums ${
                    count === 0 ? "text-lol-text/60" : "text-lol-text-bright"
                  }`}
                >
                  {count}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <Panel className={TAB_PANEL_CLASSES.gold}>
        <SectionHeading title="Spending timeline" source="d" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Average item purchases per game by minute.
        </p>
        {timeline?.spendingTimeline == null ? (
          <EmptyState text="Item purchase timeline is not available" />
        ) : (
          <div className="flex h-32 items-end gap-2">
            {timeline.spendingTimeline.map((bucket) => {
              const max = Math.max(
                ...timeline.spendingTimeline!.map((entry) => entry.averageItems ?? 0),
              );
              const height =
                max > 0 && bucket.averageItems != null ? (bucket.averageItems / max) * 100 : 0;
              return (
                <div
                  key={bucket.minute}
                  className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                >
                  <span className="text-[10px] tabular-nums text-lol-text">
                    {bucket.averageItems == null ? "—" : bucket.averageItems.toFixed(1)}
                  </span>
                  <div className="flex h-20 w-full items-end rounded bg-black/20">
                    {bucket.averageItems != null && max > 0 ? (
                      <div
                        className="w-full rounded-t"
                        style={{
                          height: `${height}%`,
                          background:
                            "linear-gradient(to right, rgb(201 164 92 / 40%), rgb(201 164 92 / 95%))",
                        }}
                      />
                    ) : null}
                  </div>
                  <span className="text-[10px] tabular-nums text-lol-text">
                    {bucket.averageItems == null ? "—" : bucket.averageItems.toFixed(1)}
                  </span>
                  <span className="text-[10px] text-lol-text/70">
                    {bucket.minute}–{bucket.minute + 5}m
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

function FarmTab({
  detail,
  baseline,
  detailLoading,
  timeline,
  timelineLoading,
  queueStats,
  queueStatsLoading,
}: {
  detail: ChampionDetailStats | null;
  baseline: ChampionStatBaseline | null;
  detailLoading: boolean;
  timeline: TimelineBucket[] | null;
  timelineLoading: boolean;
  queueStats: Array<{ queueId: number; games: number; wins: number }> | null;
  queueStatsLoading: boolean;
}) {
  if (detailLoading) return <SectionLoading />;
  if (!detail || detail.games === 0) return <NoData text="No data" />;
  if (timelineLoading) return <SectionLoading />;
  const vsOther = (value: number | null | undefined, key: string) =>
    value == null || baseline?.[key] == null ? null : value - baseline[key]!;

  const buckets = timeline ?? [];
  const bucketAt = (minute: number) => buckets.find((bucket) => bucket.minute === minute);
  const csValues = buckets.flatMap((bucket) => (bucket.avgCs == null ? [] : [bucket.avgCs]));
  const csLead = buckets.flatMap((bucket) =>
    bucket.avgCsDiffVsLaneOpponent == null ? [] : [bucket.avgCsDiffVsLaneOpponent],
  );
  const timelineGames = buckets.reduce((sum, bucket) => sum + bucket.sampleGames, 0);
  const value = (number: number | null | undefined, digits = 1) => formatPlain(number, digits);

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <div className="xl:col-span-2">
        <IntroBox legend="Badges show where a number comes from: Match-V5 = Riot match data · Timeline = minute-by-minute data · Derived = calculated by the app · LCU = game client.">
          How well you farm: CS per minute, lead over your opponent, and where your CS comes from.
        </IntroBox>
      </div>
      <div className="xl:col-span-2">
        <SectionHeading title="Key metrics" />
      </div>
      <Panel className={`${TAB_PANEL_CLASSES.emerald} `}>
        <SectionHeading title="Farm snapshot" source="d" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          CS pace, lane advantage, and farming coverage for this champion.
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat
            label="CS/min"
            value={
              detail.avgGameLength > 0
                ? (detail.avgTotalMinionsKilled / (detail.avgGameLength / 60)).toFixed(1)
                : "—"
            }
            sub="Average minions per minute"
            valueClass="text-right tabular-nums"
          />
          <Stat
            label="CS @10"
            value={value(bucketAt(10)?.avgCs)}
            sub="Timeline average"
            valueClass="text-right tabular-nums"
          />
          <Stat
            label="CS diff @15"
            value={value(bucketAt(15)?.avgCsDiffVsLaneOpponent)}
            sub="Versus lane opponent"
            valueClass="text-right tabular-nums"
          />
          <Stat
            label="8+ CS/min games"
            value="—"
            sub="Not available from current data"
            valueClass="text-right tabular-nums"
          />
          <Stat
            label="Jungle share"
            value="—"
            sub="Percentage unavailable"
            valueClass="text-right tabular-nums"
          />
          <Stat
            label="Possible CS @10"
            value="—"
            sub="Not available from current data"
            valueClass="text-right tabular-nums"
          />
        </div>
      </Panel>
      <div className="xl:col-span-2">
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
      </div>
      <div className="xl:col-span-2">
        <SectionHeading title="Detailed statistics" />
      </div>
      <Panel className={TAB_PANEL_CLASSES.emerald}>
        <SectionHeading title="Minion split" source="m" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Lane, allied jungle, and enemy jungle minion totals.
        </p>
        <CombatStatTable
          rows={[
            [
              "Lane minions",
              detail.avgTotalMinionsKilled,
              detail.maxTotalMinionsKilled,
              detail.totalTotalMinionsKilled,
              undefined,
              detail.avgTotalMinionsKilledInWins,
              detail.avgTotalMinionsKilledInLosses,
              vsOther(detail.avgTotalMinionsKilled, "avgTotalMinionsKilledOther"),
            ],
            [
              "Jungle minions (all)",
              detail.avgNeutralMinionsKilled,
              detail.maxNeutralMinionsKilled,
              detail.totalNeutralMinionsKilled,
              undefined,
              detail.avgNeutralMinionsKilledInWins,
              detail.avgNeutralMinionsKilledInLosses,
              vsOther(detail.avgNeutralMinionsKilled, "avgNeutralMinionsKilledOther"),
            ],
            [
              "Jungle minions (enemy)",
              detail.avgNeutralMinionsEnemyJungle,
              detail.maxNeutralMinionsEnemyJungle,
              detail.totalNeutralMinionsEnemyJungle,
              undefined,
              detail.avgNeutralMinionsEnemyJungleInWins,
              detail.avgNeutralMinionsEnemyJungleInLosses,
              vsOther(detail.avgNeutralMinionsEnemyJungle, "avgNeutralMinionsEnemyJungleOther"),
            ],
            [
              "Jungle minions (team)",
              detail.avgNeutralMinionsTeamJungle,
              detail.maxNeutralMinionsTeamJungle,
              detail.totalNeutralMinionsTeamJungle,
              undefined,
              detail.avgNeutralMinionsTeamJungleInWins,
              detail.avgNeutralMinionsTeamJungleInLosses,
              vsOther(detail.avgNeutralMinionsTeamJungle, "avgNeutralMinionsTeamJungleOther"),
            ],
          ]}
        />
      </Panel>
      <Panel className={TAB_PANEL_CLASSES.emerald}>
        <SectionHeading title="CS pace" source="d" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Average minion counts at key minutes throughout the game.
        </p>
        <div className="flex flex-col gap-2 text-xs">
          <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-lol-border/50 pb-2 font-semibold text-lol-text">
            <span>Stat</span>
            <span className="text-right whitespace-nowrap">Avg</span>
          </div>
          {[5, 10, 15, 20, 25, 30].map((minute) => (
            <div
              key={minute}
              className="grid grid-cols-[1fr_auto] gap-3 border-b border-white/[0.04] py-2 text-lol-text-bright transition-colors duration-[120ms] hover:bg-white/[0.025] last:border-b-0"
            >
              <span>CS @{minute}</span>
              <span className="text-right tabular-nums">{value(bucketAt(minute)?.avgCs)}</span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel className={TAB_PANEL_CLASSES.emerald}>
        <SectionHeading title="CS curve" source="d" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Average creep score progression at each available game minute.
        </p>
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
      <Panel className={TAB_PANEL_CLASSES.emerald}>
        <SectionHeading title="CS lead vs lane opponent" source="d" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Creep score advantage compared with your lane opponent over time.
        </p>
        {csLead.length < 2 ? (
          <NoData text="Not enough lane timeline data" />
        ) : (
          <LineChartExp values={csLead} format={(item) => value(item)} color="var(--theme-win)" />
        )}
      </Panel>
      <Panel className={TAB_PANEL_CLASSES.emerald}>
        <SectionHeading title="Jungle share" source="m" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Allied and enemy jungle minions included in your farm totals.
        </p>
        <div className="flex flex-col gap-2 text-xs">
          <div className="flex items-center justify-between border-b border-white/[0.04] py-2 transition-colors duration-[120ms] hover:bg-white/[0.025] last:border-b-0">
            <span className="text-lol-text">Allied jungle</span>
            <span className="text-right tabular-nums text-lol-text-bright">
              {value(detail.avgNeutralMinionsTeamJungle)}
            </span>
          </div>
          <div className="flex items-center justify-between border-b border-white/[0.04] py-2 transition-colors duration-[120ms] hover:bg-white/[0.025] last:border-b-0">
            <span className="text-lol-text">Enemy jungle</span>
            <span className="text-right tabular-nums text-lol-text-bright">
              {value(detail.avgNeutralMinionsEnemyJungle)}
            </span>
          </div>
        </div>
      </Panel>
      <Panel className={TAB_PANEL_CLASSES.emerald}>
        <SectionHeading title="Farm by queue" source="m" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Farming-related match counts grouped by queue.
        </p>
        {queueStatsLoading ? (
          <SectionLoading />
        ) : (queueStats ?? []).length === 0 ? (
          <NoData text="No queue data" />
        ) : (
          <div className="flex flex-col gap-2 text-xs">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 border-b border-lol-border/50 pb-2 font-semibold text-lol-text">
              <span>Queue</span>
              <span className="whitespace-nowrap">Games</span>
              <span className="whitespace-nowrap">CS/min</span>
              <span className="whitespace-nowrap">Avg CS</span>
            </div>
            {(queueStats ?? []).map((row) => (
              <div
                key={row.queueId}
                className="grid grid-cols-[1fr_auto_auto_auto] gap-2 border-b border-white/[0.04] py-2 text-lol-text-bright transition-colors duration-[120ms] hover:bg-white/[0.025] last:border-b-0"
              >
                <span>{QUEUE_LABELS[row.queueId] ?? row.queueId}</span>
                <span className="text-right tabular-nums">{row.games}</span>
                <span className="text-right tabular-nums">—</span>
                <span className="text-right tabular-nums">—</span>
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
        <Panel
          key={title}
          className={`${TAB_PANEL_CLASSES.emerald} ${
            title === "CS per game histogram" ||
            title === "CS by game phase" ||
            title === "Where CS comes from"
              ? "bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.06),transparent_50%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))]"
              : ""
          }`}
        >
          <SectionHeading title={title} source="d" />
          <p className="mb-3 text-[11px] text-lol-text/70">
            Additional farming breakdown unavailable from the stored data.
          </p>
          <NoData text={text} />
        </Panel>
      ))}
    </div>
  );
}

function ObjectivesTab({
  detail,
  baseline,
  detailLoading,
}: {
  detail: ChampionDetailStats | null;
  baseline: ChampionStatBaseline | null;
  detailLoading: boolean;
}) {
  if (detailLoading) return <SectionLoading />;
  if (!detail || detail.games === 0) return <NoData text="No data" />;
  const vsOther = (value: number | null | undefined, key: string) =>
    value == null || baseline?.[key] == null ? null : value - baseline[key]!;

  const objectiveTotal =
    detail.totalTurretKills +
    detail.totalInhibitorKills +
    detail.totalBaronKills +
    detail.totalObjectivesStolen;
  const objectiveDamagePerGame = detail.avgDamageToObjectives + detail.avgDamageToTurrets;

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <div className="xl:col-span-2">
        <IntroBox legend="Badges show where a number comes from: Match-V5 = Riot match data · Timeline = minute-by-minute data · Derived = calculated by the app · LCU = game client.">
          How much you contribute to dragons, barons, heralds and turrets, and what it does for your
          win rate.
        </IntroBox>
      </div>
      <div className="xl:col-span-2">
        <SectionHeading title="Key metrics" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <CombatTile
            label="Objective events / game"
            value={objectiveTotal / detail.games}
            subtitle="turrets, inhibitors, barons and steals"
            accent={CHART_PALETTE[0]}
          />
          <CombatTile
            label="Objective damage / game"
            value={objectiveDamagePerGame}
            subtitle="combined objective and turret damage"
            accent={CHART_PALETTE[1]}
          />
          <CombatTile
            label="First tower rate"
            value={(detail.totalFirstTowerKill / detail.games) * 100}
            subtitle={`${formatPlain(detail.totalFirstTowerKill, 0)} first towers`}
            accent={CHART_PALETTE[2]}
          />
          <CombatTile
            label="First inhibitor rate"
            value={(detail.totalFirstInhibitorKill / detail.games) * 100}
            subtitle={`${formatPlain(detail.totalFirstInhibitorKill, 0)} first inhibitors`}
            accent={CHART_PALETTE[3]}
          />
        </div>
      </div>
      <div className="xl:col-span-2">
        <InsightsPanel
          insights={[
            {
              kind: objectiveTotal > detail.games ? "good" : "info",
              text: `${formatPlain(objectiveTotal, 0)} objective events across ${formatPlain(detail.games, 0)} games.`,
            },
            {
              kind: "info",
              text: `First tower rate is ${(detail.totalFirstTowerKill / detail.games) * 100}% across ${formatPlain(detail.totalFirstTowerKill, 0)} games.`,
            },
          ]}
        />
      </div>
      <div className="xl:col-span-2">
        <SectionHeading title="Detailed statistics" />
      </div>
      <Panel className={TAB_PANEL_CLASSES.sapphire}>
        <SectionHeading title="Turrets & inhibitors" source="m" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Turret, inhibitor, plate, and Baron participation across your games.
        </p>
        <CombatStatTable
          rows={[
            [
              "Turret kills",
              detail.avgTurretKills,
              detail.maxTurretKills,
              detail.totalTurretKills,
              undefined,
              detail.avgTurretKillsInWins,
              detail.avgTurretKillsInLosses,
              vsOther(detail.avgTurretKills, "avgTurretKillsOther"),
            ],
            [
              "Inhibitor kills",
              detail.avgInhibitorKills,
              detail.maxInhibitorKills,
              detail.totalInhibitorKills,
              undefined,
              detail.avgInhibitorKillsInWins,
              detail.avgInhibitorKillsInLosses,
              vsOther(detail.avgInhibitorKills, "avgInhibitorKillsOther"),
            ],
            [
              "Turret plates taken",
              detail.avgTurretPlatesTaken,
              detail.maxTurretPlatesTaken,
              detail.totalTurretPlatesTaken,
              undefined,
              detail.avgTurretPlatesTakenInWins,
              detail.avgTurretPlatesTakenInLosses,
              vsOther(detail.avgTurretPlatesTaken, "avgTurretPlatesTakenOther"),
            ],
            [
              "Baron kills",
              detail.avgBaronKills,
              detail.maxBaronKills,
              detail.totalBaronKills,
              undefined,
              detail.avgBaronKillsInWins,
              detail.avgBaronKillsInLosses,
              vsOther(detail.avgBaronKills, "avgBaronKillsOther"),
            ],
          ]}
        />
      </Panel>

      <Panel className={TAB_PANEL_CLASSES.sapphire}>
        <SectionHeading title="Damage to objectives" source="m" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Damage dealt to major objectives and enemy structures each game.
        </p>
        <CombatStatTable
          rows={[
            [
              "Damage to objectives",
              detail.avgDamageToObjectives,
              detail.maxDamageToObjectives,
              detail.totalDamageToObjectives,
              undefined,
              detail.avgDamageToObjectivesInWins,
              detail.avgDamageToObjectivesInLosses,
              vsOther(detail.avgDamageToObjectives, "avgDamageToObjectivesOther"),
            ],
            [
              "Damage to turrets",
              detail.avgDamageToTurrets,
              detail.maxDamageToTurrets,
              detail.totalDamageToTurrets,
              undefined,
              detail.avgDamageToTurretsInWins,
              detail.avgDamageToTurretsInLosses,
              vsOther(detail.avgDamageToTurrets, "avgDamageToTurretsOther"),
            ],
          ]}
        />
      </Panel>

      <Panel className={`${TAB_PANEL_CLASSES.sapphire} `}>
        <SectionHeading title="First blood objectives" source="m" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          First tower and inhibitor kills or assists, with rates across games.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <CombatTile
            label="First tower kills"
            value={detail.totalFirstTowerKill}
            subtitle={`across ${formatCombatNumber(detail.games)} games (${formatPercent(detail.totalFirstTowerKill, detail.games)})`}
            accent={CHART_PALETTE[0]}
          />
          <CombatTile
            label="First tower assists"
            value={detail.totalFirstTowerAssist}
            subtitle={`across ${formatCombatNumber(detail.games)} games (${formatPercent(detail.totalFirstTowerAssist, detail.games)})`}
            accent={CHART_PALETTE[1]}
          />
          <CombatTile
            label="First inhibitor kills"
            value={detail.totalFirstInhibitorKill}
            subtitle={`across ${formatCombatNumber(detail.games)} games (${formatPercent(detail.totalFirstInhibitorKill, detail.games)})`}
            accent={CHART_PALETTE[2]}
          />
          <CombatTile
            label="First inhibitor assists"
            value={detail.totalFirstInhibitorAssist}
            subtitle={`across ${formatCombatNumber(detail.games)} games (${formatPercent(detail.totalFirstInhibitorAssist, detail.games)})`}
            accent={CHART_PALETTE[3]}
          />
        </div>
      </Panel>

      <Panel className={TAB_PANEL_CLASSES.sapphire}>
        <SectionHeading title="Stolen objectives" source="m" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Objectives stolen and assisted steals recorded across your matches.
        </p>
        <CombatStatTable
          rows={[
            [
              "Objectives stolen",
              detail.avgObjectivesStolen,
              detail.maxObjectivesStolen,
              detail.totalObjectivesStolen,
              undefined,
              detail.avgObjectivesStolenInWins,
              detail.avgObjectivesStolenInLosses,
              vsOther(detail.avgObjectivesStolen, "avgObjectivesStolenOther"),
            ],
            [
              "Objectives stolen assists",
              detail.avgObjectivesStolenAssists,
              detail.maxObjectivesStolenAssists,
              detail.totalObjectivesStolenAssists,
              undefined,
              detail.avgObjectivesStolenAssistsInWins,
              detail.avgObjectivesStolenAssistsInLosses,
              vsOther(detail.avgObjectivesStolenAssists, "avgObjectivesStolenAssistsOther"),
            ],
          ]}
        />
      </Panel>
      <Panel className={TAB_PANEL_CLASSES.sapphire}>
        <SectionHeading title="Unavailable objective detail" source="d" />
        <p className="mb-3 text-[11px] text-lol-text/70">
          Detailed objective timing and team-control metrics are not stored.
        </p>
        <EmptyState text="Objective timing, dragon types, and team control are not stored." />
      </Panel>
    </div>
  );
}

function CombatDamagePanel({
  title,
  accentClass,
  segments,
  rows,
}: {
  title: string;
  accentClass: string;
  segments: [string, number, string][];
  rows: CombatStatTableRow[];
}) {
  const total = segments.reduce((sum, [, value]) => sum + Math.max(value, 0), 0);
  return (
    <Panel className={accentClass}>
      <SectionHeading title={title} />
      <p className="mb-3 text-[11px] text-lol-text/70">
        Damage dealt or taken, split by physical, magic, and true damage.
      </p>
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
  inWins?: number | null,
  inLosses?: number | null,
  vsOther?: number | null,
];

interface EconomyStatTableRow {
  label: string;
  avg?: number | null;
  best?: number | null;
  wins?: number | null;
  losses?: number | null;
  vsOthers?: number | null;
  digits?: number;
  suffix?: string;
  highlight?: boolean;
}

function EconomyStatTable({ rows }: { rows: EconomyStatTableRow[] }) {
  const renderValue = (entry: number | null | undefined, digits: number, suffix = "") =>
    entry == null ? (
      <span className="text-lol-text/40" title="Not tracked yet">
        —
      </span>
    ) : (
      `${formatPlain(entry, digits)}${suffix}`
    );

  return (
    <div className="min-w-[680px] text-xs">
      <div className="grid grid-cols-[minmax(150px,1.4fr)_repeat(5,minmax(76px,1fr))] gap-2 border-b border-lol-border/50 pb-2 font-semibold text-lol-text">
        <span>Stat</span>
        <span className="text-right whitespace-nowrap">Avg / game</span>
        <span className="text-right whitespace-nowrap">Best</span>
        <span className="text-right whitespace-nowrap">Wins</span>
        <span className="text-right whitespace-nowrap">Losses</span>
        <span className="text-right whitespace-nowrap">vs others</span>
      </div>
      {rows.map((row, index) => {
        const digits = row.digits ?? 0;
        const delta = row.vsOthers;
        return (
          <div
            key={row.label}
            className={`grid grid-cols-[minmax(150px,1.4fr)_repeat(5,minmax(76px,1fr))] items-center gap-2 py-2.5 text-lol-text-bright transition-colors duration-[120ms] hover:bg-white/[0.025] ${
              row.highlight ? "bg-[rgba(201,164,92,0.08)]" : ""
            } ${index < rows.length - 1 ? "border-b border-white/[0.04]" : ""}`}
          >
            <span>{row.label}</span>
            <span className="text-right tabular-nums">
              {renderValue(row.avg, digits, row.suffix)}
            </span>
            <span className="text-right tabular-nums">
              {renderValue(row.best, digits, row.suffix)}
            </span>
            <span className="text-right tabular-nums">
              {renderValue(row.wins, digits, row.suffix)}
            </span>
            <span className="text-right tabular-nums">
              {renderValue(row.losses, digits, row.suffix)}
            </span>
            <span className="flex justify-end">
              {delta == null ? (
                <span
                  className="inline-flex items-center rounded bg-lol-card/60 px-1.5 py-0.5 text-xs font-semibold text-lol-text"
                  title="Not tracked yet"
                >
                  —
                </span>
              ) : (
                <span
                  className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-semibold ${
                    delta >= 0
                      ? "bg-[rgba(34,197,94,0.12)] text-[#22C55E]"
                      : "bg-[rgba(229,72,63,0.12)] text-[#E5483F]"
                  }`}
                >
                  <DeltaIndicator positive={delta >= 0} />
                  {delta >= 0 ? "+" : ""}
                  {delta.toFixed(1)}
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CombatStatTable({
  rows,
  deltaIndicators = false,
}: {
  rows: CombatStatTableRow[];
  deltaIndicators?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="grid grid-cols-[minmax(0,1.4fr)_96px_96px_96px_96px_96px] gap-3 border-b border-lol-border/50 pb-2 font-semibold text-lol-text">
        <span>Stat</span>
        <span className="text-right whitespace-nowrap">Avg / game</span>
        <span className="text-right whitespace-nowrap">Best game</span>
        <span className="text-right whitespace-nowrap">In wins</span>
        <span className="text-right whitespace-nowrap">In losses</span>
        <span className="text-right whitespace-nowrap">vs other</span>
      </div>
      {rows.map(([label, avg, best, _total, formatter, inWins, inLosses, vsOther], index) => {
        const format = formatter ?? formatCombatNumber;
        const damageColor =
          label === "Physical"
            ? "#FF8C00"
            : label === "Magic"
              ? "#00D9FF"
              : label === "True"
                ? "#FFFFFF"
                : null;
        const renderBreakdown = (value: number | null | undefined) =>
          value == null ? (
            <span className="text-lol-text/40" title="Not tracked yet">
              —
            </span>
          ) : (
            format(value)
          );
        return (
          <div
            key={label}
            className={`grid grid-cols-[minmax(0,1.4fr)_96px_96px_96px_96px_96px] items-center gap-3 py-2.5 text-lol-text-bright transition-colors duration-[120ms] hover:bg-white/[0.025] ${
              index < rows.length - 1 ? "border-b border-white/[0.04]" : ""
            }`}
          >
            <span className="flex min-w-0 items-center gap-2">
              {damageColor && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: damageColor }}
                />
              )}
              <span>{label}</span>
            </span>
            <span
              className="text-right tabular-nums"
              style={damageColor ? { color: damageColor, opacity: 0.9 } : undefined}
            >
              {format(avg)}
            </span>
            <span
              className="text-right tabular-nums"
              style={damageColor ? { color: damageColor, opacity: 0.9 } : undefined}
            >
              {format(best)}
            </span>
            <span
              className="text-right tabular-nums text-lol-text"
              style={damageColor ? { color: damageColor, opacity: 0.9 } : undefined}
            >
              {renderBreakdown(inWins)}
            </span>
            <span
              className="text-right tabular-nums text-lol-text"
              style={damageColor ? { color: damageColor, opacity: 0.9 } : undefined}
            >
              {renderBreakdown(inLosses)}
            </span>
            <span
              className="text-right tabular-nums text-lol-text"
              style={damageColor ? { color: damageColor, opacity: 0.9 } : undefined}
            >
              {deltaIndicators && vsOther != null ? (
                <span
                  className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-semibold ${
                    vsOther >= 0
                      ? "bg-[rgba(34,197,94,0.12)] text-[#22C55E]"
                      : "bg-[rgba(229,72,63,0.12)] text-[#E5483F]"
                  }`}
                >
                  <DeltaIndicator positive={vsOther >= 0} />
                  {vsOther >= 0 ? "+" : ""}
                  {vsOther.toFixed(1)}
                </span>
              ) : (
                renderBreakdown(vsOther)
              )}
            </span>
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
  accent,
}: {
  label: string;
  value: number | null | undefined;
  subtitle: string;
  accent?: string;
}) {
  return (
    <div
      className="rounded-lg border border-lol-border border-t-[3px] bg-black/10 p-3"
      style={
        accent
          ? {
              borderTopColor: accent,
              backgroundImage: `radial-gradient(circle at top right, ${accent}1a, transparent 65%)`,
              boxShadow: `0 0 8px 0 ${accent}26`,
            }
          : undefined
      }
    >
      <span className="text-xs text-lol-text">{label}</span>
      <b className="mt-1 block font-display text-2xl text-lol-text-bright">
        {formatCombatNumber(value)}
      </b>
      <span className="mt-1 block text-[11px] text-lol-text">{subtitle}</span>
    </div>
  );
}

function formatCombatNumber(value: number | null | undefined) {
  return formatPlain(value, 2);
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
  className,
  hint,
  legend,
  sort,
  options,
  onSortChange,
  loading,
  empty,
  placeholderNote = false,
  unifiedRows = false,
  children,
}: {
  title: string;
  source?: keyof typeof SOURCE_LABELS;
  className?: string;
  hint?: string;
  legend?: string;
  sort: RateSort;
  options: [RateSort, string][];
  onSortChange: (sort: RateSort) => void;
  loading: boolean;
  empty: boolean;
  placeholderNote?: boolean;
  unifiedRows?: boolean;
  children: ReactNode;
}) {
  return (
    <Panel className={className}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SectionHeading title={title} source={source} />
        <SortButtons value={sort} options={options} onChange={onSortChange} />
      </div>
      {hint && <p className="mb-3 text-[11px] text-lol-text/70">{hint}</p>}
      {legend && (
        <p className="mb-3 text-[10px] uppercase tracking-wider text-lol-text/50">{legend}</p>
      )}
      {loading ? (
        <SectionLoading />
      ) : empty ? (
        <NoData />
      ) : (
        <>
          <div
            className={`scroll-themed flex max-h-[340px] flex-col overflow-y-auto ${
              unifiedRows ? "divide-y divide-white/[0.04]" : "gap-2"
            }`}
          >
            {children}
          </div>
          {placeholderNote && (
            <p className="mt-2 text-[11px] text-lol-text/60">
              — = not tracked in the current data scope
            </p>
          )}
        </>
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
  emptySub = false,
  valueClass = "",
  sparkValues,
  miniViz,
  accent: accentOverride,
  glow = false,
  large = false,
}: {
  label: string;
  value: string;
  sub: string;
  emptySub?: boolean;
  valueClass?: string;
  sparkValues?: Array<number | null>;
  miniViz?: ReactNode;
  accent?: string;
  glow?: boolean;
  large?: boolean;
}) {
  const statIndex = Math.max(
    0,
    STAT_LABEL_ORDER.findIndex((entry) => entry === label),
  );
  const accent = accentOverride ?? CHART_PALETTE[statIndex % CHART_PALETTE.length];
  return (
    <div
      className={`relative rounded-xl border border-lol-border border-t-[3px] bg-black/10 ${
        large ? "px-[22px] py-5" : "px-[18px] py-4"
      }`}
      style={{
        borderTopColor: accent,
        backgroundImage: `radial-gradient(circle at top right, ${accent}1a, transparent 65%)`,
        boxShadow: glow ? `0 0 8px 0 ${accent}26` : undefined,
      }}
    >
      {sparkValues && (
        <div className="pointer-events-none absolute right-2.5 top-2.5">
          <Sparkline values={sparkValues} width={72} height={28} />
        </div>
      )}
      {miniViz && <div className="pointer-events-none absolute right-2.5 top-2.5">{miniViz}</div>}
      <span className="flex items-center gap-1.5 text-[12.5px] uppercase tracking-wider text-lol-text">
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
        {label}
      </span>
      <b
        className={`my-0.5 block font-display font-bold leading-tight text-lol-text-bright ${
          large ? "text-[28px]" : "text-[26px]"
        } ${valueClass}`}
      >
        {value}
      </b>
      {sub &&
        (emptySub ? (
          <EmptyState text={sub} />
        ) : (
          <div className="text-[12px] text-lol-text">{sub}</div>
        ))}
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

function IntroBox({ children, legend }: { children: ReactNode; legend: string }) {
  return (
    <div className="rounded-lg border border-lol-border bg-lol-card/40 px-4 py-3">
      <div className="text-sm text-lol-text-bright">{children}</div>
      <div className="mt-1 text-xs text-lol-text">{legend}</div>
    </div>
  );
}

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
function InsightsPanel({
  items,
  insights,
}: {
  items?: Insight[];
  insights?: Insight[];
}): ReactElement {
  const insightStyles: Record<Insight["kind"], { background: string; border: string }> = {
    good: { background: "rgba(34,197,94,0.08)", border: "#22C55E" },
    warn: { background: "rgba(201,164,92,0.08)", border: "#C9A45C" },
    info: { background: "rgba(148,163,184,0.06)", border: "#94A3B8" },
    bad: { background: "rgba(229,72,63,0.08)", border: "#E5483F" },
  };

  return (
    <div className="flex flex-col gap-2">
      {(items ?? insights ?? []).map((insight, index) => (
        <div
          key={`${insight.kind}-${index}`}
          className="rounded-r-lg px-3 py-2 text-xs text-lol-text-bright"
          style={{
            backgroundColor: insightStyles[insight.kind].background,
            borderLeft: `3px solid ${insightStyles[insight.kind].border}`,
          }}
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
    <div className="relative mb-4 flex items-baseline justify-between gap-3">
      <h2 className="flex items-center gap-2 font-display text-[16px] font-semibold text-lol-text-bright">
        <span
          className="h-2 w-2 shrink-0 rotate-45 bg-[#E5483F] shadow-[0_0_6px_0_rgba(229,72,63,0.45)]"
          aria-hidden="true"
        />
        <span>{title}</span>
        {source && <SourceBadge kind={source} />}
      </h2>
      {aside && <span className="text-[12px] text-lol-text">{aside}</span>}
      <span
        className="pointer-events-none absolute bottom-[-6px] left-0 h-px w-2/5 bg-gradient-to-r from-[#E5483F]/35 to-transparent"
        aria-hidden="true"
      />
    </div>
  );
}

function SectionLoading() {
  return <p className="py-3 text-sm text-lol-text">Loading…</p>;
}

function NoData({ text = "No data" }: { text?: string }) {
  return <span className="text-[12.5px] text-lol-text">{text}</span>;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-white/[0.08] bg-white/[0.02] px-4 py-3 text-lol-text/70">
      <span className="mr-2" aria-hidden="true">
        ⓘ
      </span>
      {text}
    </div>
  );
}

function RoleRow({
  role,
  games,
  wins,
  kills,
  deaths,
  assists,
  baseline,
}: ChampionRoleStat & { baseline?: number | null; detailed?: boolean }) {
  const rate = games > 0 ? (wins / games) * 100 : 0;
  const delta = baseline == null ? null : rate - baseline;
  const rateColor =
    delta != null && delta >= 2
      ? "text-lol-win"
      : delta != null && delta <= -2
        ? "text-lol-loss"
        : "text-lol-text";
  const unknown = role === "UNKNOWN";
  return (
    <div
      className={`grid grid-cols-[28px_minmax(180px,1fr)_64px_100px_72px] items-center gap-2 rounded-lg px-3 py-2.5 transition-colors duration-[120ms] hover:bg-white/[0.025] ${unknown ? "text-lol-text/50" : ""}`}
    >
      <RoleIcon role={role} />
      <div className="min-w-0">
        <span
          className={`block truncate whitespace-nowrap text-xs font-semibold ${unknown ? "text-lol-text/50" : "text-lol-text-bright"}`}
        >
          {unknown ? "role not recorded (older games)" : role}
        </span>
        <span
          className="block truncate text-xs tabular-nums text-lol-text"
          title={kills == null || deaths == null || assists == null ? "Not tracked yet" : undefined}
        >
          {formatOptionalKda(kills, deaths, assists)}
        </span>
      </div>
      <span className="text-right text-xs tabular-nums text-lol-text">{games}</span>
      <div className="flex h-2.5 w-[100px] min-w-0 overflow-hidden">
        <div className={`w-full ${games < 3 ? "opacity-40 grayscale" : ""}`}>
          <WinRateBar wins={wins} total={games} showPercent={false} />
        </div>
      </div>
      <div className="flex min-w-[76px] flex-col items-end justify-center gap-0.5">
        <span className={`text-right text-sm font-semibold tabular-nums ${rateColor}`}>
          {rate.toFixed(1)}%
        </span>
        <span
          className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded px-1.5 py-0.5 text-right text-xs font-semibold ${
            delta == null
              ? "bg-lol-card/60 text-lol-text"
              : delta >= 0
                ? "bg-[rgba(34,197,94,0.12)] text-[#22C55E]"
                : "bg-[rgba(229,72,63,0.12)] text-[#E5483F]"
          }`}
          title={delta == null ? "Not tracked yet" : undefined}
        >
          {delta == null ? (
            "—"
          ) : (
            <>
              <DeltaIndicator positive={delta >= 0} />
              {delta >= 0 ? "+" : ""}
              {delta.toFixed(1)}
            </>
          )}
        </span>
      </div>
    </div>
  );
}

function RoleIcon({ role }: { role: string }) {
  const label = role === "UNKNOWN" ? "?" : role.slice(0, 1);
  const accent =
    role === "MIDDLE"
      ? { color: "#C9A45C", background: "rgba(201,164,92,0.15)" }
      : role === "TOP"
        ? { color: "#E5483F", background: "rgba(229,72,63,0.15)" }
        : role === "BOTTOM"
          ? { color: "#22C55E", background: "rgba(34,197,94,0.15)" }
          : role === "JUNGLE"
            ? { color: "#3B82F6", background: "rgba(59,130,246,0.15)" }
            : { color: "#94A3B8", background: "rgba(148,163,184,0.15)" };
  return (
    <svg aria-hidden="true" className="h-6 w-6 shrink-0" viewBox="0 0 24 24" role="img">
      <rect x="1" y="1" width="22" height="22" rx="5" fill={accent.background} />
      <text x="12" y="16" fill={accent.color} fontSize="11" fontWeight="700" textAnchor="middle">
        {label}
      </text>
    </svg>
  );
}

function formatOptionalKda(kills?: number, deaths?: number, assists?: number) {
  if (kills == null || deaths == null || assists == null) return "—";
  return `${kills.toFixed(1)} / ${deaths.toFixed(1)} / ${assists.toFixed(1)}`;
}

function formatRowKda(row: { kills?: number; deaths?: number; assists?: number; games: number }) {
  if (row.games < 3) return "—";
  return formatOptionalKda(row.kills, row.deaths, row.assists);
}

function formatSmallMetric(value?: number | null) {
  return value == null ? "—" : value.toFixed(1);
}

function formatBuyTime(seconds: number) {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function DeltaIndicator({ positive }: { positive: boolean }) {
  return (
    <svg aria-hidden="true" className="h-2 w-2 shrink-0" viewBox="0 0 8 8" fill="currentColor">
      <polygon points={positive ? "0,8 4,0 8,8" : "0,0 4,8 8,0"} />
    </svg>
  );
}

function RateRow({
  icon,
  iconAccent,
  iconSize = 24,
  name,
  wins,
  total,
  count,
  baseline,
  sampleSize,
  secondary,
}: {
  icon: ReactNode;
  iconAccent?: string;
  iconSize?: number;
  name: string;
  wins: number;
  total: number;
  count: string;
  baseline?: number | null;
  sampleSize?: number;
  secondary?: string;
}) {
  const rate = total > 0 ? (wins / total) * 100 : 0;
  const delta = baseline == null ? null : rate - baseline;
  const deltaClass =
    delta != null && delta >= 0
      ? "text-lol-win"
      : delta != null
        ? "text-lol-loss"
        : "text-lol-text";
  const sparse = sampleSize != null && sampleSize < 3;
  return (
    <div className="grid grid-cols-[28px_minmax(180px,1fr)_64px_100px_72px] items-center gap-2 rounded-lg px-3 py-2.5 transition-colors duration-[120ms] hover:bg-white/[0.025]">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center">
        {iconAccent ? (
          <span
            className="flex shrink-0 items-center justify-center overflow-hidden rounded-md border"
            style={{
              width: iconSize,
              height: iconSize,
              borderColor: `${iconAccent}59`,
              boxShadow: `0 0 8px 0 ${iconAccent}33`,
            }}
          >
            {icon}
          </span>
        ) : (
          icon
        )}
      </div>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] text-lol-text-bright">{name}</span>
        <span
          className="block min-h-4 truncate text-xs text-lol-text"
          title={secondary?.includes("—") ? "Not tracked yet" : undefined}
        >
          {secondary ?? "\u00a0"}
        </span>
      </div>
      <div className="flex w-16 flex-col items-end justify-center">
        <span className="text-right text-[11px] tabular-nums text-lol-text">{count}</span>
        {sparse && (
          <span className="rounded border border-lol-border/60 px-1 py-0.5 text-[9px] text-lol-text">
            n&lt;3
          </span>
        )}
      </div>
      <div className={`w-[100px] ${sparse ? "opacity-40 grayscale" : ""}`}>
        <WinRateBar wins={wins} total={total} showPercent={false} />
      </div>
      <div className="flex w-[72px] flex-col items-end justify-center gap-0.5">
        <span
          className={`text-right text-sm font-semibold tabular-nums ${baseline == null ? (rate >= 50 ? "text-lol-win" : "text-lol-loss") : deltaClass}`}
        >
          {rate.toFixed(1)}%
        </span>
        <span
          className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded px-1 py-0.5 text-xs font-semibold ${
            delta == null
              ? "bg-lol-card/60 text-lol-text"
              : delta >= 0
                ? "bg-[rgba(34,197,94,0.12)] text-[#22C55E]"
                : "bg-[rgba(229,72,63,0.12)] text-[#E5483F]"
          }`}
          title={delta == null ? "Not tracked yet" : undefined}
        >
          {delta == null ? (
            "—"
          ) : (
            <>
              <DeltaIndicator positive={delta >= 0} />
              {delta >= 0 ? "+" : ""}
              {delta.toFixed(1)}
            </>
          )}
        </span>
      </div>
    </div>
  );
}
