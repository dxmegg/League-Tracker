import type { ServiceFailure } from "./api";

// Riot's own "no such thing" is an answer; any other 404 means the proxy has no such route
export function isRiotNotFound(status: number, body: string): boolean {
  if (status !== 404) return false;
  try {
    return JSON.parse(body)?.status?.status_code === 404;
  } catch {
    return false;
  }
}

// A failure stays only until the next success, so when there is one it is the latest check
export const lastCheck = (success: number | undefined, failure: ServiceFailure | undefined) =>
  failure?.at ?? success;
