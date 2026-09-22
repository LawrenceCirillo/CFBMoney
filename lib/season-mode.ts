// lib/season-mode.ts
//
// Season mode (lite): week-by-week drama on top of the simulator.
//
// - Storylines: every matchup gets a narrative tag from heuristics.
// - Projected rank: the user's projected final wins (actual + remaining
//   expected) ranked against every other team's modeled expected wins.
//   Labeled as projected — it moves as the season unfolds.
// - Postseason: top-12 projected seeds make a playoff (QF week 13,
//   SF week 14, NCG week 15); everyone else gets the Money Bowl (week 13).
//   Opponents are real teams picked by projected rank, never rematches.
//
// Pure functions only — no React, no I/O. Randomness via injected rng.

import type { TeamBudget } from "./types";
import { expectedWins as modeledExpectedWins } from "./moneyball";
import {
  teamRatings,
  expectedScore,
  generateSchedule,
  mulberry32,
  type Ratings as SimRatings,
  type ScheduledGame,
} from "./simulator";

export type PostseasonStage = "qf" | "sf" | "ncg" | "bowl";
export const PLAYOFF_CUT = 12;

export interface Storyline {
  tag: string;
  blurb: string;
  tone: "hype" | "mid" | "down";
}

/** Narrative tag for a matchup, from simple heuristics. */
export function storylineFor(
  game: ScheduledGame,
  prev: ScheduledGame | null
): Storyline {
  if (game.stage === "qf")
    return { tag: "Playoff quarterfinal", blurb: "Win or go home. The bracket starts here.", tone: "hype" };
  if (game.stage === "sf")
    return { tag: "Playoff semifinal", blurb: "One win from playing for it all.", tone: "hype" };
  if (game.stage === "ncg")
    return { tag: "National championship", blurb: "Sixty minutes for immortality.", tone: "hype" };
  if (game.stage === "bowl")
    return { tag: "The Money Bowl", blurb: "End the season with a trophy.", tone: "mid" };
  if (game.rivalry)
    return { tag: "Rivalry week", blurb: `${game.rivalry}. Throw the records out.`, tone: "hype" };

  const p = game.winProb;
  const opp = game.opponent;
  if (p >= 0.85)
    return { tag: "Should-win", blurb: "Don't get cute. Handle business.", tone: "mid" };
  if (p <= 0.22)
    return { tag: "David vs Goliath", blurb: "Nobody gives you a chance. Good.", tone: "down" };
  if (opp.ap_rank != null && opp.ap_rank <= 12)
    return {
      tag: "Statement game",
      blurb: `No. ${opp.ap_rank} ${opp.name}. Announce yourself.`,
      tone: "hype",
    };
  if (prev?.result && !prev.result.won)
    return { tag: "Bounce back", blurb: "Coming off a loss. Respond.", tone: "mid" };
  if (
    prev?.result?.won &&
    prev.result.scoreFor - prev.result.scoreAgainst >= 14 &&
    p < 0.75
  )
    return { tag: "Trap game", blurb: "Don't look past them.", tone: "down" };
  if (game.isHome && p >= 0.4)
    return { tag: "Home cooking", blurb: "Defend your turf.", tone: "mid" };
  if (!game.isHome && game.oppRatings.off + game.oppRatings.def >= 138)
    return { tag: "Road test", blurb: "Hostile territory.", tone: "down" };
  return { tag: `Week ${game.week}`, blurb: "Another Saturday. Another receipt.", tone: "mid" };
}

/** 1-based rank of the user's projection among the field's projections. */
export function projectedRank(userProj: number, fieldProj: number[]): number {
  return 1 + fieldProj.filter((p) => p > userProj + 1e-9).length;
}

export interface PostseasonCtx {
  program: TeamBudget;
  teams: TeamBudget[];
  userR: SimRatings;
  field: SimRatings;
  rng: () => number;
}

interface RankedTeam {
  team: TeamBudget;
  proj: number;
  projRank: number;
}

function rankedField(teams: TeamBudget[], field: SimRatings, exclude: Set<string>): RankedTeam[] {
  return teams
    .filter((t) => !exclude.has(t.slug))
    .map((t) => ({ team: t, proj: modeledExpectedWins(t.budget_mid_m, field) }))
    .sort((a, b) => b.proj - a.proj)
    .map((e, i) => ({ ...e, projRank: i + 1 }));
}

