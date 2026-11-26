import https from "https";
import * as db from "../db";
import type {
  LiveAbility,
  LiveActivePlayer,
  LiveEvent,
  LiveFull,
  LiveSeriesPoint,
  StoredLiveBody,
  LiveItem,
  LivePlayer,
  LiveRuneRef,
  LiveSpell,
  LiveSessionData,
} from "../../shared/api";
import { QUEUE_ID_MAYHEM_CUSTOM, QUEUE_LABELS } from "../../shared/queues";
import { skillCap } from "../../shared/skills";
import { status, isClientConnected, lcuRequest, getCurrentSummoner } from "./connection";
import { fetchClientProfile } from "./profile";

let matchmakingStartedAt: number | null = null;

let lastTrackedPhase: string = "None";

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

// Live Client Data API on 127.0.0.1:2999 uses a self-signed cert. This is a
// localhost-only service so skipping verification here is acceptable.
function liveClientGet(path: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const req = https.get(
      { host: "127.0.0.1", port: 2999, path, rejectUnauthorized: false, timeout: 1500 },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`status ${res.statusCode}`));
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve(body));
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
  });
}

export async function fetchLiveGameData(): Promise<LiveGameData | null> {
  const get = liveClientGet;
  try {
    const allRaw = await get("/liveclientdata/allgamedata");
    const all = JSON.parse(allRaw) as {
      activePlayer?: {
        summonerName?: string;
        level?: number;
        currentGold?: number;
        championStats?: { creepScore?: number; kills?: number; deaths?: number; assists?: number };
      };
      allPlayers?: Array<{
        summonerName?: string;
        riotId?: string;
        championName?: string;
        level?: number;
        isBot?: boolean;
        scores?: { kills?: number; deaths?: number; assists?: number; creepScore?: number };
        items?: Array<{
          itemID?: number;
          slot?: number;
          displayName?: string;
          count?: number;
        }>;
      }>;
      gameData?: { gameTime?: number; gameMode?: string };
    };

    const active = all.activePlayer ?? {};
    const game = all.gameData ?? {};
    const players = Array.isArray(all.allPlayers) ? all.allPlayers : [];

    const activeName = String(active.summonerName ?? "").trim();
    const activeLower = activeName.toLowerCase();

    // Match the active player against the player list. Modern clients return
    // `riotId` (GameName#TAG); older ones return `summonerName`.
    const me =
      players.find((p) => p.summonerName && p.summonerName === activeName) ??
      players.find((p) => p.summonerName?.toLowerCase() === activeLower) ??
      players.find((p) => p.riotId?.toLowerCase() === activeLower) ??
      players.find((p) => p.riotId?.toLowerCase().split("#")[0] === activeLower) ??
      null;

    // Prefer the player-list scores — activePlayer.championStats misses CS in
    // some modes. Fall back to championStats only if the playerlist didn't match.
    const scores = me?.scores ?? active.championStats ?? {};

    const items = (me?.items ?? [])
      .filter((it) => Number(it.itemID ?? 0) > 0)
      .map((it) => ({
        itemId: Number(it.itemID ?? 0),
        slot: Number(it.slot ?? 0),
        displayName: String(it.displayName ?? ""),
        count: Number(it.count ?? 1),
      }));

    return {
      gameTimeSec: Number(game.gameTime ?? 0),
      gameMode: String(game.gameMode ?? ""),
      items,
      activePlayer: {
        summonerName: activeName,
        level: Number(active.level ?? me?.level ?? 0),
        currentGold: Number(active.currentGold ?? 0),
        championName: String(me?.championName ?? ""),
        kills: Number(scores.kills ?? 0),
        deaths: Number(scores.deaths ?? 0),
        assists: Number(scores.assists ?? 0),
        creepScore: Number(scores.creepScore ?? 0),
      },
    };
  } catch {
    // Not in a match, or the game client hasn't opened the port yet.
    return null;
  }
}

// ---- Full live snapshot ----

export const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

export const num = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export const rec = (v: unknown): Record<string, any> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {};

const list = (v: unknown): any[] => (Array.isArray(v) ? v : []);

function runeRef(v: unknown): LiveRuneRef | null {
  const r = rec(v);
  const id = num(r.id);
  if (!id && !r.displayName) return null;
  return { id, name: str(r.displayName) };
}

