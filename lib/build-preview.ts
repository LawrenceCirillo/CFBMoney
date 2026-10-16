import { data, getTeam } from "./data";
import type { BuildDraft } from "./build-session";
import { buildSeasonGames, preseasonExpectedWins } from "./season-mode";
import { gravityRates, type GravityContext } from "./gravity";
import { PLAYSHEET_SLOTS, POSITION_GROUPS, allocationFromPlaysheet, ratingsFromAllocation, type Playsheet } from "./simulator";

export type AllocationSnapshot = { pos: Playsheet; budgetM: number };
export type AllocationAction = { before: AllocationSnapshot; after: AllocationSnapshot; label: string; context: GravityContext };
const dimes = (value: number) => Math.round(value * 10);
const total = (pos: Playsheet) => PLAYSHEET_SLOTS.reduce((sum, slot) => sum + dimes(pos[slot.key]), 0) / 10;
const copySnapshot = (snapshot: AllocationSnapshot): AllocationSnapshot => ({ pos: { ...snapshot.pos }, budgetM: snapshot.budgetM });

export function allocationAction(before: AllocationSnapshot, after: AllocationSnapshot, label: string, context: GravityContext): AllocationAction {
  return { before: copySnapshot(before), after: copySnapshot(after), label, context: { ...context } };
}
export function undoAllocation(action: AllocationAction): AllocationSnapshot {
  return copySnapshot(action.before);
}

/** Describe simulator outputs; never reimplement its proportional funding or rating math. */
export function describeAllocationChange(action: AllocationAction) {
  const { before, after, context } = action;
  const from = allocationFromPlaysheet(before.pos);
  const to = allocationFromPlaysheet(after.pos);
  const rates = gravityRates(context);
  const slots = PLAYSHEET_SLOTS.map((slot) => ({ key: slot.key, group: slot.group,
    beforeM: before.pos[slot.key], afterM: after.pos[slot.key],
    deltaM: (dimes(after.pos[slot.key]) - dimes(before.pos[slot.key])) / 10,
  })).filter((slot) => slot.deltaM !== 0);
  const groups = POSITION_GROUPS.filter((group) => slots.some((slot) => slot.group === group.key)).map((group) => ({
    key: group.key, beforeM: from[group.key], afterM: to[group.key],
    deltaM: (dimes(to[group.key]) - dimes(from[group.key])) / 10,
    effectiveBeforeM: from[group.key] * (1 + (rates[group.key] ?? 0)),
    effectiveAfterM: to[group.key] * (1 + (rates[group.key] ?? 0)),
    effectiveDeltaM: ((dimes(to[group.key]) - dimes(from[group.key])) / 10) * (1 + (rates[group.key] ?? 0)),
  }));
  const beforeRatings = ratingsFromAllocation(from, context);
  const afterRatings = ratingsFromAllocation(to, context);
  const increasedM = slots.reduce((sum, slot) => sum + Math.max(0, dimes(slot.deltaM)), 0) / 10;
  const reducedM = slots.reduce((sum, slot) => sum + Math.max(0, -dimes(slot.deltaM)), 0) / 10;
  const unspentBeforeM = (dimes(before.budgetM) - dimes(total(before.pos))) / 10;
  const unspentAfterM = (dimes(after.budgetM) - dimes(total(after.pos))) / 10;
  return {
    slots, groups, increasedM, reducedM, unspentBeforeM, unspentAfterM,
    netFundingM: (dimes(total(after.pos)) - dimes(total(before.pos))) / 10,
    beforeRatings, afterRatings,
    ratingDelta: { off: afterRatings.off - beforeRatings.off, def: afterRatings.def - beforeRatings.def, st: afterRatings.st - beforeRatings.st },
    announcement: `${action.label}: $${increasedM.toFixed(1)}M in increases, $${reducedM.toFixed(1)}M in decreases across ${groups.length} groups${groups.length ? ` (${groups.map((group) => group.key).join(", ")})` : ""}. $${unspentAfterM.toFixed(1)}M unallocated.`,
  };
}
export type AllocationChange = ReturnType<typeof describeAllocationChange>;

/** Uses kickoff's deterministic schedule builder. Reading a preview consumes no shared RNG. */
export function buildPreview(draft: BuildDraft, seed: number) {
  const program = getTeam(draft.programSlug);
  if (!program) throw new Error("Unknown program");
  const ratings = ratingsFromAllocation(allocationFromPlaysheet(draft.pos), draft);
  const games = buildSeasonGames(seed, ratings, program, data.teams);
  const exact = Object.values(draft.pos).reduce((sum, value) => sum + Math.round(value * 10), 0) === draft.budgetM * 10;
  return {
    games,
    homeGames: games.filter((game) => game.isHome).length,
    averageOpponentBudgetM: games.reduce((sum, game) => sum + game.opponent.budget_mid_m, 0) / games.length,
    expectedWins: exact ? preseasonExpectedWins(games) : null,
  };
}
