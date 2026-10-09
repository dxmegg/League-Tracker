import Database from "better-sqlite3";
import zlib from "zlib";
import { AUGMENT_SLOTS } from "../../shared/queues";
import { db } from "../db";

// ---- Raw match payloads ----
//
// A match is ~30 KB of JSON and gzips to about an eighth of that, which is the
// difference between the blobs being most of the database and being a rounding
// error. Nothing reads them to answer a query — only export, and the one-time
// normalization in migrateToV2.

export function packRaw(raw: any): Buffer {
  return zlib.gzipSync(JSON.stringify(raw));
}

export function unpackRaw(blob: Buffer | null): any {
  if (!blob) return null;
  try {
    return JSON.parse(zlib.gunzipSync(blob).toString("utf8"));
  } catch {
    return null;
  }
}

// ---- Participant extraction ----

// Riot hands us two shapes: the LCU's participants[i] + participantIdentities[i]
// pair, and SGP's flattened participant with its stats inline. Both are
// unpicked exactly once, here, on the way into match_participants — so no read
// path has to know the difference.
export interface RawParticipantRow {
  participant_id: number;
  puuid: string | null;
  game_name: string | null;
  tag_line: string | null;
  profile_icon: number | null;
  team_id: number;
  player_subteam_id: number | null;
  player_subteam_placement: number | null;
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
  true_damage: number;
  gold_earned: number;
  total_heal: number;
  largest_killing_spree: number;
  largest_critical_strike: number;
  cs: number;
  team_position: string | null;
  early_surrender: number;
  total_damage_dealt_all: number;
  true_damage_dealt: number;
  physical_damage_dealt: number;
  magic_damage_dealt: number;
  physical_damage_taken: number;
  magic_damage_taken: number;
  true_damage_taken: number;
  damage_self_mitigated: number;
  damage_to_objectives: number;
  damage_to_turrets: number;
  time_cc_others: number;
  total_cc_dealt: number;
  longest_alive: number;
  killing_sprees: number;
  first_blood_kill: number;
  first_blood_assist: number;
  gold_spent: number;
  champ_level: number;
  total_minions_killed: number;
  neutral_minions_killed: number;
  neutral_minions_enemy_jungle: number;
  neutral_minions_team_jungle: number;
  turret_kills: number;
  inhibitor_kills: number;
  turret_plates_taken: number;
  first_tower_kill: number;
  first_tower_assist: number;
  first_inhibitor_kill: number;
  first_inhibitor_assist: number;
  baron_kills: number;
  objectives_stolen: number;
  objectives_stolen_assists: number;
  total_units_healed: number;
  vision_score: number;
  wards_placed: number;
  wards_killed: number;
  vision_wards_bought: number;
  sight_wards_bought: number;
  spell1: number | null;
  spell2: number | null;
  rune0: number | null;
  rune1: number | null;
  rune2: number | null;
  rune3: number | null;
  rune4: number | null;
  rune5: number | null;
  primary_style: number | null;
  secondary_style: number | null;
  items: (number | null)[];
  augments: { slot: number; augment_id: number }[];
}

// Bots and unresolved players carry an all-zeroes puuid. Dropping it here means
// every read path can treat "has a puuid" as "is a real, identifiable player".
export function realPuuid(value: unknown): string | null {
  if (typeof value !== "string" || value === "") return null;
  return /^0+(-0+)*$/.test(value) ? null : value;
}

// "Name#TAG" where we have both halves, the bare name where we don't.
export function displayName(gameName: string | null, tagLine: string | null): string | null {
  if (!gameName) return null;
  return tagLine ? `${gameName}#${tagLine}` : gameName;
}

