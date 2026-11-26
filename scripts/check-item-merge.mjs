// node --no-warnings scripts/check-item-merge.mjs
import assert from "node:assert/strict";
import { mergeItemsByName } from "../src/shared/item-merge.ts";

const names = { 3095: "Stormrazor", 223095: "Stormrazor", 3031: "Infinity Edge" };
const merged = mergeItemsByName(
  [
    { item_id: 3031, picks: 3, wins: 1, avgBuyTimeMs: null },
    { item_id: 223095, picks: 1, wins: 1, avgBuyTimeMs: 400 },
    { item_id: 3095, picks: 3, wins: 1, avgBuyTimeMs: 800 },
  ],
  (id) => names[id],
);
assert.deepEqual(merged, [
  { item_id: 3095, picks: 4, wins: 2, avgBuyTimeMs: 700 },
  { item_id: 3031, picks: 3, wins: 1, avgBuyTimeMs: null },
]);
console.log("item merge checks passed");