function closest(ranked: RankedTeam[], targetRank: number): RankedTeam {
  let best = ranked[0];
  for (const e of ranked) {
    if (Math.abs(e.projRank - targetRank) < Math.abs(best.projRank - targetRank)) best = e;
  }
  if (!best) throw new Error("no postseason opponent available");
  return best;
}

function makeGame(
  opp: TeamBudget,
  week: number,
  stage: PostseasonStage,
  isHome: boolean,
  userR: SimRatings
): ScheduledGame {
  const oppRatings = teamRatings(opp.budget_mid_m);
  return {
    week,
    opponent: opp,
    oppRatings,
    isHome,
    winProb: expectedScore(userR, oppRatings, isHome).winProb,
    stage,
  };
}

/**
 * First postseason game after week 12. Seeds 1–4 get a bye to the semifinal
 * (week 14); seeds 5–12 host a quarterfinal (week 13); everyone else plays
 * the Money Bowl (week 13) against a peer.
 */
export function postseasonOpener(
  seed: number,
  usedSlugs: Set<string>,
  ctx: PostseasonCtx
): ScheduledGame {
  const exclude = new Set([ctx.program.slug, ...usedSlugs]);
  const ranked = rankedField(ctx.teams, ctx.field, exclude);
  const neutral = ctx.rng() < 0.5;

  if (seed <= 4) {
    // Semifinal vs a quarterfinal-winner type: the team sitting around #8.
    const opp = closest(ranked, 8);
    return makeGame(opp.team, 14, "sf", neutral, ctx.userR);
  }
  if (seed <= PLAYOFF_CUT) {
    // Proper bracket pairing: 5v12, 6v11, 7v10, 8v9. Higher seed hosts.
    const opp = closest(ranked, PLAYOFF_CUT + 1 - seed);
    return makeGame(opp.team, 13, "qf", seed < opp.projRank, ctx.userR);
  }
  const opp = closest(ranked, seed);
  return makeGame(opp.team, 13, "bowl", neutral, ctx.userR);
}

/**
 * The next game after a postseason win. Null when the run ends
 * (losses end it implicitly — the caller just stops scheduling).
 */
export function nextPostseasonGame(
  stage: PostseasonStage,
  usedSlugs: Set<string>,
  ctx: PostseasonCtx
): ScheduledGame | null {
  if (stage !== "qf" && stage !== "sf") return null;
  const exclude = new Set([ctx.program.slug, ...usedSlugs]);
  const ranked = rankedField(ctx.teams, ctx.field, exclude);
  const neutral = ctx.rng() < 0.5;
  if (stage === "qf") {
    // Semifinal vs the strongest team left standing.
    const opp = ranked[0];
    if (!opp) throw new Error("no postseason opponent available");
    return makeGame(opp.team, 14, "sf", neutral, ctx.userR);
  }
  const opp = ranked[0];
  if (!opp) throw new Error("no postseason opponent available");
  return makeGame(opp.team, 15, "ncg", neutral, ctx.userR);
}

/** Human outcome of a finished postseason run, for the season report. */
export function postseasonOutcome(games: ScheduledGame[]): string | null {
  const post = games.filter((g) => g.stage && g.result);
  if (post.length === 0) return null;
  const ncg = post.find((g) => g.stage === "ncg");
  if (ncg) return ncg.result!.won ? "National champions" : "National runners-up";
  const sf = post.find((g) => g.stage === "sf");
  if (sf && !sf.result!.won) return "Playoff semifinalists";
  const qf = post.find((g) => g.stage === "qf");
  if (qf && !qf.result!.won) return "Playoff quarterfinalists";
  const bowl = post.find((g) => g.stage === "bowl");
  if (bowl) return bowl.result!.won ? "Money Bowl champions" : "Money Bowl runners-up";
  return null;
}

//
// ---- Rivalries & schedule construction ----
//
// The slate is a fixed, honest test: the same exam for every GM at a program
// (determined by seed alone, never adapted to roster strength). Rivalry games
// are force-scheduled — one per season — because a season without your rival
// isn't a season.