// Every game stored in this database so far came in through the legacy
// LCU match-history shape (participant.stats.perk0..perk5/perkPrimaryStyle/
// perkSubStyle, no participant.perks at all) rather than the Match-V5 shape
// (participant.perks.styles[].selections[].perk). Reading only the Match-V5
// path — as every previous fix in this area did — silently produced empty
// rune data for 100% of real matches, which is the actual cause of the
// persistent "R" placeholder / "Primary / Secondary" fallback text: it was
// never a broken icon URL, it was rune data that never reached the UI.
// `owner` is a raw participant object; `stats` is `owner.stats` when present
// (legacy shape) or `owner` itself (Match-V5 shape, which is already flat).
export interface ExtractedRunes {
  runeIds: number[];
  primaryStyle: number | null;
  secondaryStyle: number | null;
  statShardIds: number[];
}

export function extractRunes(owner: any): ExtractedRunes {
  const stats = owner?.stats ?? owner ?? {};
  const styles: any[] = owner?.perks?.styles ?? stats?.perks?.styles ?? [];
  if (styles.length > 0) {
    const statPerks = owner?.perks?.statPerks ?? stats?.perks?.statPerks ?? {};
    const runeIds = styles
      .flatMap((style: any) => [
        style.style,
        ...(style.selections ?? []).map((selection: any) => selection.perk),
      ])
      .filter((id: any) => Number(id))
      .map(Number);
    return {
      runeIds,
      primaryStyle: Number(styles[0]?.style) || null,
      secondaryStyle: Number(styles[1]?.style) || null,
      statShardIds: [statPerks.offense, statPerks.flex, statPerks.defense]
        .map(Number)
        .filter(Boolean),
    };
  }

  // Legacy shape: flat perkN fields, in slot order rather than tree-grouped —
  // perk0 is the keystone plus 3 more primary perks (perk1-3), perk4-5 are the
  // two secondary perks. Positions must stay fixed through the slice below
  // (a missing/zero perk is still a slot), so zeros are only filtered out
  // after slicing, not before.
  const primaryStyle = Number(stats.perkPrimaryStyle) || null;
  const secondaryStyle = Number(stats.perkSubStyle) || null;
  const legacyPerks = [
    stats.perk0,
    stats.perk1,
    stats.perk2,
    stats.perk3,
    stats.perk4,
    stats.perk5,
  ].map(Number);
  const runeIds = [
    primaryStyle,
    ...legacyPerks.slice(0, 4),
    secondaryStyle,
    ...legacyPerks.slice(4, 6),
  ].filter((id): id is number => id != null && Number.isFinite(id) && id > 0);
  const statShardIds = [stats.statPerk0, stats.statPerk1, stats.statPerk2]
    .map(Number)
    .filter((id) => Number.isFinite(id) && id > 0);
  return { runeIds, primaryStyle, secondaryStyle, statShardIds };
}

// Riot Match-V5 sends teamPosition directly, but the League Client's own match
// payload does not: it sends timeline.lane + timeline.role instead. Normalize
// both spellings to the Match-V5 vocabulary so the rest of the app only ever
// sees "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY" | null.
export function normalizeTeamPosition(raw: any, stats: any): string | null {
  const direct = raw?.teamPosition ?? stats?.teamPosition;
  if (typeof direct === "string" && direct) return direct;

  const lane = raw?.timeline?.lane ?? stats?.timeline?.lane;
  const role = raw?.timeline?.role ?? stats?.timeline?.role;
  if (typeof lane !== "string" || !lane || lane === "NONE") return null;

  // Bot lane is the only lane whose role disambiguates the position: support
  // is reported as UTILITY by Match-V5, carry as BOTTOM.
  if (lane === "BOTTOM" && role === "DUO_SUPPORT") return "UTILITY";
  return lane;
}

