// The IPC contract: every shape that crosses the preload bridge, and the
// ElectronAPI interface the bridge is checked against. It lives in shared/ so
// src/preload can import it without the bridge depending on the display layer.
// src/renderer/lib/types.ts re-exports all of it, so renderer imports are
// unchanged.

export interface GameRecord {
  game_id: number;
  queue_id: number;
  game_mode: string;
  game_creation: number;
  game_duration: number;
  puuid?: string;
  game_version?: string | null;
}

export interface PlayerStatsRecord {
  game_id: number;
  champion_id: number;
  win: number;
  kills: number;
  deaths: number;
  assists: number;
  double_kills: number;
  triple_kills: number;
  quadra_kills: number;
  penta_kills: number;
  total_damage_dealt: number;
  total_damage_taken: number;
  gold_earned: number;
  total_heal: number;
  largest_killing_spree: number;
  item0: number | null;
  item1: number | null;
  item2: number | null;
  item3: number | null;
  item4: number | null;
  item5: number | null;
  item6: number | null;
}

export interface CurrentSummoner {
  puuid: string;
  gameName: string;
  tagLine: string;
  displayName: string;
  internalName: string;
  region: string;
  platform: string;
  profileIconId: number;
  summonerLevel: number;
}

export interface LocalProfile {
  puuid: string | null;
  name: string | null;
  profileIcon: number | null;
  platform: string | null;
}

export interface RestoreOlderGamesResult {
  restored: number;
  remaining: number;
}

export interface GameAugment {
  game_id: number;
  slot: number;
  augment_id: number;
}

export interface MatchListItem {
  game_id: number;
  queue_id: number;
  game_creation: number;
  game_duration: number;
  is_remake: number;
  favorite: number;
  champion_id: number;
  win: number;
  kills: number;
  deaths: number;
  assists: number;
  double_kills: number;
  triple_kills: number;
  quadra_kills: number;
  penta_kills: number;
  total_damage_dealt: number;
  total_damage_taken: number;
  total_heal: number;
  gold_earned: number;
  item0: number | null;
  item1: number | null;
  item2: number | null;
  item3: number | null;
  item4: number | null;
  item5: number | null;
  item6: number | null;
  score: number | null;
  score_badge: "MVP" | "ACE" | null;
  spell1: number | null;
  spell2: number | null;
  augment_ids: string | null;
  rune_ids?: string | null;
  primary_style?: number | null;
  secondary_style?: number | null;
  stat_shard_ids?: string | null;
  cs?: number;
  game_version: string | null;
  // Riot's lane for this participant in this game: "TOP" | "JUNGLE" | "MIDDLE" |
  // "BOTTOM" | "UTILITY", or null for queues that do not have lanes (ARAM,
  // Arena, Mayhem, co-op, tutorials).
  team_position: string | null;
  player_subteam_placement: number | null;
  game_max_dmg: number;
  game_max_taken: number;
  game_max_heal: number;
}

export interface QueueStat {
  queueId: number;
  count: number;
  wins: number;
  losses: number;
}

export type MatchSort =
  | "date"
  | "kda"
  | "kills"
  | "duration"
  | "score"
  | "damageDealt"
  | "damageTaken"
  | "healing";

export type MatchSortDir = "asc" | "desc";

export type MultikillType = "doubles" | "triples" | "quadras" | "pentas";

export interface MatchFilters {
  championId?: number;
  patch?: string;
  queue?: number;
  account?: string;
  ignoreHiddenQueues?: boolean;
  sort?: MatchSort;
  sortDir?: MatchSortDir;
  multikills?: MultikillType[];
  favorites?: boolean;
}

export interface TrackedAccount {
  puuid: string;
  name: string | null;
  profileIcon: number | null;
}

export interface MatchFilterOptions {
  patches: string[];
  champions: number[];
  queues: number[];
  accounts: TrackedAccount[];
  hasFavorites: boolean;
}