interface Rivalry {
  slug: string;
  name: string;
}

export const RIVALRIES: Record<string, Rivalry[]> = {
  texas: [
    { slug: "texas-am", name: "The Lone Star Showdown" },
    { slug: "oklahoma", name: "Red River Rivalry" },
  ],
  "texas-am": [{ slug: "texas", name: "The Lone Star Showdown" }],
  oklahoma: [
    { slug: "texas", name: "Red River Rivalry" },
    { slug: "oklahoma-state", name: "Bedlam" },
  ],
  "oklahoma-state": [{ slug: "oklahoma", name: "Bedlam" }],
  "ohio-state": [{ slug: "michigan", name: "The Game" }],
  michigan: [
    { slug: "ohio-state", name: "The Game" },
    { slug: "michigan-state", name: "Paul Bunyan Trophy" },
  ],
  "michigan-state": [{ slug: "michigan", name: "Paul Bunyan Trophy" }],
  alabama: [
    { slug: "auburn", name: "Iron Bowl" },
    { slug: "tennessee", name: "Third Saturday in October" },
  ],
  auburn: [
    { slug: "alabama", name: "Iron Bowl" },
    { slug: "georgia", name: "Deep South's Oldest Rivalry" },
  ],
  georgia: [
    { slug: "florida", name: "The World's Largest Outdoor Cocktail Party" },
    { slug: "auburn", name: "Deep South's Oldest Rivalry" },
    { slug: "georgia-tech", name: "Clean, Old-Fashioned Hate" },
  ],
  florida: [
    { slug: "georgia", name: "The World's Largest Outdoor Cocktail Party" },
    { slug: "florida-state", name: "Sunshine Showdown" },
  ],
  "florida-state": [
    { slug: "florida", name: "Sunshine Showdown" },
    { slug: "miami", name: "Miami–Florida State" },
  ],
  miami: [{ slug: "florida-state", name: "Miami–Florida State" }],
  tennessee: [
    { slug: "alabama", name: "Third Saturday in October" },
    { slug: "vanderbilt", name: "Tennessee–Vanderbilt" },
  ],
  vanderbilt: [{ slug: "tennessee", name: "Tennessee–Vanderbilt" }],
  "notre-dame": [
    { slug: "usc", name: "The Jeweled Shillelagh" },
    { slug: "boston-college", name: "Boston College–Notre Dame" },
  ],
  usc: [
    { slug: "notre-dame", name: "The Jeweled Shillelagh" },
    { slug: "ucla", name: "Victory Bell" },
  ],
  ucla: [{ slug: "usc", name: "Victory Bell" }],
  clemson: [{ slug: "south-carolina", name: "Palmetto Bowl" }],
  "south-carolina": [{ slug: "clemson", name: "Palmetto Bowl" }],
  washington: [{ slug: "oregon", name: "Oregon–Washington" }],
  oregon: [{ slug: "washington", name: "Oregon–Washington" }],
  iowa: [
    { slug: "iowa-state", name: "Cy-Hawk" },
    { slug: "minnesota", name: "Floyd of Rosedale" },
    { slug: "nebraska", name: "Heroes Game" },
  ],
  "iowa-state": [{ slug: "iowa", name: "Cy-Hawk" }],
  minnesota: [
    { slug: "iowa", name: "Floyd of Rosedale" },
    { slug: "wisconsin", name: "Paul Bunyan's Axe" },
  ],
  wisconsin: [{ slug: "minnesota", name: "Paul Bunyan's Axe" }],
  nebraska: [{ slug: "iowa", name: "Heroes Game" }],
  kansas: [{ slug: "kansas-state", name: "Sunflower Showdown" }],
  "kansas-state": [{ slug: "kansas", name: "Sunflower Showdown" }],
  arizona: [{ slug: "arizona-state", name: "Territorial Cup" }],
  "arizona-state": [{ slug: "arizona", name: "Territorial Cup" }],
  stanford: [{ slug: "california", name: "Big Game" }],
  california: [{ slug: "stanford", name: "Big Game" }],
  duke: [{ slug: "north-carolina", name: "Duke–North Carolina" }],
  "north-carolina": [
    { slug: "duke", name: "Duke–North Carolina" },
    { slug: "nc-state", name: "North Carolina–NC State" },
  ],
  "nc-state": [{ slug: "north-carolina", name: "North Carolina–NC State" }],
  virginia: [{ slug: "virginia-tech", name: "Commonwealth Clash" }],
  "virginia-tech": [{ slug: "virginia", name: "Commonwealth Clash" }],
  "georgia-tech": [{ slug: "georgia", name: "Clean, Old-Fashioned Hate" }],
  kentucky: [{ slug: "louisville", name: "Governor's Cup" }],
  louisville: [{ slug: "kentucky", name: "Governor's Cup" }],
  "ole-miss": [{ slug: "mississippi-state", name: "Egg Bowl" }],
  "mississippi-state": [{ slug: "ole-miss", name: "Egg Bowl" }],
  baylor: [{ slug: "tcu", name: "The Revivalry" }],
  tcu: [{ slug: "baylor", name: "The Revivalry" }],
  byu: [{ slug: "utah", name: "Holy War" }],
  utah: [{ slug: "byu", name: "Holy War" }],
  "boston-college": [{ slug: "notre-dame", name: "Boston College–Notre Dame" }],
  illinois: [{ slug: "northwestern", name: "Land of Lincoln Trophy" }],
  northwestern: [{ slug: "illinois", name: "Land of Lincoln Trophy" }],
  purdue: [{ slug: "indiana", name: "Old Oaken Bucket" }],
  indiana: [{ slug: "purdue", name: "Old Oaken Bucket" }],
};

