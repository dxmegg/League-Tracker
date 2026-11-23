import { useParams } from "react-router-dom";
import {
  QUEUE_SCOPE_ARAM,
  QUEUE_SCOPE_ARENA,
  QUEUE_SCOPE_MAYHEM,
  QUEUE_SCOPE_NORMAL,
  QUEUE_SCOPE_RANKED,
} from "../../shared/queues";
import { useActiveMode } from "../hooks/useActiveMode";

export function useHistoryScopeQueue(scopeOverride?: string): number | undefined {
  const { scope: routeScope } = useParams<{ scope?: string }>();
  const [mode] = useActiveMode();
  const scope = scopeOverride ?? routeScope;
  if (scope === "mayhem") return QUEUE_SCOPE_MAYHEM;
  if (scope === "aram") return QUEUE_SCOPE_ARAM;
  if (scope === "arena") return QUEUE_SCOPE_ARENA;
  if (scope === "ranked") return QUEUE_SCOPE_RANKED;
  if (scope === "normal") return QUEUE_SCOPE_NORMAL;
  // No explicit route scope: the global data mode decides.
  return mode === "mayhem" ? QUEUE_SCOPE_MAYHEM : undefined;
}

// Page-local queue filters are ignored in Mayhem mode so the global mode always wins.
export function useScopedQueue(
  local: number | undefined,
  scopeOverride?: string,
): number | undefined {
  const [mode] = useActiveMode();
  const scoped = useHistoryScopeQueue(scopeOverride);
  return mode === "mayhem" ? scoped : (local ?? scoped);
}

export function queueForHistoryScope(scope?: string): number | undefined {
  if (scope === "mayhem") return QUEUE_SCOPE_MAYHEM;
  if (scope === "aram") return QUEUE_SCOPE_ARAM;
  if (scope === "arena") return QUEUE_SCOPE_ARENA;
  if (scope === "ranked") return QUEUE_SCOPE_RANKED;
  if (scope === "normal") return QUEUE_SCOPE_NORMAL;
  return undefined;
}