function liveSpell(v: unknown, id: number | null): LiveSpell {
  return { name: str(rec(v).displayName), id, key: str(rec(v).rawDescription) };
}

// Names in the Live Client API carry no tag line in older clients, so compare on the game name only.
const nameKey = (v: unknown): string => str(v).split("#")[0].trim().toLowerCase();

// The gameflow session knows ids and puuids the Live Client API leaves out (champion id, summoner spell
// ids, puuid), so players are matched to it by name. It is only reachable while the LCU is connected.
async function readGameSession(): Promise<{
  phase: string | null;
  queueId: number | null;
  gameId: number | null;
  byName: Map<string, { championId: number; spell1: number; spell2: number; puuid: string | null }>;
  data?: Record<string, unknown>;
}> {
  const empty = { phase: null, queueId: null, gameId: null, byName: new Map() };
  if (!isClientConnected()) return empty;
  try {
    const session = rec(await lcuRequest("/lol-gameflow/v1/session"));
    const gameData = rec(session.gameData);
    const byName = new Map<
      string,
      { championId: number; spell1: number; spell2: number; puuid: string | null }
    >();
    for (const p of [...list(gameData.teamOne), ...list(gameData.teamTwo)]) {
      const entry = {
        championId: num(p.championId),
        spell1: num(p.spell1Id),
        spell2: num(p.spell2Id),
        puuid: p.puuid ? str(p.puuid) : null,
      };
      for (const key of [p.summonerName, p.riotIdGameName, p.summonerInternalName]) {
        if (key) byName.set(nameKey(key), entry);
      }
    }
    return {
      phase: session.phase ? str(session.phase) : null,
      queueId: typeof rec(gameData.queue).id === "number" ? rec(gameData.queue).id : null,
      gameId: gameData.gameId ? num(gameData.gameId) : null,
      byName,
      // Everything the client says about the game, minus the lobby password and the spectator key
      data: Object.fromEntries(
        Object.entries(gameData).filter(([k]) => k !== "password" && k !== "spectatorKey"),
      ),
    };
  } catch {
    return empty;
  }
}

