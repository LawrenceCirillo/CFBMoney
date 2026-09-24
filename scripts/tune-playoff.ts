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
  withDepth,
  type Allocation,
} from "../lib/simulator";
import { expectedWins as modeledExpectedWins, fieldRatings } from "../lib/moneyball";
import { buildSeasonGames, projectedRank } from "../lib/season-mode";
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
    gameplan: [], autoGameplan: true,
  };
  const calls: GameplanPick[] = buildSeasonGames(seed, ratings, program, data.teams).map((game) => {
    let best = { week: game.week, off: "balanced", def: "base" } as GameplanPick;
    let edge = -Infinity;
    for (const off of OFFENSIVE_OPTIONS) for (const def of DEFENSIVE_OPTIONS) {
      const call = { week: game.week, off: off.value, def: def.value };
      const next = resolveGameplan(call, game.opponent.slug, game.winProb).netEdge;
      if (next > edge) { best = call; edge = next; }
    }
    defensiveChoices.set(best.def, (defensiveChoices.get(best.def) ?? 0) + 1);
    offensiveChoices.set(best.off, (offensiveChoices.get(best.off) ?? 0) + 1);
    return best;
  });
  const neutral = replaySeason(base).games.slice(0, 12).filter((game) => game.result?.won).length;
  const coached = replaySeason({ ...base, gameplan: calls }).games.slice(0, 12)
    .filter((game) => game.result?.won).length;
  winGain += coached - neutral;
}
const averageGain = winGain / N;
console.log(`Perfect weekly gameplan vs neutral: ${averageGain >= 0 ? "+" : ""}${averageGain.toFixed(2)} regular-season wins (${N} paired seeds)`);
console.log(`Best defensive picks: ${JSON.stringify(Object.fromEntries(defensiveChoices))}`);
console.log(`Best offensive picks: ${JSON.stringify(Object.fromEntries(offensiveChoices))}`);
if (averageGain < 0.5 || averageGain > 1.0 ||
  defensiveChoices.size !== DEFENSIVE_OPTIONS.length || offensiveChoices.size !== OFFENSIVE_OPTIONS.length) process.exitCode = 1;
