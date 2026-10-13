import type { OwnedItemStats, OwnedItemStatsResult } from "../../shared/api";

const DEFAULT_TTL_MS = 60_000;
const MAX_ENTRIES = 200;

interface Entry {
  value: unknown;
  expiresAt: number;
}

const store = new Map<string, Entry>();

export type OwnedItemStatsCacheValue = OwnedItemStatsResult & OwnedItemStats[];

export function cachedQuery<T>(
  namespace: string,
  keyParts: (string | number | null | undefined)[],
  ttlMs: number,
  fn: () => T,
): T {
  const key = `${namespace}:${keyParts.map((part) => part ?? "_").join("|")}`;
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  if (hit) store.delete(key);

  const value = fn();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });

  if (store.size > MAX_ENTRIES) {
    let oldestKey: string | undefined;
    let oldestAt = Infinity;
    for (const [entryKey, entry] of store) {
      if (entry.expiresAt < oldestAt) {
        oldestAt = entry.expiresAt;
        oldestKey = entryKey;
      }
    }
    if (oldestKey) store.delete(oldestKey);
  }

  return value;
}

export function invalidateAllCaches(): void {
  store.clear();
}

// Keep backward-compat exports for existing callers, backed by the same store.
export function getCachedOwnedItemStats(key: string): OwnedItemStatsCacheValue | undefined {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as OwnedItemStatsCacheValue;
  if (hit) store.delete(key);
  return undefined;
}

export function setCachedOwnedItemStats(key: string, value: OwnedItemStatsCacheValue): void {
  store.set(key, { value, expiresAt: Date.now() + DEFAULT_TTL_MS });
}

export function invalidateOwnedItemStatsCache(): void {
  store.clear();
}