export async function fetchLiveFull(): Promise<LiveFull> {
  const fetchedAt = Date.now();
  const noGame: LiveFull = {
    fetchedAt,
    state: "no-game",
    gameflowPhase: null,
    game: null,
    me: null,
    players: [],
    events: [],
    raw: null,
  };

  let raw: Record<string, any>;
  try {
    raw = rec(JSON.parse(await liveClientGet("/liveclientdata/allgamedata")));
  } catch {
    // Not in a match, or the game client hasn't opened the port yet.
    const session = await readGameSession();
    return { ...noGame, gameflowPhase: session.phase };
  }
  if (!raw.gameData) return noGame;

  const session = await readGameSession();
  const gd = rec(raw.gameData);
  const ap = rec(raw.activePlayer);
  const activeKey = nameKey(ap.riotId || ap.summonerName);

  const players: LivePlayer[] = list(raw.allPlayers).map((p) => {
    const id = session.byName.get(nameKey(p.riotId || p.summonerName)) ?? null;
    const scores = rec(p.scores);
    const runes = rec(p.runes);
    const items: LiveItem[] = list(p.items)
      .filter((it) => num(it.itemID) > 0)
      .map((it) => ({
        id: num(it.itemID),
        name: str(it.displayName),
        count: Math.max(1, num(it.count)),
        price: num(it.price),
        slot: num(it.slot),
        consumable: Boolean(it.consumable),
        canUse: Boolean(it.canUse),
      }));
    const spells = rec(p.summonerSpells);
    const riotId = str(p.riotId);
    return {
      riotId,
      gameName: str(p.riotIdGameName) || riotId.split("#")[0],
      tagLine: str(p.riotIdTagLine) || riotId.split("#")[1] || "",
      summonerName: str(p.summonerName),
      championName: str(p.championName),
      championId: id && id.championId > 0 ? id.championId : null,
      team: str(p.team),
      position: str(p.position),
      level: num(p.level),
      isBot: Boolean(p.isBot),
      isDead: Boolean(p.isDead),
      respawnTimer: num(p.respawnTimer),
      skinId: num(p.skinID),
      skinName: str(p.skinName),
      kills: num(scores.kills),
      deaths: num(scores.deaths),
      assists: num(scores.assists),
      creepScore: num(scores.creepScore),
      wardScore: num(scores.wardScore),
      items,
      itemValue: items.reduce((sum, it) => sum + it.price * it.count, 0),
      spellOne: liveSpell(spells.summonerSpellOne, id ? id.spell1 || null : null),
      spellTwo: liveSpell(spells.summonerSpellTwo, id ? id.spell2 || null : null),
      keystone: runeRef(runes.keystone),
      primaryTree: runeRef(runes.primaryRuneTree),
      secondaryTree: runeRef(runes.secondaryRuneTree),
      isMe: nameKey(p.riotId || p.summonerName) === activeKey,
      puuid: id?.puuid ?? null,
    };
  });

  const abilities: LiveAbility[] = (["Passive", "Q", "W", "E", "R"] as const).map((key) => {
    const a = rec(rec(ap.abilities)[key]);
    return { key, name: str(a.displayName), level: num(a.abilityLevel) };
  });
  const full = rec(ap.fullRunes);
  const me: LiveActivePlayer | null = raw.activePlayer
    ? {
        riotId: str(ap.riotId),
        summonerName: str(ap.summonerName),
        level: num(ap.level),
        currentGold: num(ap.currentGold),
        stats: Object.fromEntries(
          Object.entries(rec(ap.championStats)).filter(
            ([, v]) => typeof v === "number" || typeof v === "string",
          ),
        ) as Record<string, number | string>,
        abilities,
        keystone: runeRef(full.keystone),
        primaryTree: runeRef(full.primaryRuneTree),
        secondaryTree: runeRef(full.secondaryRuneTree),
        generalRunes: list(full.generalRunes)
          .map(runeRef)
          .filter((r): r is LiveRuneRef => r !== null),
        statRunes: list(full.statRunes)
          .map((r) => ({ id: num(rec(r).id), name: str(rec(r).rawDescription) }))
          .filter((r) => r.id > 0),
        teamRelativeColors:
          typeof ap.teamRelativeColors === "boolean" ? ap.teamRelativeColors : null,
      }
    : null;

  // Events keep every field they arrive with: the named ones feed the feed, the rest go to `extra`.
  const known = new Set([
    "EventID",
    "EventName",
    "EventTime",
    "KillerName",
    "VictimName",
    "Assisters",
    "DragonType",
    "Stolen",
    "TurretKilled",
    "InhibKilled",
    "Acer",
    "AcingTeam",
    "KillStreak",
    "Recipient",
  ]);
  const events: LiveEvent[] = list(rec(raw.events).Events).map((e) => ({
    id: num(e.EventID),
    name: str(e.EventName),
    time: num(e.EventTime),
    killer: e.KillerName ? str(e.KillerName) : null,
    victim: e.VictimName ? str(e.VictimName) : null,
    assisters: list(e.Assisters).map(str),
    dragonType: e.DragonType ? str(e.DragonType) : null,
    stolen: str(e.Stolen).toLowerCase() === "true",
    turret: e.TurretKilled ? str(e.TurretKilled) : null,
    inhib: e.InhibKilled ? str(e.InhibKilled) : null,
    acer: e.Acer ? str(e.Acer) : null,
    acingTeam: e.AcingTeam ? str(e.AcingTeam) : null,
    killStreak: e.KillStreak != null ? num(e.KillStreak) : null,
    recipient: e.Recipient ? str(e.Recipient) : null,
    extra: Object.fromEntries(Object.entries(rec(e)).filter(([k]) => !known.has(k))),
  }));

  return {
    fetchedAt,
    state: "in-game",
    gameflowPhase: session.phase,
    game: {
      mode: str(gd.gameMode),
      mapName: str(gd.mapName),
      mapNumber: num(gd.mapNumber),
      mapTerrain: str(gd.mapTerrain),
      timeSec: num(gd.gameTime),
      queueId: session.queueId,
      gameId: session.gameId,
    },
    me,
    players,
    events,
    raw,
    session: session.data,
  };
}

const CHECKPOINT_MS = 30_000;

