import { contextBridge, ipcRenderer } from "electron";
import type {
  BackfillProgress,
  BackfillResult,
  ChampionDetailStats,
  ChampionKillDeathPosition,
  ChampionRoleStat,
  ChampionTimelineGame,
  TimelineBucket,
  ChampionTrendsData,
  ElectronAPI,
  LcuStatus,
  MatchFilters,
  ParticipantScoreBackfillProgress,
  RiotSyncResult,
  RiotAccountConfig,
  RestoreOlderGamesResult,
  HomeAccountFilter,
  HomeTimePeriod,
  TimelineData,
  TimelineBackfillProgress,
  ExportProgress,
  ImportProgress,
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

  getQueueStatsForAccount: (puuid: string) => ipcRenderer.invoke("db:queue-stats", puuid),

  getMatchFilterOptions: (
    filters?: Pick<MatchFilters, "championId" | "patch" | "queue" | "account">,
  ) => ipcRenderer.invoke("db:match-filters", filters),

  getStoredQueues: () => ipcRenderer.invoke("db:stored-queues"),

  getMatchDetail: (gameId: number) => ipcRenderer.invoke("db:match-detail", gameId),

  getTimeline: (gameId: number) => ipcRenderer.invoke("db:timeline-get", gameId),

  getChampionTimelineGames: (
    championId: number | null,
    limit: number,
    patch?: string,
    queue?: number,
    account?: string,
  ): Promise<ChampionTimelineGame[]> =>
    ipcRenderer.invoke("db:champion-timeline-games", championId, limit, patch, queue, account),

  getChampionTimelineAverages: (
    championId: number | null,
    patch?: string,
    queue?: number,
    account?: string,
  ): Promise<TimelineBucket[]> =>
    ipcRenderer.invoke("db:champion-timeline-averages", championId, patch, queue, account),

  getChampionKillDeathPositions: (
    championId: number,
    limit?: number,
    account?: string,
  ): Promise<ChampionKillDeathPosition[]> =>
    ipcRenderer.invoke("db:champion-kill-death-positions", championId, limit, account),

  fetchTimeline: (gameId: number, platform?: string): Promise<TimelineData | null> =>
    ipcRenderer.invoke("db:timeline-fetch", gameId, platform),

  reparseTimelines: (limit: number): Promise<number> =>
    ipcRenderer.invoke("db:timeline-reparse", limit),

  backfillCombatStats: (options?: { batchSize?: number }) =>
    ipcRenderer.invoke("db:backfill-combat-stats", options),

  onBackfillCombatStatsProgress: (
    callback: (progress: { done: number; total: number }) => void,
  ) => {
    const handler = (_event: unknown, progress: { done: number; total: number }) =>
      callback(progress);
    ipcRenderer.on("db:backfill-combat-stats-progress", handler);
    return () => ipcRenderer.removeListener("db:backfill-combat-stats-progress", handler);
  },

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

  getChampionStats: (patch?: string, queue?: number, account?: string) =>
    ipcRenderer.invoke("db:champion-stats", patch, queue, account),

  getChampionDetailStats: (
    championId: number | null,
    patch?: string,
    queue?: number,
    account?: string,
  ): Promise<ChampionDetailStats> =>
    ipcRenderer.invoke("db:champion-detail-stats", championId, patch, queue, account),

  getChampionQueueStats: (championId: number | null, account?: string) =>
    ipcRenderer.invoke("db:champion-queue-stats", championId, account),

  getChampionRoleStats: (
    championId: number | null,
    patch?: string,
    queue?: number,
    account?: string,
  ): Promise<ChampionRoleStat[]> =>
    ipcRenderer.invoke("db:champion-role-stats", championId, patch, queue, account),

  getChampionKeystones: (championId: number | null, account?: string) =>
    ipcRenderer.invoke("db:champion-keystones", championId, account),

  getChampionRuneStats: (
    championId: number | null,
    patch?: string,
    queue?: number,
    account?: string,
  ) => ipcRenderer.invoke("db:champion-rune-stats", championId, patch, queue, account),

  getChampionWeeklyWinRate: (championId: number | null, account?: string) =>
    ipcRenderer.invoke("db:champion-weekly-winrate", championId, account),

  getChampionMatchups: (championId: number | null, account?: string) =>
    ipcRenderer.invoke("db:champion-matchups", championId, account),

  getChampionMatchupList: (
    championId: number | null,
    patch?: string,
    queue?: number,
    account?: string,
  ) => ipcRenderer.invoke("db:champion-matchup-list", championId, patch, queue, account),

  getChampionAllyStats: (
    championId: number | null,
    patch?: string,
    queue?: number,
    account?: string,
  ) => ipcRenderer.invoke("db:champion-ally-stats", championId, patch, queue, account),

  getChampionTeammateStats: (
    championId: number | null,
    patch?: string,
    queue?: number,
    account?: string,
  ) => ipcRenderer.invoke("db:champion-teammate-stats", championId, patch, queue, account),

  getAugmentStats: (championId?: number, patch?: string, queue?: number, account?: string) =>
    ipcRenderer.invoke("db:augment-stats", championId, patch, queue, account),

  getAugmentStatsDetailed: (patch?: string, queue?: number, account?: string) =>
    ipcRenderer.invoke("db:augment-stats-detailed", patch, queue, account),

  getDashboard: (filters?: Pick<MatchFilters, "championId" | "patch" | "queue" | "account">) =>
    ipcRenderer.invoke("db:dashboard", filters),

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

  getMostPlayedQueue: (puuid: string, gameName: string, tagLine: string) =>
    ipcRenderer.invoke("db:most-played-queue", puuid, gameName, tagLine),

  getTotalMatchesPlayed: (puuid: string, gameName: string, tagLine: string) =>
    ipcRenderer.invoke("db:total-matches-played", puuid, gameName, tagLine),

  getRankedRecord: (puuid: string) => ipcRenderer.invoke("db:ranked-record", puuid),

  getRecentGames: (
    puuid: string,
    gameName: string,
    tagLine: string,
    queueIds: number[],
    limit: number,
  ) => ipcRenderer.invoke("db:recent-games", puuid, gameName, tagLine, queueIds, limit),

  getRecentRiotMatches: (
    puuid: string,
    platform: string,
    start: number,
    count: number,
    forceNewest = false,
  ) => ipcRenderer.invoke("riot:recent-matches", puuid, platform, start, count, forceNewest),

  importRecentRiotMatches: (puuid: string, platform: string, count: number) =>
    ipcRenderer.invoke("riot:import-recent", puuid, platform, count),

  onRecentMatchesProgress: (callback: (progress: { current: number; total: number }) => void) => {
    const handler = (_event: unknown, progress: { current: number; total: number }) =>
      callback(progress);
    ipcRenderer.on("riot:recent-matches-progress", handler);
    return () => ipcRenderer.removeListener("riot:recent-matches-progress", handler);
  },

  getChampionMatchHistory: (
    championId: number,
    limit: number,
    offset: number,
    patch?: string,
    queue?: number,
    account?: string,
  ) =>
    ipcRenderer.invoke(
      "db:champion-match-history",
      championId,
      limit,
      offset,
      patch,
      queue,
      account,
    ),

  getChampionRecords: (
    championId: number | null,
    patch?: string,
    queue?: number,
    account?: string,
  ) => ipcRenderer.invoke("db:champion-records", championId, patch, queue, account),

  refreshGames: () => ipcRenderer.invoke("lcu:refresh"),

  syncRiotHistory: (): Promise<RiotSyncResult | { error: string }> =>
    ipcRenderer.invoke("riot:sync"),
  getProfileData: (gameName: string, tagLine: string, platform: string, force = false) =>
    ipcRenderer.invoke("riot:profile", gameName, tagLine, platform, force),
  getSummonerGameHistoryFromMcp: (gameName: string, tagLine: string, region: string) =>
    ipcRenderer.invoke("mcp:summoner-game-history", gameName, tagLine, region),
  searchOpggSummoner: (region: string, gameName: string, tagLine: string) =>
    ipcRenderer.invoke("opgg:search", region, gameName, tagLine),
  getOpggSummonerSummary: (region: string, summonerId: string) =>
    ipcRenderer.invoke("opgg:summary", region, summonerId),
  getOpggRecentGames: (region: string, summonerId: string, limit: number) =>
    ipcRenderer.invoke("opgg:games", region, summonerId, limit),
  getRiotAccounts: (): Promise<RiotAccountConfig[]> => ipcRenderer.invoke("riot:accounts"),
  saveRiotAccount: (account: RiotAccountConfig) => ipcRenderer.invoke("riot:save-account", account),
  removeRiotAccount: (id: string) => ipcRenderer.invoke("riot:remove-account", id),

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

  backfillParticipantScores: () => ipcRenderer.invoke("db:backfill-participant-scores"),

  onParticipantScoreProgress: (callback: (progress: ParticipantScoreBackfillProgress) => void) => {
    const handler = (_event: unknown, progress: ParticipantScoreBackfillProgress) =>
      callback(progress);
    ipcRenderer.on("lcu:participant-score-progress", handler);
    return () => ipcRenderer.removeListener("lcu:participant-score-progress", handler);
  },

  getLcuStatus: () => ipcRenderer.invoke("lcu:status"),
  getLiveGame: () => ipcRenderer.invoke("lcu:live-game"),
  getLiveSession: () => ipcRenderer.invoke("lcu:live-session"),
  getChampionDataVersion: () => ipcRenderer.invoke("dragon:version"),

  getChampionData: () => ipcRenderer.invoke("dragon:champions"),

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

  getChampionTrendsData: (
    championId: number | null,
    patch?: string,
    queue?: number,
    account?: string,
  ): Promise<ChampionTrendsData> =>
    ipcRenderer.invoke("db:champion-trends", championId, patch, queue, account),

  getTeammateStats: (queue?: number, relation?: "friends" | "enemies") =>
    ipcRenderer.invoke("db:teammate-stats", queue, relation),

  getTeammateDetail: (key: string, queue?: number, relation?: "friends" | "enemies") =>
    ipcRenderer.invoke("db:teammate-detail", key, queue, relation),

  getGlobalStats: (patch?: string, queue?: number) =>
    ipcRenderer.invoke("db:global-stats", patch, queue),
  getOwnedItemStats: (patch?: string, queue?: number, account?: string) =>
    ipcRenderer.invoke("db:owned-item-stats", patch, queue, account),
  getOwnedRuneStats: (queue?: number, patch?: string, account?: string) =>
    ipcRenderer.invoke("db:owned-rune-stats", queue, patch, account),
  getRuneData: () => ipcRenderer.invoke("dragon:runes"),
  getRuneTrees: () => ipcRenderer.invoke("dragon:rune-trees"),
  getOwnedItemDetail: (itemId: number, patch?: string, queue?: number) =>
    ipcRenderer.invoke("db:owned-item-detail", itemId, patch, queue),

  getTrends: (queue?: number, account?: string) => ipcRenderer.invoke("db:trends", queue, account),

  getRecords: (queue?: number, account?: string) =>
    ipcRenderer.invoke("db:records", queue, account),

  getGlobalChampionDetail: (
    championId: number | null,
    patch?: string,
    queue?: number,
    account?: string,
  ) => ipcRenderer.invoke("db:global-champion-detail", championId, patch, queue, account),

  getSummonerPuuid: () => ipcRenderer.invoke("db:summoner-puuid"),

  getAllSummonerPuuids: () => ipcRenderer.invoke("db:all-summoner-puuids"),
  listAccountsWithData: () => ipcRenderer.invoke("db:list-accounts"),
  getAccountSnapshot: (puuid: string) => ipcRenderer.invoke("db:get-account-snapshot", puuid),
  getCurrentPuuid: () => ipcRenderer.invoke("lcu:current-puuid"),

  getSavedSummoners: () => ipcRenderer.invoke("db:saved-summoners"),
  deleteSummoner: (puuid: string) => ipcRenderer.invoke("db:delete-summoner", puuid),
  deleteSearchedSummoners: () => ipcRenderer.invoke("db:delete-searched-summoners"),

  getProfile: () => ipcRenderer.invoke("db:profile"),
  getCurrentSummonerProfileIcon: () => ipcRenderer.invoke("lcu:current-summoner-icon"),
  getCurrentSummoner: () => ipcRenderer.invoke("lcu:current-summoner"),
  getProfileExtras: () => ipcRenderer.invoke("lcu:profile-extras"),
  getProfileIcon: (puuid: string, platform?: string) =>
    ipcRenderer.invoke("riot:profile-icon", puuid, platform),
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

  importData: (): Promise<{
    success: boolean;
    imported?: number;
    total?: number;
    skipped?: number;
    error?: string;
  }> => ipcRenderer.invoke("data:import"),

  repairPuuids: () => ipcRenderer.invoke("data:repair-puuids"),

  restoreOlderGames: (): Promise<RestoreOlderGamesResult | { error: string }> =>
    ipcRenderer.invoke("db:restore-older-games"),

  hasLocalAccount: () => ipcRenderer.invoke("db:has-local-account"),

  listBackups: () => ipcRenderer.invoke("backup:list"),

  createBackup: () => ipcRenderer.invoke("backup:create"),

  restoreBackup: (file: string) => ipcRenderer.invoke("backup:restore", file),

  getRecoveryReport: () => ipcRenderer.invoke("backup:recovery-report"),

  openBackupFolder: () => ipcRenderer.invoke("backup:open-folder"),

  getVersion: () => ipcRenderer.invoke("app:version"),

  checkForUpdate: () => ipcRenderer.invoke("app:check-update"),

  downloadUpdate: (assetUrl: string) => ipcRenderer.invoke("app:download-update", assetUrl),

  onUpdateProgress: (callback: (percent: number) => void) => {
    const handler = (_event: unknown, percent: number) => callback(percent);
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
