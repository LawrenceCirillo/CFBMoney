// lib/season-mode.ts
//
// Season mode (lite): week-by-week drama on top of the simulator.
//
// - Storylines: every matchup gets a narrative tag from heuristics.
// - Projected rank: the user's projected final wins (actual + remaining
//   expected) ranked against every other team's modeled expected wins.
//   Labeled as projected — it moves as the season unfolds.
// - Postseason: one fixed projected player path (FR 13, QF 14, SF 15, NCG 16).
//   Top-four seeds have a first-round bye. Other teams' games are not simulated.
//
// Pure functions only — no React, no I/O. Randomness via injected rng.

import type { TeamBudget } from "./types";
import { expectedWins as modeledExpectedWins } from "./moneyball";
import { offTagLabel, schemeTagsFor, type GameplanResolution } from "./gameplan";
import { playoffSeedPath, type PlayoffStage } from "./playoff-path";
import {
  teamRatings,
  expectedScore,
  generateSchedule,
  mulberry32,
  gameVenue,
  type GameVenue,
  type Ratings as SimRatings,
  type ScheduledGame,
} from "./simulator";

export type PostseasonStage = PlayoffStage | "bowl";
export const PLAYOFF_CUT = 12;

export interface Storyline {
  tag: string;
  blurb: string;
  tone: "hype" | "mid" | "down";
}

/** Narrative tag for a matchup, from simple heuristics. */
export function storylineFor(
  game: ScheduledGame,
  prev: ScheduledGame | null,
  plan?: GameplanResolution | null,
): Storyline {
  if (game.stage === "fr")
    return { tag: "Playoff first round", blurb: "Win to reach the quarterfinal. Higher seed hosts.", tone: "hype" };
  if (game.stage === "qf")
    return { tag: "Playoff quarterfinal", blurb: "A neutral field. Win to reach the semifinal.", tone: "hype" };
  if (game.stage === "sf")
    return { tag: "Playoff semifinal", blurb: "One win from playing for it all.", tone: "hype" };
  if (game.stage === "ncg")
    return { tag: "National championship", blurb: "Sixty minutes for immortality.", tone: "hype" };
  if (game.stage === "bowl")
    return { tag: "The Money Bowl", blurb: "End the season with a trophy.", tone: "mid" };
  if (game.rivalry)
    return { tag: "Rivalry week", blurb: `${game.rivalry}. Their ${offTagLabel(schemeTagsFor(game.opponent.slug).offTag)} against ${plan?.def === "blitz" ? "your blitz packages" : "your defensive call"}.`, tone: "hype" };

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
    .sort((a, b) => b.proj - a.proj || (a.team.slug < b.team.slug ? -1 : a.team.slug > b.team.slug ? 1 : 0))
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
  venue: GameVenue,
  userR: SimRatings,
  playerSeed: number,
  opponentSeed?: number,
): ScheduledGame {
  const oppRatings = teamRatings(opp.budget_mid_m);
  return {
    week,
    opponent: opp,
    oppRatings,
    isHome: venue === "home",
    venue,
    playerSeed,
    ...(opponentSeed === undefined ? {} : { opponentSeed }),
    winProb: expectedScore(userR, oppRatings, venue).winProb,
    stage,
  };
}

/** Construct once from regular results; projections consume no outcome RNG. */
export function buildPostseasonPath(
  seed: number,
  usedSlugs: Set<string>,
  ctx: PostseasonCtx
): ScheduledGame[] {
  if (!Number.isInteger(seed) || seed < 1) throw new Error("Invalid qualification seed");
  const exclude = new Set([ctx.program.slug, ...usedSlugs]);
  const ranked = rankedField(ctx.teams, ctx.field, exclude);
  if (seed > PLAYOFF_CUT) return [makeGame(closest(ranked, seed).team, 13, "bowl", "neutral", ctx.userR, seed)];
  if (ranked.length < 11) throw new Error("Not enough unique eligible programs for a modeled path field");
  const field = ranked.slice(0, 11).map((entry) => entry.team);
  field.splice(seed - 1, 0, ctx.program);
  return playoffSeedPath(seed).map((round) => makeGame(field[round.opponentSeed - 1], round.week,
    round.stage, round.venue, ctx.userR, seed, round.opponentSeed));
}

export function postseasonOpener(seed: number, usedSlugs: Set<string>, ctx: PostseasonCtx): ScheduledGame {
  return buildPostseasonPath(seed, usedSlugs, ctx)[0];
}

/** Caller advances only on a player win; never redraw or re-rank this path. */
export function nextPostseasonGame(
  stage: PostseasonStage,
  path: ScheduledGame[],
): ScheduledGame | null {
  const index = path.findIndex((game) => game.stage === stage);
  return index < 0 ? null : path[index + 1] ?? null;
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
  const fr = post.find((g) => g.stage === "fr");
  if (fr && !fr.result!.won) return "Playoff first-round exit";
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
    venue: gameVenue(g),
    winProb: expectedScore(userR, g.oppRatings, gameVenue(g)).winProb,
  });

  let games = generateSchedule(program, teams, seed).map(withProbs);
  games = withRivalryGame(games, program, teams, rng).map(withProbs);
  return games;
}
