/**
 * Playtest: play season mode headlessly under several college-football-fan
 * diagnostic roster proposals through the same canonical replay as SeasonMode.
 * Prints actual player results, explicit venues and regular-only rank metrics;
 * other teams' projected bracket representatives never receive simulated results.
 *
 * Run with: npx tsx scripts/playtest.ts
 */
import { data, getTeam } from "../lib/data";
import { MARKET_CAPS, venueLabel, type Allocation, type ScheduledGame } from "../lib/simulator";
import { expectedWins as modeledExpectedWins, fieldRatings } from "../lib/moneyball";
import { postseasonOutcome, projectedRank, storylineFor } from "../lib/season-mode";
import { DATA_FINGERPRINT, SIM_VERSION, replaySeason } from "../lib/season-replay";
const field = fieldRatings();

interface Persona {
  name: string;
  programSlug: string;
  seed: number;
  alloc: Allocation;
  pitch: string;
}

const PERSONAS: Persona[] = [
  {
    name: "QB OR BUST",
    programSlug: "texas",
    seed: 7,
    alloc: { QB: 12, RB: 2, WR: 5, OL: 3, DL: 3, LB: 2, DB: 2, ST: 1 },
    pitch: "Pay the quarterback like an NFL first-rounder, duct-tape the rest.",
  },
  {
    name: "TRENCHES",
    programSlug: "georgia",
    seed: 21,
    alloc: { QB: 4, RB: 2, WR: 2, OL: 8, DL: 9, LB: 2, DB: 2, ST: 1 },
    pitch: "Games are won up front. Skill guys are interchangeable.",
  },
  {
    name: "DEFENSE WINS CHAMPIONSHIPS",
    programSlug: "iowa",
    seed: 42,
    alloc: { QB: 3, RB: 1, WR: 2, OL: 3, DL: 8, LB: 5, DB: 7, ST: 1 },
    pitch: "Iowa-ball: 17-13 wins, punter is people too.",
  },
  {
    name: "SPREAD IT AROUND (optimal)",
    programSlug: "ohio-state",
    seed: 99,
    alloc: { QB: 5.4, RB: 2.1, WR: 3, OL: 3.6, DL: 5.4, LB: 4, DB: 4.5, ST: 2 },
    pitch: "The quant build — auto-optimize, trust the math.",
  },
  {
    name: "SKILL STARS, SCRUB LINES",
    programSlug: "boston-college",
    seed: 137,
    alloc: { QB: 8, RB: 4, WR: 8, OL: 2, DL: 1, LB: 2, DB: 4, ST: 1 },
    pitch: "Underdog program, all the money on the guys who touch the ball.",
  },
];

const STAGE_WEEK: Record<string, string> = { fr: "FR", qf: "QF", sf: "SF", ncg: "NCG", bowl: "BOWL" };

for (const p of PERSONAS) {
  const total = Object.values(p.alloc).reduce((a, b) => a + b, 0);
  const program = getTeam(p.programSlug)!;
  const overMarket = Object.entries(p.alloc).filter(([key, value]) => value > MARKET_CAPS[key as keyof Allocation]);
  const run = replaySeason({ mode: "season", seed: p.seed, programSlug: p.programSlug, budgetM: total,
    alloc: p.alloc, simVersion: SIM_VERSION, dataFingerprint: DATA_FINGERPRINT, gameplan: [],
    autoGameplan: true, gravityOn: false, gravityVersion: "v1" });
  const fieldProj = data.teams.filter((team) => team.slug !== program.slug).map((team) => modeledExpectedWins(team.budget_mid_m, field));
  const ranks = run.games.filter((game) => !game.stage).map((_, index) => projectedRank(run.games.filter((game) => !game.stage)
    .reduce((sum, game, i) => sum + (i <= index ? Number(game.result!.won) : game.winProb), 0), fieldProj));
  console.log(`\nPERSONA: ${p.name} @ ${program.name} · model v${SIM_VERSION}`);
  console.log(`Diagnostic allocation only · $${total}M · gravity off${overMarket.length ? ` · over market: ${overMarket.map(([key]) => key).join(", ")}` : ""}. Not a publishable-roster claim.`);
  console.log(p.pitch);
  for (const [index, game] of run.games.entries()) {
    const story = storylineFor(game, run.games[index - 1] ?? null, game.gameplan);
    const result = game.result!;
    console.log(`${game.stage ? STAGE_WEEK[game.stage] : `Wk ${game.week}`} [${story.tag}] ${venueLabel(game)} ${game.opponent.name} ` +
      `(${(game.winProb * 100).toFixed(1)}%) → ${result.won ? "W" : "L"} ${result.scoreFor}-${result.scoreAgainst}`);
  }
  console.log(`Frozen qualification seed #${run.postseasonSeed} · rank swing ${Math.max(...ranks) - Math.min(...ranks)} (12 regular games only)`);
  console.log(`FINAL: ${run.summary.wins}-${run.summary.losses} · ${postseasonOutcome(run.games)}`);
}
console.log("\nDONE · canonical player paths only; no other-team results, publication or source-data writes.");