// One row per player, straight from match_participants — the scoreboard no
// longer reconstructs these from a raw match payload.
export interface MatchParticipantRecord {
  participantId: number;
  puuid: string | null;
  gameName: string | null;
  tagLine: string | null;
  championId: number;
  teamId: number;
  playerSubteamId: number | null;
  playerSubteamPlacement: number | null;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  goldEarned: number;
  totalHeal: number;
  largestKillingSpree: number;
  spell1Id: number | null;
  spell2Id: number | null;
  cs: number;
  runeIds: number[];
  primaryStyle: number | null;
  secondaryStyle: number | null;
  statShardIds: number[];
  items: number[];
  augments: number[];
}

export interface MatchDetail {
  game: GameRecord;
  stats: PlayerStatsRecord;
  augments: GameAugment[];
  participants: MatchParticipantRecord[];
}

export interface ChampionStats {
  champion_id: number;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  avg_kills: number;
  avg_deaths: number;
  avg_assists: number;
  avg_damage: number;
  avg_gold: number;
  // Null when none of the champion's games have a stored score
  avg_score: number | null;
  mvps: number;
  aces: number;
  double_kills: number;
  triple_kills: number;
  quadra_kills: number;
  penta_kills: number;
}

export interface AugmentStats {
  augment_id: number;
  picks: number;
  wins: number;
}

export interface ItemStats {
  item_id: number;
  picks: number;
  wins: number;
}
export interface RuneStats {
  rune_id: number;
  picks: number;
  wins: number;
}
export interface RuneChampionStats {
  champion_id: number;
  games: number;
  keystones: { rune_id: number; picks: number }[];
}
export interface RuneOverview {
  runes: RuneStats[];
  champions: RuneChampionStats[];
}
export interface RuneData {
  [id: number]: {
    name: string;
    longDesc: string;
    icon: string;
    category: "keystone" | "secondary" | "tree";
  };
}
// Full tree layout (all options per slot, in row order) — used by the hover
// tooltip to show unselected alternatives greyed out next to the player's
// actual picks. `slots[0]` is the keystone row for a primary tree; for a
// secondary tree slots[0] is unused (LoL never lets you pick a secondary
// keystone) but is still present because runesReforged.json always ships 4
// rows per tree.
export interface RuneTreeLayout {
  [treeId: number]: {
    id: number;
    key: string;
    name: string;
    icon: string;
    slots: number[][];
  };
}
export interface ItemDetail {
  item_id: number;
  picks: number;
  wins: number;
  totalGames: number;
  champions: {
    champion_id: number;
    games: number;
    championGames: number;
    wins: number;
    matches: {
      game_id: number;
      game_creation: number;
      game_duration: number;
      win: number;
      kills: number;
      deaths: number;
      assists: number;
    }[];
  }[];
}

export interface AugmentStatsDetailed {
  augment_id: number;
  picks: number;
  wins: number;
  champions: { champion_id: number; picks: number; wins: number }[];
}

export interface AugmentStatsDetailedResult {
  // Games matching the same filters, so pick rate has a real denominator
  totalGames: number;
  augments: AugmentStatsDetailed[];
}

export interface DashboardData {
  totalGames: number;
  // Seconds of game time across every counted game
  totalDuration: number;
  wins: number;
  totalKills: number;
  totalDeaths: number;
  totalAssists: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  avgDamageDealt: number;
  avgDamageTaken: number;
  avgDamageHealed: number;
  avgCs: number;
  csTotal: number;
  csPerMin: number;
  avgGameLength: number;
  avgGold: number;
  goldTotal: number;
  avgScore: number | null;
  teamAvgScore: number;
  mvps: number;
  aces: number;
  // MVP is only awarded on a win and ACE only on a loss, so those are the
  // denominators for their rates — and only over games that have a score at all
  scoredWins: number;
  scoredLosses: number;
  // Tracked accounts these totals pool together, under the current filters
  accounts: number;
  // Newest first
  recentForm: {
    game_id: number;
    win: number;
    is_remake: number;
    champion_id: number;
    kills: number;
    deaths: number;
    assists: number;
  }[];
  topChampions: ChampionStats[];
  multikills: {
    doubles: number;
    triples: number;
    quadras: number;
    pentas: number;
    gamesWithDoubles: number;
    gamesWithTriples: number;
    gamesWithQuadras: number;
    gamesWithPentas: number;
  };
  topAugments: AugmentStats[];
}