export function participantRowsFromRaw(raw: any): RawParticipantRow[] {
  const participants = raw?.participants;
  if (!Array.isArray(participants)) return [];
  const identities = raw.participantIdentities || [];

  return participants.map((p: any, i: number): RawParticipantRow => {
    const s = p.stats || p;
    const player = identities[i]?.player || {};
    const augments: { slot: number; augment_id: number }[] = [];
    for (let slot = 1; slot <= AUGMENT_SLOTS; slot++) {
      const augId = s[`playerAugment${slot}`];
      if (augId && augId > 0) augments.push({ slot, augment_id: augId });
    }
    const icon = player.profileIcon;
    const runes = extractRunes(p);
    const perks = runes.runeIds.filter(
      (id) => id !== runes.primaryStyle && id !== runes.secondaryStyle,
    );
    const subteamRaw = p.playerSubteamId ?? s.playerSubteamId ?? p.subteamId ?? s.subteamId;
    const subteamId = Number(subteamRaw);
    const playerSubteamId = Number.isFinite(subteamId) && subteamId > 0 ? subteamId : null;
    const placementRaw =
      p.playerSubteamPlacement ??
      s.playerSubteamPlacement ??
      p.subteamPlacement ??
      s.subteamPlacement ??
      p.placement ??
      s.placement;
    const placementNum = Number(placementRaw);
    const playerSubteamPlacement =
      Number.isFinite(placementNum) && placementNum > 0 ? placementNum : null;

    return {
      participant_id: p.participantId ?? i + 1,
      puuid: realPuuid(p.puuid) ?? realPuuid(player.puuid),
      game_name:
        player.gameName || player.summonerName || p.summonerName || p.riotIdGameName || null,
      tag_line: player.tagLine || p.riotIdTagline || null,
      profile_icon: typeof icon === "number" && icon > 0 ? icon : null,
      team_id: p.teamId ?? s.teamId ?? 100,
      player_subteam_id: playerSubteamId,
      player_subteam_placement: playerSubteamPlacement,
      champion_id: p.championId ?? s.championId ?? 0,
      win: s.win ? 1 : 0,
      kills: s.kills ?? 0,
      deaths: s.deaths ?? 0,
      assists: s.assists ?? 0,
      double_kills: s.doubleKills ?? 0,
      triple_kills: s.tripleKills ?? 0,
      quadra_kills: s.quadraKills ?? 0,
      penta_kills: s.pentaKills ?? 0,
      total_damage_dealt: s.totalDamageDealtToChampions ?? s.totalDamageDealt ?? 0,
      total_damage_taken: s.totalDamageTaken ?? 0,
      true_damage: s.trueDamageDealtToChampions ?? 0,
      gold_earned: s.goldEarned ?? 0,
      total_heal: s.totalHeal ?? 0,
      largest_killing_spree: s.largestKillingSpree ?? 0,
      largest_critical_strike: s.largestCriticalStrike ?? 0,
      early_surrender: s.gameEndedInEarlySurrender ? 1 : 0,
      // Riot's "totalDamageDealt" is all damage the participant dealt —
      // champions, minions, jungle, structures — unlike total_damage_dealt
      // above, which prefers the champions-only figure. Keep both: the
      // scoreboard/records want champion damage, this new "total" record
      // wants the raw everything-included number.
      total_damage_dealt_all: Number(s.totalDamageDealt ?? 0),
      true_damage_dealt: Number(s.trueDamageDealtToChampions ?? s.trueDamageDealt ?? 0),
      physical_damage_dealt: s.physicalDamageDealtToChampions ?? 0,
      magic_damage_dealt: s.magicDamageDealtToChampions ?? 0,
      physical_damage_taken: s.physicalDamageTaken ?? 0,
      magic_damage_taken: s.magicalDamageTaken ?? 0,
      true_damage_taken: s.trueDamageTaken ?? 0,
      damage_self_mitigated: s.damageSelfMitigated ?? 0,
      damage_to_objectives: s.damageDealtToObjectives ?? 0,
      damage_to_turrets: s.damageDealtToTurrets ?? 0,
      time_cc_others: s.timeCCingOthers ?? 0,
      total_cc_dealt: s.totalTimeCrowdControlDealt ?? 0,
      longest_alive: s.longestTimeSpentLiving ?? 0,
      killing_sprees: s.killingSprees ?? 0,
      first_blood_kill: s.firstBloodKill ? 1 : 0,
      first_blood_assist: s.firstBloodAssist ? 1 : 0,
      gold_spent: s.goldSpent ?? 0,
      champ_level: s.champLevel ?? 0,
      total_minions_killed: s.totalMinionsKilled ?? 0,
      neutral_minions_killed: s.neutralMinionsKilled ?? 0,
      neutral_minions_enemy_jungle: s.neutralMinionsKilledEnemyJungle ?? 0,
      neutral_minions_team_jungle: s.neutralMinionsKilledTeamJungle ?? 0,
      turret_kills: s.turretKills ?? 0,
      inhibitor_kills: s.inhibitorKills ?? 0,
      turret_plates_taken: s.turretPlatesTaken ?? 0,
      first_tower_kill: s.firstTowerKill ? 1 : 0,
      first_tower_assist: s.firstTowerAssist ? 1 : 0,
      first_inhibitor_kill: s.firstInhibitorKill ? 1 : 0,
      first_inhibitor_assist: s.firstInhibitorAssist ? 1 : 0,
      baron_kills: s.baronKills ?? 0,
      objectives_stolen: s.objectivesStolen ?? 0,
      objectives_stolen_assists: s.objectivesStolenAssists ?? 0,
      total_units_healed: s.totalUnitsHealed ?? 0,
      vision_score: s.visionScore ?? 0,
      wards_placed: s.wardsPlaced ?? 0,
      wards_killed: s.wardsKilled ?? 0,
      vision_wards_bought: s.visionWardsBoughtInGame ?? 0,
      sight_wards_bought: s.sightWardsBoughtInGame ?? 0,
      spell1: p.spell1Id ?? p.summoner1Id ?? s.spell1Id ?? s.summoner1Id ?? null,
      spell2: p.spell2Id ?? p.summoner2Id ?? s.spell2Id ?? s.summoner2Id ?? null,
      cs:
        s.totalCreepScore != null
          ? Number(s.totalCreepScore)
          : Number(s.totalMinionsKilled ?? p.totalMinionsKilled ?? 0) +
            Number(s.neutralMinionsKilled ?? p.neutralMinionsKilled ?? 0),
      team_position: normalizeTeamPosition(p, s),
      rune0: perks[0] ?? null,
      rune1: perks[1] ?? null,
      rune2: perks[2] ?? null,
      rune3: perks[3] ?? null,
      rune4: perks[4] ?? null,
      rune5: perks[5] ?? null,
      primary_style: runes.primaryStyle,
      secondary_style: runes.secondaryStyle,
      items: [s.item0, s.item1, s.item2, s.item3, s.item4, s.item5, s.item6].map((it) =>
        typeof it === "number" ? it : null,
      ),
      augments,
    };
  });
}