// Consecutive samples without a game before it counts as over (a few seconds, not one dropped request)
const MISSES_BEFORE_END = 3;

// Momentary readings that say nothing about how strong the champion is
const SKIP_STATS = new Set(["currentHealth", "resourceValue", "resourceType"]);

// Game seconds between two points of the stored flow series
const SERIES_STEP_SEC = 5;

type Recording = db.LiveStatRecording & {
  lastSave: number;
  dirty: boolean;
  misses: number;
  // The latest full snapshot and the flow series, written with the peaks so they end up with the match
  snapshot: LiveFull | null;
  series: LiveSeriesPoint[];
  firstSampleSec: number | null;
  playerIds: string[];
  itemLog: NonNullable<StoredLiveBody["itemLog"]>;
  skillLog: NonNullable<StoredLiveBody["skillLog"]>;
  statSeries: NonNullable<StoredLiveBody["statSeries"]>;
  spellLog: NonNullable<StoredLiveBody["spellLog"]>;
  champSelect: StoredLiveBody["champSelect"];
  // Last seen state, to turn snapshots into change logs
  prevItems: Map<string, Map<number, number>>;
  prevSkills: Record<string, number>;
  prevSpells: Map<string, string>;
};

// The last champion select seen by the lobby poll, attached to the game that follows it
let lastChampSelect: { at: number; value: NonNullable<LiveSessionData["champSelect"]> } | null =
  null;

const CHAMP_SELECT_MAX_AGE_MS = 30 * 60_000;

const STAT_SERIES_STEP_SEC = 5;

const playerKey = (p: LivePlayer) => p.riotId || `${p.summonerName}|${p.championName}`;

// Turns one snapshot into the per-player series point, inventory changes, skill order and stat series
function collectExtras(rec: Recording, snap: LiveFull, t: number, sample: Record<string, number>) {
  rec.firstSampleSec ??= t;
  if (rec.playerIds.length === 0) rec.playerIds = snap.players.map(playerKey);

  for (const p of snap.players) {
    const key = playerKey(p);
    const now = new Map<number, number>();
    for (const it of p.items) now.set(it.id, (now.get(it.id) ?? 0) + it.count);
    const before = rec.prevItems.get(key) ?? new Map<number, number>();
    for (const id of new Set([...now.keys(), ...before.keys()])) {
      const d = (now.get(id) ?? 0) - (before.get(id) ?? 0);
      if (d !== 0) {
        rec.itemLog.push({ t, p: key, id, d });
        rec.dirty = true;
      }
    }
    rec.prevItems.set(key, now);

    for (const [slot, spell] of [
      [1, p.spellOne],
      [2, p.spellTwo],
    ] as const) {
      const id = `${key}|${slot}`;
      const seen = spell.key || spell.name;
      if (!seen || rec.prevSpells.get(id) === seen) continue;
      rec.prevSpells.set(id, seen);
      rec.spellLog.push({ t, p: key, slot, name: spell.name, key: spell.key ?? "" });
      rec.dirty = true;
    }
  }

  // prevSkills holds the highest rank seen per key: the client's readings flicker, so only a new
  // maximum (within the rank cap) counts as a level-up
  for (const a of snap.me?.abilities ?? []) {
    if (a.key === "Passive") continue;
    const have = rec.prevSkills[a.key] ?? 0;
    const target = Math.min(a.level, skillCap(a.key));
    for (let rank = have + 1; rank <= target; rank++) {
      rec.skillLog.push({ t, key: a.key, level: rank });
      rec.dirty = true;
    }
    rec.prevSkills[a.key] = Math.max(have, target);
  }

  const lastStat = rec.statSeries[rec.statSeries.length - 1];
  if (!lastStat || t < lastStat.t || t - lastStat.t >= STAT_SERIES_STEP_SEC) {
    // Momentary readings are left out of the peaks but kept in the series
    const stats = { ...sample };
    for (const key of ["currentHealth", "resourceValue"]) {
      const value = snap.me?.stats[key];
      if (typeof value === "number") stats[key] = value;
    }
    rec.statSeries.push({ t, stats });
  }
}

let recording: Recording | null = null;

let recordBusy = false;