export type HomeTimePeriod = "24h" | "7d" | "30d" | "full";

export type HomeAccountFilter = string | "all" | undefined;

export interface HomeDashboardPayload {
  summary: {
    totalGames: number;
    wins: number;
    losses: number;
    totalKills: number;
    totalDeaths: number;
    totalAssists: number;
    avgKills: number;
    avgDeaths: number;
    avgAssists: number;
    avgKda: number;
    totalDuration: number;
    accounts: number;
    recentForm: Array<{
      game_id: number;
      win: number;
      is_remake: number;
      champion_id: number;
      kills: number;
      deaths: number;
      assists: number;
    }>;
    avgDamageDealt: number;
    avgDamageTaken: number;
    avgDamageHealed: number;
    avgCs: number;
    csTotal: number;
    csPerMin: number;
    avgGameLength: number;
    avgGold: number;
    goldTotal: number;
    teamAvgScore: number;
    multikills: {
      doubles: number;
      triples: number;
      quadras: number;
      pentas: number;
      gamesWithDoubles: number;
      gamesWithTriples: number;
      gamesWithQuadras: number;
      gamesWithPentas: number;
    };
  };
  records: {
    mostKills: {
      value: number;
      championId: number;
      gameId: number;
      gameCreation: number;
      win: number;
    } | null;
    mostDeaths: {
      value: number;
      championId: number;
      gameId: number;
      gameCreation: number;
      win: number;
    } | null;
    mostAssists: {
      value: number;
      championId: number;
      gameId: number;
      gameCreation: number;
      win: number;
    } | null;
    mostDamage: {
      value: number;
      championId: number;
      gameId: number;
      gameCreation: number;
      win: number;
    } | null;
    biggestCrit: {
      value: number;
      championId: number;
      gameId: number;
      gameCreation: number;
      win: number;
    } | null;
    mostCs: {
      value: number;
      championId: number;
      gameId: number;
      gameCreation: number;
      win: number;
    } | null;
  };
  topChampions: Array<{
    championId: number;
    games: number;
    wins: number;
    winRate: number;
  }>;
}

export interface HomeMatchListPayload {
  matches: MatchListItem[];
  total: number;
}

export interface ChampionData {
  [id: number]: {
    name: string;
    key: string;
    class?: string;
  };
}

export interface ProfileRecentGame {
  game_id: number;
  champion_id: number;
  win: number;
  is_remake: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  game_duration: number;
  score: number | null;
  team_position: string | null;
  queue_id: number;
}

export interface AugmentData {
  [id: number]: {
    name: string;
    desc: string;
    iconPath: string;
    rarity: string;
    // CommunityDragon branch this entry came from. iconPath is only valid
    // against that branch, since paths move between patches.
    branch: string;
  };
}

export interface ItemData {
  [id: number]: {
    name: string;
    // Riot tooltip markup (<mainText>, <passive>, <magicDamage>…), already
    // resolved — render it with RiotText, never as HTML.
    description: string;
    iconPath: string;
    branch: string;
    price?: number;
    from?: number[];
  };
}

export interface SummonerSpellData {
  [id: number]: {
    name: string;
    iconPath: string;
  };
}

export interface TeammateStats {
  // Stable id for routing — the teammate's puuid, or their name when unknown
  key: string;
  name: string;
  puuid: string | null;
  profileIcon: number | null;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  champions: { champion_id: number; games: number }[];
  lastPlayed: number;
}

// A shared game, seen from both sides: our stats on the row itself, theirs
// under `friend`.
export interface TeammateMatch extends MatchListItem {
  friend: {
    champion_id: number;
    win: number;
    kills: number;
    deaths: number;
    assists: number;
    total_damage_dealt: number;
    total_damage_taken: number;
    total_heal: number;
    score: number | null;
    score_badge: "MVP" | "ACE" | null;
  };
}

export interface TeammateChampionStats {
  champion_id: number;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
}

// The list view only needs a teammate's most-played champions; their profile
// breaks every champion down.
export interface TeammateProfile extends Omit<TeammateStats, "champions"> {
  champions: TeammateChampionStats[];
}

export interface TeammateDetail {
  player: TeammateProfile;
  matches: TeammateMatch[];
}