export interface GameDenorm {
  is_remake: number;
  queue_id: number | null;
  game_version: string | null;
}

let writeParticipantsStmts: {
  participant: Database.Statement;
  augment: Database.Statement;
  clearParticipants: Database.Statement;
  clearAugments: Database.Statement;
} | null = null;

export function resetParticipantStatements(): void {
  writeParticipantsStmts = null;
}

export function participantStatements() {
  if (!writeParticipantsStmts) {
    writeParticipantsStmts = {
      participant: db.prepare(`
        INSERT OR REPLACE INTO match_participants (
          game_id, participant_id, puuid, game_name, tag_line, profile_icon,
          team_id, player_subteam_id, player_subteam_placement, champion_id, win, kills, deaths, assists,
          double_kills, triple_kills, quadra_kills, penta_kills,
          total_damage_dealt, total_damage_taken, true_damage, gold_earned, total_heal,
          largest_killing_spree, largest_critical_strike, cs, early_surrender,
          total_damage_dealt_all, true_damage_dealt,
          physical_damage_dealt, magic_damage_dealt, physical_damage_taken, magic_damage_taken,
          true_damage_taken, damage_self_mitigated, damage_to_objectives, damage_to_turrets,
          time_cc_others, total_cc_dealt, longest_alive, killing_sprees,
          first_blood_kill, first_blood_assist,
          gold_spent, champ_level, total_minions_killed, neutral_minions_killed,
          neutral_minions_enemy_jungle, neutral_minions_team_jungle, turret_kills,
          inhibitor_kills, turret_plates_taken, first_tower_kill, first_tower_assist,
          first_inhibitor_kill, first_inhibitor_assist, baron_kills, objectives_stolen,
          objectives_stolen_assists, total_units_healed, vision_score, wards_placed,
          wards_killed, vision_wards_bought, sight_wards_bought,
          is_remake, queue_id, game_version,
          spell1, spell2, item0, item1, item2, item3, item4, item5, item6,
          team_position,
          rune0, rune1, rune2, rune3, rune4, rune5,
          primary_style, secondary_style
        ) VALUES (
          @game_id, @participant_id, @puuid, @game_name, @tag_line, @profile_icon,
          @team_id, @player_subteam_id, @player_subteam_placement, @champion_id, @win, @kills, @deaths, @assists,
          @double_kills, @triple_kills, @quadra_kills, @penta_kills,
          @total_damage_dealt, @total_damage_taken, @true_damage, @gold_earned, @total_heal,
          @largest_killing_spree, @largest_critical_strike, @cs, @early_surrender,
          @total_damage_dealt_all, @true_damage_dealt,
          @physical_damage_dealt, @magic_damage_dealt, @physical_damage_taken, @magic_damage_taken,
          @true_damage_taken, @damage_self_mitigated, @damage_to_objectives, @damage_to_turrets,
          @time_cc_others, @total_cc_dealt, @longest_alive, @killing_sprees,
          @first_blood_kill, @first_blood_assist,
          @gold_spent, @champ_level, @total_minions_killed, @neutral_minions_killed,
          @neutral_minions_enemy_jungle, @neutral_minions_team_jungle, @turret_kills,
          @inhibitor_kills, @turret_plates_taken, @first_tower_kill, @first_tower_assist,
          @first_inhibitor_kill, @first_inhibitor_assist, @baron_kills, @objectives_stolen,
          @objectives_stolen_assists, @total_units_healed, @vision_score, @wards_placed,
          @wards_killed, @vision_wards_bought, @sight_wards_bought,
          @is_remake, @queue_id, @game_version,
          @spell1, @spell2, @item0, @item1, @item2, @item3, @item4, @item5, @item6,
          @team_position,
          @rune0, @rune1, @rune2, @rune3, @rune4, @rune5,
          @primary_style, @secondary_style
        )
      `),
      augment: db.prepare(`
        INSERT OR REPLACE INTO match_participant_augments (
          game_id, participant_id, slot, augment_id,
          champion_id, win, is_remake, queue_id, game_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      clearParticipants: db.prepare("DELETE FROM match_participants WHERE game_id = ?"),
      clearAugments: db.prepare("DELETE FROM match_participant_augments WHERE game_id = ?"),
    };
  }
  return writeParticipantsStmts;
}

// Replaces one game's participant rows wholesale. Callers are already inside a
// transaction; this deliberately isn't one, so a game and its participants
// commit together or not at all.
export function writeParticipants(
  gameId: number,
  meta: GameDenorm,
  rows: RawParticipantRow[],
): void {
  const stmts = participantStatements();
  stmts.clearParticipants.run(gameId);
  stmts.clearAugments.run(gameId);

  for (const row of rows) {
    stmts.participant.run({
      game_id: gameId,
      participant_id: row.participant_id,
      puuid: row.puuid,
      game_name: row.game_name,
      tag_line: row.tag_line,
      profile_icon: row.profile_icon,
      team_id: row.team_id,
      player_subteam_id: row.player_subteam_id,
      player_subteam_placement: row.player_subteam_placement,
      champion_id: row.champion_id,
      win: row.win,
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
      double_kills: row.double_kills,
      triple_kills: row.triple_kills,
      quadra_kills: row.quadra_kills,
      penta_kills: row.penta_kills,
      total_damage_dealt: row.total_damage_dealt,
      total_damage_taken: row.total_damage_taken,
      true_damage: row.true_damage,
      gold_earned: row.gold_earned,
      total_heal: row.total_heal,
      largest_killing_spree: row.largest_killing_spree,
      largest_critical_strike: row.largest_critical_strike,
      cs: row.cs,
      early_surrender: row.early_surrender,
      total_damage_dealt_all: row.total_damage_dealt_all,
      true_damage_dealt: row.true_damage_dealt,
      physical_damage_dealt: row.physical_damage_dealt,
      magic_damage_dealt: row.magic_damage_dealt,
      physical_damage_taken: row.physical_damage_taken,
      magic_damage_taken: row.magic_damage_taken,
      true_damage_taken: row.true_damage_taken,
      damage_self_mitigated: row.damage_self_mitigated,
      damage_to_objectives: row.damage_to_objectives,
      damage_to_turrets: row.damage_to_turrets,
      time_cc_others: row.time_cc_others,
      total_cc_dealt: row.total_cc_dealt,
      longest_alive: row.longest_alive,
      killing_sprees: row.killing_sprees,
      first_blood_kill: row.first_blood_kill,
      first_blood_assist: row.first_blood_assist,
      gold_spent: row.gold_spent,
      champ_level: row.champ_level,
      total_minions_killed: row.total_minions_killed,
      neutral_minions_killed: row.neutral_minions_killed,
      neutral_minions_enemy_jungle: row.neutral_minions_enemy_jungle,
      neutral_minions_team_jungle: row.neutral_minions_team_jungle,
      turret_kills: row.turret_kills,
      inhibitor_kills: row.inhibitor_kills,
      turret_plates_taken: row.turret_plates_taken,
      first_tower_kill: row.first_tower_kill,
      first_tower_assist: row.first_tower_assist,
      first_inhibitor_kill: row.first_inhibitor_kill,
      first_inhibitor_assist: row.first_inhibitor_assist,
      baron_kills: row.baron_kills,
      objectives_stolen: row.objectives_stolen,
      objectives_stolen_assists: row.objectives_stolen_assists,
      total_units_healed: row.total_units_healed,
      vision_score: row.vision_score,
      wards_placed: row.wards_placed,
      wards_killed: row.wards_killed,
      vision_wards_bought: row.vision_wards_bought,
      sight_wards_bought: row.sight_wards_bought,
      team_position: row.team_position,
      is_remake: meta.is_remake,
      queue_id: meta.queue_id,
      game_version: meta.game_version,
      spell1: row.spell1,
      spell2: row.spell2,
      item0: row.items[0],
      item1: row.items[1],
      item2: row.items[2],
      item3: row.items[3],
      item4: row.items[4],
      item5: row.items[5],
      item6: row.items[6],
      rune0: row.rune0,
      rune1: row.rune1,
      rune2: row.rune2,
      rune3: row.rune3,
      rune4: row.rune4,
      rune5: row.rune5,
      primary_style: row.primary_style,
      secondary_style: row.secondary_style,
    });

    for (const aug of row.augments) {
      stmts.augment.run(
        gameId,
        row.participant_id,
        aug.slot,
        aug.augment_id,
        row.champion_id,
        row.win,
        meta.is_remake,
        meta.queue_id,
        meta.game_version,
      );
    }
  }
}

export async function backfillParticipantCombatStats(
  onProgress?: (done: number, total: number) => void,
  batchSize = 200,
): Promise<{ updated: number; scanned: number }> {
  console.log("[db] backfillParticipantCombatStats called:", { batchSize });
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new TypeError("batchSize must be a positive integer");
  }

  const total = (
    db.prepare("SELECT COUNT(*) as count FROM games WHERE raw_gz IS NOT NULL").get() as {
      count: number;
    }
  ).count;
  const page = db.prepare(`
    SELECT game_id, raw_gz
    FROM games
    WHERE raw_gz IS NOT NULL AND game_id > ?
    ORDER BY game_id
    LIMIT ?
  `);
  const update = db.prepare(`
    UPDATE match_participants
    SET physical_damage_dealt = ?,
        magic_damage_dealt = ?,
        physical_damage_taken = ?,
        magic_damage_taken = ?,
        true_damage_taken = ?,
        damage_self_mitigated = ?,
        damage_to_objectives = ?,
        damage_to_turrets = ?,
        time_cc_others = ?,
        total_cc_dealt = ?,
        longest_alive = ?,
        killing_sprees = ?,
        first_blood_kill = ?,
        first_blood_assist = ?,
        gold_spent = ?,
        champ_level = ?,
        total_minions_killed = ?,
        neutral_minions_killed = ?,
        neutral_minions_enemy_jungle = ?,
        neutral_minions_team_jungle = ?,
        turret_kills = ?,
        inhibitor_kills = ?,
        turret_plates_taken = ?,
        first_tower_kill = ?,
        first_tower_assist = ?,
        first_inhibitor_kill = ?,
        first_inhibitor_assist = ?,
        baron_kills = ?,
        objectives_stolen = ?,
        objectives_stolen_assists = ?,
        total_units_healed = ?,
        vision_score = ?,
        wards_placed = ?,
        wards_killed = ?,
        vision_wards_bought = ?,
        sight_wards_bought = ?
    WHERE game_id = ? AND participant_id = ?
  `);

  let lastId = 0;
  let scanned = 0;
  let updated = 0;
  for (;;) {
    const rows = page.all(lastId, batchSize) as Array<{ game_id: number; raw_gz: Buffer }>;
    if (rows.length === 0) break;

    const tx = db.transaction(() => {
      for (const row of rows) {
        try {
          const raw = JSON.parse(zlib.gunzipSync(row.raw_gz).toString("utf8"));
          const participants = participantRowsFromRaw(raw);
          for (const participant of participants) {
            updated += update.run(
              participant.physical_damage_dealt,
              participant.magic_damage_dealt,
              participant.physical_damage_taken,
              participant.magic_damage_taken,
              participant.true_damage_taken,
              participant.damage_self_mitigated,
              participant.damage_to_objectives,
              participant.damage_to_turrets,
              participant.time_cc_others,
              participant.total_cc_dealt,
              participant.longest_alive,
              participant.killing_sprees,
              participant.first_blood_kill,
              participant.first_blood_assist,
              participant.gold_spent,
              participant.champ_level,
              participant.total_minions_killed,
              participant.neutral_minions_killed,
              participant.neutral_minions_enemy_jungle,
              participant.neutral_minions_team_jungle,
              participant.turret_kills,
              participant.inhibitor_kills,
              participant.turret_plates_taken,
              participant.first_tower_kill,
              participant.first_tower_assist,
              participant.first_inhibitor_kill,
              participant.first_inhibitor_assist,
              participant.baron_kills,
              participant.objectives_stolen,
              participant.objectives_stolen_assists,
              participant.total_units_healed,
              participant.vision_score,
              participant.wards_placed,
              participant.wards_killed,
              participant.vision_wards_bought,
              participant.sight_wards_bought,
              row.game_id,
              participant.participant_id,
            ).changes;
          }
        } catch (error) {
          console.warn(`[db] backfillParticipantCombatStats skipped ${row.game_id}:`, error);
        }
      }
    });
    tx();

    scanned += rows.length;
    lastId = rows[rows.length - 1].game_id;
    onProgress?.(scanned, total);
  }

  console.log("[db] backfillParticipantCombatStats done:", { updated, scanned });
  return { updated, scanned };
}
