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

export interface MergeDuplicateAccountDetail {
  gameName: string;
  tagLine: string;
  stalePuuid: string;
  canonicalPuuid: string;
  movedGames: number;
  movedTrackedRows: number;
}

export interface MergeDuplicateAccountsResult {
  merged: number;
  details: MergeDuplicateAccountDetail[];
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
  vision_score: number | null;
  wards_placed: number | null;
  wards_killed: number | null;
  vision_wards_bought: number | null;
  sight_wards_bought: number | null;
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
  | "healing"
  | "deaths"
  | "cs"
  | "gold"
  | "doubles"
  | "triples"
  | "quadras"
  | "pentas";

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
  result?: "win" | "loss";
  timePeriod?: HomeTimePeriod;
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

// Per-player numbers for the match Stats tab; every one may be missing on games stored before they were kept.
export interface ParticipantDetailStats {
  // Known only for games recorded live
  premadeGroup?: number | null;
  skinName?: string | null;
  largestCriticalStrike?: number | null;
  trueDamageToChampions?: number | null;
  physicalDamageToChampions?: number | null;
  magicDamageToChampions?: number | null;
  totalDamageDealtAll?: number | null;
  damageToTurrets?: number | null;
  physicalDamageTaken?: number | null;
  magicDamageTaken?: number | null;
  trueDamageTaken?: number | null;
  damageSelfMitigated?: number | null;
  wardsPlaced?: number | null;
  wardsKilled?: number | null;
  visionWardsBought?: number | null;
  goldSpent?: number | null;
  minionsKilled?: number | null;
  neutralMinionsKilled?: number | null;
  turretKills?: number | null;
  inhibitorKills?: number | null;
  champLevel?: number | null;
  totalCcDealt?: number | null;
  longestAlive?: number | null;
  killingSprees?: number | null;
  totalUnitsHealed?: number | null;
  neutralMinionsTeamJungle?: number | null;
  neutralMinionsEnemyJungle?: number | null;
  // Numbers only the end-of-game block has; null for games it was not captured for
  eog?: Record<string, number> | null;
}

export interface MatchTeamRecord {
  team_id: number;
  win: number | null;
  baron_kills: number;
  dragon_kills: number;
  rift_herald_kills: number;
  horde_kills: number;
  atakhan_kills: number;
  tower_kills: number;
  inhibitor_kills: number;
  first_baron: number;
  first_dragon: number;
  first_herald: number;
  first_tower: number;
  first_blood: number;
}

// One row per player, straight from match_participants — the scoreboard no
// longer reconstructs these from a raw match payload.
export interface MatchParticipantRecord extends ParticipantDetailStats {
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
  enemyMissingPings?: number | null;
  dangerPings?: number | null;
  onMyWayPings?: number | null;
  assistMePings?: number | null;
  getBackPings?: number | null;
  visionClearedPings?: number | null;
  needVisionPings?: number | null;
  pushPings?: number | null;
  allInPings?: number | null;
  basicPings?: number | null;
  commandPings?: number | null;
  spell1Casts?: number | null;
  spell2Casts?: number | null;
  spell3Casts?: number | null;
  spell4Casts?: number | null;
  summoner1Casts?: number | null;
  summoner2Casts?: number | null;
  totalHealOnTeammates?: number | null;
  totalDamageShieldedOnTeammates?: number | null;
  // What the Rift and Arena score systems read on top of the damage/gold/heal totals
  teamPosition?: string | null;
  visionScore?: number | null;
  timeCcOthers?: number | null;
  damageToObjectives?: number | null;
  firstBloodKill?: boolean;
  objectivesStolen?: number | null;
  challenges?: Record<string, number>;
}

export interface MatchDetail {
  game: GameRecord;
  stats: PlayerStatsRecord;
  augments: GameAugment[];
  participants: MatchParticipantRecord[];
  teams?: MatchTeamRecord[];
  // Client data captured after the game, keyed by kind (see main/post-game.ts)
  postGame?: Record<string, unknown>;
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
  avg_cs_per_min: number | null;
}

export interface ChampionDetailStats {
  games: number;
  killParticipation: number; // 0-1, averaged per-game ratio
  damageShare: number; // 0-1, averaged per-game ratio
  avgDamageTaken: number;
  avgDamageTakenInWins?: number | null;
  avgDamageTakenInLosses?: number | null;
  avgHeal: number;
  avgHealInWins?: number | null;
  avgHealInLosses?: number | null;
  avgPhysicalDamageDealt: number;
  avgPhysicalDamageDealtInWins?: number | null;
  avgPhysicalDamageDealtInLosses?: number | null;
  maxPhysicalDamageDealt: number;
  maxPhysicalDamageDealtInWins?: number | null;
  maxPhysicalDamageDealtInLosses?: number | null;
  totalPhysicalDamageDealt: number;
  totalPhysicalDamageDealtInWins?: number | null;
  totalPhysicalDamageDealtInLosses?: number | null;
  avgMagicDamageDealt: number;
  avgMagicDamageDealtInWins?: number | null;
  avgMagicDamageDealtInLosses?: number | null;
  avgTrueDamageDealt?: number | null;
  avgTrueDamageDealtInWins?: number | null;
  avgTrueDamageDealtInLosses?: number | null;
  maxTrueDamageDealt?: number | null;
  maxMagicDamageDealt: number;
  maxMagicDamageDealtInWins?: number | null;
  maxMagicDamageDealtInLosses?: number | null;
  totalMagicDamageDealt: number;
  totalMagicDamageDealtInWins?: number | null;
  totalMagicDamageDealtInLosses?: number | null;
  avgPhysicalDamageTaken: number;
  avgPhysicalDamageTakenInWins?: number | null;
  avgPhysicalDamageTakenInLosses?: number | null;
  maxPhysicalDamageTaken: number;
  maxPhysicalDamageTakenInWins?: number | null;
  maxPhysicalDamageTakenInLosses?: number | null;
  totalPhysicalDamageTaken: number;
  totalPhysicalDamageTakenInWins?: number | null;
  totalPhysicalDamageTakenInLosses?: number | null;
  avgMagicDamageTaken: number;
  avgMagicDamageTakenInWins?: number | null;
  avgMagicDamageTakenInLosses?: number | null;
  maxMagicDamageTaken: number;
  maxMagicDamageTakenInWins?: number | null;
  maxMagicDamageTakenInLosses?: number | null;
  totalMagicDamageTaken: number;
  totalMagicDamageTakenInWins?: number | null;
  totalMagicDamageTakenInLosses?: number | null;
  avgTrueDamageTaken: number;
  avgTrueDamageTakenInWins?: number | null;
  avgTrueDamageTakenInLosses?: number | null;
  maxTrueDamageTaken: number;
  maxTrueDamageTakenInWins?: number | null;
  maxTrueDamageTakenInLosses?: number | null;
  totalTrueDamageTaken: number;
  totalTrueDamageTakenInWins?: number | null;
  totalTrueDamageTakenInLosses?: number | null;
  avgDamageSelfMitigated: number;
  avgDamageSelfMitigatedInWins?: number | null;
  avgDamageSelfMitigatedInLosses?: number | null;
  maxDamageSelfMitigated: number;
  maxDamageSelfMitigatedInWins?: number | null;
  maxDamageSelfMitigatedInLosses?: number | null;
  totalDamageSelfMitigated: number;
  totalDamageSelfMitigatedInWins?: number | null;
  totalDamageSelfMitigatedInLosses?: number | null;
  avgDamageToObjectives: number;
  avgDamageToObjectivesInWins?: number | null;
  avgDamageToObjectivesInLosses?: number | null;
  maxDamageToObjectives: number;
  maxDamageToObjectivesInWins?: number | null;
  maxDamageToObjectivesInLosses?: number | null;
  totalDamageToObjectives: number;
  totalDamageToObjectivesInWins?: number | null;
  totalDamageToObjectivesInLosses?: number | null;
  avgDamageToTurrets: number;
  avgDamageToTurretsInWins?: number | null;
  avgDamageToTurretsInLosses?: number | null;
  maxDamageToTurrets: number;
  maxDamageToTurretsInWins?: number | null;
  maxDamageToTurretsInLosses?: number | null;
  totalDamageToTurrets: number;
  totalDamageToTurretsInWins?: number | null;
  totalDamageToTurretsInLosses?: number | null;
  avgTimeCcOthers: number;
  avgTimeCcOthersInWins?: number | null;
  avgTimeCcOthersInLosses?: number | null;
  maxTimeCcOthers: number;
  maxTimeCcOthersInWins?: number | null;
  maxTimeCcOthersInLosses?: number | null;
  totalTimeCcOthers: number;
  totalTimeCcOthersInWins?: number | null;
  totalTimeCcOthersInLosses?: number | null;
  avgTotalCcDealt: number;
  avgTotalCcDealtInWins?: number | null;
  avgTotalCcDealtInLosses?: number | null;
  maxTotalCcDealt: number;
  maxTotalCcDealtInWins?: number | null;
  maxTotalCcDealtInLosses?: number | null;
  totalTotalCcDealt: number;
  totalTotalCcDealtInWins?: number | null;
  totalTotalCcDealtInLosses?: number | null;
  avgLongestAlive: number;
  avgLongestAliveInWins?: number | null;
  avgLongestAliveInLosses?: number | null;
  maxLongestAlive: number;
  maxLongestAliveInWins?: number | null;
  maxLongestAliveInLosses?: number | null;
  totalLongestAlive: number;
  totalLongestAliveInWins?: number | null;
  totalLongestAliveInLosses?: number | null;
  avgKillingSprees: number;
  avgKillingSpreesInWins?: number | null;
  avgKillingSpreesInLosses?: number | null;
  maxKillingSprees: number;
  maxKillingSpreesInWins?: number | null;
  maxKillingSpreesInLosses?: number | null;
  totalKillingSprees: number;
  totalKillingSpreesInWins?: number | null;
  totalKillingSpreesInLosses?: number | null;
  avgFirstBloodKill: number;
  avgFirstBloodKillInWins?: number | null;
  avgFirstBloodKillInLosses?: number | null;
  maxFirstBloodKill: number;
  maxFirstBloodKillInWins?: number | null;
  maxFirstBloodKillInLosses?: number | null;
  totalFirstBloodKill: number;
  totalFirstBloodKillInWins?: number | null;
  totalFirstBloodKillInLosses?: number | null;
  avgFirstBloodAssist: number;
  avgFirstBloodAssistInWins?: number | null;
  avgFirstBloodAssistInLosses?: number | null;
  maxFirstBloodAssist: number;
  maxFirstBloodAssistInWins?: number | null;
  maxFirstBloodAssistInLosses?: number | null;
  totalFirstBloodAssist: number;
  totalFirstBloodAssistInWins?: number | null;
  totalFirstBloodAssistInLosses?: number | null;
  avgCcPerMin: number;
  avgCcPerMinInWins?: number | null;
  avgCcPerMinInLosses?: number | null;
  avgGoldEarned?: number | null;
  maxGoldEarned?: number | null;
  totalGoldEarned?: number | null;
  avgGoldEarnedInWins?: number | null;
  avgGoldEarnedInLosses?: number | null;
  maxGoldEarnedInWins?: number | null;
  maxGoldEarnedInLosses?: number | null;
  totalGoldEarnedInWins?: number | null;
  totalGoldEarnedInLosses?: number | null;
  avgGoldSpent: number;
  avgGoldSpentInWins?: number | null;
  avgGoldSpentInLosses?: number | null;
  maxGoldSpent: number;
  maxGoldSpentInWins?: number | null;
  maxGoldSpentInLosses?: number | null;
  totalGoldSpent: number;
  totalGoldSpentInWins?: number | null;
  totalGoldSpentInLosses?: number | null;
  maxChampLevel: number;
  maxChampLevelInWins?: number | null;
  maxChampLevelInLosses?: number | null;
  avgTotalMinionsKilled: number;
  avgTotalMinionsKilledInWins?: number | null;
  avgTotalMinionsKilledInLosses?: number | null;
  maxTotalMinionsKilled: number;
  maxTotalMinionsKilledInWins?: number | null;
  maxTotalMinionsKilledInLosses?: number | null;
  totalTotalMinionsKilled: number;
  totalTotalMinionsKilledInWins?: number | null;
  totalTotalMinionsKilledInLosses?: number | null;
  avgNeutralMinionsKilled: number;
  avgNeutralMinionsKilledInWins?: number | null;
  avgNeutralMinionsKilledInLosses?: number | null;
  maxNeutralMinionsKilled: number;
  maxNeutralMinionsKilledInWins?: number | null;
  maxNeutralMinionsKilledInLosses?: number | null;
  totalNeutralMinionsKilled: number;
  totalNeutralMinionsKilledInWins?: number | null;
  totalNeutralMinionsKilledInLosses?: number | null;
  avgNeutralMinionsEnemyJungle: number;
  avgNeutralMinionsEnemyJungleInWins?: number | null;
  avgNeutralMinionsEnemyJungleInLosses?: number | null;
  maxNeutralMinionsEnemyJungle: number;
  maxNeutralMinionsEnemyJungleInWins?: number | null;
  maxNeutralMinionsEnemyJungleInLosses?: number | null;
  totalNeutralMinionsEnemyJungle: number;
  totalNeutralMinionsEnemyJungleInWins?: number | null;
  totalNeutralMinionsEnemyJungleInLosses?: number | null;
  avgNeutralMinionsTeamJungle: number;
  avgNeutralMinionsTeamJungleInWins?: number | null;
  avgNeutralMinionsTeamJungleInLosses?: number | null;
  maxNeutralMinionsTeamJungle: number;
  maxNeutralMinionsTeamJungleInWins?: number | null;
  maxNeutralMinionsTeamJungleInLosses?: number | null;
  totalNeutralMinionsTeamJungle: number;
  totalNeutralMinionsTeamJungleInWins?: number | null;
  totalNeutralMinionsTeamJungleInLosses?: number | null;
  avgTurretKills: number;
  avgTurretKillsInWins?: number | null;
  avgTurretKillsInLosses?: number | null;
  maxTurretKills: number;
  maxTurretKillsInWins?: number | null;
  maxTurretKillsInLosses?: number | null;
  totalTurretKills: number;
  totalTurretKillsInWins?: number | null;
  totalTurretKillsInLosses?: number | null;
  avgInhibitorKills: number;
  avgInhibitorKillsInWins?: number | null;
  avgInhibitorKillsInLosses?: number | null;
  maxInhibitorKills: number;
  maxInhibitorKillsInWins?: number | null;
  maxInhibitorKillsInLosses?: number | null;
  totalInhibitorKills: number;
  totalInhibitorKillsInWins?: number | null;
  totalInhibitorKillsInLosses?: number | null;
  avgTurretPlatesTaken: number;
  avgTurretPlatesTakenInWins?: number | null;
  avgTurretPlatesTakenInLosses?: number | null;
  maxTurretPlatesTaken: number;
  maxTurretPlatesTakenInWins?: number | null;
  maxTurretPlatesTakenInLosses?: number | null;
  totalTurretPlatesTaken: number;
  totalTurretPlatesTakenInWins?: number | null;
  totalTurretPlatesTakenInLosses?: number | null;
  avgBaronKills: number;
  avgBaronKillsInWins?: number | null;
  avgBaronKillsInLosses?: number | null;
  maxBaronKills: number;
  maxBaronKillsInWins?: number | null;
  maxBaronKillsInLosses?: number | null;
  totalBaronKills: number;
  totalBaronKillsInWins?: number | null;
  totalBaronKillsInLosses?: number | null;
  avgObjectivesStolen: number;
  avgObjectivesStolenInWins?: number | null;
  avgObjectivesStolenInLosses?: number | null;
  maxObjectivesStolen: number;
  maxObjectivesStolenInWins?: number | null;
  maxObjectivesStolenInLosses?: number | null;
  totalObjectivesStolen: number;
  totalObjectivesStolenInWins?: number | null;
  totalObjectivesStolenInLosses?: number | null;
  avgObjectivesStolenAssists: number;
  avgObjectivesStolenAssistsInWins?: number | null;
  avgObjectivesStolenAssistsInLosses?: number | null;
  maxObjectivesStolenAssists: number;
  maxObjectivesStolenAssistsInWins?: number | null;
  maxObjectivesStolenAssistsInLosses?: number | null;
  totalObjectivesStolenAssists: number;
  totalObjectivesStolenAssistsInWins?: number | null;
  totalObjectivesStolenAssistsInLosses?: number | null;
  avgVisionScore: number;
  avgVisionScoreInWins?: number | null;
  avgVisionScoreInLosses?: number | null;
  maxVisionScore: number;
  maxVisionScoreInWins?: number | null;
  maxVisionScoreInLosses?: number | null;
  totalVisionScore: number;
  totalVisionScoreInWins?: number | null;
  totalVisionScoreInLosses?: number | null;
  avgWardsPlaced: number;
  avgWardsPlacedInWins?: number | null;
  avgWardsPlacedInLosses?: number | null;
  maxWardsPlaced: number;
  maxWardsPlacedInWins?: number | null;
  maxWardsPlacedInLosses?: number | null;
  totalWardsPlaced: number;
  totalWardsPlacedInWins?: number | null;
  totalWardsPlacedInLosses?: number | null;
  avgWardsKilled: number;
  avgWardsKilledInWins?: number | null;
  avgWardsKilledInLosses?: number | null;
  maxWardsKilled: number;
  maxWardsKilledInWins?: number | null;
  maxWardsKilledInLosses?: number | null;
  totalWardsKilled: number;
  totalWardsKilledInWins?: number | null;
  totalWardsKilledInLosses?: number | null;
  avgVisionWardsBought: number;
  avgVisionWardsBoughtInWins?: number | null;
  avgVisionWardsBoughtInLosses?: number | null;
  maxVisionWardsBought: number;
  maxVisionWardsBoughtInWins?: number | null;
  maxVisionWardsBoughtInLosses?: number | null;
  totalVisionWardsBought: number;
  totalVisionWardsBoughtInWins?: number | null;
  totalVisionWardsBoughtInLosses?: number | null;
  avgSightWardsBought: number;
  avgSightWardsBoughtInWins?: number | null;
  avgSightWardsBoughtInLosses?: number | null;
  maxSightWardsBought: number;
  maxSightWardsBoughtInWins?: number | null;
  maxSightWardsBoughtInLosses?: number | null;
  totalSightWardsBought: number;
  totalSightWardsBoughtInWins?: number | null;
  totalSightWardsBoughtInLosses?: number | null;
  totalFirstTowerKill: number;
  totalFirstTowerKillInWins?: number | null;
  totalFirstTowerKillInLosses?: number | null;
  totalFirstTowerAssist: number;
  totalFirstTowerAssistInWins?: number | null;
  totalFirstTowerAssistInLosses?: number | null;
  totalFirstInhibitorKill: number;
  totalFirstInhibitorKillInWins?: number | null;
  totalFirstInhibitorKillInLosses?: number | null;
  totalFirstInhibitorAssist: number;
  totalFirstInhibitorAssistInWins?: number | null;
  totalFirstInhibitorAssistInLosses?: number | null;
  goldPerMin: number;
  goldPerMinInWins?: number | null;
  goldPerMinInLosses?: number | null;
  avgGameLength: number; // seconds
  avgGameLengthInWins?: number | null;
  avgGameLengthInLosses?: number | null;
  totalTimePlayed: number; // seconds
  totalTimePlayedInWins?: number | null;
  totalTimePlayedInLosses?: number | null;
  longestWinStreak: number; // best consecutive wins ever on this champion
}

export interface ChampionTeamObjectivesSide {
  games: number;
  first_blood_pct: number;
  first_tower_pct: number;
  first_dragon_pct: number;
  first_baron_pct: number;
  first_herald_pct: number;
  avg_dragon_kills: number;
  avg_baron_kills: number;
  avg_herald_kills: number;
  avg_horde_kills: number;
  avg_tower_kills: number;
  avg_inhibitor_kills: number;
}

export interface ChampionTeamObjectives {
  ally: ChampionTeamObjectivesSide;
  enemy: ChampionTeamObjectivesSide;
}

export type ChampionStatBaseline = Record<string, number | null>;

export interface ChampionChallengeMetric {
  key: string;
  avg: number | null;
  best: number | null;
  games: number;
}

export interface ChampionChallengeAggregates {
  gamesWithChallenges: number;
  metrics: ChampionChallengeMetric[];
}

export interface ChampionSkillOrder {
  order: string;
  picks: number;
}

export interface ChampionSkillOrdersResult {
  topOrders: ChampionSkillOrder[];
  rTiming: {
    avgR1Min: number | null;
    avgR2Min: number | null;
    avgR3Min: number | null;
    sampleSize: number;
  };
  summonerSpells: Array<{ pair: string; picks: number; wins: number }>;
  timelineCoverage: {
    gamesWithTimeline: number;
    totalGames: number;
  };
}

export interface ChampionQueueStat {
  queueId: number;
  games: number;
  wins: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  avgGold?: number | null;
  goldPerMin?: number | null;
  avgCs?: number | null;
  csPerMin?: number | null;
  avgScore?: number | null;
  avgGameLength?: number | null;
}

export interface ChampionRoleStat {
  role: string;
  games: number;
  wins: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  avgCsPerMin?: number | null;
  avgScore?: number | null;
}

export interface ChampionKeystoneStat {
  runeId: number;
  picks: number;
  wins: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  avgScore?: number | null;
}

export interface ChampionRuneStatsResult {
  keystones: Array<{ runeId: number; picks: number; wins: number }>;
  primaryTrees: Array<{ styleId: number; picks: number; wins: number }>;
  secondaryTrees: Array<{ styleId: number; picks: number; wins: number }>;
  pages: Array<{ runes: string; picks: number; wins: number }>;
}

export interface ChampionWeeklyWinRate {
  weekStart: number;
  games: number;
  wins: number;
}

export interface ChampionWeeklyMetrics {
  weekStart: number;
  metrics: Record<string, number | null>;
}

export interface ChampionMatchup {
  championId: number;
  games: number;
  wins: number;
}

export interface ChampionMatchupRow {
  championId: number;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  goldEarned: number;
  avgCsDiffAt15?: number | null;
  avgGoldDiffAt15?: number | null;
}

export interface OtherPlayersRow {
  id: number;
  count: number;
  wins: number;
}

export interface OtherPlayersStats {
  champions: OtherPlayersRow[];
  augments: OtherPlayersRow[];
  items: OtherPlayersRow[];
}

export interface ChampionAllyRow {
  championId: number;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
}

export interface ChampionTeammateRow {
  puuid: string;
  name: string;
  profileIcon: number | null;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  topChampionId: number | null;
}

export interface ChampionMatchups {
  best: ChampionMatchup[];
  worst: ChampionMatchup[];
}

export interface AugmentStats {
  augment_id: number;
  picks: number;
  wins: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  avgScore?: number | null;
  // Five champions that took this augment most often
  champions?: Array<{ champion_id: number; picks: number }>;
}

export interface ItemStats {
  item_id: number;
  picks: number;
  wins: number;
  isTrinket: boolean;
  avgBuyTime?: number | null;
  commonPurchaseSlot?: number | null;
}
export interface OwnedItemStats extends ItemStats {
  avgBuyTimeMs?: number | null;
  commonPurchaseSlot?: number | null;
  scopeTotalGames?: number;
  scopeTotalBuilds?: number;
  scopeAvgWinRate?: number;
}
export interface OwnedItemStatsResult {
  rows: OwnedItemStats[];
  totalGames: number;
  totalBuilds: number;
  avgWinRate: number;
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
  avgBuyTimeMs: number | null;
  patchBreakdown: { patch: string; games: number; wins: number }[];
  topPairings: { item_id: number; games: number; wins: number }[];
  // Games in the same scope where the item was not built; averages are null when there are none
  baseline: {
    games: number;
    wins: number;
    kills: number;
    deaths: number;
    assists: number;
    damage: number | null;
    taken: number | null;
    gold: number | null;
    heal: number | null;
    score: number | null;
    duration: number | null;
  };
  champions: {
    champion_id: number;
    games: number;
    championGames: number;
    championWins: number;
    wins: number;
    matches: {
      game_id: number;
      champion_id: number;
      game_creation: number;
      game_duration: number;
      queue_id: number;
      win: number;
      kills: number;
      deaths: number;
      assists: number;
      damage: number;
      taken: number;
      gold: number;
      heal: number;
      score: number | null;
    }[];
  }[];
}

export type AugmentDetail = Pick<
  ItemDetail,
  "picks" | "wins" | "totalGames" | "baseline" | "champions" | "patchBreakdown"
> & {
  augment_id: number;
  // Other augments and items taken in the same games
  pairings: { id: number; games: number; wins: number }[];
  topItems: { id: number; games: number; wins: number }[];
};

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
  totalTimeSeconds: number;
  recentStreak: number;
  statsEligibleDuration: number;
  wins: number;
  statsEligibleGames: number;
  totalKills: number;
  totalDeaths: number;
  totalAssists: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  avgDamageDealt: number;
  damageDealtTotal: number;
  avgDamageTaken: number;
  damageTakenTotal: number;
  avgDamageHealed: number;
  damageHealedTotal: number;
  avgCs: number;
  csTotal: number;
  csPerMin: number;
  avgGameLength: number;
  avgGold: number;
  goldTotal: number;
  avgScore: number | null;
  avgScoreWins: number | null;
  avgScoreLosses: number | null;
  bestScore: number | null;
  worstScore: number | null;
  // 0–1 shares averaged per game; null when no game has the team data
  killParticipation: number | null;
  damageShare: number | null;
  longestGameSeconds: number | null;
  // Deaths per game over the last period and the one before it
  deathsTrend: { current: number | null; previous: number | null };
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
    score: number | null;
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
    // Champions with the most of each multikill, best first
    topChampions: Record<
      "double" | "triple" | "quadra" | "penta",
      Array<{ champion_id: number; count: number }>
    >;
  };
  topAugments: AugmentStats[];
}

