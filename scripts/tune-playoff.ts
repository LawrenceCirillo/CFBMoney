/**
 * Measure playoff reach rate: for N seeds, build a season with buildSeasonGames,
 * play it, and check the projected seed. Target: 20-35% for a well-built roster.
 *
 * Run with: npx tsx scripts/tune-playoff.ts
 */
import { data, getTeam } from "../lib/data";
import {
  mulberry32,
  cappedOptimalAllocation,
  ratingsFromAllocation,
  ratingsFromAllocationWithRates,
  simulateGame,
  withDepth,
  type Allocation,
} from "../lib/simulator";
import { expectedWins as modeledExpectedWins, fieldRatings } from "../lib/moneyball";
import { buildSeasonGames, projectedRank } from "../lib/season-mode";
import { preseasonExpectedWins } from "../lib/season-mode";
import { gravityTags } from "../lib/gravity";
import { GAME_BUDGET_M, MARKET_CAPS, POSITION_GROUPS, TALENT_FLOOR, type PositionKey } from "../lib/simulator";
import { writeFileSync } from "node:fs";
import { DATA_FINGERPRINT, SIM_VERSION, replaySeason, type ReplayInput } from "../lib/season-replay";
import { DEFENSIVE_OPTIONS, OFFENSIVE_OPTIONS, resolveGameplan, type GameplanPick } from "../lib/gameplan";

const field = fieldRatings();
const N = 400;

function playoffRate(programSlug: string, alloc: Allocation): { rate: number; avgSeed: number; avgWins: number } {
  const program = getTeam(programSlug)!;
  const userR = ratingsFromAllocation(alloc);
  const fieldProj = data.teams
    .filter((t) => t.slug !== program.slug)
    .map((t) => modeledExpectedWins(t.budget_mid_m, field));
  let made = 0;
  let seedSum = 0;
  let winSum = 0;
  for (let seed = 0; seed < N; seed++) {
    const games = buildSeasonGames(seed, userR, program, data.teams);
    const rng = mulberry32(seed ^ 0x9e3779b9);
    let wins = 0;
    for (const g of games) {
      if (simulateGame(userR, g.oppRatings, g.isHome, rng).won) wins++;
    }
    const seedRank = projectedRank(wins, fieldProj);
    if (seedRank <= 12) made++;
    seedSum += seedRank;
    winSum += wins;
  }
  return { rate: made / N, avgSeed: seedSum / N, avgWins: winSum / N };
}

const opt = cappedOptimalAllocation(30);
const qbHeavy: Allocation = { QB: 12, RB: 2, WR: 5, OL: 3, DL: 3, LB: 2, DB: 2, ST: 1 };
const trenches: Allocation = { QB: 4, RB: 2, WR: 2, OL: 8, DL: 9, LB: 2, DB: 2, ST: 1 };

for (const [label, slug, alloc] of [
  ["optimal @ texas", "texas", opt],
  ["optimal @ iowa", "iowa", opt],
  ["optimal @ boston-college", "boston-college", opt],
  ["qb-heavy @ texas", "texas", qbHeavy],
  ["trenches @ georgia", "georgia", trenches],
] as [string, string, Allocation][]) {
  const r = playoffRate(slug, alloc);
  console.log(
    `${label}: playoff ${(r.rate * 100).toFixed(1)}% | avg seed #${r.avgSeed.toFixed(1)} | avg wins ${r.avgWins.toFixed(2)}`
  );
}
console.log("DONE");

