import * as db from "../db";
import type {
  CurrentSummoner,
  ClientProfile,
  ChallengesData,
  ClientChallenge,
  ProfileExtras,
  RankEntry,
} from "../../shared/api";
import {
  isClientConnected,
  friendlyErrorMessage,
  forgetCredentials,
  lcuRequest,
  recordPayload,
  numberField,
  rankEntry,
  getCurrentSummoner,
} from "./connection";
import { str, num, rec } from "./live";

let watcherInterval: NodeJS.Timeout | null = null;

let watcherStartupTimeout: ReturnType<typeof setTimeout> | null = null;

let lastSyncedPuuid: string | null = null;

export async function getProfileExtras(): Promise<ProfileExtras> {
  console.log("[lcu] getProfileExtras called:", {});
  let rankedSolo: RankEntry | null = null;
  let rankedFlex: RankEntry | null = null;
  let topMasteryChampions: ProfileExtras["topMasteryChampions"] = [];
  let totalMasteryPoints = 0;
  let totalMasteryScore = 0;

  try {
    const ranked = recordPayload(await lcuRequest("/lol-ranked/v1/current-ranked-stats"));
    const queueMap = recordPayload(ranked.queueMap);
    rankedSolo = rankEntry(queueMap.RANKED_SOLO_5x5);
    rankedFlex = rankEntry(queueMap.RANKED_FLEX_SR);
  } catch (err) {
    console.warn("[lcu] profile ranked stats unavailable:", err);
  }

  try {
    const masteryPayload = await lcuRequest(
      "/lol-champion-mastery/v1/local-player/champion-mastery",
    );
    const fullMasteryList = (Array.isArray(masteryPayload) ? masteryPayload : [])
      .map((entry) => {
        const mastery = recordPayload(entry);
        return {
          championId: numberField(mastery.championId),
          level: numberField(mastery.championLevel),
          points: numberField(mastery.championPoints),
        };
      })
      .filter((entry) => entry.championId > 0 && entry.points >= 0);
    totalMasteryPoints = fullMasteryList.reduce((sum, entry) => sum + entry.points, 0);
    totalMasteryScore = fullMasteryList.reduce((sum, entry) => sum + entry.level, 0);
    topMasteryChampions = fullMasteryList
      .sort((left, right) => right.points - left.points)
      .slice(0, 5);
  } catch (err) {
    console.warn("[lcu] profile mastery unavailable:", err);
  }

  const result = {
    rankedSolo,
    rankedFlex,
    topMasteryChampions,
    totalMasteryPoints,
    totalMasteryScore,
  };
  console.log("[lcu] getProfileExtras done:", {
    hasRankedSolo: Boolean(rankedSolo),
    hasRankedFlex: Boolean(rankedFlex),
    masteryCount: topMasteryChampions.length,
    totalMasteryPoints,
    totalMasteryScore,
  });
  return result;
}

export async function collectAndSaveSnapshot(): Promise<void> {
  console.log("[lcu-watcher] collectAndSaveSnapshot called");
  let summoner: CurrentSummoner;
  try {
    summoner = await getCurrentSummoner();
  } catch (err) {
    console.warn("[lcu-watcher] current summoner unavailable:", err);
    return;
  }

  let extras: ProfileExtras | undefined;
  try {
    extras = await getProfileExtras();
  } catch (err) {
    console.warn("[lcu-watcher] profile extras unavailable:", err);
  }

  db.saveAccountSnapshot({
    puuid: summoner.puuid,
    gameName: summoner.gameName,
    tagLine: summoner.tagLine,
    profileIconId: summoner.profileIconId,
    platform: summoner.platform,
    summonerLevel: summoner.summonerLevel,
    rankedSolo: extras?.rankedSolo,
    rankedFlex: extras?.rankedFlex,
    topMasteryChampions: extras?.topMasteryChampions,
  });
  if (summoner.puuid && summoner.gameName) {
    const updated = db.updateParticipantNames(
      summoner.puuid,
      summoner.gameName,
      summoner.tagLine ?? "",
    );
    if (updated > 0) {
      console.log(`[lcu-watcher] updated participant names in ${updated} match rows`);
    }
  }
  console.log(`[lcu-watcher] snapshot saved for ${summoner.puuid}`);
}

