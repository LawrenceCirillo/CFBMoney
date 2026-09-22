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
  simulateGame,
  type Allocation,
} from "../lib/simulator";
import { expectedWins as modeledExpectedWins, fieldRatings } from "../lib/moneyball";
import { buildSeasonGames, projectedRank } from "../lib/season-mode";

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