// Same roster, same program, same seeds: isolate the rating effect of gravity.
// "Lean" chooses the tested allocation with the largest incremental gravity
// benefit; "ignore" spends as little as possible on tagged groups while
// respecting every market cap and the exact $55M book. Neither changes the
// published table or scoring model.
const gravitySamples = 32;
const gravityRows: { program: string; lean: number; ignore: number; optimized: number; leanSpend: number; ignoreSpend: number; monotone: boolean }[] = [];
for (const team of data.teams) {
  const tags = gravityTags(team.slug);
  if (!tags.length) continue;
  const context = { programSlug: team.slug, gravityOn: true };
  const tagged = new Set(tags.map((tag) => tag.group));
  const gainCache = new WeakMap<Allocation, number>();
  const gain = (alloc: Allocation, rates?: Partial<Record<PositionKey, number>>) => {
    if (!rates && gainCache.has(alloc)) return gainCache.get(alloc)!;
    const off = ratingsFromAllocation(alloc);
    const on = rates ? ratingsFromAllocationWithRates(alloc, rates) : ratingsFromAllocation(alloc, context);
    let sum = 0;
    for (let seed = 0; seed < gravitySamples; seed++) {
      sum += preseasonExpectedWins(buildSeasonGames(seed, on, team, data.teams)) -
        preseasonExpectedWins(buildSeasonGames(seed, off, team, data.teams));
    }
    const result = sum / gravitySamples;
    if (!rates) gainCache.set(alloc, result);
    return result;
  };
  const empty = (): Allocation => ({ QB: 0, RB: 0, WR: 0, OL: 0, DL: 0, LB: 0, DB: 0, ST: 0 });
  const untagged = POSITION_GROUPS.filter((g) => !tagged.has(g.key));
  const fill = (tagDimes: Partial<Record<PositionKey, number>>): Allocation | null => {
    const d = empty();
    for (const tag of tags) d[tag.group] = tagDimes[tag.group] ?? 0;
    let left = Math.round(GAME_BUDGET_M * 10) - tags.reduce((sum, tag) => sum + d[tag.group], 0);
    if (left < 0 || left > untagged.reduce((sum, g) => sum + Math.round(MARKET_CAPS[g.key] * 10), 0)) return null;
    while (left > 0) {
      const best = untagged.filter((g) => d[g.key] < Math.round(MARKET_CAPS[g.key] * 10))
        .sort((a, b) => {
          const marginal = (g: typeof a) => {
            const side = g.side === "st" ? 0.08 : 0.46;
            const spend = d[g.key] / 10;
            return side * g.weight * (1 - TALENT_FLOOR) * g.c / ((spend + g.c) ** 2);
          };
          return marginal(b) - marginal(a) || a.key.localeCompare(b.key);
        })[0];
      if (!best) return null;
      d[best.key]++;
      left--;
    }
    for (const g of POSITION_GROUPS) d[g.key] /= 10;
    return d;
  };
  const minimumTagged = Math.max(0, 550 - untagged.reduce((sum, g) => sum + Math.round(MARKET_CAPS[g.key] * 10), 0));
  const ignoreCandidates = tags.map((tag) => fill({ [tag.group]: minimumTagged }));
  const ignored = ignoreCandidates.filter((candidate): candidate is Allocation => !!candidate)
    .sort((a, b) => gain(a) - gain(b))[0];
  if (!ignored) throw new Error(`${team.slug}: cannot build ignore allocation`);
  const choices = tags.map((tag) => {
    const g = POSITION_GROUPS.find((group) => group.key === tag.group)!;
    const peak = Math.round(g.c / Math.sqrt(1 + tag.gravity) * 10);
    return [...new Set([minimumTagged, peak, Math.round(g.c * 10), Math.round(MARKET_CAPS[g.key] * 10)])]
      .filter((v) => v >= 0 && v <= Math.round(MARKET_CAPS[g.key] * 10));
  });
  const candidateDimes = tags.length === 1
    ? choices[0].map((a) => ({ [tags[0].group]: a }))
    : choices[0].flatMap((a) => choices[1].map((b) => ({ [tags[0].group]: a, [tags[1].group]: b })));
  const candidates = [ignored, cappedOptimalAllocation(GAME_BUDGET_M, context),
    ...candidateDimes.map((choice) => fill(choice)).filter((candidate): candidate is Allocation => !!candidate)];
  const leanAlloc = candidates.sort((a, b) => gain(b) - gain(a))[0];
  const monotone = tags.every((tag) => {
    const small = gain(leanAlloc, { [tag.group]: tag.gravity / 2 });
    const large = gain(leanAlloc, { [tag.group]: tag.gravity });
    return large > small && small > 0;
  });
  const taggedSpend = (alloc: Allocation) => tags.reduce((sum, tag) => sum + alloc[tag.group], 0);
  gravityRows.push({ program: team.slug, lean: gain(leanAlloc), ignore: gain(ignored),
    optimized: gain(cappedOptimalAllocation(GAME_BUDGET_M, context)),
    leanSpend: taggedSpend(leanAlloc), ignoreSpend: taggedSpend(ignored), monotone });
}
console.log("Gravity expected wins by tagged program (lean / ignore / auto-opt):");
for (const row of gravityRows) console.log(`${row.program.padEnd(20)} +${row.lean.toFixed(3)} / +${row.ignore.toFixed(3)} / +${row.optimized.toFixed(3)} · tagged $${row.leanSpend.toFixed(1)}M vs $${row.ignoreSpend.toFixed(1)}M`);
const outside = gravityRows.filter((row) => row.lean <= row.ignore + 1e-9 || !row.monotone);
console.log(`Gravity directionality and monotonicity: ${gravityRows.length - outside.length}/${gravityRows.length} tagged programs pass`);
if (outside.length) { console.error(`Failed: ${outside.map((row) => row.program).join(", ")}`); process.exitCode = 1; }
writeFileSync("docs/gravity-tuning.md", [
  "# Program Gravity tuning · v1", "",
  "Measured at the $55M cap with 32 paired seeds per tagged program. Each gain compares the same roster and schedule with gravity on versus off. Lean selects the tested valid allocation with the largest incremental gravity gain; it does not necessarily maximize total wins. Ignore minimizes tagged spend under the exact cap and market ceilings. Auto-opt uses the gravity-aware water fill. Larger-versus-smaller tags are compared within the same program, roster, and schedule. Values are expected regular-season wins.", "",
  "| Program | Lean gain | Ignore gain | Auto-opt gain | Tagged spend: lean / ignore | Monotone |", "|---|---:|---:|---:|---:|---|",
  ...gravityRows.map((row) => `| ${row.program} | +${row.lean.toFixed(3)} | +${row.ignore.toFixed(3)} | +${row.optimized.toFixed(3)} | $${row.leanSpend.toFixed(1)}M / $${row.ignoreSpend.toFixed(1)}M | ${row.monotone ? "Yes" : "No"} |`),
  "", `Directionality and monotonicity: ${gravityRows.length - outside.length}/${gravityRows.length} programs pass.`, "",
].join("\n"));

