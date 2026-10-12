import type { HomeDashboardPayload } from "../../shared/api";

const DASHBOARD_CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 20;

interface DashboardCacheEntry {
  data: HomeDashboardPayload;
  expiresAt: number;
}

const dashboardCache = new Map<string, DashboardCacheEntry>();

export function getCachedDashboard(key: string): HomeDashboardPayload | undefined {
  const entry = dashboardCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    dashboardCache.delete(key);
    return undefined;
  }
  return entry.data;
}

export function setCachedDashboard(key: string, data: HomeDashboardPayload): void {
  dashboardCache.set(key, {
    data,
    expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS,
  });
  if (dashboardCache.size <= MAX_CACHE_ENTRIES) return;

  const oldestKey = [...dashboardCache.entries()].reduce((oldest, current) =>
    current[1].expiresAt < oldest[1].expiresAt ? current : oldest,
  )[0];
  dashboardCache.delete(oldestKey);
}

export function invalidateDashboardCache(): void {
  dashboardCache.clear();
}

export function invalidateDashboardCacheForAccount(account: string): void {
  for (const key of dashboardCache.keys()) {
    if (key.startsWith(`${account}|`)) dashboardCache.delete(key);
  }
}
