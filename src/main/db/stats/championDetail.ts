import { db } from "../../db";
import { NO_STATS_QUEUE_IDS } from "../../../shared/queues";
import { applyQueueFilter, pushTimeFilter, ownerFilter } from "../filters";

export function getChampionDetailStats(
  championId: number | null,
  patch?: string,
  queue?: number | number[],
  account?: string,
  timePeriod?: "24h" | "7d" | "30d" | "full",
): {
  games: number;
  killParticipation: number;
  damageShare: number;
  avgDamageTaken: number;
  avgHeal: number;
  avgPhysicalDamageDealt: number;
  maxPhysicalDamageDealt: number;
  totalPhysicalDamageDealt: number;
  avgMagicDamageDealt: number;
  maxMagicDamageDealt: number;
  totalMagicDamageDealt: number;
  avgTrueDamageDealt: number | null;
  avgTrueDamageDealtInWins: number | null;
  avgTrueDamageDealtInLosses: number | null;
  maxTrueDamageDealt: number | null;
  avgPhysicalDamageTaken: number;
  maxPhysicalDamageTaken: number;
  totalPhysicalDamageTaken: number;
  avgMagicDamageTaken: number;
  maxMagicDamageTaken: number;
  totalMagicDamageTaken: number;
  avgTrueDamageTaken: number;
  maxTrueDamageTaken: number;
  totalTrueDamageTaken: number;
  avgDamageSelfMitigated: number;
  maxDamageSelfMitigated: number;
  totalDamageSelfMitigated: number;
  avgDamageToObjectives: number;
  maxDamageToObjectives: number;
  totalDamageToObjectives: number;
  avgDamageToTurrets: number;
  maxDamageToTurrets: number;
  totalDamageToTurrets: number;
  avgTimeCcOthers: number;
  maxTimeCcOthers: number;
  totalTimeCcOthers: number;
  avgTotalCcDealt: number;
  maxTotalCcDealt: number;
  totalTotalCcDealt: number;
  avgLongestAlive: number;
  maxLongestAlive: number;
  totalLongestAlive: number;
  avgKillingSprees: number;
  maxKillingSprees: number;
  totalKillingSprees: number;
  avgFirstBloodKill: number;
  maxFirstBloodKill: number;
  totalFirstBloodKill: number;
  avgFirstBloodAssist: number;
  maxFirstBloodAssist: number;
  totalFirstBloodAssist: number;
  avgCcPerMin: number;
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
  maxGoldSpent: number;
  totalGoldSpent: number;
  maxChampLevel: number;
  avgTotalMinionsKilled: number;
  maxTotalMinionsKilled: number;
  totalTotalMinionsKilled: number;
  avgNeutralMinionsKilled: number;
  maxNeutralMinionsKilled: number;
  totalNeutralMinionsKilled: number;
  avgNeutralMinionsEnemyJungle: number;
  maxNeutralMinionsEnemyJungle: number;
  totalNeutralMinionsEnemyJungle: number;
  avgNeutralMinionsTeamJungle: number;
  maxNeutralMinionsTeamJungle: number;
  totalNeutralMinionsTeamJungle: number;
  avgTurretKills: number;
  maxTurretKills: number;
  totalTurretKills: number;
  avgInhibitorKills: number;
  maxInhibitorKills: number;
  totalInhibitorKills: number;
  avgTurretPlatesTaken: number;
  maxTurretPlatesTaken: number;
  totalTurretPlatesTaken: number;
  avgBaronKills: number;
  maxBaronKills: number;
  totalBaronKills: number;
  avgObjectivesStolen: number;
  maxObjectivesStolen: number;
  totalObjectivesStolen: number;
  avgObjectivesStolenAssists: number;
  maxObjectivesStolenAssists: number;
  totalObjectivesStolenAssists: number;
  totalFirstTowerKill: number;
  totalFirstTowerAssist: number;
  totalFirstInhibitorKill: number;
  totalFirstInhibitorAssist: number;
  goldPerMin: number;
  avgGameLength: number;
  totalTimePlayed: number;
  longestWinStreak: number;
  avgVisionScore: number;
  maxVisionScore: number;
  totalVisionScore: number;
  avgWardsPlaced: number;
  maxWardsPlaced: number;
  totalWardsPlaced: number;
  avgWardsKilled: number;
  maxWardsKilled: number;
  totalWardsKilled: number;
  avgVisionWardsBought: number;
  maxVisionWardsBought: number;
  totalVisionWardsBought: number;
  avgSightWardsBought: number;
  maxSightWardsBought: number;
  totalSightWardsBought: number;
} {
  const where: string[] = ["g.is_remake = 0", "g.source != 'search-import'"];
  const statsPlaceholders = NO_STATS_QUEUE_IDS.map(() => "?").join(",");
  const params: any[] = [];
  where.push(`g.queue_id NOT IN (${statsPlaceholders})`);
  params.push(...NO_STATS_QUEUE_IDS);

  if (patch) {
    where.push("g.game_version = ?");
    params.push(patch);
  }

  applyQueueFilter(where, params, queue, "g");
  pushTimeFilter(where, params, timePeriod);

  where.push(ownerFilter("mp", account));
  if (account && account !== "all") params.push(account);

  const result = db
    .prepare(`
      WITH champion_rows AS (
        SELECT mp.game_id, mp.team_id, mp.win, mp.kills, mp.assists,
               mp.total_damage_dealt, mp.total_damage_taken, mp.total_heal,
               mp.physical_damage_dealt, mp.magic_damage_dealt,
               mp.physical_damage_taken, mp.magic_damage_taken,
               mp.true_damage_taken, mp.true_damage_dealt, mp.damage_self_mitigated,
               mp.damage_to_objectives, mp.damage_to_turrets,
               mp.time_cc_others, mp.total_cc_dealt, mp.longest_alive,
               mp.killing_sprees, mp.first_blood_kill, mp.first_blood_assist,
               mp.gold_spent, mp.champ_level, mp.total_minions_killed,
               mp.neutral_minions_killed, mp.neutral_minions_enemy_jungle,
               mp.neutral_minions_team_jungle, mp.turret_kills, mp.inhibitor_kills,
               mp.turret_plates_taken, mp.baron_kills, mp.objectives_stolen,
               mp.objectives_stolen_assists, mp.first_tower_kill, mp.first_tower_assist,
               mp.first_inhibitor_kill, mp.first_inhibitor_assist,
               mp.vision_score, mp.wards_placed, mp.wards_killed,
               mp.vision_wards_bought, mp.sight_wards_bought,
               mp.gold_earned, g.game_duration, g.game_creation
        FROM match_participants mp
        JOIN games g ON mp.game_id = g.game_id
        WHERE ${where.join(" AND ")}${championId !== null ? " AND mp.champion_id = ?" : ""}
      ),
      teams AS (
        SELECT mp.game_id, mp.team_id,
               SUM(mp.total_damage_dealt) AS team_damage,
               SUM(mp.kills) AS team_kills
        FROM match_participants mp
        WHERE mp.game_id IN (SELECT game_id FROM champion_rows)
        GROUP BY mp.game_id, mp.team_id
      ),
      ordered AS (
        SELECT win,
               ROW_NUMBER() OVER (ORDER BY game_creation ASC) AS rn_all,
               ROW_NUMBER() OVER (PARTITION BY win ORDER BY game_creation ASC) AS rn_win
        FROM champion_rows
      ),
      streaks AS (
        SELECT COUNT(*) AS len
        FROM ordered
        WHERE win = 1
        GROUP BY (rn_all - rn_win)
      )
      SELECT
        COUNT(*) AS games,
        AVG(CASE WHEN t.team_kills > 0
                 THEN (cr.kills + cr.assists) * 1.0 / t.team_kills END) AS killParticipation,
        AVG(CASE WHEN t.team_damage > 0
                 THEN cr.total_damage_dealt * 1.0 / t.team_damage END) AS damageShare,
        AVG(cr.total_damage_taken) AS avgDamageTaken,
        AVG(CASE WHEN cr.win = 1 THEN cr.total_damage_taken END) AS avgDamageTakenInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.total_damage_taken END) AS avgDamageTakenInLosses,
        AVG(cr.total_heal) AS avgHeal,
        AVG(CASE WHEN cr.win = 1 THEN cr.total_heal END) AS avgHealInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.total_heal END) AS avgHealInLosses,
        AVG(cr.physical_damage_dealt) AS avgPhysicalDamageDealt,
        AVG(CASE WHEN cr.win = 1 THEN cr.physical_damage_dealt END) AS avgPhysicalDamageDealtInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.physical_damage_dealt END) AS avgPhysicalDamageDealtInLosses,
        MAX(cr.physical_damage_dealt) AS maxPhysicalDamageDealt,
        MAX(CASE WHEN cr.win = 1 THEN cr.physical_damage_dealt END) AS maxPhysicalDamageDealtInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.physical_damage_dealt END) AS maxPhysicalDamageDealtInLosses,
        SUM(cr.physical_damage_dealt) AS totalPhysicalDamageDealt,
        SUM(CASE WHEN cr.win = 1 THEN cr.physical_damage_dealt END) AS totalPhysicalDamageDealtInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.physical_damage_dealt END) AS totalPhysicalDamageDealtInLosses,
        AVG(cr.magic_damage_dealt) AS avgMagicDamageDealt,
        AVG(CASE WHEN cr.win = 1 THEN cr.magic_damage_dealt END) AS avgMagicDamageDealtInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.magic_damage_dealt END) AS avgMagicDamageDealtInLosses,
        MAX(cr.magic_damage_dealt) AS maxMagicDamageDealt,
        MAX(CASE WHEN cr.win = 1 THEN cr.magic_damage_dealt END) AS maxMagicDamageDealtInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.magic_damage_dealt END) AS maxMagicDamageDealtInLosses,
        SUM(cr.magic_damage_dealt) AS totalMagicDamageDealt,
        SUM(CASE WHEN cr.win = 1 THEN cr.magic_damage_dealt END) AS totalMagicDamageDealtInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.magic_damage_dealt END) AS totalMagicDamageDealtInLosses,
        AVG(cr.true_damage_dealt) AS avgTrueDamageDealt,
        AVG(CASE WHEN cr.win = 1 THEN cr.true_damage_dealt END) AS avgTrueDamageDealtInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.true_damage_dealt END) AS avgTrueDamageDealtInLosses,
        MAX(cr.true_damage_dealt) AS maxTrueDamageDealt,
        AVG(cr.physical_damage_taken) AS avgPhysicalDamageTaken,
        AVG(CASE WHEN cr.win = 1 THEN cr.physical_damage_taken END) AS avgPhysicalDamageTakenInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.physical_damage_taken END) AS avgPhysicalDamageTakenInLosses,
        MAX(cr.physical_damage_taken) AS maxPhysicalDamageTaken,
        MAX(CASE WHEN cr.win = 1 THEN cr.physical_damage_taken END) AS maxPhysicalDamageTakenInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.physical_damage_taken END) AS maxPhysicalDamageTakenInLosses,
        SUM(cr.physical_damage_taken) AS totalPhysicalDamageTaken,
        SUM(CASE WHEN cr.win = 1 THEN cr.physical_damage_taken END) AS totalPhysicalDamageTakenInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.physical_damage_taken END) AS totalPhysicalDamageTakenInLosses,
        AVG(cr.magic_damage_taken) AS avgMagicDamageTaken,
        AVG(CASE WHEN cr.win = 1 THEN cr.magic_damage_taken END) AS avgMagicDamageTakenInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.magic_damage_taken END) AS avgMagicDamageTakenInLosses,
        MAX(cr.magic_damage_taken) AS maxMagicDamageTaken,
        MAX(CASE WHEN cr.win = 1 THEN cr.magic_damage_taken END) AS maxMagicDamageTakenInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.magic_damage_taken END) AS maxMagicDamageTakenInLosses,
        SUM(cr.magic_damage_taken) AS totalMagicDamageTaken,
        SUM(CASE WHEN cr.win = 1 THEN cr.magic_damage_taken END) AS totalMagicDamageTakenInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.magic_damage_taken END) AS totalMagicDamageTakenInLosses,
        AVG(cr.true_damage_taken) AS avgTrueDamageTaken,
        AVG(CASE WHEN cr.win = 1 THEN cr.true_damage_taken END) AS avgTrueDamageTakenInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.true_damage_taken END) AS avgTrueDamageTakenInLosses,
        MAX(cr.true_damage_taken) AS maxTrueDamageTaken,
        MAX(CASE WHEN cr.win = 1 THEN cr.true_damage_taken END) AS maxTrueDamageTakenInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.true_damage_taken END) AS maxTrueDamageTakenInLosses,
        SUM(cr.true_damage_taken) AS totalTrueDamageTaken,
        SUM(CASE WHEN cr.win = 1 THEN cr.true_damage_taken END) AS totalTrueDamageTakenInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.true_damage_taken END) AS totalTrueDamageTakenInLosses,
        AVG(cr.damage_self_mitigated) AS avgDamageSelfMitigated,
        AVG(CASE WHEN cr.win = 1 THEN cr.damage_self_mitigated END) AS avgDamageSelfMitigatedInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.damage_self_mitigated END) AS avgDamageSelfMitigatedInLosses,
        MAX(cr.damage_self_mitigated) AS maxDamageSelfMitigated,
        MAX(CASE WHEN cr.win = 1 THEN cr.damage_self_mitigated END) AS maxDamageSelfMitigatedInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.damage_self_mitigated END) AS maxDamageSelfMitigatedInLosses,
        SUM(cr.damage_self_mitigated) AS totalDamageSelfMitigated,
        SUM(CASE WHEN cr.win = 1 THEN cr.damage_self_mitigated END) AS totalDamageSelfMitigatedInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.damage_self_mitigated END) AS totalDamageSelfMitigatedInLosses,
        AVG(cr.damage_to_objectives) AS avgDamageToObjectives,
        AVG(CASE WHEN cr.win = 1 THEN cr.damage_to_objectives END) AS avgDamageToObjectivesInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.damage_to_objectives END) AS avgDamageToObjectivesInLosses,
        MAX(cr.damage_to_objectives) AS maxDamageToObjectives,
        MAX(CASE WHEN cr.win = 1 THEN cr.damage_to_objectives END) AS maxDamageToObjectivesInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.damage_to_objectives END) AS maxDamageToObjectivesInLosses,
        SUM(cr.damage_to_objectives) AS totalDamageToObjectives,
        SUM(CASE WHEN cr.win = 1 THEN cr.damage_to_objectives END) AS totalDamageToObjectivesInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.damage_to_objectives END) AS totalDamageToObjectivesInLosses,
        AVG(cr.damage_to_turrets) AS avgDamageToTurrets,
        AVG(CASE WHEN cr.win = 1 THEN cr.damage_to_turrets END) AS avgDamageToTurretsInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.damage_to_turrets END) AS avgDamageToTurretsInLosses,
        MAX(cr.damage_to_turrets) AS maxDamageToTurrets,
        MAX(CASE WHEN cr.win = 1 THEN cr.damage_to_turrets END) AS maxDamageToTurretsInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.damage_to_turrets END) AS maxDamageToTurretsInLosses,
        SUM(cr.damage_to_turrets) AS totalDamageToTurrets,
        SUM(CASE WHEN cr.win = 1 THEN cr.damage_to_turrets END) AS totalDamageToTurretsInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.damage_to_turrets END) AS totalDamageToTurretsInLosses,
        AVG(cr.time_cc_others) AS avgTimeCcOthers,
        AVG(CASE WHEN cr.win = 1 THEN cr.time_cc_others END) AS avgTimeCcOthersInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.time_cc_others END) AS avgTimeCcOthersInLosses,
        MAX(cr.time_cc_others) AS maxTimeCcOthers,
        MAX(CASE WHEN cr.win = 1 THEN cr.time_cc_others END) AS maxTimeCcOthersInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.time_cc_others END) AS maxTimeCcOthersInLosses,
        SUM(cr.time_cc_others) AS totalTimeCcOthers,
        SUM(CASE WHEN cr.win = 1 THEN cr.time_cc_others END) AS totalTimeCcOthersInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.time_cc_others END) AS totalTimeCcOthersInLosses,
        AVG(cr.total_cc_dealt) AS avgTotalCcDealt,
        AVG(CASE WHEN cr.win = 1 THEN cr.total_cc_dealt END) AS avgTotalCcDealtInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.total_cc_dealt END) AS avgTotalCcDealtInLosses,
        MAX(cr.total_cc_dealt) AS maxTotalCcDealt,
        MAX(CASE WHEN cr.win = 1 THEN cr.total_cc_dealt END) AS maxTotalCcDealtInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.total_cc_dealt END) AS maxTotalCcDealtInLosses,
        SUM(cr.total_cc_dealt) AS totalTotalCcDealt,
        SUM(CASE WHEN cr.win = 1 THEN cr.total_cc_dealt END) AS totalTotalCcDealtInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.total_cc_dealt END) AS totalTotalCcDealtInLosses,
        AVG(cr.longest_alive) AS avgLongestAlive,
        AVG(CASE WHEN cr.win = 1 THEN cr.longest_alive END) AS avgLongestAliveInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.longest_alive END) AS avgLongestAliveInLosses,
        MAX(cr.longest_alive) AS maxLongestAlive,
        MAX(CASE WHEN cr.win = 1 THEN cr.longest_alive END) AS maxLongestAliveInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.longest_alive END) AS maxLongestAliveInLosses,
        SUM(cr.longest_alive) AS totalLongestAlive,
        SUM(CASE WHEN cr.win = 1 THEN cr.longest_alive END) AS totalLongestAliveInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.longest_alive END) AS totalLongestAliveInLosses,
        AVG(cr.killing_sprees) AS avgKillingSprees,
        AVG(CASE WHEN cr.win = 1 THEN cr.killing_sprees END) AS avgKillingSpreesInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.killing_sprees END) AS avgKillingSpreesInLosses,
        MAX(cr.killing_sprees) AS maxKillingSprees,
        MAX(CASE WHEN cr.win = 1 THEN cr.killing_sprees END) AS maxKillingSpreesInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.killing_sprees END) AS maxKillingSpreesInLosses,
        SUM(cr.killing_sprees) AS totalKillingSprees,
        SUM(CASE WHEN cr.win = 1 THEN cr.killing_sprees END) AS totalKillingSpreesInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.killing_sprees END) AS totalKillingSpreesInLosses,
        AVG(cr.first_blood_kill) AS avgFirstBloodKill,
        AVG(CASE WHEN cr.win = 1 THEN cr.first_blood_kill END) AS avgFirstBloodKillInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.first_blood_kill END) AS avgFirstBloodKillInLosses,
        MAX(cr.first_blood_kill) AS maxFirstBloodKill,
        MAX(CASE WHEN cr.win = 1 THEN cr.first_blood_kill END) AS maxFirstBloodKillInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.first_blood_kill END) AS maxFirstBloodKillInLosses,
        SUM(cr.first_blood_kill) AS totalFirstBloodKill,
        SUM(CASE WHEN cr.win = 1 THEN cr.first_blood_kill END) AS totalFirstBloodKillInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.first_blood_kill END) AS totalFirstBloodKillInLosses,
        AVG(cr.first_blood_assist) AS avgFirstBloodAssist,
        AVG(CASE WHEN cr.win = 1 THEN cr.first_blood_assist END) AS avgFirstBloodAssistInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.first_blood_assist END) AS avgFirstBloodAssistInLosses,
        MAX(cr.first_blood_assist) AS maxFirstBloodAssist,
        MAX(CASE WHEN cr.win = 1 THEN cr.first_blood_assist END) AS maxFirstBloodAssistInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.first_blood_assist END) AS maxFirstBloodAssistInLosses,
        SUM(cr.first_blood_assist) AS totalFirstBloodAssist,
        SUM(CASE WHEN cr.win = 1 THEN cr.first_blood_assist END) AS totalFirstBloodAssistInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.first_blood_assist END) AS totalFirstBloodAssistInLosses,
        AVG(cr.gold_earned) AS avgGoldEarned,
        MAX(cr.gold_earned) AS maxGoldEarned,
        SUM(cr.gold_earned) AS totalGoldEarned,
        AVG(CASE WHEN cr.win = 1 THEN cr.gold_earned END) AS avgGoldEarnedInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.gold_earned END) AS avgGoldEarnedInLosses,
        MAX(CASE WHEN cr.win = 1 THEN cr.gold_earned END) AS maxGoldEarnedInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.gold_earned END) AS maxGoldEarnedInLosses,
        SUM(CASE WHEN cr.win = 1 THEN cr.gold_earned END) AS totalGoldEarnedInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.gold_earned END) AS totalGoldEarnedInLosses,
        AVG(cr.gold_spent) AS avgGoldSpent,
        AVG(CASE WHEN cr.win = 1 THEN cr.gold_spent END) AS avgGoldSpentInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.gold_spent END) AS avgGoldSpentInLosses,
        MAX(cr.gold_spent) AS maxGoldSpent,
        MAX(CASE WHEN cr.win = 1 THEN cr.gold_spent END) AS maxGoldSpentInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.gold_spent END) AS maxGoldSpentInLosses,
        SUM(cr.gold_spent) AS totalGoldSpent,
        SUM(CASE WHEN cr.win = 1 THEN cr.gold_spent END) AS totalGoldSpentInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.gold_spent END) AS totalGoldSpentInLosses,
        MAX(cr.champ_level) AS maxChampLevel,
        MAX(CASE WHEN cr.win = 1 THEN cr.champ_level END) AS maxChampLevelInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.champ_level END) AS maxChampLevelInLosses,
        AVG(cr.total_minions_killed) AS avgTotalMinionsKilled,
        AVG(CASE WHEN cr.win = 1 THEN cr.total_minions_killed END) AS avgTotalMinionsKilledInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.total_minions_killed END) AS avgTotalMinionsKilledInLosses,
        MAX(cr.total_minions_killed) AS maxTotalMinionsKilled,
        MAX(CASE WHEN cr.win = 1 THEN cr.total_minions_killed END) AS maxTotalMinionsKilledInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.total_minions_killed END) AS maxTotalMinionsKilledInLosses,
        SUM(cr.total_minions_killed) AS totalTotalMinionsKilled,
        SUM(CASE WHEN cr.win = 1 THEN cr.total_minions_killed END) AS totalTotalMinionsKilledInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.total_minions_killed END) AS totalTotalMinionsKilledInLosses,
        AVG(cr.neutral_minions_killed) AS avgNeutralMinionsKilled,
        AVG(CASE WHEN cr.win = 1 THEN cr.neutral_minions_killed END) AS avgNeutralMinionsKilledInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.neutral_minions_killed END) AS avgNeutralMinionsKilledInLosses,
        MAX(cr.neutral_minions_killed) AS maxNeutralMinionsKilled,
        MAX(CASE WHEN cr.win = 1 THEN cr.neutral_minions_killed END) AS maxNeutralMinionsKilledInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.neutral_minions_killed END) AS maxNeutralMinionsKilledInLosses,
        SUM(cr.neutral_minions_killed) AS totalNeutralMinionsKilled,
        SUM(CASE WHEN cr.win = 1 THEN cr.neutral_minions_killed END) AS totalNeutralMinionsKilledInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.neutral_minions_killed END) AS totalNeutralMinionsKilledInLosses,
        AVG(cr.neutral_minions_enemy_jungle) AS avgNeutralMinionsEnemyJungle,
        AVG(CASE WHEN cr.win = 1 THEN cr.neutral_minions_enemy_jungle END) AS avgNeutralMinionsEnemyJungleInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.neutral_minions_enemy_jungle END) AS avgNeutralMinionsEnemyJungleInLosses,
        MAX(cr.neutral_minions_enemy_jungle) AS maxNeutralMinionsEnemyJungle,
        MAX(CASE WHEN cr.win = 1 THEN cr.neutral_minions_enemy_jungle END) AS maxNeutralMinionsEnemyJungleInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.neutral_minions_enemy_jungle END) AS maxNeutralMinionsEnemyJungleInLosses,
        SUM(cr.neutral_minions_enemy_jungle) AS totalNeutralMinionsEnemyJungle,
        SUM(CASE WHEN cr.win = 1 THEN cr.neutral_minions_enemy_jungle END) AS totalNeutralMinionsEnemyJungleInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.neutral_minions_enemy_jungle END) AS totalNeutralMinionsEnemyJungleInLosses,
        AVG(cr.neutral_minions_team_jungle) AS avgNeutralMinionsTeamJungle,
        AVG(CASE WHEN cr.win = 1 THEN cr.neutral_minions_team_jungle END) AS avgNeutralMinionsTeamJungleInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.neutral_minions_team_jungle END) AS avgNeutralMinionsTeamJungleInLosses,
        MAX(cr.neutral_minions_team_jungle) AS maxNeutralMinionsTeamJungle,
        MAX(CASE WHEN cr.win = 1 THEN cr.neutral_minions_team_jungle END) AS maxNeutralMinionsTeamJungleInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.neutral_minions_team_jungle END) AS maxNeutralMinionsTeamJungleInLosses,
        SUM(cr.neutral_minions_team_jungle) AS totalNeutralMinionsTeamJungle,
        SUM(CASE WHEN cr.win = 1 THEN cr.neutral_minions_team_jungle END) AS totalNeutralMinionsTeamJungleInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.neutral_minions_team_jungle END) AS totalNeutralMinionsTeamJungleInLosses,
        AVG(cr.turret_kills) AS avgTurretKills,
        AVG(CASE WHEN cr.win = 1 THEN cr.turret_kills END) AS avgTurretKillsInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.turret_kills END) AS avgTurretKillsInLosses,
        MAX(cr.turret_kills) AS maxTurretKills,
        MAX(CASE WHEN cr.win = 1 THEN cr.turret_kills END) AS maxTurretKillsInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.turret_kills END) AS maxTurretKillsInLosses,
        SUM(cr.turret_kills) AS totalTurretKills,
        SUM(CASE WHEN cr.win = 1 THEN cr.turret_kills END) AS totalTurretKillsInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.turret_kills END) AS totalTurretKillsInLosses,
        AVG(cr.inhibitor_kills) AS avgInhibitorKills,
        AVG(CASE WHEN cr.win = 1 THEN cr.inhibitor_kills END) AS avgInhibitorKillsInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.inhibitor_kills END) AS avgInhibitorKillsInLosses,
        MAX(cr.inhibitor_kills) AS maxInhibitorKills,
        MAX(CASE WHEN cr.win = 1 THEN cr.inhibitor_kills END) AS maxInhibitorKillsInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.inhibitor_kills END) AS maxInhibitorKillsInLosses,
        SUM(cr.inhibitor_kills) AS totalInhibitorKills,
        SUM(CASE WHEN cr.win = 1 THEN cr.inhibitor_kills END) AS totalInhibitorKillsInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.inhibitor_kills END) AS totalInhibitorKillsInLosses,
        AVG(cr.turret_plates_taken) AS avgTurretPlatesTaken,
        AVG(CASE WHEN cr.win = 1 THEN cr.turret_plates_taken END) AS avgTurretPlatesTakenInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.turret_plates_taken END) AS avgTurretPlatesTakenInLosses,
        MAX(cr.turret_plates_taken) AS maxTurretPlatesTaken,
        MAX(CASE WHEN cr.win = 1 THEN cr.turret_plates_taken END) AS maxTurretPlatesTakenInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.turret_plates_taken END) AS maxTurretPlatesTakenInLosses,
        SUM(cr.turret_plates_taken) AS totalTurretPlatesTaken,
        SUM(CASE WHEN cr.win = 1 THEN cr.turret_plates_taken END) AS totalTurretPlatesTakenInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.turret_plates_taken END) AS totalTurretPlatesTakenInLosses,
        AVG(cr.baron_kills) AS avgBaronKills,
        AVG(CASE WHEN cr.win = 1 THEN cr.baron_kills END) AS avgBaronKillsInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.baron_kills END) AS avgBaronKillsInLosses,
        MAX(cr.baron_kills) AS maxBaronKills,
        MAX(CASE WHEN cr.win = 1 THEN cr.baron_kills END) AS maxBaronKillsInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.baron_kills END) AS maxBaronKillsInLosses,
        SUM(cr.baron_kills) AS totalBaronKills,
        SUM(CASE WHEN cr.win = 1 THEN cr.baron_kills END) AS totalBaronKillsInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.baron_kills END) AS totalBaronKillsInLosses,
        AVG(cr.objectives_stolen) AS avgObjectivesStolen,
        AVG(CASE WHEN cr.win = 1 THEN cr.objectives_stolen END) AS avgObjectivesStolenInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.objectives_stolen END) AS avgObjectivesStolenInLosses,
        MAX(cr.objectives_stolen) AS maxObjectivesStolen,
        MAX(CASE WHEN cr.win = 1 THEN cr.objectives_stolen END) AS maxObjectivesStolenInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.objectives_stolen END) AS maxObjectivesStolenInLosses,
        SUM(cr.objectives_stolen) AS totalObjectivesStolen,
        SUM(CASE WHEN cr.win = 1 THEN cr.objectives_stolen END) AS totalObjectivesStolenInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.objectives_stolen END) AS totalObjectivesStolenInLosses,
        AVG(cr.objectives_stolen_assists) AS avgObjectivesStolenAssists,
        AVG(CASE WHEN cr.win = 1 THEN cr.objectives_stolen_assists END) AS avgObjectivesStolenAssistsInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.objectives_stolen_assists END) AS avgObjectivesStolenAssistsInLosses,
        MAX(cr.objectives_stolen_assists) AS maxObjectivesStolenAssists,
        MAX(CASE WHEN cr.win = 1 THEN cr.objectives_stolen_assists END) AS maxObjectivesStolenAssistsInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.objectives_stolen_assists END) AS maxObjectivesStolenAssistsInLosses,
        SUM(cr.objectives_stolen_assists) AS totalObjectivesStolenAssists,
        SUM(CASE WHEN cr.win = 1 THEN cr.objectives_stolen_assists END) AS totalObjectivesStolenAssistsInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.objectives_stolen_assists END) AS totalObjectivesStolenAssistsInLosses,
        AVG(cr.vision_score) AS avgVisionScore,
        AVG(CASE WHEN cr.win = 1 THEN cr.vision_score END) AS avgVisionScoreInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.vision_score END) AS avgVisionScoreInLosses,
        MAX(cr.vision_score) AS maxVisionScore,
        MAX(CASE WHEN cr.win = 1 THEN cr.vision_score END) AS maxVisionScoreInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.vision_score END) AS maxVisionScoreInLosses,
        SUM(cr.vision_score) AS totalVisionScore,
        SUM(CASE WHEN cr.win = 1 THEN cr.vision_score END) AS totalVisionScoreInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.vision_score END) AS totalVisionScoreInLosses,
        AVG(cr.wards_placed) AS avgWardsPlaced,
        AVG(CASE WHEN cr.win = 1 THEN cr.wards_placed END) AS avgWardsPlacedInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.wards_placed END) AS avgWardsPlacedInLosses,
        MAX(cr.wards_placed) AS maxWardsPlaced,
        MAX(CASE WHEN cr.win = 1 THEN cr.wards_placed END) AS maxWardsPlacedInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.wards_placed END) AS maxWardsPlacedInLosses,
        SUM(cr.wards_placed) AS totalWardsPlaced,
        SUM(CASE WHEN cr.win = 1 THEN cr.wards_placed END) AS totalWardsPlacedInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.wards_placed END) AS totalWardsPlacedInLosses,
        AVG(cr.wards_killed) AS avgWardsKilled,
        AVG(CASE WHEN cr.win = 1 THEN cr.wards_killed END) AS avgWardsKilledInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.wards_killed END) AS avgWardsKilledInLosses,
        MAX(cr.wards_killed) AS maxWardsKilled,
        MAX(CASE WHEN cr.win = 1 THEN cr.wards_killed END) AS maxWardsKilledInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.wards_killed END) AS maxWardsKilledInLosses,
        SUM(cr.wards_killed) AS totalWardsKilled,
        SUM(CASE WHEN cr.win = 1 THEN cr.wards_killed END) AS totalWardsKilledInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.wards_killed END) AS totalWardsKilledInLosses,
        AVG(cr.vision_wards_bought) AS avgVisionWardsBought,
        AVG(CASE WHEN cr.win = 1 THEN cr.vision_wards_bought END) AS avgVisionWardsBoughtInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.vision_wards_bought END) AS avgVisionWardsBoughtInLosses,
        MAX(cr.vision_wards_bought) AS maxVisionWardsBought,
        MAX(CASE WHEN cr.win = 1 THEN cr.vision_wards_bought END) AS maxVisionWardsBoughtInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.vision_wards_bought END) AS maxVisionWardsBoughtInLosses,
        SUM(cr.vision_wards_bought) AS totalVisionWardsBought,
        SUM(CASE WHEN cr.win = 1 THEN cr.vision_wards_bought END) AS totalVisionWardsBoughtInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.vision_wards_bought END) AS totalVisionWardsBoughtInLosses,
        AVG(cr.sight_wards_bought) AS avgSightWardsBought,
        AVG(CASE WHEN cr.win = 1 THEN cr.sight_wards_bought END) AS avgSightWardsBoughtInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.sight_wards_bought END) AS avgSightWardsBoughtInLosses,
        MAX(cr.sight_wards_bought) AS maxSightWardsBought,
        MAX(CASE WHEN cr.win = 1 THEN cr.sight_wards_bought END) AS maxSightWardsBoughtInWins,
        MAX(CASE WHEN cr.win = 0 THEN cr.sight_wards_bought END) AS maxSightWardsBoughtInLosses,
        SUM(cr.sight_wards_bought) AS totalSightWardsBought,
        SUM(CASE WHEN cr.win = 1 THEN cr.sight_wards_bought END) AS totalSightWardsBoughtInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.sight_wards_bought END) AS totalSightWardsBoughtInLosses,
        SUM(cr.first_tower_kill) AS totalFirstTowerKill,
        SUM(CASE WHEN cr.win = 1 THEN cr.first_tower_kill END) AS totalFirstTowerKillInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.first_tower_kill END) AS totalFirstTowerKillInLosses,
        SUM(cr.first_tower_assist) AS totalFirstTowerAssist,
        SUM(CASE WHEN cr.win = 1 THEN cr.first_tower_assist END) AS totalFirstTowerAssistInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.first_tower_assist END) AS totalFirstTowerAssistInLosses,
        SUM(cr.first_inhibitor_kill) AS totalFirstInhibitorKill,
        SUM(CASE WHEN cr.win = 1 THEN cr.first_inhibitor_kill END) AS totalFirstInhibitorKillInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.first_inhibitor_kill END) AS totalFirstInhibitorKillInLosses,
        SUM(cr.first_inhibitor_assist) AS totalFirstInhibitorAssist,
        SUM(CASE WHEN cr.win = 1 THEN cr.first_inhibitor_assist END) AS totalFirstInhibitorAssistInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.first_inhibitor_assist END) AS totalFirstInhibitorAssistInLosses,
        AVG(CASE WHEN cr.game_duration > 0
                 THEN cr.time_cc_others * 60.0 / cr.game_duration END) AS avgCcPerMin,
        AVG(CASE WHEN cr.win = 1 AND cr.game_duration > 0
                 THEN cr.time_cc_others * 60.0 / cr.game_duration END) AS avgCcPerMinInWins,
        AVG(CASE WHEN cr.win = 0 AND cr.game_duration > 0
                 THEN cr.time_cc_others * 60.0 / cr.game_duration END) AS avgCcPerMinInLosses,
        AVG(CASE WHEN cr.game_duration >= 60
                 THEN cr.gold_earned * 60.0 / cr.game_duration END) AS goldPerMin,
        AVG(CASE WHEN cr.win = 1 AND cr.game_duration >= 60
                 THEN cr.gold_earned * 60.0 / cr.game_duration END) AS goldPerMinInWins,
        AVG(CASE WHEN cr.win = 0 AND cr.game_duration >= 60
                 THEN cr.gold_earned * 60.0 / cr.game_duration END) AS goldPerMinInLosses,
        AVG(cr.game_duration) AS avgGameLength,
        AVG(CASE WHEN cr.win = 1 THEN cr.game_duration END) AS avgGameLengthInWins,
        AVG(CASE WHEN cr.win = 0 THEN cr.game_duration END) AS avgGameLengthInLosses,
        SUM(cr.game_duration) AS totalTimePlayed,
        SUM(CASE WHEN cr.win = 1 THEN cr.game_duration END) AS totalTimePlayedInWins,
        SUM(CASE WHEN cr.win = 0 THEN cr.game_duration END) AS totalTimePlayedInLosses,
        COALESCE((SELECT MAX(len) FROM streaks), 0) AS longestWinStreak
      FROM champion_rows cr
      JOIN teams t ON t.game_id = cr.game_id AND t.team_id = cr.team_id
    `)
    .get(...params, ...(championId !== null ? [championId] : [])) as {
    games: number | null;
    killParticipation: number | null;
    damageShare: number | null;
    avgDamageTaken: number | null;
    avgHeal: number | null;
    avgPhysicalDamageDealt: number | null;
    maxPhysicalDamageDealt: number | null;
    totalPhysicalDamageDealt: number | null;
    avgMagicDamageDealt: number | null;
    maxMagicDamageDealt: number | null;
    totalMagicDamageDealt: number | null;
    avgTrueDamageDealt: number | null;
    avgTrueDamageDealtInWins: number | null;
    avgTrueDamageDealtInLosses: number | null;
    maxTrueDamageDealt: number | null;
    avgPhysicalDamageTaken: number | null;
    maxPhysicalDamageTaken: number | null;
    totalPhysicalDamageTaken: number | null;
    avgMagicDamageTaken: number | null;
    maxMagicDamageTaken: number | null;
    totalMagicDamageTaken: number | null;
    avgTrueDamageTaken: number | null;
    maxTrueDamageTaken: number | null;
    totalTrueDamageTaken: number | null;
    avgDamageSelfMitigated: number | null;
    maxDamageSelfMitigated: number | null;
    totalDamageSelfMitigated: number | null;
    avgDamageToObjectives: number | null;
    maxDamageToObjectives: number | null;
    totalDamageToObjectives: number | null;
    avgDamageToTurrets: number | null;
    maxDamageToTurrets: number | null;
    totalDamageToTurrets: number | null;
    avgTimeCcOthers: number | null;
    maxTimeCcOthers: number | null;
    totalTimeCcOthers: number | null;
    avgTotalCcDealt: number | null;
    maxTotalCcDealt: number | null;
    totalTotalCcDealt: number | null;
    avgLongestAlive: number | null;
    maxLongestAlive: number | null;
    totalLongestAlive: number | null;
    avgKillingSprees: number | null;
    maxKillingSprees: number | null;
    totalKillingSprees: number | null;
    avgFirstBloodKill: number | null;
    maxFirstBloodKill: number | null;
    totalFirstBloodKill: number | null;
    avgFirstBloodAssist: number | null;
    maxFirstBloodAssist: number | null;
    totalFirstBloodAssist: number | null;
    avgGoldSpent: number | null;
    maxGoldSpent: number | null;
    totalGoldSpent: number | null;
    maxChampLevel: number | null;
    avgTotalMinionsKilled: number | null;
    maxTotalMinionsKilled: number | null;
    totalTotalMinionsKilled: number | null;
    avgNeutralMinionsKilled: number | null;
    maxNeutralMinionsKilled: number | null;
    totalNeutralMinionsKilled: number | null;
    avgNeutralMinionsEnemyJungle: number | null;
    maxNeutralMinionsEnemyJungle: number | null;
    totalNeutralMinionsEnemyJungle: number | null;
    avgNeutralMinionsTeamJungle: number | null;
    maxNeutralMinionsTeamJungle: number | null;
    totalNeutralMinionsTeamJungle: number | null;
    avgTurretKills: number | null;
    maxTurretKills: number | null;
    totalTurretKills: number | null;
    avgInhibitorKills: number | null;
    maxInhibitorKills: number | null;
    totalInhibitorKills: number | null;
    avgTurretPlatesTaken: number | null;
    maxTurretPlatesTaken: number | null;
    totalTurretPlatesTaken: number | null;
    avgBaronKills: number | null;
    maxBaronKills: number | null;
    totalBaronKills: number | null;
    avgObjectivesStolen: number | null;
    maxObjectivesStolen: number | null;
    totalObjectivesStolen: number | null;
    avgObjectivesStolenAssists: number | null;
    maxObjectivesStolenAssists: number | null;
    totalObjectivesStolenAssists: number | null;
    totalFirstTowerKill: number | null;
    totalFirstTowerAssist: number | null;
    totalFirstInhibitorKill: number | null;
    totalFirstInhibitorAssist: number | null;
    avgVisionScore: number | null;
    maxVisionScore: number | null;
    totalVisionScore: number | null;
    avgWardsPlaced: number | null;
    maxWardsPlaced: number | null;
    totalWardsPlaced: number | null;
    avgWardsKilled: number | null;
    maxWardsKilled: number | null;
    totalWardsKilled: number | null;
    avgVisionWardsBought: number | null;
    maxVisionWardsBought: number | null;
    totalVisionWardsBought: number | null;
    avgSightWardsBought: number | null;
    maxSightWardsBought: number | null;
    totalSightWardsBought: number | null;
    avgCcPerMin: number | null;
    avgGoldEarned: number | null;
    maxGoldEarned: number | null;
    totalGoldEarned: number | null;
    avgGoldEarnedInWins: number | null;
    avgGoldEarnedInLosses: number | null;
    maxGoldEarnedInWins: number | null;
    maxGoldEarnedInLosses: number | null;
    totalGoldEarnedInWins: number | null;
    totalGoldEarnedInLosses: number | null;
    goldPerMin: number | null;
    avgGameLength: number | null;
    totalTimePlayed: number | null;
    longestWinStreak: number | null;
  };

  return {
    ...result,
    games: result?.games ?? 0,
    killParticipation: result?.killParticipation ?? 0,
    damageShare: result?.damageShare ?? 0,
    avgDamageTaken: result?.avgDamageTaken ?? 0,
    avgHeal: result?.avgHeal ?? 0,
    avgPhysicalDamageDealt: result?.avgPhysicalDamageDealt ?? 0,
    maxPhysicalDamageDealt: result?.maxPhysicalDamageDealt ?? 0,
    totalPhysicalDamageDealt: result?.totalPhysicalDamageDealt ?? 0,
    avgMagicDamageDealt: result?.avgMagicDamageDealt ?? 0,
    maxMagicDamageDealt: result?.maxMagicDamageDealt ?? 0,
    totalMagicDamageDealt: result?.totalMagicDamageDealt ?? 0,
    avgTrueDamageDealt: result?.avgTrueDamageDealt ?? null,
    avgTrueDamageDealtInWins: result?.avgTrueDamageDealtInWins ?? null,
    avgTrueDamageDealtInLosses: result?.avgTrueDamageDealtInLosses ?? null,
    maxTrueDamageDealt: result?.maxTrueDamageDealt ?? null,
    avgPhysicalDamageTaken: result?.avgPhysicalDamageTaken ?? 0,
    maxPhysicalDamageTaken: result?.maxPhysicalDamageTaken ?? 0,
    totalPhysicalDamageTaken: result?.totalPhysicalDamageTaken ?? 0,
    avgMagicDamageTaken: result?.avgMagicDamageTaken ?? 0,
    maxMagicDamageTaken: result?.maxMagicDamageTaken ?? 0,
    totalMagicDamageTaken: result?.totalMagicDamageTaken ?? 0,
    avgTrueDamageTaken: result?.avgTrueDamageTaken ?? 0,
    maxTrueDamageTaken: result?.maxTrueDamageTaken ?? 0,
    totalTrueDamageTaken: result?.totalTrueDamageTaken ?? 0,
    avgDamageSelfMitigated: result?.avgDamageSelfMitigated ?? 0,
    maxDamageSelfMitigated: result?.maxDamageSelfMitigated ?? 0,
    totalDamageSelfMitigated: result?.totalDamageSelfMitigated ?? 0,
    avgDamageToObjectives: result?.avgDamageToObjectives ?? 0,
    maxDamageToObjectives: result?.maxDamageToObjectives ?? 0,
    totalDamageToObjectives: result?.totalDamageToObjectives ?? 0,
    avgDamageToTurrets: result?.avgDamageToTurrets ?? 0,
    maxDamageToTurrets: result?.maxDamageToTurrets ?? 0,
    totalDamageToTurrets: result?.totalDamageToTurrets ?? 0,
    avgTimeCcOthers: result?.avgTimeCcOthers ?? 0,
    maxTimeCcOthers: result?.maxTimeCcOthers ?? 0,
    totalTimeCcOthers: result?.totalTimeCcOthers ?? 0,
    avgTotalCcDealt: result?.avgTotalCcDealt ?? 0,
    maxTotalCcDealt: result?.maxTotalCcDealt ?? 0,
    totalTotalCcDealt: result?.totalTotalCcDealt ?? 0,
    avgLongestAlive: result?.avgLongestAlive ?? 0,
    maxLongestAlive: result?.maxLongestAlive ?? 0,
    totalLongestAlive: result?.totalLongestAlive ?? 0,
    avgKillingSprees: result?.avgKillingSprees ?? 0,
    maxKillingSprees: result?.maxKillingSprees ?? 0,
    totalKillingSprees: result?.totalKillingSprees ?? 0,
    avgFirstBloodKill: result?.avgFirstBloodKill ?? 0,
    maxFirstBloodKill: result?.maxFirstBloodKill ?? 0,
    totalFirstBloodKill: result?.totalFirstBloodKill ?? 0,
    avgFirstBloodAssist: result?.avgFirstBloodAssist ?? 0,
    maxFirstBloodAssist: result?.maxFirstBloodAssist ?? 0,
    totalFirstBloodAssist: result?.totalFirstBloodAssist ?? 0,
    avgGoldSpent: result?.avgGoldSpent ?? 0,
    maxGoldSpent: result?.maxGoldSpent ?? 0,
    totalGoldSpent: result?.totalGoldSpent ?? 0,
    maxChampLevel: result?.maxChampLevel ?? 0,
    avgTotalMinionsKilled: result?.avgTotalMinionsKilled ?? 0,
    maxTotalMinionsKilled: result?.maxTotalMinionsKilled ?? 0,
    totalTotalMinionsKilled: result?.totalTotalMinionsKilled ?? 0,
    avgNeutralMinionsKilled: result?.avgNeutralMinionsKilled ?? 0,
    maxNeutralMinionsKilled: result?.maxNeutralMinionsKilled ?? 0,
    totalNeutralMinionsKilled: result?.totalNeutralMinionsKilled ?? 0,
    avgNeutralMinionsEnemyJungle: result?.avgNeutralMinionsEnemyJungle ?? 0,
    maxNeutralMinionsEnemyJungle: result?.maxNeutralMinionsEnemyJungle ?? 0,
    totalNeutralMinionsEnemyJungle: result?.totalNeutralMinionsEnemyJungle ?? 0,
    avgNeutralMinionsTeamJungle: result?.avgNeutralMinionsTeamJungle ?? 0,
    maxNeutralMinionsTeamJungle: result?.maxNeutralMinionsTeamJungle ?? 0,
    totalNeutralMinionsTeamJungle: result?.totalNeutralMinionsTeamJungle ?? 0,
    avgTurretKills: result?.avgTurretKills ?? 0,
    maxTurretKills: result?.maxTurretKills ?? 0,
    totalTurretKills: result?.totalTurretKills ?? 0,
    avgInhibitorKills: result?.avgInhibitorKills ?? 0,
    maxInhibitorKills: result?.maxInhibitorKills ?? 0,
    totalInhibitorKills: result?.totalInhibitorKills ?? 0,
    avgTurretPlatesTaken: result?.avgTurretPlatesTaken ?? 0,
    maxTurretPlatesTaken: result?.maxTurretPlatesTaken ?? 0,
    totalTurretPlatesTaken: result?.totalTurretPlatesTaken ?? 0,
    avgBaronKills: result?.avgBaronKills ?? 0,
    maxBaronKills: result?.maxBaronKills ?? 0,
    totalBaronKills: result?.totalBaronKills ?? 0,
    avgObjectivesStolen: result?.avgObjectivesStolen ?? 0,
    maxObjectivesStolen: result?.maxObjectivesStolen ?? 0,
    totalObjectivesStolen: result?.totalObjectivesStolen ?? 0,
    avgObjectivesStolenAssists: result?.avgObjectivesStolenAssists ?? 0,
    maxObjectivesStolenAssists: result?.maxObjectivesStolenAssists ?? 0,
    totalObjectivesStolenAssists: result?.totalObjectivesStolenAssists ?? 0,
    totalFirstTowerKill: result?.totalFirstTowerKill ?? 0,
    totalFirstTowerAssist: result?.totalFirstTowerAssist ?? 0,
    totalFirstInhibitorKill: result?.totalFirstInhibitorKill ?? 0,
    totalFirstInhibitorAssist: result?.totalFirstInhibitorAssist ?? 0,
    avgVisionScore: result?.avgVisionScore ?? 0,
    maxVisionScore: result?.maxVisionScore ?? 0,
    totalVisionScore: result?.totalVisionScore ?? 0,
    avgWardsPlaced: result?.avgWardsPlaced ?? 0,
    maxWardsPlaced: result?.maxWardsPlaced ?? 0,
    totalWardsPlaced: result?.totalWardsPlaced ?? 0,
    avgWardsKilled: result?.avgWardsKilled ?? 0,
    maxWardsKilled: result?.maxWardsKilled ?? 0,
    totalWardsKilled: result?.totalWardsKilled ?? 0,
    avgVisionWardsBought: result?.avgVisionWardsBought ?? 0,
    maxVisionWardsBought: result?.maxVisionWardsBought ?? 0,
    totalVisionWardsBought: result?.totalVisionWardsBought ?? 0,
    avgSightWardsBought: result?.avgSightWardsBought ?? 0,
    maxSightWardsBought: result?.maxSightWardsBought ?? 0,
    totalSightWardsBought: result?.totalSightWardsBought ?? 0,
    avgCcPerMin: result?.avgCcPerMin ?? 0,
    goldPerMin: result?.goldPerMin ?? 0,
    avgGameLength: result?.avgGameLength ?? 0,
    totalTimePlayed: result?.totalTimePlayed ?? 0,
    longestWinStreak: result?.longestWinStreak ?? 0,
  };
}
