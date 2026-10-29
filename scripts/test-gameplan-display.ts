import assert from "node:assert/strict";
import { gameplanOdds } from "../lib/gameplan-display";

assert.equal(gameplanOdds(0.68, null).neutralLabel, "68.0%");
assert.equal(gameplanOdds(0.68, null).modifier, null);
for (const [neutral, adjusted, nominal, expected] of [
  [0.68, 0.72, 4, "4.0 percentage points increase"],
  [0.68, 0.66, -2, "2.0 percentage points decrease"],
  [0.99, 0.999, 8, "0.9 percentage points increase"],
  [0.01, 0.001, -8, "0.9 percentage points decrease"],
  [0.5, 0.5, 0, "No change in win odds"],
  [0.99999, 0.999, 8, "0.1 percentage points decrease"],
] as const) {
  const odds = gameplanOdds(neutral, { adjustedWinProb: adjusted, netEdge: nominal });
  assert.equal(odds.change, expected);
  assert(Math.abs(odds.deltaPoints - 100 * (adjusted - neutral)) < 1e-12);
  const displayedDelta = Number.parseFloat(odds.adjustedLabel) - Number.parseFloat(odds.neutralLabel);
  assert(Math.abs(displayedDelta - odds.deltaPoints) <= 0.10000001);
}
for (const sign of [-1, 1]) {
  const odds = gameplanOdds(0.5, { adjustedWinProb: 0.5 + sign * 0.000001, netEdge: sign * 3 });
  assert.equal(odds.change, `Less than 0.1 percentage point ${sign > 0 ? "increase" : "decrease"}`);
  assert(!odds.change.includes("0.0"));
}
assert(gameplanOdds(0.99999, { adjustedWinProb: 0.999, netEdge: 8 }).deltaPoints < 0, "Display actual v4 output without silently correcting the future model issue");
console.log("Gameplan display passed: neutral, positive/negative, clipped/extreme, tiny changes, actual stored deltas and accessible summaries.");