// One row per calendar day with at least one game, local time. The Trends page
// re-buckets these into weeks/months itself, so this is the only time series
// the main process has to produce.
export interface TrendsDay {
  day: string; // YYYY-MM-DD
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  // Summed over games that have a score; scored_games is that count, so the
  // average stays honest when only some games are scored
  score_sum: number | null;
  scored_games: number;
}

export interface TrendsData {
  daily: TrendsDay[];
  // Chronological by first game played on the patch
  patches: {
    patch: string;
    games: number;
    wins: number;
    avg_score: number | null;
    first_played: number;
  }[];
  hours: { hour: number; games: number; wins: number }[];
  // 0 = Sunday, matching strftime('%w')
  weekdays: { weekday: number; games: number; wins: number }[];
}

// Just enough of a game to draw a record's context line and open its match.
export interface RecordMatchRef {
  game_id: number;
  game_creation: number;
  game_duration: number;
  queue_id: number;
  champion_id: number;
  win: number;
  kills: number;
  deaths: number;
  assists: number;
}

// A single-game best: the mark itself plus the game it was set in.
export interface StatRecord {
  value: number;
  match: RecordMatchRef;
}

export interface StreakRecord {
  length: number;
  start: number;
  end: number;
  // The streak's final game
  match: RecordMatchRef;
}

export interface RecordsData {
  totalGames: number;
  bests: {
    kills: StatRecord | null;
    deaths: StatRecord | null;
    assists: StatRecord | null;
    kda: StatRecord | null;
    score: StatRecord | null;
    killingSpree: StatRecord | null;
    damage: StatRecord | null;
    damageTaken: StatRecord | null;
    totalDamage: StatRecord | null;
    trueDamage: StatRecord | null;
    cs: StatRecord | null;
    csPerMinute: StatRecord | null;
    healing: StatRecord | null;
    gold: StatRecord | null;
    fastestWin: StatRecord | null;
    fastestLoss: StatRecord | null;
    longestGame: StatRecord | null;
    criticalStrike: StatRecord | null;
  };
  winStreak: StreakRecord | null;
  lossStreak: StreakRecord | null;
}

export interface GlobalStats {
  champions: { champion_id: number; games: number; wins: number }[];
  augments: { augment_id: number; picks: number; wins: number }[];
  items: { item_id: number; picks: number; wins: number }[];
  totalParticipantSlots: number;
  totalGames: number;
}

// One champion across every stored game, counting all ten players per game.
export interface GlobalChampionDetail {
  champion_id: number;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  avgDamage: number;
  avgDamageTaken: number;
  avgGold: number;
  avgHeal: number;
  // Averaged per-game ratios, 0-1
  damageShare: number;
  killParticipation: number;
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  totalParticipantSlots: number;
  items: ItemStats[];
  augments: AugmentStats[];
}

export interface ParsedParticipant {
  participantId: number;
  championId: number;
  teamId: number;
  playerSubteamId: number | null;
  playerSubteamPlacement: number | null;
  puuid: string | null;
  gameName: string | null;
  tagLine: string | null;
  summonerName: string;
  kills: number;
  deaths: number;
  assists: number;
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  goldEarned: number;
  totalHeal: number;
  largestKillingSpree: number;
  spell1Id: number | null;
  spell2Id: number | null;
  items: number[];
  augments: number[];
  cs: number;
  runeIds: number[];
  primaryStyle: number | null;
  secondaryStyle: number | null;
  statShardIds: number[];
  win: boolean;
  isSelf: boolean;
}

export type LcuStatus = "disconnected" | "connecting" | "connected" | "ingame";

export interface BackfillProgress {
  current: number;
  total: number;
  added: number;
}

export interface BackfillResult {
  added: number;
  scanned: number;
  checked: number;
  totalGames: number;
  truncated: boolean;
  cancelled: boolean;
}

export interface ParticipantScoreBackfillProgress {
  phase: "scores";
  done: number;
  total: number;
}

export type ParticipantScoreBackfillResult =
  | { ok: true; skipped: true }
  | { ok: true; skipped: false; updated: number }
  | { ok: false; error: string };

