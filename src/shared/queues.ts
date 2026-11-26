export const QUEUE_ID_ARAM = 450;
export const QUEUE_ID_MAYHEM = 2400;
export const QUEUE_ID_MAYHEM_CLASSIC = 2450;
export const QUEUE_ID_CUSTOM = 0;
export const QUEUE_ID_MAYHEM_CUSTOM = 3270;

export const MAYHEM_QUEUE_IDS = [QUEUE_ID_MAYHEM, QUEUE_ID_MAYHEM_CLASSIC];
export const ARENA_QUEUE_IDS = [1700, 1740, 1750];
export const TUTORIAL_QUEUE_IDS = [31, 32, 42, 52] as const;
export const HIDDEN_QUEUE_IDS: ReadonlyArray<number> = [0, 31, 32, 33, 830, 840, 850];

// Queues where CS and CS/min are meaningless — Arena variants have no lanes
// or minion waves. These games still count toward kills/damage/gold averages.
export const NO_CS_QUEUE_IDS = [1700, 1740, 1750] as const;

// Custom games, tutorials, and the practice tool. Their stats are excluded
// from every average and record, but the games still count in totalGames.
export const NO_STATS_QUEUE_IDS = [0, 30, 2000, 2010, 2020, 3140, QUEUE_ID_MAYHEM_CUSTOM] as const;

// Arena and Mayhem replace the standard rune page with Augments — there is no
// rune data to show for these queues at all (see extractRunes in
// src/main/db.ts, which returns empty rune ids for them), so the UI should
// swap the "RUNES" column/section for "AUGMENTS" instead of showing it empty.
export function isAugmentQueue(queueId?: number | null): boolean {
  if (queueId == null) return false;
  return MAYHEM_QUEUE_IDS.includes(queueId) || ARENA_QUEUE_IDS.includes(queueId);
}

export function isArenaQueue(queueId?: number | null): boolean {
  if (queueId == null) return false;
  return ARENA_QUEUE_IDS.includes(queueId);
}

// UI-only queue scopes used by the history tabs.
export const QUEUE_SCOPE_MAYHEM = -1;
export const QUEUE_SCOPE_REST = -2;
export const QUEUE_SCOPE_RANKED = -4;
export const QUEUE_SCOPE_NORMAL = -5;
export const QUEUE_SCOPE_ARAM = -6;
export const QUEUE_SCOPE_ARENA = -7;
export const QUEUE_GROUP_ARENA = -3;

export const QUEUE_LABELS: Record<number, string> = {
  [QUEUE_ID_MAYHEM]: "ARAM Mayhem",
  [QUEUE_ID_MAYHEM_CLASSIC]: "Mayhem Classic",
  [QUEUE_ID_MAYHEM_CUSTOM]: "ARAM Mayhem - Custom game",
  0: "Custom",
  2: "Summoner's Rift (Blind)",
  4: "Ranked Solo",
  6: "Ranked Premade",
  7: "Summoner's Rift (Blind)",
  14: "Summoner's Rift (Draft)",
  16: "Dominion",
  17: "Dominion (Draft)",
  25: "Dominion (Blind)",
  30: "Summoner's Rift (Practice)",
  31: "Summoner's Rift (Co-op vs AI)",
  32: "Summoner's Rift (Co-op vs AI)",
  33: "Summoner's Rift (Co-op vs AI)",
  41: "Ranked Team Builder",
  42: "Ranked Solo/Duo",
  52: "Twisted Treeline (Co-op vs AI)",
  61: "Team Builder",
  65: "ARAM",
  67: "ARAM (Co-op vs AI)",
  70: "One for All",
  72: "Snowdown Showdown",
  73: "Victory Prototype",
  75: "Summoner's Rift 1v1",
  76: "Summoner's Rift 2v2",
  78: "Hexakill",
  83: "Co-op vs AI URF",
  98: "Twisted Treeline 3v3",
  100: "ARAM",
  310: "Nemesis",
  313: "Black Market Brawlers",
  315: "Nexus Siege",
  317: "Definitely Not Dominion",
  318: "All Random Summoner's Rift",
  325: "All Random",
  400: "Summoner's Rift (Draft)",
  410: "Ranked 5v5",
  420: "Ranked Solo/Duo",
  430: "Summoner's Rift (Blind)",
  440: "Ranked Flex",
  450: "ARAM",
  490: "Quickplay",
  480: "Swiftplay",
  880: "Co-op vs AI Intermediate",
  1700: "Arena",
  1740: "Arena Bravery",
  1750: "Arena 3x6",
  900: "ARURF",
  2020: "Tutorial 3",
  4310: "League Classic",
  2000: "Tutorial 1",
  2010: "Tutorial 2",
  3140: "Training Tool",
  // Names below follow CommunityDragon's queues.json
  700: "Clash",
  720: "ARAM Clash",
  820: "Co-op vs AI Beginner",
  830: "Co-op vs AI Intro",
  840: "Co-op vs AI Beginner",
  850: "Co-op vs AI Intermediate",
  870: "Co-op vs AI Intro",
  890: "Co-op vs AI Intermediate",
  1020: "One for All",
  1300: "Nexus Blitz",
  1400: "Ultimate Spellbook",
  1810: "Swarm",
  1820: "Swarm",
  1830: "Swarm",
  1840: "Swarm",
  1900: "URF",
  2300: "Brawl",
  2401: "ARAM Mayhem",
  2403: "ARAM Mayhem",
  2405: "ARAM Mayhem",
  2410: "ARAM Mayhem Tournament",
  3100: "Summoner's Rift (Blind) - Custom game",
  3110: "Summoner's Rift (Draft) - Custom game",
  3120: "Summoner's Rift (All Random) - Custom game",
  3130: "Summoner's Rift (Tournament Draft) - Custom game",
  3200: "ARAM (Blind) - Custom game",
  3210: "ARAM (Draft) - Custom game",
  3220: "ARAM - Custom game",
  3230: "ARAM (Tournament Draft) - Custom game",
  3240: "ARAM Mayhem - Custom game",
  3250: "ARAM (First Blood) - Custom game",
  3260: "League Classic (Blind) - Custom game",
  3262: "League Classic (Draft) - Custom game",
  3280: "Mayhem Classic - Custom game",
  4200: "Doom Bots",
  4210: "Doom Bots",
  4220: "Doom Bots (Hard)",
};

// CommunityDragon's queues.json as id -> name. Entries without a name are left out.
export function toQueueNames(list: unknown): Record<number, string> {
  const names: Record<number, string> = {};
  for (const q of Array.isArray(list) ? list : []) {
    const name = typeof q?.name === "string" ? q.name.trim() : "";
    if (Number.isInteger(q?.id) && name) names[q.id] ??= name;
  }
  return names;
}

// Fills in queues the list above does not name; the names above always win
export function addQueueLabels(names: Record<number, string>): void {
  for (const [id, name] of Object.entries(names)) QUEUE_LABELS[Number(id)] ??= name;
}

// Four picked at level breakpoints, plus up to two bonus slots for special augments
export const AUGMENT_SLOTS = 6;