export function persistRecording() {
  if (!recording) return;
  try {
    db.saveLiveStatPeaks(recording);
    if (recording.snapshot) {
      db.saveLiveGameData(recording.gameId, recording.puuid, {
        snapshot: recording.snapshot,
        series: recording.series,
        firstSampleSec: recording.firstSampleSec ?? undefined,
        playerIds: recording.playerIds,
        itemLog: recording.itemLog,
        skillLog: recording.skillLog,
        statSeries: recording.statSeries,
        spellLog: recording.spellLog,
        champSelect: recording.champSelect,
      });
    }
    recording.dirty = false;
    recording.lastSave = Date.now();
  } catch (err) {
    console.log("Saving live stats failed:", err);
  }
}

function statSample(snap: LiveFull): Record<string, number> | null {
  const me = snap.me;
  if (!me) return null;
  const row = snap.players.find((p) => p.isMe);
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(me.stats)) {
    if (typeof value === "number" && !SKIP_STATS.has(key)) out[key] = value;
  }
  const hp = out.maxHealth ?? 0;
  out.effectiveHpPhysical = hp * (1 + (out.armor ?? 0) / 100);
  out.effectiveHpMagic = hp * (1 + (out.magicResist ?? 0) / 100);
  out.level = me.level;
  out.gold = me.currentGold;
  if (row) {
    out.kills = row.kills;
    out.deaths = row.deaths;
    out.assists = row.assists;
    out.creepScore = row.creepScore;
    out.wardScore = row.wardScore;
    out.itemValue = row.itemValue;
  }
  return out;
}

export async function recordTick() {
  // Nothing to do outside a game, unless a finished one still has to be written out
  if (recordBusy || (status !== "ingame" && !recording)) return;
  recordBusy = true;
  try {
    const snap = await fetchLiveFull();
    const gameId = snap.game?.gameId ?? null;
    const sample = snap.state === "in-game" && gameId != null ? statSample(snap) : null;

    if (!sample || gameId == null) {
      if (recording && ++recording.misses >= MISSES_BEFORE_END) {
        persistRecording();
        recording = null;
      }
      return;
    }

    if (recording && recording.gameId !== gameId) {
      persistRecording();
      recording = null;
    }
    if (!recording) {
      const row = snap.players.find((p) => p.isMe);
      const puuid = row?.puuid ?? (await getCurrentSummoner().catch(() => null))?.puuid;
      if (!puuid) return;
      recording = {
        gameId,
        puuid,
        championId: row?.championId ?? null,
        championName: row?.championName ?? "",
        queueId: snap.game?.queueId ?? null,
        peaks: {},
        finals: {},
        lastSave: 0,
        dirty: false,
        misses: 0,
        snapshot: null,
        series: [],
        firstSampleSec: null,
        playerIds: [],
        itemLog: [],
        skillLog: [],
        statSeries: [],
        spellLog: [],
        prevSpells: new Map(),
        champSelect:
          lastChampSelect && Date.now() - lastChampSelect.at < CHAMP_SELECT_MAX_AGE_MS
            ? lastChampSelect.value
            : null,
        prevItems: new Map(),
        prevSkills: {},
      };
    }
    recording.misses = 0;
    recording.snapshot = snap;
    const t = snap.game?.timeSec ?? 0;
    collectExtras(recording, snap, t, sample);
    const lastPoint = recording.series[recording.series.length - 1];
    if (!lastPoint || t < lastPoint.t || t - lastPoint.t >= SERIES_STEP_SEC) {
      const team = (name: string) => {
        const ps = snap.players.filter((p) => p.team === name);
        return {
          kills: ps.reduce((s, p) => s + p.kills, 0),
          cs: ps.reduce((s, p) => s + p.creepScore, 0),
          itemValue: ps.reduce((s, p) => s + p.itemValue, 0),
        };
      };
      recording.series.push({
        t,
        ORDER: team("ORDER"),
        CHAOS: team("CHAOS"),
        gold: snap.me?.currentGold ?? 0,
        players: recording.playerIds.map((id) => {
          const p = snap.players.find((x) => playerKey(x) === id);
          return p
            ? [
                p.kills,
                p.deaths,
                p.assists,
                p.creepScore,
                p.itemValue,
                p.level,
                p.wardScore,
                Number(p.isDead),
                p.respawnTimer,
              ]
            : [0, 0, 0, 0, 0, 0, 0, 0, 0];
        }),
      });
      recording.dirty = true;
    }
    for (const [key, value] of Object.entries(sample)) {
      recording.finals[key] = value;
      if (!(key in recording.peaks) || value > recording.peaks[key]) {
        recording.peaks[key] = value;
        recording.dirty = true;
      }
    }
    if (recording.dirty && Date.now() - recording.lastSave >= CHECKPOINT_MS) persistRecording();
  } catch (err) {
    console.log("Live stat recording failed:", err);
  } finally {
    recordBusy = false;
  }
}

