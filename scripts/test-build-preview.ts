import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { allocationAction, describeAllocationChange, undoAllocation, buildPreview } from "../lib/build-preview";
import { createRun } from "../lib/build-session";
import { gravityRates } from "../lib/gravity";
import { data } from "../lib/data";
import { replaySeason } from "../lib/season-replay";
import { allocationFromPlaysheet, ratingsFromAllocation, clampPlaysheetToBudget, PLAYSHEET_SLOTS, setPlaysheetPosition, cappedOptimalAllocation, distributeAllocationToSlots, emptyPlaysheet } from "../lib/simulator";

const slate = (games: ReturnType<typeof buildPreview>["games"]) => games.map((game) => [game.week, game.opponent.slug, game.isHome]);
for (const program of data.teams) {
  for (const seed of [0, 24, 147, 2 ** 31 - 1]) {
    const baseline = buildPreview({ programSlug: program.slug, budgetM: 55, gravityOn: true, pos: emptyPlaysheet() }, seed);
    assert.equal(baseline.games.length, 12);
    assert.equal(new Set(baseline.games.map((game) => game.opponent.slug)).size, 12);
    assert.equal(baseline.homeGames, 7);
    assert.equal(baseline.expectedWins, null, "unallocated roster has no forecast");
    assert.equal(baseline.averageOpponentBudgetM, baseline.games.reduce((sum, game) => sum + game.opponent.budget_mid_m, 0) / 12);
    for (const budgetM of [10, 55]) for (const gravityOn of [false, true]) {
      const context = { programSlug: program.slug, gravityOn };
      const draft = { ...context, budgetM, pos: distributeAllocationToSlots(cappedOptimalAllocation(budgetM, context)) };
      const preview = buildPreview(draft, seed);
      assert.deepEqual(slate(preview.games), slate(baseline.games), "roster/book/gravity cannot change the slate");
      assert.deepEqual(buildPreview(draft, seed), preview, "repeat reads are deterministic");
      const run = createRun("season", draft, randomUUID(), seed);
      const started = replaySeason(run.input, 0);
      assert.deepEqual(preview.games, started.games, "preview equals exact seeded kickoff, including neutral odds");
      assert.equal(preview.expectedWins, started.games.reduce((sum, game) => sum + game.winProb, 0));
      assert.deepEqual(slate(replaySeason({ ...run.input, gameplan: [{ week: 1, off: "air", def: "blitz" }] }, 1).games.slice(0, 12)), slate(preview.games), "calls/results cannot change regular-season slate");
    }
  }
}
console.log("All build preview tests passed: all programs × four seeds, 12 unique opponents, seven home, invariant slate, exact kickoff/forecast equality.");

const dimes = (value: number) => Math.round(value * 10);
for (const program of data.teams) for (const gravityOn of [false, true]) for (const budgetM of [10, 55]) {
  const context = { programSlug: program.slug, gravityOn };
  const full = distributeAllocationToSlots(cappedOptimalAllocation(budgetM, context));
  for (const slot of PLAYSHEET_SLOTS) for (const base of [full, emptyPlaysheet()]) {
    const next = setPlaysheetPosition(base, budgetM, slot.key, slot.cap);
    const action = allocationAction({ pos: base, budgetM }, { pos: next, budgetM }, "Position adjusted", context);
    const change = describeAllocationChange(action);
    const increase = dimes(next[slot.key]) - dimes(base[slot.key]);
    const donors = change.slots.filter((affected) => affected.key !== slot.key).reduce((sum, affected) => sum - dimes(affected.deltaM), 0);
    assert.equal(increase, donors + dimes(change.unspentBeforeM) - dimes(change.unspentAfterM), "donors plus unspent reconcile requested increase");
    assert.equal(dimes(change.increasedM) - dimes(change.reducedM), dimes(change.netFundingM));
    assert.deepEqual(change.beforeRatings, ratingsFromAllocation(allocationFromPlaysheet(base), context));
    assert.deepEqual(change.afterRatings, ratingsFromAllocation(allocationFromPlaysheet(next), context));
    for (const rating of ["off", "def", "st"] as const) assert.equal(change.ratingDelta[rating], change.afterRatings[rating] - change.beforeRatings[rating]);
    for (const group of change.groups) {
      assert.equal(group.beforeM, allocationFromPlaysheet(base)[group.key]);
      assert.equal(group.afterM, allocationFromPlaysheet(next)[group.key]);
      assert.equal(group.effectiveBeforeM, group.beforeM * (1 + (gravityRates(context)[group.key] ?? 0)));
      assert.equal(group.effectiveAfterM, group.afterM * (1 + (gravityRates(context)[group.key] ?? 0)));
      assert.equal(dimes(group.deltaM), dimes(group.afterM) - dimes(group.beforeM));
      assert(Math.abs(group.effectiveAfterM - group.effectiveBeforeM - group.effectiveDeltaM) < 1e-10);
    }
    for (const member of PLAYSHEET_SLOTS) {
      assert(next[member.key] >= 0 && next[member.key] <= member.cap);
      assert.equal(dimes(next[member.key]), next[member.key] * 10);
    }
    assert.deepEqual(undoAllocation(action), { pos: base, budgetM }, "Undo restores every slot and book");
  }
  const fitted = clampPlaysheetToBudget(full, 10);
  const smaller = allocationAction({ pos: full, budgetM }, { pos: fitted, budgetM: 10 }, "Book changed", context);
  assert.deepEqual(undoAllocation(smaller), { pos: full, budgetM }, "Undo book reduction restores its pre-fit roster and book");
  for (const next of [emptyPlaysheet(), full]) {
    const action = allocationAction({ pos: fitted, budgetM: 10 }, { pos: next, budgetM }, "Reset/Optimize", context);
    assert.deepEqual(undoAllocation(action), { pos: fitted, budgetM: 10 });
  }
}
const sameGroup = distributeAllocationToSlots(cappedOptimalAllocation(55));
const shifted = { ...sameGroup, LT: sameGroup.LT + 0.1, RT: sameGroup.RT - 0.1 };
const transfer = allocationAction({ pos: sameGroup, budgetM: 55 }, { pos: shifted, budgetM: 55 }, "Same group", { programSlug: "iowa", gravityOn: true });
const within = describeAllocationChange(transfer);
assert.deepEqual(within.ratingDelta, { off: 0, def: 0, st: 0 });
assert.equal(within.groups[0].deltaM, 0);
assert.equal(within.groups[0].effectiveDeltaM, 0);
const restored = undoAllocation(transfer);
restored.pos.QB = 0;
assert.notEqual(transfer.before.pos.QB, 0, "Undo result cannot mutate the stored snapshot");
console.log("All allocation tradeoff tests passed: caps/dimes, donors + unspent, simulator group/rating equality, same-group neutrality and exact Undo including book fits/Reset/Optimize.");
