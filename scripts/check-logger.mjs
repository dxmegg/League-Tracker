// node --no-warnings scripts/check-logger.mjs
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { ignoreStreamErrors, logFileFor, logLine, redact } from "../src/shared/log-format.ts";

assert.equal(logFileFor("[sync x] Match 1 skipped"), "sync");
assert.equal(logFileFor("[lcu-watcher] connected"), "sync");
assert.equal(logFileFor("[backfill] page 0"), "sync");
assert.equal(logFileFor("[backfill-tracked] done"), "database");
assert.equal(logFileFor("[db] importData done"), "database");
assert.equal(logFileFor("[update] could not clean up"), "app");

const secret = "Bearer abc.def-123 puuid=759d5397-2900-5db2-b7f8-41b90c4a3706 " + "K".repeat(78);
assert.equal(redact(secret), "Bearer <token> puuid=<id> <id>");
assert.equal(redact("resolved KFsHjYayHkgf... (len=78)"), "resolved <id> (len=78)");
assert.equal(redact("Added 3 games"), "Added 3 games");

assert.equal(
  logLine("WARN", "[sync] x", new Date(2026, 0, 5, 7, 8, 9)),
  "2026-01-05 07:08:09 WARN [sync] x\n",
);
// An "error" event nobody listens to throws
const stream = new EventEmitter();
ignoreStreamErrors(stream);
stream.emit("error", Object.assign(new Error("broken pipe"), { code: "EPIPE" }));
console.log("logger checks passed");