/** Guarantee the program's rivalry game is on the schedule (one per season). */
function withRivalryGame(
  games: ScheduledGame[],
  program: TeamBudget,
  teams: TeamBudget[],
  rng: () => number
): ScheduledGame[] {
  const rivals = (RIVALRIES[program.slug] ?? []).filter((r) =>
    teams.some((t) => t.slug === r.slug)
  );
  if (rivals.length === 0) return games;
  const pick = rivals[Math.floor(rng() * rivals.length)];
  const rivalTeam = teams.find((t) => t.slug === pick.slug)!;

  const existingIdx = games.findIndex((g) => g.opponent.slug === rivalTeam.slug);
  if (existingIdx !== -1) {
    const next = [...games];
    next[existingIdx] = { ...next[existingIdx], rivalry: pick.name };
    return next;
  }
  // Replace a non-conference game; conference slates stay intact.
  const candidates = games.filter((g) => g.nonConf && !g.rivalry);
  if (candidates.length === 0) return games;
  const target = candidates[Math.floor(rng() * candidates.length)];
  const idx = games.indexOf(target);
  const next = [...games];
  next[idx] = {
    ...target,
    opponent: rivalTeam,
    oppRatings: teamRatings(rivalTeam.budget_mid_m),
    rivalry: pick.name,
  };
  return next;
}

/**
 * Preseason expected wins: the sum of win probabilities over the 12
 * regular-season games. This is the exam's difficulty rating for a roster —
 * fixed once the schedule is built, never adapted to results.
 */
export function preseasonExpectedWins(games: ScheduledGame[]): number {
  return games.filter((g) => !g.stage).reduce((s, g) => s + g.winProb, 0);
}

/**
 * Build the full 12-game regular-season slate for a roster: base schedule,
 * guaranteed rivalry game, and real win probabilities for the user's ratings.
 * Deterministic in (seed, alloc). Never adapted to roster strength — the same
 * slate is the same exam for every GM. Shared by Season mode and Quick sim so
 * both agree.
 */
export function buildSeasonGames(
  seed: number,
  userR: SimRatings,
  program: TeamBudget,
  teams: TeamBudget[]
): ScheduledGame[] {
  const rng = mulberry32((seed ^ 0x51ab3f) >>> 0);
  const withProbs = (g: ScheduledGame): ScheduledGame => ({
    ...g,
    winProb: expectedScore(userR, g.oppRatings, g.isHome).winProb,
  });

  let games = generateSchedule(program, teams, seed).map(withProbs);
  games = withRivalryGame(games, program, teams, rng).map(withProbs);
  return games;
}