export type HomeTimePeriod = "24h" | "7d" | "30d" | "full";

export type HomeAccountFilter = string | "all" | undefined;

export interface RoleBreakdown {
  role: "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY" | "NO_POSITION";
  games: number;
  wins: number;
  winRate: number;
}

export interface HomeDashboardPayload {
  summary: {
    totalGames: number;
    // Remade games, which no stat counts
    remakes: number;
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
    totalTimeSeconds: number;
    recentStreak: number;
    statsEligibleDuration: number;
    statsEligibleGames: number;
    accounts: number;
    recentForm: Array<{
      game_id: number;
      win: number;
      score: number | null;
      is_remake: number;
      champion_id: number;
      kills: number;
      deaths: number;
      assists: number;
    }>;
    avgDamageDealt: number;
    damageDealtTotal: number;
    avgDamageTaken: number;
    damageTakenTotal: number;
    avgDamageHealed: number;
    damageHealedTotal: number;
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
    mostGold: {
      value: number;
      championId: number;
      gameId: number;
      gameCreation: number;
      win: number;
    } | null;
    wardsPlaced: {
      value: number;
      championId: number;
      gameId: number;
      gameCreation: number;
      win: number;
    } | null;
    damageTaken: {
      value: number;
      championId: number;
      gameId: number;
      gameCreation: number;
      win: number;
    } | null;
    longestGame: {
      value: number;
      championId: number;
      gameId: number;
      gameCreation: number;
      win: number;
    } | null;
    visionScore: {
      value: number;
      championId: number;
      gameId: number;
      gameCreation: number;
      win: number;
    } | null;
    turretDamage: {
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
    categories?: string[];
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
  totalGames: number;
}

export interface TeammateChampionStats {
  champion_id: number;
  games: number;
  wins: number;
  kda: number;
  totalGames: number;
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
  duration_sum: number;
  // Summed over games that have a score; scored_games is that count, so the
  // average stays honest when only some games are scored
  score_sum: number | null;
  scored_games: number;
}

export interface TrendsData {
  daily: TrendsDay[];
  summaryStats: {
    avgKills: number;
    avgDeaths: number;
    avgAssists: number;
    peakKdaGame: { kills: number; deaths: number; assists: number } | null;
    totalGames: number;
    mostActiveDay: string;
    longestActiveStreak: number;
    lastPlayed: number;
    peakWr: number;
    lowestWr: number;
    currentWlStreak: string;
    avgKdaAll: number;
    kdaOver3Percent: number;
    trend30dKda: number;
    trendKdaAll: number;
  };
  combatEconomy?: {
    dpm: number;
    gpm: number;
    cspm: number;
    vision: number;
    killParticipation: number;
    damageTaken: number;
  };
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
  roleBreakdown: { role: string; games: number; wins: number }[];
  queueBreakdown: {
    queueId: number;
    games: number;
    wins: number;
    kills: number;
    deaths: number;
    assists: number;
    avgDuration: number;
  }[];
  championTop: {
    championId: number;
    games: number;
    wins: number;
    kills: number;
    deaths: number;
    assists: number;
  }[];
  dayHourMatrix: { weekday: number; hour: number; games: number; wins: number }[];
  championMost: TrendsData["championTop"];
  // Every game of the period, oldest first
  timeline: { owner: string; time: number; duration: number; win: number }[];
  // Totals of the period of the same length before this one; null for "all time"
  previous: {
    games: number;
    wins: number;
    kills: number;
    deaths: number;
    assists: number;
    score: number | null;
  } | null;
  insights: {
    winRateDiff: number;
    bestDay: { day: string; wr: number } | null;
    peakWindow: { startHour: number; endHour: number; wr: number } | null;
  };
  streaks: {
    maxWinStreak: number;
    maxLossStreak: number;
    avgSessionKda: number;
    last20Games: boolean[];
    last20AvgKda: number;
    currentStreak: { type: "W" | "L" | null; count: number };
  };
  winningConditions: {
    firstBloodWr: number | null;
    kda3Wr: number | null;
    score7Wr: number | null;
  };
  recentSessions: {
    date: number;
    queueName: string;
    games: number;
    wins: number;
    avgKda: number;
  }[];
  damageSplit: {
    physical: number;
    magic: number;
    true: number;
  };
  objectiveControl: {
    dragons: { win: number; loss: number };
    barons: { win: number; loss: number };
    towers: { win: number; loss: number };
  };
  topDuos: {
    puuid: string;
    gameName: string;
    tagLine: string;
    profileIcon: number | null;
    games: number;
    wins: number;
    winRate: number;
  }[];
}

export interface ChampionTrendsDay {
  day: string;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  score_sum: number | null;
  scored_games: number;
  cs_sum: number | null;
  gold_sum: number | null;
}

export interface ChampionTrendsPatch {
  patch: string;
  games: number;
  wins: number;
  avg_score: number | null;
  first_played: number;
}

export interface ChampionTrendsHour {
  hour: number;
  games: number;
  wins: number;
}

export interface ChampionTrendsWeekday {
  weekday: number;
  games: number;
  wins: number;
}

export interface ChampionTrendsData {
  daily: ChampionTrendsDay[];
  patches: ChampionTrendsPatch[];
  hours: ChampionTrendsHour[];
  weekdays: ChampionTrendsWeekday[];
}

export interface ActivityHeatmapDay {
  day: string;
  games: number;
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
  perfect?: boolean;
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
  multikillTotals?: {
    doubles: number;
    triples: number;
    quadras: number;
    pentakills: number;
  };
  recentlyBroken?: Array<{
    key: string;
    label: string;
    value: number;
    gameCreation: number;
    gameId?: string;
  }>;
  achievements?: Array<{
    key: string;
    label: string;
    description: string;
    current: number;
    target: number;
    unlocked: boolean;
  }>;
  winStreak: StreakRecord | null;
  lossStreak: StreakRecord | null;
  visionScore?: StatRecord;
  goldPerMinute?: StatRecord;
  damagePerGold?: StatRecord;
  turretKills?: StatRecord;
  ccTime?: StatRecord;
  wardsPlaced?: StatRecord;
  turretDamage?: StatRecord;
  objectiveDamage?: StatRecord;
  fastestPentakill?: StatRecord;
  flawlessAce?: StatRecord;
  // Further single-game bests, keyed by record name
  extras?: Record<string, StatRecord>;
  // Highest value of each champion stat reached in a game, keyed like the live tab's peak stats
  rawStats?: Record<string, StatRecord>;
  topDamageGames?: Array<{
    gameId: string;
    championId: number;
    damage: number;
    win: boolean;
    gameCreation: number;
  }>;
  bestByQueue?: Array<{
    queueLabel: string;
    queueIds: number[];
    mostKills: StatRecord;
    highestKda: StatRecord;
    mostDamage: StatRecord;
    bestWinStreak: { count: number; start: number; end: number };
  }>;
  milestones?: Array<{
    key: "firstWin" | "firstPentakill" | "kill1000" | "longestWinStreak" | "win1000" | "game2000";
    label: string;
    championId?: number;
    gameCreation: number;
    gameId?: string;
    value?: number;
  }>;
}

export interface ChampionRecord {
  key: string;
  label: string;
  value: number;
  gameId: number | null;
  gameDuration?: number;
  secondValue: number | null;
  secondGameId: number | null;
}

export interface ChampionRecordsResult {
  records: ChampionRecord[];
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
  totalKills: number;
  totalDeaths: number;
  totalAssists: number;
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

export interface ParsedParticipant extends ParticipantDetailStats {
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
  enemyMissingPings?: number | null;
  dangerPings?: number | null;
  onMyWayPings?: number | null;
  assistMePings?: number | null;
  getBackPings?: number | null;
  visionClearedPings?: number | null;
  needVisionPings?: number | null;
  pushPings?: number | null;
  allInPings?: number | null;
  basicPings?: number | null;
  commandPings?: number | null;
  spell1Casts?: number | null;
  spell2Casts?: number | null;
  spell3Casts?: number | null;
  spell4Casts?: number | null;
  summoner1Casts?: number | null;
  summoner2Casts?: number | null;
  totalHealOnTeammates?: number | null;
  totalDamageShieldedOnTeammates?: number | null;
  teamPosition?: string | null;
  visionScore?: number | null;
  timeCcOthers?: number | null;
  damageToObjectives?: number | null;
  firstBloodKill?: boolean;
  objectivesStolen?: number | null;
  challenges?: Record<string, number>;
  win: boolean;
  isSelf: boolean;
}

export type LcuStatus = "disconnected" | "connecting" | "connected" | "ingame";

export interface LiveGameData {
  gameTimeSec: number;
  gameMode: string;
  items: Array<{ itemId: number; slot: number; displayName: string; count: number }>;
  activePlayer: {
    summonerName: string;
    level: number;
    currentGold: number;
    championName: string;
    kills: number;
    deaths: number;
    assists: number;
    creepScore: number;
  };
}

// Client data captured around the end of a game, keyed by kind (see main/post-game.ts)
export interface PostGameRecord {
  gameId: number;
  recordedAt: number;
  data: Record<string, unknown>;
}

// The best value of one stat across the recorded games (see live_stat_peaks)
export interface LiveStatRecord {
  stat: string;
  peak: number;
  gameId: number;
  championId: number | null;
  championName: string;
  recordedAt: number;
}

// Who is signed in to the League client and what the client knows about them, independent of any game
export interface ClientProfile {
  gameName: string;
  tagLine: string;
  level: number;
  // 0-100 progress to the next summoner level
  xpPercent: number;
  profileIconId: number;
  region: string;
  // "16.23" taken from the client's game version
  patch: string;
  honorLevel: number | null;
  // Chat presence: "chat" (online), "away", "dnd" (in a game or queue), "mobile", "offline"
  presence: string;
  statusMessage: string;
  blueEssence: number | null;
  rp: number | null;
  challengePoints: number | null;
  challengeLevel: string | null;
  // Only queues the account has a rank in
  ranked: Array<{
    queue: string;
    tier: string;
    division: string;
    lp: number;
    wins: number;
    losses: number;
  }>;
}

export interface LiveSessionData {
  phase: string;
  queueId: number | null;
  queueLabel: string | null;
  lobbySize: number | null;
  lobbyMaxSize: number | null;
  queueStartedAt: number | null;
  gameMode: string | null;
  mapId: number | null;
  isCustom: boolean;
  // Lobby members; empty outside a lobby
  members: Array<{ name: string; isLeader: boolean; ready: boolean; isMe: boolean }>;
  // Whether the local player can press the start / find match button
  canStart: boolean | null;
  search: {
    state: string;
    estimatedSec: number | null;
    elapsedSec: number | null;
    penaltySec: number | null;
    dodgeWarning: string | null;
  } | null;
  readyCheck: { response: string; timerSec: number | null; state: string } | null;
  champSelect: {
    myChampionId: number | null;
    myTeam: Array<{ summonerName: string; championId: number; isMe: boolean }>;
    bench: Array<{ championId: number }>;
    isMyTurn: boolean;
    timeLeftMs: number | null;
    timerPhase: string | null;
    bans: { mine: number[]; theirs: number[] };
    rerollsRemaining: number | null;
  } | null;
  profile: ClientProfile | null;
}

// ---- Full live game snapshot (Live Client Data API + gameflow session) ----

export type LiveAbilityKey = "Passive" | "Q" | "W" | "E" | "R";

export interface LiveAbility {
  key: LiveAbilityKey;
  name: string;
  // Rank the player has put into it; 0 for the passive, which has no ranks
  level: number;
}

export interface LiveRuneRef {
  id: number;
  name: string;
}

export interface LiveItem {
  id: number;
  name: string;
  count: number;
  // Shop price of one copy; gold value of an inventory is the sum of price x count
  price: number;
  slot: number;
  consumable: boolean;
  canUse: boolean;
}

export interface LiveSpell {
  name: string;
  // Resolved from the gameflow session when the client is connected
  id: number | null;
  // The game's raw description key; Mayhem augments that replace a spell are only told apart by it
  key?: string;
}

export interface LivePlayer {
  riotId: string;
  gameName: string;
  tagLine: string;
  summonerName: string;
  championName: string;
  // Resolved from the gameflow session or by name; null when neither knows it
  championId: number | null;
  team: string;
  // "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY", or "" in modes without lanes
  position: string;
  level: number;
  isBot: boolean;
  isDead: boolean;
  respawnTimer: number;
  skinId: number;
  skinName: string;
  kills: number;
  deaths: number;
  assists: number;
  creepScore: number;
  wardScore: number;
  items: LiveItem[];
  itemValue: number;
  spellOne: LiveSpell;
  spellTwo: LiveSpell;
  keystone: LiveRuneRef | null;
  primaryTree: LiveRuneRef | null;
  secondaryTree: LiveRuneRef | null;
  isMe: boolean;
  puuid: string | null;
}

export interface LiveEvent {
  id: number;
  name: string;
  time: number;
  killer: string | null;
  victim: string | null;
  assisters: string[];
  dragonType: string | null;
  stolen: boolean;
  turret: string | null;
  inhib: string | null;
  acer: string | null;
  acingTeam: string | null;
  killStreak: number | null;
  recipient: string | null;
  // Every field the API sent that has no named slot above, so nothing is dropped
  extra: Record<string, unknown>;
}

export interface LiveActivePlayer {
  riotId: string;
  summonerName: string;
  level: number;
  currentGold: number;
  // championStats exactly as sent: numbers, plus resourceType as a string
  stats: Record<string, number | string>;
  abilities: LiveAbility[];
  keystone: LiveRuneRef | null;
  primaryTree: LiveRuneRef | null;
  secondaryTree: LiveRuneRef | null;
  generalRunes: LiveRuneRef[];
  statRunes: LiveRuneRef[];
  teamRelativeColors: boolean | null;
}

export interface LiveGameInfo {
  mode: string;
  mapName: string;
  mapNumber: number;
  mapTerrain: string;
  timeSec: number;
  queueId: number | null;
  gameId: number | null;
}

// One point of the game-flow series kept for a finished game (team totals every few game seconds)
export interface LiveSeriesPoint {
  t: number;
  ORDER: { kills: number; cs: number; itemValue: number };
  CHAOS: { kills: number; cs: number; itemValue: number };
  gold: number;
  // Per player, in the order of `playerIds`: [kills, deaths, assists, cs, itemValue, level,
  // wardScore, isDead (0/1), respawnTimer]; the last three are missing in older rows
  players?: number[][];
}

// What was extracted from a game while it ran. Everything past `snapshot` and `series` is optional
// because older rows were written before it was collected.
export interface StoredLiveBody {
  snapshot: LiveFull;
  series: LiveSeriesPoint[];
  // Game second of the first sample; the logs below are incomplete before it when the app joined late
  firstSampleSec?: number;
  playerIds?: string[];
  // Inventory changes of every player: d > 0 item gained, d < 0 item lost or sold
  itemLog?: Array<{ t: number; p: string; id: number; d: number }>;
  // Your ability ranks as they were put in, in order
  skillLog?: Array<{ t: number; key: string; level: number }>;
  // Your champion stats every ~5 game seconds
  statSeries?: Array<{ t: number; stats: Record<string, number> }>;
  // Summoner spells of every player: the first ones seen, then every change
  spellLog?: Array<{ t: number; p: string; slot: 1 | 2; name: string; key: string }>;
  // Draft info captured in champion select, when the app was watching it
  champSelect?: NonNullable<LiveSessionData["champSelect"]> | null;
}

// What the live tab showed for a game, as stored with the match
export interface StoredLiveGame extends StoredLiveBody {
  gameId: number;
  durationSec: number;
  recordedAt: number;
}

export interface LiveFull {
  fetchedAt: number;
  // "no-game" means the Live Client port is closed or answered nothing usable
  state: "in-game" | "no-game";
  gameflowPhase: string | null;
  game: LiveGameInfo | null;
  me: LiveActivePlayer | null;
  players: LivePlayer[];
  events: LiveEvent[];
  // The untouched allgamedata payload, for the raw viewer
  raw: unknown;
  // The client's gameflow gameData (without the lobby password); absent without a connected client
  session?: unknown;
}
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

export interface BackfillTeamsLocalResult {
  total: number;
  processed: number;
  inserted: number;
  skipped: number;
  errors: number;
}

export interface BackfillTimelineLocalResult {
  total: number;
  processed: number;
  updated: number;
  skipped: number;
  errors: number;
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
  cancelled: boolean;
  error?: string;
}

export interface RiotSyncOptions {
  refreshExisting?: boolean;
}

export interface RiotSyncProgress {
  phase: string;
  accountIndex: number;
  accountTotal: number;
  currentGame: number;
  totalGames: number;
  currentAccount: string;
}

export interface ResolvedPlatform {
  platform: string;
  route: string;
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
  wins: number;
  decidedGames: number;
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
  // False outside the portable exe, where there is no file to swap
  canInstall?: boolean;
}

export interface UpdateProgress {
  phase: "downloading" | "verifying" | "installing";
  percent: number;
  received: number;
  total: number;
  bytesPerSecond: number;
}

export interface DbStats {
  games: number;
  sizeBytes: number;
  freeBytes: number;
  backupBytes: number;
  imageBytes: number;
  oldestGame: number | null;
  newestGame: number | null;
  tables: { name: string; rows: number }[];
}

export type AchievementTotals = Record<
  | "games"
  | "wins"
  | "kills"
  | "assists"
  | "deaths"
  | "damage"
  | "damageTaken"
  | "healing"
  | "gold"
  | "cs"
  | "hours"
  | "doubles"
  | "triples"
  | "quadras"
  | "pentas"
  | "champions"
  | "championsWon"
  | "bestKills"
  | "bestAssists"
  | "bestDamage"
  | "bestSpree"
  | "bestCrit"
  | "deathlessWins"
  | "greatScores"
  | "mvps"
  | "favorites"
  | "bestStreak"
  | "mainGames"
  | "masteredChampions",
  number
>;

export interface ClientChallenge {
  id: number;
  name: string;
  description: string;
  category: string;
  // League tier name in capitals, or "NONE"
  level: string;
  value: number;
  // Only the tiers this challenge has, lowest first: many have a single one
  tiers: { level: string; value: number }[];
  // Lower is better (a leaderboard-style division number)
  reverse: boolean;
  nextThreshold: number | null;
  // Percent of players at or above you, 0..100; null while unranked
  percentile: number | null;
}

export interface ChallengesData {
  challenges: ClientChallenge[];
  totalPoints: number;
  totalLevel: string;
  fetchedAt: number | null;
  // false when this is the saved copy from an earlier session
  live: boolean;
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

export interface StorageInfo {
  dbDir: string;
  dbIsDefault: boolean;
  backupDir: string;
  backupIsDefault: boolean;
}

export interface StorageResult {
  status: "ok" | "cancelled" | "error";
  message?: string;
}

export interface ElectronAPI {
  getStorageInfo: () => Promise<StorageInfo>;
  changeDbFolder: (reset: boolean) => Promise<StorageResult>;
  changeBackupFolder: (reset: boolean) => Promise<StorageResult>;
  openDbFolder: () => Promise<void>;
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
  repairDerivedScores: () => Promise<{ repaired: number }>;
  getMatchDetail: (gameId: number) => Promise<MatchDetail>;
  getTimeline: (gameId: number) => Promise<TimelineData | null>;
  fetchTimeline: (gameId: number, platform?: string) => Promise<TimelineData | null>;
  reparseTimelines: (limit: number) => Promise<number>;
  backfillCombatStats: (options?: { batchSize?: number }) => Promise<{
    updated: number;
    scanned: number;
  }>;
  backfillTeamsLocal: (options?: { limit?: number }) => Promise<BackfillTeamsLocalResult>;
  backfillTimelineLocal: (options?: { limit?: number }) => Promise<BackfillTimelineLocalResult>;
  onBackfillCombatStatsProgress: (
    callback: (progress: { done: number; total: number }) => void,
  ) => () => void;
  timelineBackfillStart: (options: {
    limit: number;
  }) => Promise<{ started: true } | { started: false; reason: "already-running" }>;
  timelineBackfillStatus: () => Promise<TimelineBackfillProgress | null>;
  timelineBackfillStop: () => Promise<{ stopped: boolean }>;
  onTimelineBackfillProgress: (
    callback: (progress: TimelineBackfillProgress) => void,
  ) => () => void;
  onTimelineBackfillDone: (
    callback: (payload: { cancelled: boolean; progress: TimelineBackfillProgress | null }) => void,
  ) => () => void;
  toggleFavorite: (gameId: number) => Promise<boolean>;
  getChampionStats: (
    patch?: string,
    queue?: number,
    account?: string,
    timePeriod?: HomeTimePeriod,
  ) => Promise<ChampionStats[]>;
  getActivityHeatmap: (
    account?: string,
    timePeriod?: HomeTimePeriod,
    queue?: number,
  ) => Promise<ActivityHeatmapDay[]>;
  getChampionDetailStats: (
    championId: number | null,
    patch?: string,
    queue?: number,
    account?: string,
    timePeriod?: HomeTimePeriod,
  ) => Promise<ChampionDetailStats>;
  getChampionChallengeAggregates: (
    puuid: string,
    championId: number,
  ) => Promise<ChampionChallengeAggregates>;
  getChampionTeamObjectives: (puuid: string, championId: number) => Promise<ChampionTeamObjectives>;
  getChampionStatBaseline: (
    championId: number,
    patch?: string,
    queue?: number,
    account?: string,
  ) => Promise<ChampionStatBaseline>;
  getChampionQueueStats: (
    championId: number | null,
    account?: string,
    queue?: number,
  ) => Promise<ChampionQueueStat[]>;
  getChampionRoleStats: (
    championId: number | null,
    patch?: string,
    queue?: number,
    account?: string,
    timePeriod?: HomeTimePeriod,
  ) => Promise<ChampionRoleStat[]>;
  getChampionKeystones: (
    championId: number | null,
    account?: string,
    timePeriod?: HomeTimePeriod,
    queue?: number,
  ) => Promise<ChampionKeystoneStat[]>;
  getChampionRuneStats: (
    championId: number | null,
    patch?: string,
    queue?: number,
    account?: string,
  ) => Promise<ChampionRuneStatsResult>;
  getChampionWeeklyWinRate: (
    championId: number | null,
    account?: string,
    queue?: number,
  ) => Promise<ChampionWeeklyWinRate[]>;
  getChampionWeeklyMetrics: (
    championId: number,
    patch?: string,
    queue?: string,
    account?: string,
  ) => Promise<ChampionWeeklyMetrics[]>;
  getChampionTrendsData: (
    championId: number | null,
    patch?: string,
    queue?: number,
    account?: string,
  ) => Promise<ChampionTrendsData>;
  getChampionTimelineGames: (
    championId: number | null,
    limit: number,
    patch?: string,
    queue?: number,
    account?: string,
  ) => Promise<ChampionTimelineGame[]>;
  getChampionTimelineAverages: (
    championId: number | null,
    patch?: string,
    queue?: number,
    account?: string,
  ) => Promise<ChampionTimelineAverages>;
  getChampionKillDeathPositions: (
    championId: number,
    limit?: number,
    account?: string,
  ) => Promise<ChampionKillDeathPosition[]>;
  getOtherPlayersStats: (queue?: number) => Promise<OtherPlayersStats>;
  getChampionMatchups: (championId: number | null, account?: string) => Promise<ChampionMatchups>;
  getChampionMatchupList: (
    championId: number | null,
    patch?: string,
    queue?: number,
    account?: string,
    timePeriod?: HomeTimePeriod,
  ) => Promise<ChampionMatchupRow[]>;
  getChampionAllyStats: (
    championId: number | null,
    patch?: string,
    queue?: number,
    account?: string,
    timePeriod?: HomeTimePeriod,
  ) => Promise<ChampionAllyRow[]>;
  getChampionTeammateStats: (
    championId: number | null,
    patch?: string,
    queue?: number,
    account?: string,
  ) => Promise<ChampionTeammateRow[]>;
  getAugmentStats: (
    championId?: number,
    patch?: string,
    queue?: number,
    account?: string,
    timePeriod?: HomeTimePeriod,
  ) => Promise<AugmentStats[]>;
  getAugmentDetail: (
    augmentId: number,
    patch?: string,
    queue?: number,
    account?: string,
  ) => Promise<AugmentDetail>;
  getAugmentStatsDetailed: (
    patch?: string,
    queue?: number,
    account?: string,
  ) => Promise<AugmentStatsDetailedResult>;
  getDashboard: (
    filters?: Pick<MatchFilters, "championId" | "patch" | "queue" | "account" | "timePeriod">,
  ) => Promise<DashboardData>;
  getHomeDashboard: (
    account: HomeAccountFilter,
    timePeriod: HomeTimePeriod,
    queue: number | number[] | undefined,
  ) => Promise<HomeDashboardPayload>;
  getRoleBreakdown: (
    account: HomeAccountFilter,
    queue: number | number[] | undefined,
    timePeriod: HomeTimePeriod,
  ) => Promise<RoleBreakdown[]>;
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
    championId: number | null,
    limit: number,
    offset: number,
    patch?: string,
    queue?: number,
    account?: string,
    timePeriod?: HomeTimePeriod,
  ) => Promise<{ matches: MatchListItem[]; total: number }>;
  getChampionRecords: (
    championId: number | null,
    patch?: string,
    queue?: number,
    account?: string,
    timePeriod?: HomeTimePeriod,
  ) => Promise<ChampionRecordsResult>;
  getChampionItemStats: (
    championId: number | null,
    patch?: string,
    queue?: number,
    account?: string,
  ) => Promise<ItemStats[]>;
  getChampionSkillOrders: (
    championId: number,
    patch?: string,
    queue?: number,
    account?: string,
  ) => Promise<ChampionSkillOrdersResult>;
  getTeammateStats: (queue?: number, relation?: "friends" | "enemies") => Promise<TeammateStats[]>;
  getTeammateGroups: (queue?: number) => Promise<import("./groups").TeammateGroup[]>;
  getMatchInsights: (queue?: number, account?: string) => Promise<MatchInsights>;
  getTeammateChampions: (
    queue?: number,
    relation?: "friends" | "enemies",
  ) => Promise<TeammateChampionStats[]>;
  getTeammateDetail: (
    key: string,
    queue?: number,
    relation?: "friends" | "enemies",
  ) => Promise<TeammateDetail | null>;
  getGlobalStats: (patch?: string, queue?: number) => Promise<GlobalStats>;
  getOwnedItemStats: (
    patch?: string,
    queue?: number,
    account?: string,
  ) => Promise<OwnedItemStatsResult & OwnedItemStats[]>;
  getOwnedRuneStats: (queue?: number, patch?: string, account?: string) => Promise<RuneOverview>;
  getRuneData: () => Promise<RuneData>;
  getRuneTrees: () => Promise<RuneTreeLayout>;
  getOwnedItemDetail: (itemIds: number[], patch?: string, queue?: number) => Promise<ItemDetail>;
  getTrends: (
    queue?: number,
    account?: string,
    timePeriod?: "4w" | "12w" | "6m" | "all",
    patch?: string,
  ) => Promise<TrendsData>;
  getRecords: (queue?: number, account?: string) => Promise<RecordsData>;
  getGlobalChampionDetail: (
    championId: number | null,
    patch?: string,
    queue?: number,
    account?: string,
    timePeriod?: HomeTimePeriod,
  ) => Promise<GlobalChampionDetail>;
  getSummonerPuuid: () => Promise<string | null>;
  getAllSummonerPuuids: () => Promise<string[]>;
  listAccountsWithData: () => Promise<AccountListItem[]>;
  getResolvedPlatform: () => Promise<ResolvedPlatform | { error: string }>;
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
  mergeDuplicateAccounts: () => Promise<MergeDuplicateAccountsResult>;
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
  syncRiotHistory: (options?: RiotSyncOptions) => Promise<RiotSyncResult | { error: string }>;
  riotCancelSync: () => Promise<{ cancelled: true }>;
  onRiotSyncProgress: (callback: (progress: RiotSyncProgress) => void) => () => void;
  listRiotAccounts: () => Promise<RiotAccountConfig[]>;
  removeRiotAccount: (id: string) => Promise<RiotAccountConfig[]>;
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
  getLiveGame: () => Promise<LiveGameData | null>;
  getLiveSession: () => Promise<LiveSessionData | null>;
  getStatRecords: (filters?: {
    championId?: number;
    stat?: string;
    queueId?: number;
  }) => Promise<LiveStatRecord[]>;
  getGameStatPeaks: (
    gameId: number,
  ) => Promise<Array<{ stat: string; peak: number; final: number }>>;
  getGameLiveData: (gameId: number) => Promise<StoredLiveGame | null>;
  getPostGameData: () => Promise<PostGameRecord[]>;
  getLiveFull: () => Promise<LiveFull>;
  getChampionDataVersion: () => Promise<string>;
  getChampionData: () => Promise<ChampionData>;
  getQueueNames: () => Promise<Record<number, string>>;
  getAugmentData: (patch?: string) => Promise<AugmentData>;
  resolveAugmentIcon: (id: number, patch?: string) => Promise<string | null>;
  cacheDragonAsset: (remoteUrl: string) => Promise<string | null>;
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
  onExportProgress: (callback: (progress: ExportProgress) => void) => () => void;
  getDbStats: () => Promise<DbStats>;
  getAchievementTotals: (queue?: number, account?: string) => Promise<AchievementTotals>;
  getChallenges: () => Promise<ChallengesData>;
  importData: () => Promise<{
    success: boolean;
    imported?: number;
    total?: number;
    skipped?: number;
    error?: string;
  }>;
  onImportProgress: (callback: (progress: ImportProgress) => void) => () => void;
  repairPuuids: () => Promise<{
    repairedGames: number;
    discoveredAccounts: number;
    rebuiltGames: number;
  }>;
  recalculateScores: () => Promise<{ games: number; ms: number } | { error: string }>;
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
  onUpdateProgress: (callback: (progress: UpdateProgress) => void) => () => void;
  openUrl: (url: string) => Promise<void>;
  minimizeWindow: () => Promise<void>;
  toggleMaximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  isWindowMaximized: () => Promise<boolean>;
  onMaximizedChanged: (callback: (maximized: boolean) => void) => () => void;
}

export interface TimelineBackfillProgress {
  current: number;
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  currentGameId: string | null;
}

export interface ExportProgress {
  phase: "games" | "timeline-status" | "timeline-frames" | "timeline-events" | "done";
  current: number;
  total: number;
  label: string;
}

export interface ImportProgress {
  phase: "reading" | "games" | "timeline-status" | "timeline-frames" | "timeline-events" | "done";
  current: number;
  total: number;
  label: string;
}

export interface TimelineBackfillResult extends TimelineBackfillProgress {
  cancelled: boolean;
}

export interface TimelineStatus {
  game_id: number;
  fetched_at: number;
  frame_count: number;
  event_count: number;
  fetch_error: string | null;
}

export interface TimelineFrame {
  frame_index: number;
  timestamp_ms: number;
  participant_id: number;
  puuid: string | null;
  level: number | null;
  xp: number | null;
  gold: number | null;
  cs: number | null;
  position_x: number | null;
  position_y: number | null;
  attack_damage: number | null;
  ability_power: number | null;
  armor: number | null;
  magic_resist: number | null;
  attack_speed: number | null;
  ability_haste: number | null;
  move_speed: number | null;
  max_health: number | null;
  current_health: number | null;
  // Damage to champions so far; only timelines from the match history service carry it
  damage?: number | null;
}

export interface TimelineEvent {
  event_index: number;
  timestamp_ms: number;
  event_type: string;
  participant_id: number | null;
  killer_id: number | null;
  victim_id: number | null;
  team_id: number | null;
  item_id: number | null;
  skill_slot: number | null;
  level_up_type: string | null;
  ward_type: string | null;
  building_type: string | null;
  monster_type: string | null;
  monster_subtype: string | null;
  position_x: number | null;
  position_y: number | null;
  assisting_participant_ids: string | null;
}

export interface MatchInsights {
  leads: Array<{
    minute: number;
    games: number;
    avgCs: number | null;
    buckets: Array<{ label: string; games: number; wins: number }>;
  }>;
  queues: Array<{
    queueId: number;
    games: number;
    goldPerMin: number | null;
    csPerMin: number | null;
    objectiveDamage: number | null;
    turretDamage: number | null;
  }>;
}

export interface TimelineData {
  status: TimelineStatus | null;
  frames: TimelineFrame[];
  events: TimelineEvent[];
}

export interface ChampionTimelineGame {
  gameId: number;
  gameCreation: number;
  queueId: number;
  championId: number;
  ownerPuuid: string | null;
  win: number;
  kills: number;
  deaths: number;
  assists: number;
  frameCount: number;
}

export interface ChampionKillDeathPosition {
  x: number;
  y: number;
  kind: "kill" | "death";
  timestampMs: number;
}

export interface TimelineBucket {
  minute: number;
  avgGold: number | null;
  avgCs: number | null;
  avgXp: number | null;
  avgLevel: number | null;
  avgGoldDiffVsLaneOpponent: number | null;
  avgCsDiffVsLaneOpponent: number | null;
  avgXpDiffVsLaneOpponent: number | null;
  sampleGames: number;
}

export interface ChampionTimelineAverages {
  buckets: TimelineBucket[];
  ahead10: number | null;
  itemsBought: number | null;
  comebacks: number | null;
  avgLevel6Ms?: number | null;
  avgLevel11Ms?: number | null;
  avgLevel16Ms?: number | null;
  level6Games?: number;
  level11Games?: number;
  level16Games?: number;
  winrateByGoldLead15: {
    behind1000plus: number | null;
    behind0to1000: number | null;
    ahead0to1000: number | null;
    ahead1000plus: number | null;
  } | null;
  goldLeadDistribution15: {
    behind1000plus: number;
    behind0to1000: number;
    ahead0to1000: number;
    ahead1000plus: number;
  } | null;
  spendingTimeline: Array<{ minute: number; averageItems: number | null }> | null;
}
