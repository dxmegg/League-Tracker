// OP.GG has no public documentation for this API and no key — it is the same
// endpoint the op.gg website itself calls. Because it is undocumented, the shape
// of data may change without notice, which is why these functions return unknown
// and the caller decides how to interpret it.
const OPGG_BASE = "https://lol-api-summoner.op.gg/api";
const OPGG_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// OP.GG returns JSON under a top-level data key on every endpoint. A missing key
// or a non-OK status is an error, not a silent empty result — callers must see
// the failure.
async function opggFetch<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { "User-Agent": OPGG_UA, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`OP.GG returned ${response.status} for ${url}`);
  }
  const body = (await response.json()) as { data?: T; error?: unknown };
  if (body.data === undefined) {
    throw new Error(`OP.GG response had no data key for ${url}`);
  }
  return body.data;
}

export async function searchSummoner(
  region: string,
  gameName: string,
  tagLine: string,
): Promise<unknown> {
  const riotId = encodeURIComponent(`${gameName}#${tagLine}`);
  const url = `${OPGG_BASE}/v3/${encodeURIComponent(region)}/summoners?riot_id=${riotId}&hl=en_US`;
  return opggFetch(url);
}

export async function getSummonerSummary(
  region: string,
  summonerId: string,
): Promise<unknown> {
  const url = `${OPGG_BASE}/${encodeURIComponent(region)}/summoners/${encodeURIComponent(summonerId)}/summary?hl=en_US`;
  return opggFetch(url);
}

export async function getRecentGames(
  region: string,
  summonerId: string,
  limit = 20,
): Promise<unknown> {
  const safeLimit = Math.max(1, Math.min(20, Math.floor(limit)));
  const url = `${OPGG_BASE}/${encodeURIComponent(region)}/summoners/${encodeURIComponent(summonerId)}/games?limit=${safeLimit}&game_type=TOTAL&hl=en_US`;
  return opggFetch(url);
}
