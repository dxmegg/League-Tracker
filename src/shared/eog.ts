// Pure helpers over the client's end-of-game block. Type imports only, so a script can test them.
import type { LiveEvent } from "./api";

type Row = Record<string, any>;

// Chat credentials the block carries; never stored
const SECRET_KEYS = ["mucJwtDto", "multiUserChatId", "multiUserChatPassword"];

export function stripEogSecrets<T>(eog: T): T {
  if (!eog || typeof eog !== "object" || Array.isArray(eog)) return eog;
  return Object.fromEntries(
    Object.entries(eog as Row).filter(([key]) => !SECRET_KEYS.includes(key)),
  ) as T;
}

// match_participants column -> stat name in the block. The client's match history leaves these at zero.
export const EOG_COLUMNS: Record<string, string> = {
  enemy_missing_pings: "enemyMissingPings",
  danger_pings: "dangerPings",
  on_my_way_pings: "onMyWayPings",
  assist_me_pings: "assistMePings",
  get_back_pings: "getBackPings",
  vision_cleared_pings: "visionClearedPings",
  need_vision_pings: "needVisionPings",
  push_pings: "pushPings",
  all_in_pings: "allInPings",
  basic_pings: "basicPings",
  command_pings: "commandPings",
  spell1_casts: "spell1Casts",
  spell2_casts: "spell2Casts",
  spell3_casts: "spell3Casts",
  spell4_casts: "spell4Casts",
  summoner1_casts: "summoner1Casts",
  summoner2_casts: "summoner2Casts",
  total_heal_on_teammates: "totalHealsOnTeammates",
  total_damage_shielded_on_teammates: "totalDamageShieldedOnTeammates",
};

const EXTRA_STATS = [
  "totalTimeSpentDead",
  "champExperience",
  "unrealKills",
  "turretTakedowns",
  "turretsLost",
  "inhibitorTakedowns",
  "inhibitorsLost",
  "nexusKills",
  "nexusTakedowns",
  "nexusLost",
  "damageDealtToBuildings",
  "baronKills",
  "dragonKills",
  "itemsPurchased",
  "consumablesPurchased",
  "gameEndedInSurrender",
  "causedEarlySurrender",
];

export interface EogKey {
  puuid: string | null;
  championId: number;
  teamId: number;
}

// The live poll usually misses GameEnd (the game closes its API first), so take it from the result screen
export function withGameEnd(events: LiveEvent[], eog: any): LiveEvent[] {
  const teams: any[] = eog?.teams ?? [];
  const mine = teams.find((t) => t.isPlayerTeam);
  // No winner means no result to report
  if (!mine || !teams.some((t) => t.isWinningTeam) || events.some((e) => e.name === "GameEnd")) {
    return events;
  }
  return [
    ...events,
    {
      id: Math.max(-1, ...events.map((e) => e.id)) + 1,
      name: "GameEnd",
      time: Number(eog.gameLength) || 0,
      killer: null,
      victim: null,
      assisters: [],
      dragonType: null,
      stolen: false,
      turret: null,
      inhib: null,
      acer: null,
      acingTeam: null,
      killStreak: null,
      recipient: null,
      extra: { Result: mine.isWinningTeam ? "Win" : "Lose" },
    },
  ];
}

export function findEogPlayer(eog: any, who: EogKey): Row | null {
  const players: Row[] = (eog?.teams ?? []).flatMap((team: Row) => team?.players ?? []);
  return (
    (who.puuid ? players.find((p) => p.puuid === who.puuid) : undefined) ??
    players.find((p) => p.championId === who.championId && p.teamId === who.teamId) ??
    null
  );
}

// The block's numbers that have no column of their own
export function eogExtras(player: Row): Record<string, number> {
  const stats: Row = player.stats ?? {};
  const out: Record<string, number> = {};
  const put = (key: string, value: unknown) => {
    if (typeof value === "number" || typeof value === "boolean") out[key] = Number(value);
  };
  for (const key of EXTRA_STATS) put(key, stats[key]);
  for (const key of ["level", "wasAfk", "leaver", "severeTransgressor"]) put(key, player[key]);
  // The client leaves the record at zero for players it does not report it for
  if (player.wins || player.losses) {
    for (const key of ["wins", "losses", "leaves"]) put(key, player[key]);
  }
  return out;
}
