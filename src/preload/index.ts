import { contextBridge, ipcRenderer } from "electron";
import type {
  BackfillProgress,
  BackfillResult,
  ChampionChallengeAggregates,
  ChampionDetailStats,
  ActivityHeatmapDay,
  ChampionStatBaseline,
  ChampionKillDeathPosition,
  ChampionRoleStat,
  ChampionTimelineAverages,
  ChampionWeeklyMetrics,
  ElectronAPI,
  LcuStatus,
  MatchFilters,
  RiotSyncResult,
  RiotSyncOptions,
  RiotSyncProgress,
  RiotAccountConfig,
  ResolvedPlatform,
  RestoreOlderGamesResult,
  HomeAccountFilter,
  HomeTimePeriod,
  TimelineBackfillProgress,
  ExportProgress,
  ImportProgress,
  OwnedItemStats,
  OwnedItemStatsResult,
  BackfillTeamsLocalResult,
  BackfillTimelineLocalResult,
  ChampionTeamObjectives,
} from "../shared/api";

// Annotated rather than inferred, so the compiler checks this object against
// the contract the renderer calls through. Written freehand the two could
// disagree silently, and the disagreement surfaces as a call failing at
// runtime instead of as a build error.
//
// The annotation is also what gives call sites their return types: every
// method here returns ipcRenderer.invoke(...), which is Promise<any>.
const api: ElectronAPI = {
  getMatchHistory: (limit: number, offset: number, filters?: MatchFilters) =>
    ipcRenderer.invoke("db:match-history", limit, offset, filters),

  getMatchFilterOptions: (
    filters?: Pick<MatchFilters, "championId" | "patch" | "queue" | "account">,
  ) => ipcRenderer.invoke("db:match-filters", filters),

  getStoredQueues: () => ipcRenderer.invoke("db:stored-queues"),

  getMatchDetail: (gameId: number) => ipcRenderer.invoke("db:match-detail", gameId),

  getTimeline: (gameId: number) => ipcRenderer.invoke("db:timeline-get", gameId),

  getChampionTimelineAverages: (
    championId: number | null,
    patch?: string,
    queue?: number,
    account?: string,
  ): Promise<ChampionTimelineAverages> =>
    ipcRenderer.invoke("db:champion-timeline-averages", championId, patch, queue, account),

  getChampionKillDeathPositions: (
    championId: number,
    limit?: number,
    account?: string,
  ): Promise<ChampionKillDeathPosition[]> =>
    ipcRenderer.invoke("db:champion-kill-death-positions", championId, limit, account),

  reparseTimelines: (limit: number): Promise<number> =>
    ipcRenderer.invoke("db:timeline-reparse", limit),

  backfillTeamsLocal: (options?: { limit?: number }): Promise<BackfillTeamsLocalResult> =>
    ipcRenderer.invoke("db:backfill-teams-local", options),

  backfillTimelineLocal: (options?: { limit?: number }): Promise<BackfillTimelineLocalResult> =>
    ipcRenderer.invoke("db:backfill-timeline-local", options),

  timelineBackfillStart: (options: { limit: number }) =>
    ipcRenderer.invoke("db:timeline-backfill-start", options),

  timelineBackfillStatus: (): Promise<TimelineBackfillProgress | null> =>
    ipcRenderer.invoke("db:timeline-backfill-status"),

  timelineBackfillStop: (): Promise<{ stopped: boolean }> =>
    ipcRenderer.invoke("db:timeline-backfill-stop"),

  onTimelineBackfillProgress: (callback: (progress: TimelineBackfillProgress) => void) => {
    const handler = (_event: unknown, progress: TimelineBackfillProgress) => callback(progress);
    ipcRenderer.on("db:timeline-backfill-progress", handler);
    return () => ipcRenderer.removeListener("db:timeline-backfill-progress", handler);
  },

  onExportProgress: (callback: (progress: ExportProgress) => void) => {
    const handler = (_event: unknown, progress: ExportProgress) => callback(progress);
    ipcRenderer.on("data:export-progress", handler);
    return () => ipcRenderer.removeListener("data:export-progress", handler);
  },

  onImportProgress: (callback: (progress: ImportProgress) => void) => {
    const handler = (_event: unknown, progress: ImportProgress) => callback(progress);
    ipcRenderer.on("data:import-progress", handler);
    return () => ipcRenderer.removeListener("data:import-progress", handler);
  },

  onTimelineBackfillDone: (
    callback: (payload: { cancelled: boolean; progress: TimelineBackfillProgress | null }) => void,
  ) => {
    const handler = (
      _event: unknown,
      payload: { cancelled: boolean; progress: TimelineBackfillProgress | null },
    ) => callback(payload);
    ipcRenderer.on("db:timeline-backfill-done", handler);
    return () => ipcRenderer.removeListener("db:timeline-backfill-done", handler);
  },

  toggleFavorite: (gameId: number) => ipcRenderer.invoke("db:toggle-favorite", gameId),

  getChampionStats: (
    patch?: string,
    queue?: number,
    account?: string,
    timePeriod?: HomeTimePeriod,
  ) => ipcRenderer.invoke("db:champion-stats", patch, queue, account, timePeriod),

  getActivityHeatmap: (
    account?: string,
    timePeriod?: HomeTimePeriod,
    queue?: number,
  ): Promise<ActivityHeatmapDay[]> =>
    ipcRenderer.invoke("db:activity-heatmap", account, timePeriod, queue),

  getChampionDetailStats: (
    championId: number | null,
    patch?: string,
    queue?: number,
    account?: string,
    timePeriod?: HomeTimePeriod,
  ): Promise<ChampionDetailStats> =>
    ipcRenderer.invoke("db:champion-detail-stats", championId, patch, queue, account, timePeriod),

  getChampionChallengeAggregates: (
    puuid: string,
    championId: number,
  ): Promise<ChampionChallengeAggregates> =>
    ipcRenderer.invoke("db:get-champion-challenge-aggregates", puuid, championId),

  getChampionTeamObjectives: (puuid: string, championId: number): Promise<ChampionTeamObjectives> =>
    ipcRenderer.invoke("db:get-champion-team-objectives", puuid, championId),

  getChampionStatBaseline: (
    championId: number,
    patch?: string,
    queue?: number,
    account?: string,
  ): Promise<ChampionStatBaseline> =>
    ipcRenderer.invoke("db:champion-stat-baseline", championId, patch, queue, account),

  getChampionQueueStats: (championId: number | null, account?: string, queue?: number) =>
    ipcRenderer.invoke("db:champion-queue-stats", championId, account, queue),

  getChampionRoleStats: (
    championId: number | null,
    patch?: string,
    queue?: number,
    account?: string,
    timePeriod?: HomeTimePeriod,
  ): Promise<ChampionRoleStat[]> =>
    ipcRenderer.invoke("db:champion-role-stats", championId, patch, queue, account, timePeriod),

  getChampionKeystones: (
    championId: number | null,
    account?: string,
    timePeriod?: HomeTimePeriod,
    queue?: number,
  ) => ipcRenderer.invoke("db:champion-keystones", championId, account, timePeriod, queue),

  getChampionRuneStats: (
    championId: number | null,
    patch?: string,
    queue?: number,
    account?: string,
  ) => ipcRenderer.invoke("db:champion-rune-stats", championId, patch, queue, account),

  getChampionWeeklyWinRate: (championId: number | null, account?: string, queue?: number) =>
    ipcRenderer.invoke("db:champion-weekly-winrate", championId, account, queue),

  getChampionWeeklyMetrics: (
    championId: number,
    patch?: string,
    queue?: string,
    account?: string,
  ): Promise<ChampionWeeklyMetrics[]> =>
    ipcRenderer.invoke("db:champion-weekly-metrics", championId, patch, queue, account),

  getChampionMatchupList: (
    championId: number | null,
    patch?: string,
    queue?: number,
    account?: string,
    timePeriod?: HomeTimePeriod,
  ) =>
    ipcRenderer.invoke("db:champion-matchup-list", championId, patch, queue, account, timePeriod),

  getChampionAllyStats: (
    championId: number | null,
    patch?: string,
    queue?: number,
    account?: string,
    timePeriod?: HomeTimePeriod,
  ) => ipcRenderer.invoke("db:champion-ally-stats", championId, patch, queue, account, timePeriod),

  getOtherPlayersStats: (queue?: number) => ipcRenderer.invoke("db:other-players-stats", queue),

  getAugmentStats: (
    championId?: number,
    patch?: string,
    queue?: number,
    account?: string,
    timePeriod?: HomeTimePeriod,
  ) => ipcRenderer.invoke("db:augment-stats", championId, patch, queue, account, timePeriod),

  getAugmentDetail: (augmentId: number, patch?: string, queue?: number, account?: string) =>
    ipcRenderer.invoke("db:augment-detail", augmentId, patch, queue, account),

  getAugmentStatsDetailed: (patch?: string, queue?: number, account?: string) =>
    ipcRenderer.invoke("db:augment-stats-detailed", patch, queue, account),

  getDashboard: (
    filters?: Pick<MatchFilters, "championId" | "patch" | "queue" | "account" | "timePeriod">,
  ) => ipcRenderer.invoke("db:dashboard", filters),

  getHomeDashboard: (
    account: HomeAccountFilter,
    timePeriod: HomeTimePeriod,
    queue: number | number[] | undefined,
  ) => ipcRenderer.invoke("db:home-dashboard", account, timePeriod, queue),

  getHomeMatchList: (
    account: HomeAccountFilter,
    queue: number | number[] | undefined,
    limit: number,
  ) => ipcRenderer.invoke("db:home-match-list", account, queue, limit),

  getChampionMatchHistory: (
    championId: number | null,
    limit: number,
    offset: number,
    patch?: string,
    queue?: number,
    account?: string,
    timePeriod?: HomeTimePeriod,
  ) =>
    ipcRenderer.invoke(
      "db:champion-match-history",
      championId,
      limit,
      offset,
      patch,
      queue,
      account,
      timePeriod,
    ),

  getChampionRecords: (
    championId: number | null,
    patch?: string,
    queue?: number,
    account?: string,
    timePeriod?: HomeTimePeriod,
  ) => ipcRenderer.invoke("db:champion-records", championId, patch, queue, account, timePeriod),

  refreshGames: () => ipcRenderer.invoke("lcu:refresh"),

  syncRiotHistory: (options?: RiotSyncOptions): Promise<RiotSyncResult | { error: string }> =>
    ipcRenderer.invoke("riot:sync", options),
  riotCancelSync: (): Promise<{ cancelled: true }> => ipcRenderer.invoke("riot:cancel-sync"),
  onRiotSyncProgress: (callback: (progress: RiotSyncProgress) => void) => {
    const handler = (_event: unknown, progress: RiotSyncProgress) => callback(progress);
    ipcRenderer.on("riot:sync-progress", handler);
    return () => ipcRenderer.removeListener("riot:sync-progress", handler);
  },
  getProfileData: (gameName: string, tagLine: string, platform: string, force = false) =>
    ipcRenderer.invoke("riot:profile", gameName, tagLine, platform, force),
  listRiotAccounts: (): Promise<RiotAccountConfig[]> => ipcRenderer.invoke("riot:list-accounts"),
  removeRiotAccount: (id: string): Promise<RiotAccountConfig[]> =>
    ipcRenderer.invoke("riot:remove-account", { id }),

  backfillHistory: (forceFull = false) => ipcRenderer.invoke("lcu:backfill", forceFull),
  syncAccountHistory: (puuid: string) => ipcRenderer.invoke("backfill:sync-account", puuid),

  cancelBackfill: () => ipcRenderer.invoke("lcu:cancel-backfill"),

  isBackfillRunning: () => ipcRenderer.invoke("lcu:backfill-running"),

  onBackfillDone: (callback: (result: BackfillResult | { error: string }) => void) => {
    const handler = (_event: unknown, result: BackfillResult | { error: string }) =>
      callback(result);
    ipcRenderer.on("lcu:backfill-done", handler);
    return () => ipcRenderer.removeListener("lcu:backfill-done", handler);
  },

  onBackfillProgress: (callback: (progress: BackfillProgress) => void) => {
    const handler = (_event: unknown, progress: BackfillProgress) => callback(progress);
    ipcRenderer.on("lcu:backfill-progress", handler);
    return () => ipcRenderer.removeListener("lcu:backfill-progress", handler);
  },

  getLcuStatus: () => ipcRenderer.invoke("lcu:status"),
  getLiveGame: () => ipcRenderer.invoke("lcu:live-game"),
  getLiveFull: () => ipcRenderer.invoke("lcu:live-full"),
  getLiveSession: () => ipcRenderer.invoke("lcu:live-session"),
  getStatRecords: (filters?: { championId?: number; stat?: string; queueId?: number }) =>
    ipcRenderer.invoke("stats:records", filters),
  getGameStatPeaks: (gameId: number) => ipcRenderer.invoke("stats:game-peaks", gameId),
  getGameLiveData: (gameId: number) => ipcRenderer.invoke("stats:game-live", gameId),
  getPostGameData: () => ipcRenderer.invoke("stats:post-game"),
  getChampionDataVersion: () => ipcRenderer.invoke("dragon:version"),

  getChampionData: () => ipcRenderer.invoke("dragon:champions"),

  getQueueNames: () => ipcRenderer.invoke("dragon:queue-names"),

  getAugmentData: (patch?: string) => ipcRenderer.invoke("dragon:augments", patch),

  resolveAugmentIcon: (id: number, patch?: string) =>
    ipcRenderer.invoke("dragon:augment-icon", id, patch),
  cacheDragonAsset: (remoteUrl: string) => ipcRenderer.invoke("dragon:asset-cache", remoteUrl),
  getItemData: (patch?: string) => ipcRenderer.invoke("dragon:items", patch),

  getSummonerSpellData: () => ipcRenderer.invoke("dragon:summoner-spells"),

  getChampionItemStats: (
    championId: number | null,
    patch?: string,
    queue?: number,
    account?: string,
  ) => ipcRenderer.invoke("db:champion-item-stats", championId, patch, queue, account),

  getChampionSkillOrders: (championId: number, patch?: string, queue?: number, account?: string) =>
    ipcRenderer.invoke("db:champion-skill-orders", championId, patch, queue, account),

  getTeammateStats: (queue?: number, relation?: "friends" | "enemies") =>
    ipcRenderer.invoke("db:teammate-stats", queue, relation),
  getTeammateGroups: (queue?: number) => ipcRenderer.invoke("db:teammate-groups", queue),
  getMatchInsights: (queue?: number, account?: string) =>
    ipcRenderer.invoke("db:match-insights", queue, account),

  getTeammateChampions: (queue?: number, relation?: "friends" | "enemies") =>
    ipcRenderer.invoke("db:get-teammate-champions", queue, relation),

  getTeammateDetail: (key: string, queue?: number, relation?: "friends" | "enemies") =>
    ipcRenderer.invoke("db:teammate-detail", key, queue, relation),
  getOwnedItemStats: (
    patch?: string,
    queue?: number,
    account?: string,
  ): Promise<OwnedItemStatsResult & OwnedItemStats[]> =>
    ipcRenderer.invoke("db:owned-item-stats", patch, queue, account),
  getOwnedRuneStats: (queue?: number, patch?: string, account?: string) =>
    ipcRenderer.invoke("db:owned-rune-stats", queue, patch, account),
  getRuneData: () => ipcRenderer.invoke("dragon:runes"),
  getRuneTrees: () => ipcRenderer.invoke("dragon:rune-trees"),
  getOwnedItemDetail: (itemIds: number[], patch?: string, queue?: number, account?: string) =>
    ipcRenderer.invoke("db:owned-item-detail", itemIds, patch, queue, account),

  getTrends: (
    queue?: number,
    account?: string,
    timePeriod?: "4w" | "12w" | "6m" | "all",
    patch?: string,
  ) => ipcRenderer.invoke("db:trends", queue, account, timePeriod, patch),

  getRecords: (queue?: number, account?: string) =>
    ipcRenderer.invoke("db:records", queue, account),

  getGlobalChampionDetail: (
    championId: number | null,
    patch?: string,
    queue?: number,
    account?: string,
    timePeriod?: HomeTimePeriod,
  ) =>
    ipcRenderer.invoke("db:global-champion-detail", championId, patch, queue, account, timePeriod),

  getAllSummonerPuuids: () => ipcRenderer.invoke("db:all-summoner-puuids"),
  listAccountsWithData: () => ipcRenderer.invoke("db:list-accounts"),
  getResolvedPlatform: (): Promise<ResolvedPlatform | { error: string }> =>
    ipcRenderer.invoke("db:get-resolved-platform"),
  getAccountSnapshot: (puuid: string) => ipcRenderer.invoke("db:get-account-snapshot", puuid),
  getCurrentPuuid: () => ipcRenderer.invoke("lcu:current-puuid"),

  getSavedSummoners: () => ipcRenderer.invoke("db:saved-summoners"),
  mergeDuplicateAccounts: () => ipcRenderer.invoke("db:merge-duplicate-accounts"),
  deleteSummoner: (puuid: string) => ipcRenderer.invoke("db:delete-summoner", puuid),

  getProfile: () => ipcRenderer.invoke("db:profile"),
  getCurrentSummonerProfileIcon: () => ipcRenderer.invoke("lcu:current-summoner-icon"),
  getCurrentSummoner: () => ipcRenderer.invoke("lcu:current-summoner"),
  getProfileExtras: () => ipcRenderer.invoke("lcu:profile-extras"),
  getDebugEnabled: () => ipcRenderer.invoke("dbg:get"),
  setDebugEnabled: (enabled: boolean) => ipcRenderer.invoke("dbg:set", enabled),

  onStatusChanged: (callback: (status: LcuStatus) => void) => {
    const handler = (_event: unknown, status: LcuStatus) => callback(status);
    ipcRenderer.on("lcu:status-changed", handler);
    return () => ipcRenderer.removeListener("lcu:status-changed", handler);
  },

  onGamesUpdated: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("lcu:games-updated", handler);
    return () => ipcRenderer.removeListener("lcu:games-updated", handler);
  },

  getSetting: (key: string) => ipcRenderer.invoke("settings:get", key),

  isAutoStartSupported: () => ipcRenderer.invoke("autostart:supported"),

  setSetting: (key: string, value: string) => ipcRenderer.invoke("settings:set", key, value),

  exportData: () => ipcRenderer.invoke("data:export"),
  getDbStats: () => ipcRenderer.invoke("data:get-db-stats"),
  getAchievementTotals: (queue?: number, account?: string) =>
    ipcRenderer.invoke("db:achievement-totals", queue, account),
  getChallenges: () => ipcRenderer.invoke("lcu:challenges"),

  importData: (): Promise<{
    success: boolean;
    imported?: number;
    total?: number;
    skipped?: number;
    error?: string;
  }> => ipcRenderer.invoke("data:import"),

  repairPuuids: () => ipcRenderer.invoke("data:repair-puuids"),
  recalculateScores: () => ipcRenderer.invoke("data:recalculate-scores"),

  restoreOlderGames: (): Promise<RestoreOlderGamesResult | { error: string }> =>
    ipcRenderer.invoke("db:restore-older-games"),

  listBackups: () => ipcRenderer.invoke("backup:list"),

  createBackup: () => ipcRenderer.invoke("backup:create"),

  restoreBackup: (file: string) => ipcRenderer.invoke("backup:restore", file),

  getRecoveryReport: () => ipcRenderer.invoke("backup:recovery-report"),

  openBackupFolder: () => ipcRenderer.invoke("backup:open-folder"),

  getStorageInfo: () => ipcRenderer.invoke("storage:info"),
  changeDbFolder: (reset: boolean) => ipcRenderer.invoke("storage:change-db", reset),
  changeBackupFolder: (reset: boolean) => ipcRenderer.invoke("storage:change-backup", reset),
  openDbFolder: () => ipcRenderer.invoke("storage:open-db"),

  getVersion: () => ipcRenderer.invoke("app:version"),

  checkForUpdate: () => ipcRenderer.invoke("app:check-update"),

  downloadUpdate: (assetUrl: string) => ipcRenderer.invoke("app:download-update", assetUrl),

  onUpdateProgress: (callback: (progress: import("../shared/api").UpdateProgress) => void) => {
    const handler = (_event: unknown, progress: import("../shared/api").UpdateProgress) =>
      callback(progress);
    ipcRenderer.on("update:progress", handler);
    return () => ipcRenderer.removeListener("update:progress", handler);
  },

  openUrl: (url: string) => ipcRenderer.invoke("app:open-url", url),

  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),

  toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggle-maximize"),

  closeWindow: () => ipcRenderer.invoke("window:close"),

  isWindowMaximized: () => ipcRenderer.invoke("window:is-maximized"),

  onMaximizedChanged: (callback: (maximized: boolean) => void) => {
    const handler = (_event: unknown, maximized: boolean) => callback(maximized);
    ipcRenderer.on("window:maximized-changed", handler);
    return () => ipcRenderer.removeListener("window:maximized-changed", handler);
  },
};

contextBridge.exposeInMainWorld("api", api);
