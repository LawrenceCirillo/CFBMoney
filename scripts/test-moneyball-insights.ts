import assert from "node:assert/strict";
import { data } from "../lib/data";
import { buildMoneyballInsights } from "../lib/moneyball-insights";
import { seasonSnapshot } from "../lib/season-snapshot";
import rawHistory from "../public/data/moneyball-history-2026.json";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CostPerWin } from "../components/moneyball/MoneyStories";

const ballot = rawHistory.currentPoll.ballot;
const current = buildMoneyballInsights(data.teams, seasonSnapshot.teams, ballot);
assert.equal(Object.keys(current.facts).length, data.teams.length);
for (const { team, wins, costPerWinM } of Object.values(current.facts)) {
  assert.equal(costPerWinM, wins > 0 ? team.budget_mid_m / wins : null);
}
assert.deepEqual(current.unrankedSpenders.map((t) => t.slug).sort(), data.teams.filter((t) => t.spend_rank <= 10 && t.ap_rank == null).map((t) => t.slug).sort());
assert(current.field.every((row) => row.rank <= 12));
if (data.poll.week === 8) {
  assert.deepEqual(current.above.map((t) => t.slug), ["houston"]);
  assert.deepEqual(current.cheapest.map((t) => t.slug), ["arizona"]);
  assert.deepEqual(current.unrankedSpenders.map((t) => [t.slug, current.facts[t.slug].record]), [["oregon", "4-2"], ["texas-am", "4-3"]]);
  assert.equal(current.fieldMidM, 432.5);
  assert.deepEqual(current.firstOut.map(({ team, outspends }) => [team.slug, outspends]), [["alabama", 6]]);
  assert.equal(current.facts.houston.costPerWinM, 17 / 6);
}

// Swap the snapshot's AP and budget facts: selectors must follow data, including ties.
const changed = structuredClone(data.teams);
const arizona = changed.find((t) => t.slug === "arizona")!;
arizona.ap_rank = 1; arizona.value_gap = arizona.spend_rank - 1;
const changedInsights = buildMoneyballInsights(changed, seasonSnapshot.teams, ballot);
assert.deepEqual(changedInsights.above.map((t) => t.slug), ["arizona"]);
const houston = changed.find((t) => t.slug === "houston")!;
houston.spend_rank = arizona.spend_rank; houston.ap_rank = 1; houston.value_gap = arizona.value_gap;
houston.budget_mid_m = arizona.budget_mid_m;
const tied = buildMoneyballInsights(changed, seasonSnapshot.teams, ballot);
assert.deepEqual(tied.above.map((t) => t.slug), ["arizona", "houston"]);
assert.deepEqual(tied.cheapest.map((t) => t.slug), ["arizona", "houston"]);
assert(tied.takeaway.includes("Arizona") && tied.takeaway.includes("Houston"));

const noUnranked = data.teams.map((t) => t.ap_rank == null ? { ...t, spend_rank: 11 } : t);
assert.equal(buildMoneyballInsights(noUnranked, seasonSnapshot.teams, ballot).unrankedSpenders.length, 0);
const includeTie = data.teams.map((t) => t.slug === "auburn" ? { ...t, ap_rank: null, spend_rank: 10 } : t);
assert(buildMoneyballInsights(includeTie, seasonSnapshot.teams, ballot).unrankedSpenders.some((t) => t.slug === "auburn"));

const records = { ...seasonSnapshot.teams, houston: { record: "0-7" } };
assert.equal(buildMoneyballInsights(data.teams, records, ballot).facts.houston.costPerWinM, null);
const zeroWinMarkup = renderToStaticMarkup(createElement(CostPerWin, { value: null }));
assert(zeroWinMarkup.includes("No wins yet") && !zeroWinMarkup.includes("$"), "Zero wins must never render a dollar figure");
assert(zeroWinMarkup.includes("partial-season"));
for (const record of ["", "Unknown", "6"])
  assert.throws(() => buildMoneyballInsights(data.teams, { ...records, oregon: { record } }, ballot), /valid snapshot record for oregon/);
assert.throws(() => buildMoneyballInsights(data.teams, { ...records, oregon: undefined }, ballot), /valid snapshot record for oregon/);

const withUnknown = ballot.map((row) => row.rank === 12 ? { name: "Outside budget coverage", rank: 12, slug: null } : row);
const incomplete = buildMoneyballInsights(data.teams, seasonSnapshot.teams, withUnknown);
assert.equal(incomplete.field.length, 12, "An untracked team still belongs to the AP proxy");
assert.equal(incomplete.fieldMidM, null, "Never display a partial subtotal as the full field cost");
assert.equal(incomplete.firstOut.length, 0);
assert.equal(incomplete.missingBudgets[0].name, "Outside budget coverage");
const cutoffTie = buildMoneyballInsights(data.teams, seasonSnapshot.teams, [...ballot, { name: "Cutoff tie", rank: 12, slug: null }]);
assert.equal(cutoffTie.field.length, 13, "Do not silently discard a cutoff tie");
const cheaperFirstOut = data.teams.map((t) => t.ap_rank === 13 ? { ...t, budget_mid_m: 1 } : t);
assert.equal(buildMoneyballInsights(cheaperFirstOut, seasonSnapshot.teams, ballot).firstOut.length, 0);
console.log("Moneyball insights passed: current arithmetic, changed snapshots, tied leaders, all unranked top spenders, zero/missing records, AP proxy coverage/cutoff ties and first-out comparisons.");
