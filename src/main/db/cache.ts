import type { OwnedItemStats, OwnedItemStatsResult } from "../../shared/api";

const OWNED_ITEM_STATS_CACHE_TTL_MS = 60_000;

type OwnedItemStatsCacheValue = OwnedItemStatsResult & OwnedItemStats[];

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const ownedItemStatsCache = new Map<string, CacheEntry<OwnedItemStatsCacheValue>>();

export function getCachedOwnedItemStats(key: string): OwnedItemStatsCacheValue | undefined {
  const entry = ownedItemStatsCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    ownedItemStatsCache.delete(key);
    return undefined;
  }
  return entry.value;
}

export function setCachedOwnedItemStats(key: string, value: OwnedItemStatsCacheValue): void {
  ownedItemStatsCache.set(key, {
    value,
    expiresAt: Date.now() + OWNED_ITEM_STATS_CACHE_TTL_MS,
  });
}

export function invalidateOwnedItemStatsCache(): void {
  ownedItemStatsCache.clear();
}