const QUEUE_LABEL_BY_ID: Record<number, string> = {
  400: "Normal Draft",
  420: "Ranked Solo",
  430: "Normal Blind",
  440: "Ranked Flex",
  450: "ARAM",
  480: "Swiftplay",
  700: "Clash",
  720: "ARAM Clash",
  1700: "Arena",
  1740: "Arena",
  1750: "Arena",
  2400: "ARAM Mayhem",
  2450: "ARAM Mayhem",
  [QUEUE_ID_MAYHEM_CUSTOM]: "ARAM Mayhem - Custom game",
};

export async function fetchLiveSessionData(): Promise<LiveSessionData | null> {
  if (!isClientConnected()) {
    return null;
  }

  let phase = "None";
  try {
    const raw = (await lcuRequest("/lol-gameflow/v1/gameflow-phase")) as unknown;
    phase = typeof raw === "string" ? raw : "None";
  } catch {
    phase = "None";
  }

  if (phase === "Matchmaking" && lastTrackedPhase !== "Matchmaking") {
    matchmakingStartedAt = Date.now();
  }
  if (phase !== "Matchmaking" && phase !== "ReadyCheck") {
    matchmakingStartedAt = null;
  }
  lastTrackedPhase = phase;

  let queueId: number | null = null;
  try {
    const session = (await lcuRequest("/lol-gameflow/v1/session")) as {
      gameData?: { queue?: { id?: unknown } };
    };
    const qid = session?.gameData?.queue?.id;
    if (typeof qid === "number") queueId = qid;
  } catch {
    queueId = null;
  }

  let lobbySize: number | null = null;
  let lobbyMaxSize: number | null = null;
  let gameMode: string | null = null;
  let mapId: number | null = null;
  let isCustom = false;
  let canStart: boolean | null = null;
  let members: LiveSessionData["members"] = [];
  let search: LiveSessionData["search"] = null;
  let readyCheck: LiveSessionData["readyCheck"] = null;
  if (phase === "Lobby" || phase === "Matchmaking" || phase === "ReadyCheck") {
    try {
      const lobby = rec(await lcuRequest("/lol-lobby/v2/lobby"));
      const config = rec(lobby.gameConfig);
      const localPuuid = str(rec(lobby.localMember).puuid);
      members = list(lobby.members).map((m) => ({
        name: str(m.summonerName) || str(m.gameName) || "Player",
        isLeader: Boolean(m.isLeader),
        ready: Boolean(m.ready),
        isMe: !!localPuuid && str(m.puuid) === localPuuid,
      }));
      lobbySize = members.length;
      lobbyMaxSize = typeof config.maxLobbySize === "number" ? config.maxLobbySize : null;
      gameMode = config.gameMode ? str(config.gameMode) : null;
      mapId = typeof config.mapId === "number" ? config.mapId : null;
      isCustom = Boolean(config.isCustom);
      canStart =
        typeof rec(lobby.localMember).allowedStartActivity === "boolean"
          ? Boolean(rec(lobby.localMember).allowedStartActivity)
          : null;
      if (queueId == null && typeof config.queueId === "number") queueId = config.queueId;
    } catch {
      // Lobby endpoint may fail in transitional phases.
    }

    if (phase === "Matchmaking" || phase === "ReadyCheck") {
      try {
        const s = rec(await lcuRequest("/lol-matchmaking/v1/search"));
        const low = rec(s.lowPriorityData);
        const rc = rec(s.readyCheck);
        search = {
          state: str(s.searchState),
          estimatedSec: typeof s.estimatedQueueTime === "number" ? s.estimatedQueueTime : null,
          elapsedSec: typeof s.timeInQueue === "number" ? s.timeInQueue : null,
          penaltySec: num(low.penaltyTimeRemaining) > 0 ? num(low.penaltyTimeRemaining) : null,
          dodgeWarning: rc.dodgeWarning && rc.dodgeWarning !== "None" ? str(rc.dodgeWarning) : null,
        };
        if (phase === "ReadyCheck") {
          readyCheck = {
            response: str(rc.playerResponse),
            timerSec: typeof rc.timer === "number" ? rc.timer : null,
            state: str(rc.state),
          };
        }
      } catch {
        // Search resource only exists while the player is queued.
      }
    }
  }

  let champSelect: LiveSessionData["champSelect"] = null;
  if (phase === "ChampSelect") {
    try {
      const session = (await lcuRequest("/lol-champ-select/v1/session")) as {
        localPlayerCellId?: unknown;
        myTeam?: Array<{
          summonerId?: unknown;
          cellId?: unknown;
          championId?: unknown;
        }>;
        bench?: Array<{ championId?: unknown }>;
        actions?: Array<
          Array<{
            actorCellId?: unknown;
            type?: unknown;
            completed?: unknown;
            isInProgress?: unknown;
            timer?: {
              adjustedTimeLeftInPhase?: unknown;
              internalNowInEpochMs?: unknown;
            };
          }>
        >;
        gameData?: { queue?: { id?: unknown } };
      };
      if (session) {
        const localCellId = Number(session.localPlayerCellId ?? -1);
        const myTeam = Array.isArray(session.myTeam)
          ? session.myTeam.map((member) => ({
              summonerName:
                str(rec(member).gameName) ||
                str(rec(member).summonerName) ||
                String(member.summonerId ?? member.cellId ?? ""),
              championId: Number(member.championId ?? 0),
              isMe: Number(member.cellId) === localCellId,
            }))
          : [];
        const bench = Array.isArray(session.bench)
          ? session.bench.map((entry) => ({ championId: Number(entry.championId ?? 0) }))
          : [];
        const me = session.myTeam?.find((member) => Number(member.cellId) === localCellId);
        const myChampionId = me ? Number(me.championId ?? 0) : null;

        let isMyTurn = false;
        let timeLeftMs: number | null = null;
        for (const group of session.actions ?? []) {
          for (const action of group ?? []) {
            if (
              Number(action.actorCellId) === localCellId &&
              action.type === "pick" &&
              !action.completed
            ) {
              isMyTurn = action.isInProgress === true;
            }
            if (action.isInProgress) {
              timeLeftMs =
                Number(
                  action.timer?.adjustedTimeLeftInPhase ?? action.timer?.internalNowInEpochMs ?? 0,
                ) || null;
            }
          }
        }

        if (typeof session.gameData?.queue?.id === "number") {
          queueId = session.gameData.queue.id;
        }
        const timer = rec((session as { timer?: unknown }).timer);
        const bans = rec((session as { bans?: unknown }).bans);
        const toIds = (v: unknown) =>
          list(v)
            .map(num)
            .filter((id) => id > 0);
        const rerolls = (session as { rerollsRemaining?: unknown }).rerollsRemaining;
        champSelect = {
          myChampionId,
          myTeam,
          bench,
          isMyTurn,
          timeLeftMs: timeLeftMs ?? (num(timer.adjustedTimeLeftInPhase) || null),
          timerPhase: timer.phase ? str(timer.phase) : null,
          bans: { mine: toIds(bans.myTeamBans), theirs: toIds(bans.theirTeamBans) },
          rerollsRemaining: typeof rerolls === "number" ? rerolls : null,
        };
        lastChampSelect = { at: Date.now(), value: champSelect };
      }
    } catch {
      // Champ-select endpoint may be unavailable during a transition.
    }
  }

  return {
    phase,
    queueId,
    queueLabel:
      queueId != null
        ? (QUEUE_LABEL_BY_ID[queueId] ?? QUEUE_LABELS[queueId] ?? `Queue ${queueId}`)
        : null,
    lobbySize,
    lobbyMaxSize,
    queueStartedAt: matchmakingStartedAt,
    gameMode,
    mapId,
    isCustom,
    members,
    canStart,
    search,
    readyCheck,
    champSelect,
    profile: await fetchClientProfile(),
  };
}