// The schedule and random draw are paired by seed. Only the coaching calls
// change, so this measures their season-level effect without roster changes.
const program = getTeam("texas")!;
const roster = cappedOptimalAllocation(30);
const ratings = ratingsFromAllocation(withDepth(roster, 30));
let winGain = 0;
const defensiveChoices = new Map<string, number>();
const offensiveChoices = new Map<string, number>();
for (let seed = 0; seed < N; seed++) {
  const base: ReplayInput = {
    mode: "season", seed, programSlug: program.slug, budgetM: 30,
    alloc: roster, simVersion: SIM_VERSION, dataFingerprint: DATA_FINGERPRINT,
    gameplan: [], autoGameplan: true, gravityOn: true, gravityVersion: "v1",
  };
  const calls: GameplanPick[] = buildSeasonGames(seed, ratings, program, data.teams).map((game) => {
    let edge = -Infinity;
    let bestCalls: GameplanPick[] = [];
    for (const off of OFFENSIVE_OPTIONS) for (const def of DEFENSIVE_OPTIONS) {
      const call = { week: game.week, off: off.value, def: def.value };
      const next = resolveGameplan(call, game.opponent.slug, game.winProb).netEdge;
      if (next > edge) { bestCalls = [call]; edge = next; }
      else if (next === edge) bestCalls.push(call);
    }
    for (const choice of new Set(bestCalls.map((call) => call.def))) {
      defensiveChoices.set(choice, (defensiveChoices.get(choice) ?? 0) + 1);
    }
    for (const choice of new Set(bestCalls.map((call) => call.off))) {
      offensiveChoices.set(choice, (offensiveChoices.get(choice) ?? 0) + 1);
    }
    // Tied calls produce the same probability. Prefer Balanced so its viable
    // multiple-front matchup is visible in the representative perfect slate.
    const best = bestCalls.find((call) => call.off === "balanced") ?? bestCalls[0];
    return best;
  });
  const neutral = replaySeason(base).games.slice(0, 12).filter((game) => game.result?.won).length;
  const coached = replaySeason({ ...base, gameplan: calls }).games.slice(0, 12)
    .filter((game) => game.result?.won).length;
  winGain += coached - neutral;
}
const averageGain = winGain / N;
console.log(`Perfect weekly gameplan vs neutral: ${averageGain >= 0 ? "+" : ""}${averageGain.toFixed(2)} regular-season wins (${N} paired seeds)`);
console.log(`Optimal defensive picks (ties included): ${JSON.stringify(Object.fromEntries(defensiveChoices))}`);
console.log(`Optimal offensive picks (ties included): ${JSON.stringify(Object.fromEntries(offensiveChoices))}`);
if (averageGain < 0.5 || averageGain > 1.0 ||
  defensiveChoices.size !== DEFENSIVE_OPTIONS.length || offensiveChoices.size !== OFFENSIVE_OPTIONS.length) process.exitCode = 1;
