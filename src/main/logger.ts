import { app, ipcMain } from "electron";
import fs from "fs";
import path from "path";
import { format } from "util";
import { ignoreStreamErrors, logFileFor, logLine, type LogFile } from "../shared/log-format";

// Log files next to the program data. Imported right after ./identity, so that whatever the other
// modules print while loading is kept too.

const MAX_BYTES = 1024 * 1024;
const OLDER_COPIES = 2;
// Longer than this and the window visibly stalls
const SLOW_MS = 200;

export const getLogsDir = () => path.join(app.getPath("userData"), "logs");

function append(file: LogFile, line: string): void {
  try {
    const target = path.join(getLogsDir(), `${file}.log`);
    fs.mkdirSync(getLogsDir(), { recursive: true });
    if ((fs.statSync(target, { throwIfNoEntry: false })?.size ?? 0) > MAX_BYTES) {
      for (let copy = OLDER_COPIES; copy > 0; copy--) {
        const newer = copy === 1 ? target : `${target}.${copy - 1}`;
        if (fs.existsSync(newer)) fs.renameSync(newer, `${target}.${copy}`);
      }
    }
    fs.appendFileSync(target, line);
  } catch {
    // Logging must never be what breaks the program
  }
}

type Level = "INFO" | "WARN" | "ERROR";

function write(level: Level, message: string, file = logFileFor(message)): void {
  const line = logLine(level, message, new Date());
  append(file, line);
  if (level === "ERROR") append("errors", line);
}

export function logNetwork(service: string, outcome: number | string, startedAt: number): void {
  const ms = Math.round(performance.now() - startedAt);
  append("network", logLine("INFO", `${service} ${outcome} ${ms} ms`, new Date()));
}

// The console may be a pipe whose reader has exited; unhandled, that EPIPE stops the program
ignoreStreamErrors(process.stdout, process.stderr);

for (const [method, level] of [
  ["log", "INFO"],
  ["info", "INFO"],
  ["warn", "WARN"],
  ["error", "ERROR"],
] as const) {
  const print = console[method].bind(console);
  console[method] = (...args: unknown[]) => {
    print(...args);
    write(level, format(...args));
  };
}

// Only watches: the error window still appears, and the log keeps what it said
process.on("uncaughtExceptionMonitor", (err) => write("ERROR", `[app] uncaught: ${format(err)}`));

// Errors the page prints
app.on("web-contents-created", (_event, contents) => {
  contents.on("console-message", (details) => {
    if (details.level === "error") write("ERROR", `[window] ${details.message}`, "app");
  });
});

app.on("ready", () => write("INFO", `[app] started, version ${app.getVersion()}`));
app.on("quit", () => write("INFO", "[app] closed"));

// Only the part of a request handler that blocks the program counts: waiting does not freeze it
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) =>
  handle(channel, (event, ...args) => {
    const startedAt = performance.now();
    try {
      return listener(event, ...args);
    } finally {
      const ms = Math.round(performance.now() - startedAt);
      if (ms >= SLOW_MS) {
        append("performance", logLine("WARN", `${channel} blocked for ${ms} ms`, new Date()));
      }
    }
  });
