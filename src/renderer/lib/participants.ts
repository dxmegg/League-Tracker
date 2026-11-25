import type { ScoreInput } from "../../shared/opScore";
import type { MatchParticipantRecord, ParsedParticipant } from "./types";

// The main process sends participants already unpicked from the match payload,
// so all that's left is marking which rows are ours.
export function parseParticipants(
  participants: MatchParticipantRecord[] | undefined,
  selfPuuids: string[] | null,
): ParsedParticipant[] {
  if (!participants) return [];

  return participants.map((p) => ({
    ...p,
    cs: p.cs ?? 0,
    gameName: p.gameName,
    tagLine: p.tagLine,
    runeIds: p.runeIds ?? [],
    primaryStyle: p.primaryStyle ?? null,
    secondaryStyle: p.secondaryStyle ?? null,
    statShardIds: p.statShardIds ?? [],
    summonerName: p.gameName || `Player ${p.participantId}`,
    isSelf: selfPuuids != null && p.puuid != null && selfPuuids.includes(p.puuid),
  }));
}

// The score systems need the queue and game length on top of each player's stats; the scoreboard
// holds those on the game record rather than on the participants.
export function scoreInputsFor(
  participants: ParsedParticipant[],
  game: { queue_id: number; game_duration: number },
): ScoreInput[] {
  return participants.map((p) => ({
    participantId: p.participantId,
    teamId: p.teamId,
    championId: p.championId,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    doubleKills: p.doubleKills,
    tripleKills: p.tripleKills,
    quadraKills: p.quadraKills,
    pentaKills: p.pentaKills,
    totalDamageDealtToChampions: p.totalDamageDealtToChampions,
    totalDamageTaken: p.totalDamageTaken,
    goldEarned: p.goldEarned,
    totalHeal: p.totalHeal,
    win: p.win,
    queueId: game.queue_id,
    gameDuration: game.game_duration,
    teamPosition: p.teamPosition,
    cs: p.cs,
    visionScore: p.visionScore,
    timeCcingOthers: p.timeCcOthers,
    healOnTeammates: p.totalHealOnTeammates,
    shieldedOnTeammates: p.totalDamageShieldedOnTeammates,
    damageToObjectives: p.damageToObjectives,
    firstBlood: p.firstBloodKill,
    objectivesStolen: p.objectivesStolen,
    subteamId: p.playerSubteamId,
    placement: p.playerSubteamPlacement,
  }));
}

export function groupByTeam(participants: ParsedParticipant[]): Map<number, ParsedParticipant[]> {
  const teams = new Map<number, ParsedParticipant[]>();
  for (const p of participants) {
    if (!teams.has(p.teamId)) teams.set(p.teamId, []);
    teams.get(p.teamId)!.push(p);
  }
  return teams;
}
