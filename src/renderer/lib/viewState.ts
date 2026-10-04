// The filters and sorting the user has picked. Values always live in an
// in-memory map so they survive route changes within the session, and are
// additionally persisted to localStorage when the user has turned the
// remember_filters setting on (so they survive a relaunch too).
const PREFIX = "view:";

let remembering = false;
const memory = new Map<string, unknown>();

// Set from main.tsx before the first render: pages read their stored values
// synchronously while mounting, so the answer has to be in hand by then.
export function initViewState(enabled: boolean): void {
  remembering = enabled;
}

export function setRemembering(enabled: boolean): void {
  remembering = enabled;
  // Turning persistence off means the next launch opens on defaults; the
  // in-memory cache still carries values across route changes in this session.
  if (!enabled) clearPersisted();
}

export function readViewState<T>(key: string, fallback: T): T {
  if (memory.has(key)) return memory.get(key) as T;
  if (!remembering) return fallback;
  const raw = localStorage.getItem(PREFIX + key);
  if (raw === null) return fallback;
  try {
    const parsed = JSON.parse(raw);
    // An "All"-style filter holds undefined, which only survives JSON as null
    const value = parsed === null ? (undefined as T) : (parsed as T);
    memory.set(key, value);
    return value;
  } catch {
    return fallback;
  }
}

export function writeViewState(key: string, value: unknown): void {
  memory.set(key, value);
  if (!remembering) return;
  localStorage.setItem(PREFIX + key, JSON.stringify(value ?? null));
}

function clearPersisted(): void {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(PREFIX)) localStorage.removeItem(key);
  }
}
