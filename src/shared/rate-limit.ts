// Limits of the Riot API key: 20 requests per second and 100 per 2 minutes. The app has a single
// user for now, so it takes the whole allowance. No imports, so a script can test this.
export const RIOT_LIMITS = [
  { max: 20, windowMs: 1_000 },
  { max: 100, windowMs: 120_000 },
];
// Riot counts when a request arrives, not when it leaves
const MARGIN_MS = 100;

// When the next request may start, given the start times already handed out (oldest first)
export function nextSlot(starts: number[], now: number, limits = RIOT_LIMITS): number {
  let at = Math.max(now, starts.at(-1) ?? 0);
  for (const { max, windowMs } of limits) {
    if (starts.length >= max) at = Math.max(at, starts[starts.length - max] + windowMs + MARGIN_MS);
  }
  return at;
}