async function accountWatcherTick(): Promise<void> {
  if (!isClientConnected()) {
    lastSyncedPuuid = null;
    return;
  }

  let currentSummoner: CurrentSummoner;
  try {
    currentSummoner = await getCurrentSummoner();
  } catch (err) {
    console.warn("[lcu-watcher] current summoner check failed:", err);
    return;
  }

  if (!currentSummoner.puuid || currentSummoner.puuid === lastSyncedPuuid) return;

  try {
    await collectAndSaveSnapshot();
    lastSyncedPuuid = currentSummoner.puuid;
  } catch (err) {
    console.error("[lcu-watcher] snapshot save failed:", err);
  }
}

export function startAccountWatcher(): void {
  if (watcherInterval) return;

  watcherStartupTimeout = setTimeout(() => {
    watcherStartupTimeout = null;
    void accountWatcherTick();
  }, 5_000);
  watcherInterval = setInterval(() => {
    void accountWatcherTick();
  }, 60_000);
}

export function stopAccountWatcher(): void {
  if (watcherStartupTimeout) {
    clearTimeout(watcherStartupTimeout);
    watcherStartupTimeout = null;
  }
  if (watcherInterval) {
    clearInterval(watcherInterval);
    watcherInterval = null;
  }
  lastSyncedPuuid = null;
}

// What the client knows about the signed-in player changes slowly, so it is read at most twice a minute
// instead of with every poll of the lobby state.
const PROFILE_TTL_MS = 30_000;

let profileCache: { at: number; value: ClientProfile | null } | null = null;

const RANKED_QUEUE_LABEL: Record<string, string> = {
  RANKED_SOLO_5x5: "Ranked Solo",
  RANKED_FLEX_SR: "Ranked Flex",
  RANKED_TFT: "TFT Ranked",
};

export async function fetchClientProfile(): Promise<ClientProfile | null> {
  if (profileCache && Date.now() - profileCache.at < PROFILE_TTL_MS) return profileCache.value;

  const ask = async (url: string) => {
    try {
      return await lcuRequest(url);
    } catch {
      return null;
    }
  };
  const [summoner, chat, honor, wallet, rankedRaw, region, version] = await Promise.all([
    ask("/lol-summoner/v1/current-summoner"),
    ask("/lol-chat/v1/me"),
    ask("/lol-honor-v2/v1/profile"),
    ask("/lol-inventory/v1/wallet?currencyTypes=%5B%22RP%22%2C%22lol_blue_essence%22%5D"),
    ask("/lol-ranked/v1/current-ranked-stats"),
    ask("/riotclient/region-locale"),
    ask("/lol-patch/v1/game-version"),
  ]);

  const s = rec(summoner);
  let value: ClientProfile | null = null;
  if (s.puuid) {
    const lol = rec(rec(chat).lol);
    const w = rec(wallet);
    const queues = rec(rec(rankedRaw).queueMap);
    const ranked = Object.entries(queues)
      .map(([key, q]) => ({ key, q: rec(q) }))
      .filter(({ q }) => str(q.tier) && str(q.tier) !== "NONE")
      .map(({ key, q }) => ({
        queue: RANKED_QUEUE_LABEL[key] ?? key,
        tier: str(q.tier),
        division: str(q.division) === "NA" ? "" : str(q.division),
        lp: num(q.leaguePoints),
        wins: num(q.wins),
        losses: num(q.losses),
      }));
    value = {
      gameName: str(s.gameName) || str(s.displayName),
      tagLine: str(s.tagLine),
      level: num(s.summonerLevel),
      xpPercent: num(s.percentCompleteForNextLevel),
      profileIconId: num(s.profileIconId),
      region: str(rec(region).region),
      patch: str(version).split(".").slice(0, 2).join("."),
      honorLevel: typeof rec(honor).honorLevel === "number" ? rec(honor).honorLevel : null,
      presence: str(rec(chat).availability),
      statusMessage: str(rec(chat).statusMessage),
      blueEssence: typeof w.lol_blue_essence === "number" ? w.lol_blue_essence : null,
      rp: typeof w.RP === "number" ? w.RP : null,
      challengePoints: lol.challengePoints ? num(lol.challengePoints) : null,
      challengeLevel: lol.challengeCrystalLevel ? str(lol.challengeCrystalLevel) : null,
      ranked,
    };
  }
  profileCache = { at: Date.now(), value };
  return value;
}