export interface RiotSyncResult {
  added: number;
  scanned: number;
  totalGames: number;
  complete: boolean;
}

export interface RiotAccountConfig {
  id: string;
  gameName: string;
  tagLine: string;
  platform: string;
}

export interface ProfileRankedEntry {
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
}

export interface ProfileMasteryChampion {
  championId: number;
  championPoints: number;
  championLevel: number;
}

export interface RankEntry {
  tier: string;
  division: string;
  leaguePoints: number;
  wins: number;
  losses: number;
}

export interface MasteryChampion {
  championId: number;
  level: number;
  points: number;
}

export interface AccountListItem {
  puuid: string;
  gameName: string | null;
  tagLine: string | null;
  profileIconId: number | null;
  platform: string | null;
  summonerLevel: number | null;
  lastSeen: number | null;
  gameCount: number;
}

export interface AccountSnapshot {
  puuid: string;
  gameName: string | null;
  tagLine: string | null;
  profileIconId: number | null;
  platform: string | null;
  summonerLevel: number | null;
  rankedSolo: RankEntry | null;
  rankedFlex: RankEntry | null;
  topMasteryChampions: MasteryChampion[];
  lastSeen: number | null;
}

export interface ProfileExtras {
  rankedSolo: RankEntry | null;
  rankedFlex: RankEntry | null;
  topMasteryChampions: MasteryChampion[];
  totalMasteryPoints: number;
  totalMasteryScore: number;
}

export interface RecentRiotMatch {
  gameId: number;
  win: boolean;
  championId: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  score: number | null;
  gameCreation: number;
  gameDuration: number;
  queueId: number;
  teamPosition: string | null;
}

export interface ProfileData {
  puuid: string;
  gameName: string;
  tagLine: string;
  platform: string;
  profileIconId: number;
  summonerLevel: number;
  dataDragonVersion: string;
  masteryPoints: number;
  masteryScore: number;
  totalMasteryPoints: number;
  totalMasteryScore: number;
  topMasteryChampions: ProfileMasteryChampion[] | null;
  rankedSolo: ProfileRankedEntry | null;
  rankedFlex: ProfileRankedEntry | null;
}

export interface ReleaseNote {
  version: string;
  publishedAt: string;
  body: string;
  url: string;
}

export interface UpdateInfo {
  hasUpdate: boolean;
  latest?: string;
  current?: string;
  url?: string;
  assetUrl?: string;
  assetSize?: number;
  // Every release newer than the installed version, newest first
  releases?: ReleaseNote[];
  // True when there are skipped releases beyond the page the check fetched
  moreVersions?: boolean;
  error?: string;
}

export interface BackupInfo {
  file: string;
  created: number;
  size: number;
  // null when the snapshot exists but couldn't be read
  games: number | null;
  reason: string;
}

export interface RecoveryReport {
  problem: "missing" | "corrupt";
  restoredFrom: string | null;
  quarantined: string | null;
  detail?: string;
}

