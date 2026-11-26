// What the client only offers around the end of a game: the end-of-game screen, mastery changes and
// honor received. Stored as the client sends it, so later views can read whatever turns out useful.
// No imports on purpose: the client and the database are passed in, so a script can test this.

export type PostGameKind =
  | "eog"
  | "mastery_updates"
  | "mastery_changes"
  | "honor"
  | "honor_profile"
  | "statstones"
  | "challenge_changes"
  | "counters";

interface Deps {
  get: (url: string) => Promise<unknown>;
  save: (gameId: number, kind: PostGameKind, data: unknown) => void | Promise<void>;
  delays?: number[];
}

type Row = Record<string, any>;

export const EOG_STATS_URL = "lol-end-of-game/v1/eog-stats-block";
export const MASTERY_UPDATES_URL = "lol-end-of-game/v1/champion-mastery-updates";
export const HONOR_URL = "lol-honor-v2/v1/recognition-history";
const MASTERY_URL = "lol-champion-mastery/v1/local-player/champion-mastery";
export const HONOR_PROFILE_URL = "lol-honor-v2/v1/profile";
export const CHALLENGES_URL = "lol-challenges/v1/challenges/local-player";
export const STATSTONES_URL = "lol-statstones/v1/eog-notifications/";
export const PROGRESSION_URL = "lol-progression/v1/groups/";

// Champions whose mastery differs between two reads of the full list
export function masteryChanges(
  before: Row[],
  after: Row[],
): Array<{ before: Row | null; after: Row }> {
  const old = new Map(before.map((row) => [row.championId, row]));
  return after
    .map((row) => ({ before: old.get(row.championId) ?? null, after: row }))
    .filter(
      ({ before: was, after: now }) =>
        !was || was.championPoints !== now.championPoints || was.lastPlayTime !== now.lastPlayTime,
    );
}

export function honorByGame(entries: unknown): Map<number, Row[]> {
  const games = new Map<number, Row[]>();
  for (const entry of Array.isArray(entries) ? (entries as Row[]) : []) {
    const gameId = Number(entry?.gameId);
    if (!(gameId > 0)) continue;
    games.set(gameId, [...(games.get(gameId) ?? []), entry]);
  }
  return games;
}

// Challenges that moved between two reads of the full list
export function challengeChanges(before: Row, after: Row): Row[] {
  const old = new Map(Object.values(before).map((c: Row) => [c.id, c]));
  return Object.values(after).flatMap((now: Row) => {
    const was = old.get(now.id);
    if (!was || was.currentValue === now.currentValue) return [];
    return [
      {
        id: now.id,
        name: now.name,
        before: was.currentValue,
        after: now.currentValue,
        levelBefore: was.currentLevel,
        level: now.currentLevel,
      },
    ];
  });
}

// Mayhem win and loss counters; the configuration names them, the instance data holds the values
async function mayhemCounters(read: (url: string) => Promise<any>): Promise<Row[]> {
  const config = await read(`${PROGRESSION_URL}configuration`);
  const out: Row[] = [];
  for (const group of Object.values((config ?? {}) as Row) as Row[]) {
    const wanted = (group.counters ?? []).filter((c: Row) => /^KIWI /.test(c.name));
    if (wanted.length === 0) continue;
    const data = await read(`${PROGRESSION_URL}${group.id}/instanceData`);
    for (const counter of wanted) {
      const value = data?.counters?.find((c: Row) => c.counterId === counter.id)?.counterValue;
      if (typeof value === "number") out.push({ name: counter.name, value });
    }
  }
  return out;
}

export function createPostGameCapture({ get, save, delays = [3_000, 20_000, 90_000] }: Deps) {
  let masteryBefore: Row[] | null = null;
  let challengesBefore: Row | null = null;
  // The game that just ended; the mastery frames and polls are filed under it
  let endedGame = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const read = async (url: string): Promise<any> => {
    try {
      return await get(`/${url}`);
    } catch {
      // Most of these answer 404 outside the post-game screen
      return null;
    }
  };

  const store = async (gameId: number, kind: PostGameKind, data: unknown) => {
    if (!(gameId > 0) || data == null || (Array.isArray(data) && data.length === 0)) return;
    try {
      await save(gameId, kind, data);
    } catch (err) {
      console.log(`[post-game] could not store ${kind} for ${gameId}:`, err);
    }
  };

  const storeHonor = async (entries: unknown) => {
    for (const [gameId, rows] of honorByGame(entries)) await store(gameId, "honor", rows);
  };

  const collect = async (gameId: number) => {
    const eog = await read(EOG_STATS_URL);
    if (Number(eog?.gameId) === gameId) await store(gameId, "eog", eog);
    // A newer game must not have its screen filed under this one
    if (endedGame !== gameId) return;
    await store(gameId, "mastery_updates", await read(MASTERY_UPDATES_URL));
    const after = await read(MASTERY_URL);
    if (masteryBefore && Array.isArray(after)) {
      await store(gameId, "mastery_changes", masteryChanges(masteryBefore, after));
    }
    await storeHonor(await read(HONOR_URL));
    await store(gameId, "honor_profile", await read(HONOR_PROFILE_URL));
    await store(gameId, "statstones", await read(`${STATSTONES_URL}${gameId}`));
    const challenges = await read(CHALLENGES_URL);
    if (challengesBefore && challenges) {
      await store(gameId, "challenge_changes", challengeChanges(challengesBefore, challenges));
    }
    await store(gameId, "counters", await mayhemCounters(read));
  };

  return {
    async onGameStart() {
      const rows = await read(MASTERY_URL);
      if (Array.isArray(rows)) masteryBefore = rows;
      challengesBefore = (await read(CHALLENGES_URL)) ?? challengesBefore;
    },

    onGameEnd(gameId: number) {
      if (!(gameId > 0) || endedGame === gameId) return;
      endedGame = gameId;
      for (const delay of delays) {
        const timer = setTimeout(() => {
          timers.delete(timer);
          void collect(gameId);
        }, delay);
        timer.unref?.();
        timers.add(timer);
      }
    },

    // The post-game screen can be dismissed before the first poll, so pushed events are kept too
    async onFrame(path: string, data: any) {
      if (!data) return;
      if (path === EOG_STATS_URL) await store(Number(data.gameId), "eog", data);
      else if (path === MASTERY_UPDATES_URL) {
        await store(Number(data.gameId) || endedGame, "mastery_updates", data);
      } else if (path === HONOR_URL) await storeHonor(data);
    },

    // Honor stays listed for a while, so pick up what arrived while the app was closed
    async catchUp() {
      await storeHonor(await read(HONOR_URL));
    },

    stop() {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    },
  };
}