// ---- Challenges ----

const CHALLENGES_CACHE_KEY = "challenges_cache_v2";

const CHALLENGE_LEVELS = [
  "IRON",
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "EMERALD",
  "DIAMOND",
  "MASTER",
  "GRANDMASTER",
  "CHALLENGER",
];

// The client's challenge list for the signed-in account. The answer is stored so the tab still
// shows it while the client is closed.
export async function getChallenges(): Promise<ChallengesData> {
  try {
    const [all, summary] = await Promise.all([
      lcuRequest("/lol-challenges/v1/challenges/local-player"),
      lcuRequest("/lol-challenges/v1/summary-player-data/local-player").catch(() => null),
    ]);
    const challenges = Object.values(rec(all))
      .map((entry) => parseChallenge(rec(entry)))
      .filter((c): c is ClientChallenge => c !== null);
    if (challenges.length === 0) throw new Error("The client returned no challenges");

    const overall = rec(summary);
    const result: ChallengesData = {
      challenges,
      totalPoints: num(overall.totalChallengeScore),
      totalLevel: str(overall.overallChallengeLevel),
      fetchedAt: Date.now(),
      live: true,
    };
    db.setSetting(CHALLENGES_CACHE_KEY, JSON.stringify(result));
    return result;
  } catch (err) {
    console.warn("[lcu] challenges unavailable:", friendlyErrorMessage(err));
    // Credentials from a client that has since restarted would keep failing
    forgetCredentials();
    const saved = db.getSetting(CHALLENGES_CACHE_KEY);
    if (saved) return { ...(JSON.parse(saved) as ChallengesData), live: false };
    return {
      challenges: [],
      totalPoints: 0,
      totalLevel: "",
      fetchedAt: null,
      live: false,
      error: isClientConnected() ? friendlyErrorMessage(err) : undefined,
    };
  }
}

function parseChallenge(c: Record<string, any>): ClientChallenge | null {
  // Retired challenges stay in the list but can no longer progress
  const retired = num(c.retireTimestamp) > 0 && num(c.retireTimestamp) < Date.now();
  if (!num(c.id) || !str(c.name) || retired) return null;
  const value = num(c.currentValue);
  const thresholds = rec(c.thresholds);
  const tiers = CHALLENGE_LEVELS.filter((level) => level in thresholds).map((level) => ({
    level,
    value: num(rec(thresholds[level]).value ?? thresholds[level]),
  }));
  // The client's own nextThreshold is unreliable for short and reverse ladders, so it is derived
  const reached = CHALLENGE_LEVELS.indexOf(str(c.currentLevel));
  const next = tiers.find((tier) => CHALLENGE_LEVELS.indexOf(tier.level) > reached);
  const percentile = c.percentile ?? c.percentage;
  return {
    id: num(c.id),
    name: str(c.name),
    description: str(c.description) || str(c.shortDescription),
    category: str(c.category) || "NONE",
    level: str(c.currentLevel) || "NONE",
    value,
    tiers,
    reverse: Boolean(c.isReverseDirection),
    nextThreshold: next?.value ?? null,
    // The client already answers in percent; unranked would only ever read "top 100%"
    percentile:
      typeof percentile === "number" && percentile > 0 && str(c.currentLevel) !== "NONE"
        ? percentile
        : null,
  };
}