export interface ElectronAPI {
  getMatchHistory: (
    limit: number,
    offset: number,
    filters?: MatchFilters,
  ) => Promise<{ matches: MatchListItem[]; total: number }>;
  getQueueStatsForAccount: (puuid: string) => Promise<QueueStat[]>;
  getMatchFilterOptions: (
    filters?: Pick<MatchFilters, "championId" | "patch" | "queue" | "account">,
  ) => Promise<MatchFilterOptions>;
  getStoredQueues: () => Promise<number[]>;
  getMatchDetail: (gameId: number) => Promise<MatchDetail>;
  toggleFavorite: (gameId: number) => Promise<boolean>;
  getChampionStats: (patch?: string, queue?: number, account?: string) => Promise<ChampionStats[]>;
  getAugmentStats: (
    championId?: number,
    patch?: string,
    queue?: number,
    account?: string,
  ) => Promise<AugmentStats[]>;
  getAugmentStatsDetailed: (
    patch?: string,
    queue?: number,
    account?: string,
  ) => Promise<AugmentStatsDetailedResult>;
  getDashboard: (
    filters?: Pick<MatchFilters, "championId" | "patch" | "queue" | "account">,
  ) => Promise<DashboardData>;
  getHomeDashboard: (
    account: HomeAccountFilter,
    timePeriod: HomeTimePeriod,
    queue: number | number[] | undefined,
  ) => Promise<HomeDashboardPayload>;
  getHomeMatchList: (
    account: HomeAccountFilter,
    queue: number | number[] | undefined,
    limit: number,
  ) => Promise<HomeMatchListPayload>;
  getMostPlayedQueue: (
    puuid: string,
    gameName: string,
    tagLine: string,
  ) => Promise<{ queue_id: number; games: number; wins: number; isArenaGroup: boolean } | null>;
  getTotalMatchesPlayed: (
    puuid: string,
    gameName: string,
    tagLine: string,
  ) => Promise<{ games: number; wins: number } | null>;
  getRankedRecord: (puuid: string) => Promise<{
    solo: { wins: number; losses: number };
    flex: { wins: number; losses: number };
  } | null>;
  getRecentGames: (
    puuid: string,
    gameName: string,
    tagLine: string,
    queueIds: number[],
    limit: number,
  ) => Promise<ProfileRecentGame[] | null>;
  getRecentRiotMatches: (
    puuid: string,
    platform: string,
    start: number,
    count: number,
    forceNewest?: boolean,
  ) => Promise<{ matches: RecentRiotMatch[]; total: number } | { error: string }>;
  importRecentRiotMatches: (
    puuid: string,
    platform: string,
    count: number,
  ) => Promise<{ imported: number; scanned: number; totalAvailable: number } | { error: string }>;
  onRecentMatchesProgress: (
    callback: (progress: { current: number; total: number }) => void,
  ) => () => void;
  getChampionMatchHistory: (
    championId: number,
    limit: number,
    offset: number,
    patch?: string,
    queue?: number,
    account?: string,
  ) => Promise<{ matches: MatchListItem[]; total: number }>;
  getChampionItemStats: (
    championId: number,
    patch?: string,
    queue?: number,
  ) => Promise<ItemStats[]>;
  getTeammateStats: (queue?: number, relation?: "friends" | "enemies") => Promise<TeammateStats[]>;
  getTeammateDetail: (
    key: string,
    queue?: number,
    relation?: "friends" | "enemies",
  ) => Promise<TeammateDetail | null>;
  getGlobalStats: (patch?: string, queue?: number) => Promise<GlobalStats>;
  getOwnedItemStats: (patch?: string, queue?: number, account?: string) => Promise<ItemStats[]>;
  getOwnedRuneStats: (queue?: number, patch?: string) => Promise<RuneOverview>;
  getRuneData: () => Promise<RuneData>;
  getRuneTrees: () => Promise<RuneTreeLayout>;
  getOwnedItemDetail: (itemId: number, patch?: string, queue?: number) => Promise<ItemDetail>;
  getTrends: (queue?: number, account?: string) => Promise<TrendsData>;
  getRecords: (queue?: number, account?: string) => Promise<RecordsData>;
  getGlobalChampionDetail: (
    championId: number,
    patch?: string,
    queue?: number,
  ) => Promise<GlobalChampionDetail>;
  getSummonerPuuid: () => Promise<string | null>;
  getAllSummonerPuuids: () => Promise<string[]>;
  listAccountsWithData: () => Promise<AccountListItem[]>;
  getAccountSnapshot: (puuid: string) => Promise<AccountSnapshot | null>;
  getCurrentPuuid: () => Promise<string | null>;
  getSavedSummoners: () => Promise<
    Array<{
      puuid: string;
      game_name: string | null;
      tag_line: string | null;
      profile_icon: number | null;
      updated_at: number;
      games: number;
    }>
  >;
  deleteSearchedSummoners: () => Promise<{ removed: number; games: number }>;
  deleteSummoner: (puuid: string) => Promise<{ deletedGames: number; deletedTrackedRows: number }>;
  getProfile: () => Promise<LocalProfile>;
  getCurrentSummonerProfileIcon: () => Promise<number | null>;
  getCurrentSummoner: () => Promise<CurrentSummoner>;
  getProfileExtras: () => Promise<ProfileExtras>;
  getProfileIcon: (puuid: string, platform?: string) => Promise<number | null>;
  getDebugEnabled: () => Promise<boolean>;
  setDebugEnabled: (enabled: boolean) => Promise<void>;
  getProfileData: (
    gameName: string,
    tagLine: string,
    platform: string,
    force?: boolean,
  ) => Promise<ProfileData | { error: string } | null>;
  getSummonerGameHistoryFromMcp: (
    gameName: string,
    tagLine: string,
    region: string,
  ) => Promise<unknown | { error: string }>;
  searchOpggSummoner: (
    region: string,
    gameName: string,
    tagLine: string,
  ) => Promise<unknown | { error: string }>;
  getOpggSummonerSummary: (
    region: string,
    summonerId: string,
  ) => Promise<unknown | { error: string }>;
  getOpggRecentGames: (
    region: string,
    summonerId: string,
    limit: number,
  ) => Promise<unknown | { error: string }>;
  refreshGames: () => Promise<{ newGames: number; totalGames: number } | { error: string }>;
  syncRiotHistory: () => Promise<RiotSyncResult | { error: string }>;
  getRiotAccounts: () => Promise<RiotAccountConfig[]>;
  saveRiotAccount: (account: RiotAccountConfig) => Promise<void>;
  removeRiotAccount: (id: string) => Promise<void>;
  backfillHistory: (forceFull?: boolean) => Promise<BackfillResult | { error: string }>;
  syncAccountHistory: (puuid: string) => Promise<{ ok: boolean; error?: string }>;
  cancelBackfill: () => Promise<void>;
  isBackfillRunning: () => Promise<boolean>;
  onBackfillProgress: (callback: (progress: BackfillProgress) => void) => () => void;
  onBackfillDone: (result: (result: BackfillResult | { error: string }) => void) => () => void;
  backfillParticipantScores: () => Promise<ParticipantScoreBackfillResult>;
  onParticipantScoreProgress: (
    callback: (progress: ParticipantScoreBackfillProgress) => void,
  ) => () => void;
  getLcuStatus: () => Promise<LcuStatus>;
  getChampionDataVersion: () => Promise<string>;
  getChampionData: () => Promise<ChampionData>;
  getAugmentData: (patch?: string) => Promise<AugmentData>;
  resolveAugmentIcon: (id: number, patch?: string) => Promise<string | null>;
  getItemData: (patch?: string) => Promise<ItemData>;
  getSummonerSpellData: () => Promise<SummonerSpellData>;
  onStatusChanged: (callback: (status: LcuStatus) => void) => () => void;
  onGamesUpdated: (callback: () => void) => () => void;
  getSetting: (key: string) => Promise<string | null>;
  isAutoStartSupported: () => Promise<boolean>;
  setSetting: (key: string, value: string) => Promise<void>;
  exportData: () => Promise<{
    success: boolean;
    path?: string;
    games?: number;
    error?: string;
  }>;
  importData: () => Promise<{
    success: boolean;
    imported?: number;
    total?: number;
    skipped?: number;
    error?: string;
  }>;
  repairPuuids: () => Promise<{
    repairedGames: number;
    discoveredAccounts: number;
    rebuiltGames: number;
  }>;
  restoreOlderGames: () => Promise<RestoreOlderGamesResult | { error: string }>;
  hasLocalAccount: () => Promise<boolean>;
  listBackups: () => Promise<BackupInfo[]>;
  createBackup: () => Promise<{ success: boolean; backup?: BackupInfo; error?: string }>;
  restoreBackup: (file: string) => Promise<{ success: boolean; games?: number; error?: string }>;
  getRecoveryReport: () => Promise<RecoveryReport | null>;
  openBackupFolder: () => Promise<void>;
  getVersion: () => Promise<string>;
  checkForUpdate: () => Promise<UpdateInfo>;
  downloadUpdate: (assetUrl: string) => Promise<{ success: boolean; error?: string }>;
  onUpdateProgress: (callback: (percent: number) => void) => () => void;
  openUrl: (url: string) => Promise<void>;
  minimizeWindow: () => Promise<void>;
  toggleMaximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  isWindowMaximized: () => Promise<boolean>;
  onMaximizedChanged: (callback: (maximized: boolean) => void) => () => void;
}
