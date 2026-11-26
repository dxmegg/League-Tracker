// node --no-warnings scripts/check-queues.mjs
import assert from "node:assert/strict";
import { addQueueLabels, QUEUE_LABELS, toQueueNames } from "../src/shared/queues.ts";

const names = toQueueNames([
  { id: 450, name: "Other ARAM" },
  { id: 999999, name: "" },
  { id: 999999, name: " New Mode " },
  { id: "5", name: "Bad id" },
  null,
]);
assert.deepEqual(names, { 450: "Other ARAM", 999999: "New Mode" });
assert.deepEqual(toQueueNames({ not: "a list" }), {});

addQueueLabels(names);
assert.equal(QUEUE_LABELS[450], "ARAM"); // the built-in name wins
assert.equal(QUEUE_LABELS[999999], "New Mode");

console.log("queue checks passed");
