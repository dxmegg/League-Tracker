export type ParsedTimeline = {
  frames: Array<{
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
  }>;
  events: Array<{
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
    raw_json: string;
  }>;
};

export function parseTimeline(raw: any): ParsedTimeline {
  const sourceFrames = Array.isArray(raw?.info?.frames) ? raw.info.frames : [];
  const frames = sourceFrames.flatMap((frame: any, frameIndex: number) =>
    Object.values(frame?.participantFrames ?? {}).map((participantFrame: any) => ({
      frame_index: frameIndex,
      timestamp_ms: typeof frame?.timestamp === "number" ? frame.timestamp : 0,
      participant_id:
        typeof participantFrame?.participantId === "number" ? participantFrame.participantId : 0,
      puuid: participantFrame?.puuid ?? null,
      level: participantFrame?.level ?? null,
      xp: participantFrame?.xp ?? null,
      gold: participantFrame?.totalGold ?? null,
      cs:
        (typeof participantFrame?.minionsKilled === "number" ? participantFrame.minionsKilled : 0) +
        (typeof participantFrame?.jungleMinionsKilled === "number"
          ? participantFrame.jungleMinionsKilled
          : 0),
      position_x: participantFrame?.position?.x ?? null,
      position_y: participantFrame?.position?.y ?? null,
      // Riot timeline nests combat stats under championStats; currentHealth is not exposed at all in the timeline API.
      attack_damage: participantFrame?.championStats?.attackDamage ?? null,
      ability_power: participantFrame?.championStats?.abilityPower ?? null,
      armor: participantFrame?.championStats?.armor ?? null,
      magic_resist: participantFrame?.championStats?.magicResist ?? null,
      // Riot returns attackSpeed as integer ×100 (1.10 a/s → 110). Divide back to float.
      attack_speed: (() => {
        const raw = participantFrame?.championStats?.attackSpeed;
        return typeof raw === "number" ? raw / 100 : null;
      })(),
      ability_haste: participantFrame?.championStats?.abilityHaste ?? null,
      // Riot timeline nests health and movement speed under championStats; currentHealth is championStats.health.
      move_speed: participantFrame?.championStats?.movementSpeed ?? null,
      max_health: participantFrame?.championStats?.healthMax ?? null,
      current_health: participantFrame?.championStats?.health ?? null,
    })),
  );

  const sourceEvents = sourceFrames.flatMap((frame: any) =>
    Array.isArray(frame?.events) ? frame.events : [],
  );
  const events = sourceEvents.map((event: any, eventIndex: number) => ({
    event_index: eventIndex,
    timestamp_ms: typeof event?.timestamp === "number" ? event.timestamp : 0,
    event_type: event?.type ?? "",
    participant_id: event?.participantId ?? null,
    killer_id: event?.killerId ?? null,
    victim_id: event?.victimId ?? null,
    team_id: event?.teamId ?? null,
    item_id: event?.itemId ?? null,
    skill_slot: event?.skillSlot ?? null,
    level_up_type: event?.levelUpType ?? null,
    ward_type: event?.wardType ?? null,
    building_type: event?.buildingType ?? null,
    monster_type: event?.monsterType ?? null,
    monster_subtype: event?.monsterSubType ?? null,
    raw_json: JSON.stringify(event),
  }));

  return { frames, events };
}
