// The pure half of the log files: which file a line belongs to and what must never be in one

export type LogFile = "app" | "sync" | "database" | "errors" | "network" | "performance";

const SYNC = /^\[(lcu|sync|backfill\]|timeline|post-game|riot|profile|insertGameFull)/;
const DATABASE = /^\[(db|storage|backup|migrat|merge|score|startup-reconcile|backfill-tracked)/;

// Console messages start with a "[area]" tag; anything without a known one is about the program
export function logFileFor(message: string): LogFile {
  if (SYNC.test(message)) return "sync";
  return DATABASE.test(message) ? "database" : "app";
}

// Tokens and player ids stay out, so a log can be handed to someone else
export function redact(message: string): string {
  return message
    .replace(/(Bearer|Basic)\s+[\w.~+/=-]+/g, "$1 <token>")
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "<token>")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/[\w-]{12}\.\.\./g, "<id>")
    .replace(/[\w-]{60,}/g, "<id>");
}

const two = (value: number) => String(value).padStart(2, "0");

export function logLine(level: "INFO" | "WARN" | "ERROR", message: string, at: Date): string {
  const day = `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`;
  const time = `${two(at.getHours())}:${two(at.getMinutes())}:${two(at.getSeconds())}`;
  return `${day} ${time} ${level} ${redact(message)}\n`;
}
