/**
 * Playtest: play season mode headlessly under several college-football-fan
 * roster proposals, using the EXACT code paths the SeasonMode component uses
 * (schedule gen, storylineFor, projectedRank, postseasonOpener/nextPostseasonGame,
 * simulateGame). Prints a week-by-week narrative log per persona plus fun metrics.
 *
 * Run with: npx tsx scripts/playtest.ts
 */
import { data, getTeam } from "../lib/data";
import {
  expectedScore,
  generateSchedule,
  mulberry32,
  optimalAllocation,
  ratingsFromAllocation,
  simulateGame,
  type Allocation,
  type ScheduledGame,
} from "../lib/simulator";
import { expectedWins as modeledExpectedWins, fieldRatings } from "../lib/moneyball";
import {
  buildSeasonGames,
  nextPostseasonGame,
  postseasonOpener,
  postseasonOutcome,
  projectedRank,
  storylineFor,
} from "../lib/season-mode";

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

function projection(games: ScheduledGame[]): number {
  return games.reduce((s, g) => s + (g.result ? (g.result.won ? 1 : 0) : g.winProb), 0);
}

const STAGE_WEEK: Record<string, string> = { qf: "QF", sf: "SF", ncg: "NCG", bowl: "BOWL" };

for (const p of PERSONAS) {
  const program = getTeam(p.programSlug)!;
  const total = Object.values(p.alloc).reduce((a, b) => a + b, 0);
  const userR = ratingsFromAllocation(p.alloc);
  const rng = mulberry32(p.seed);
  const ctx = { program, teams: data.teams, userR, field, rng };
  const fieldProj = data.teams
    .filter((t) => t.slug !== program.slug)
    .map((t) => modeledExpectedWins(t.budget_mid_m, field));

  let games: ScheduledGame[] = buildSeasonGames(p.seed, userR, program, data.teams);

  console.log(`\n${"=".repeat(72)}`);
  console.log(`PERSONA: ${p.name}  @  ${program.name}`);
  console.log(`"${p.pitch}"`);
  console.log(`Roster ratings: off ${userR.off.toFixed(0)} / def ${userR.def.toFixed(0)} / st ${userR.st.toFixed(0)}  ($${total}M)`);
  console.log(`Preseason projected rank: #${projectedRank(projection(games), fieldProj)}`);
  console.log(`${"=".repeat(72)}`);

  let upsets = 0;
  let oneScore = 0;
  const ranks: number[] = [];
  const tags = new Set<string>();

  const rankNow = () => projectedRank(projection(games), fieldProj);

  // Regular season, week by week.
  for (let w = 0; w < 12; w++) {
    const g = games[w];
    const prev = w > 0 ? games[w - 1] : null;
    const story = storylineFor(g, prev);
    tags.add(story.tag);
    const result = simulateGame(userR, g.oppRatings, g.isHome, rng);
    games[w] = { ...g, result };
    const rank = rankNow();
    ranks.push(rank);
    const prevRank = ranks.length > 1 ? ranks[ranks.length - 2] : rank;
    const delta = prevRank - rank;
    const upset = (result.won && g.winProb < 0.35) || (!result.won && g.winProb > 0.65);
    if (upset) upsets++;
    const margin = Math.abs(result.scoreFor - result.scoreAgainst);
    if (margin <= 7) oneScore++;
    const move = delta > 0 ? `▲${delta}` : delta < 0 ? `▼${-delta}` : "–";
    const ranked = g.opponent.ap_rank != null ? ` AP #${g.opponent.ap_rank}` : "";
    console.log(
      `Wk ${String(w + 1).padEnd(2)} [${story.tag}] ${g.isHome ? "vs" : "at"}${ranked} ${g.opponent.name} ` +
        `(${Math.round(g.winProb * 100)}%) → ${result.won ? "W" : "L"} ${result.scoreFor}-${result.scoreAgainst}` +
        `${upset ? "  ★ UPSET" : ""}${margin <= 7 ? "  (one-score)" : ""}   | rank #${rank} ${move}`
    );
  }

  const wins = games.filter((g) => g.result!.won).length;
  const seedRank = rankNow();
  console.log(`\nRegular season: ${wins}-${12 - wins} → projected seed #${seedRank}`);

  // Postseason.
  const used = new Set(games.map((g) => g.opponent.slug));
  let stage: string | null = null;
  {
    let g = postseasonOpener(seedRank, used, ctx);
    g = { ...g, result: simulateGame(userR, g.oppRatings, g.isHome, rng) };
    games = [...games, g];
    stage = g.stage!;
    const story = storylineFor(g, games[games.length - 2]);
    tags.add(story.tag);
    const r = g.result!;
    const upset = (r.won && g.winProb < 0.35) || (!r.won && g.winProb > 0.65);
    if (upset) upsets++;
    if (Math.abs(r.scoreFor - r.scoreAgainst) <= 7) oneScore++;
    console.log(
      `${STAGE_WEEK[g.stage!]} [${story.tag}] ${g.isHome ? "vs" : "at"} ${g.opponent.name} ` +
        `(${Math.round(g.winProb * 100)}%) → ${r.won ? "W" : "L"} ${r.scoreFor}-${r.scoreAgainst}${upset ? "  ★ UPSET" : ""}`
    );
    while (r.won || g.result!.won) {
      const last = games[games.length - 1];
      if (!last.result!.won) break;
      const nxt = nextPostseasonGame(last.stage!, new Set(games.map((x) => x.opponent.slug)), ctx);
      if (!nxt) break;
      const ng = { ...nxt, result: simulateGame(userR, nxt.oppRatings, nxt.isHome, rng) };
      games = [...games, ng];
      const nr = ng.result!;
      const nupset = (nr.won && ng.winProb < 0.35) || (!nr.won && ng.winProb > 0.65);
      if (nupset) upsets++;
      if (Math.abs(nr.scoreFor - nr.scoreAgainst) <= 7) oneScore++;
      console.log(
        `${STAGE_WEEK[ng.stage!]} [${storylineFor(ng, last).tag}] ${ng.isHome ? "vs" : "at"} ${ng.opponent.name} ` +
          `(${Math.round(ng.winProb * 100)}%) → ${nr.won ? "W" : "L"} ${nr.scoreFor}-${nr.scoreAgainst}${nupset ? "  ★ UPSET" : ""}`
      );
    }
  }

  const finalWins = games.filter((g) => g.result!.won).length;
  const outcome = postseasonOutcome(games);
  const rankSwing = Math.max(...ranks) - Math.min(...ranks);
  console.log(`\nFINAL: ${finalWins}-${games.length - finalWins}  |  ${outcome ?? "no postseason"}`);
  console.log(
    `METRICS: upsets=${upsets}, one-score games=${oneScore}, rank swing=${rankSwing} ` +
      `(best #${Math.min(...ranks)}, worst #${Math.max(...ranks)}), storyline variety=${tags.size}/12 tags`
  );
  console.log(`Tags seen: ${[...tags].join(" · ")}`);
}

console.log("\nDONE");
