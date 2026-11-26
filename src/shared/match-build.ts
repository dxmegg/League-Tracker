// One player's build out of the timeline events, and premade groups out of the lobby.
// Type imports only, so a script can test them.
import type { TimelineEvent } from "./api";

export interface Purchase {
  ms: number;
  itemId: number;
  sold: boolean;
}

// Buys and sales in order. An undo takes back the purchase or the sale it names.
export function purchaseOrder(events: TimelineEvent[], participantId: number): Purchase[] {
  const out: Purchase[] = [];
  for (const e of events) {
    if (e.participant_id !== participantId || !e.item_id) continue;
    if (e.event_type === "ITEM_PURCHASED" || e.event_type === "ITEM_SOLD") {
      out.push({ ms: e.timestamp_ms, itemId: e.item_id, sold: e.event_type === "ITEM_SOLD" });
    } else if (e.event_type === "ITEM_UNDO") {
      const i = out.findLastIndex((p) => p.itemId === e.item_id);
      if (i >= 0) out.splice(i, 1);
    }
  }
  return out;
}

// "Q", "W", "E" or "R" for every skill point, in the order they were spent
export function skillOrder(events: TimelineEvent[], participantId: number): string[] {
  return events
    .filter(
      (e) =>
        e.event_type === "SKILL_LEVEL_UP" &&
        e.participant_id === participantId &&
        // Evolutions are not a skill point
        e.level_up_type !== "EVOLVE",
    )
    .map((e) => "QWER"[(e.skill_slot ?? 0) - 1] ?? "?");
}

export function lastTakedownMs(events: TimelineEvent[], participantId: number): number | null {
  const mine = events.filter((e) => {
    if (e.event_type !== "CHAMPION_KILL") return false;
    if (e.killer_id === participantId) return true;
    return (JSON.parse(e.assisting_participant_ids ?? "[]") as number[]).includes(participantId);
  });
  return mine.length ? Math.max(...mine.map((e) => e.timestamp_ms)) : null;
}

// Premade groups as the client's lobby numbers them: teammates sharing teamParticipantId.
// Keyed "teamId:championId"; groups are numbered from 1 across both teams.
// shortcut: the meaning of the field is not confirmed against a known premade yet
export function premadeGroups(session: any): Map<string, number> {
  const out = new Map<string, number>();
  let next = 1;
  for (const [teamId, team] of [
    [100, session?.teamOne],
    [200, session?.teamTwo],
  ] as const) {
    const byId = new Map<number, number[]>();
    for (const p of Array.isArray(team) ? team : []) {
      if (p?.teamParticipantId == null || !p.championId) continue;
      byId.set(p.teamParticipantId, [...(byId.get(p.teamParticipantId) ?? []), p.championId]);
    }
    for (const champions of byId.values()) {
      if (champions.length < 2) continue;
      for (const championId of champions) out.set(`${teamId}:${championId}`, next);
      next++;
    }
  }
  return out;
}
