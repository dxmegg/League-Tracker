export interface Dbg {
  log: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  err: (message: string, error?: unknown) => void;
  time: (label: string) => () => void;
  safe: <T>(label: string, fn: () => T) => T;
  scope: (name: string) => Dbg;
  setEnabled: (enabled: boolean) => void;
}

type RuntimeGlobals = typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
  __LT_DEBUG__?: boolean;
};

const loadedAt = Date.now();
const runtime = globalThis as RuntimeGlobals;
let enabled =
  runtime.process?.env?.LEAGUE_TRACKER_DEBUG === "1" ||
  runtime.process?.env?.LEAGUE_TRACKER_DEBUG === "true" ||
  runtime.__LT_DEBUG__ === true;
const scopes = new Map<string, Dbg>();

function errorDetails(error: unknown): unknown[] {
  if (error instanceof Error) return [error.message, error.stack];
  return [error];
}

function createScope(name: string): Dbg {
  const prefix = () => `[${name}] +${Date.now() - loadedAt}ms`;
  const write = (method: "log" | "info" | "warn" | "error", message: string, args: unknown[]) => {
    if (!enabled) return;
    console[method](prefix(), message, ...args);
  };
  const reportFailure = (label: string, error: unknown): never => {
    write("error", `${label} FAILED`, errorDetails(error));
    throw error;
  };
  const child: Dbg = {
    log: (message, ...args) => write("log", message, args),
    info: (message, ...args) => write("info", message, args),
    warn: (message, ...args) => write("warn", message, args),
    err: (message, error) => write("error", message, error === undefined ? [] : errorDetails(error)),
    time: (label) => {
      const started = Date.now();
      return () => write("log", `${label} took ${Date.now() - started}ms`, []);
    },
    safe: <T>(label: string, fn: () => T): T => {
      try {
        const result = fn();
        if (
          result &&
          typeof result === "object" &&
          "catch" in result &&
          typeof result.catch === "function"
        ) {
          return result.catch((error: unknown) => reportFailure(label, error)) as T;
        }
        return result;
      } catch (error) {
        return reportFailure(label, error);
      }
    },
    scope: (childName) => dbg.scope(`${name}:${childName}`),
    setEnabled: (value) => {
      enabled = value;
      runtime.__LT_DEBUG__ = value;
    },
  };
  return child;
}

export const dbg: Dbg = {
  ...createScope("app"),
  scope: (name) => {
    const existing = scopes.get(name);
    if (existing) return existing;
    const child = createScope(name);
    scopes.set(name, child);
    return child;
  },
};

export default dbg;
