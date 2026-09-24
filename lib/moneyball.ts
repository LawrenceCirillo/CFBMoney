// lib/moneyball.ts
//
// Moneyball's Build-model comparison.
//
// Every figure here is MODEL-BASED, derived from the simulator's own math
// (lib/simulator.ts): a budget buys talent with diminishing returns, talent
// maps to ratings, ratings map to win probability against the average 68-team
// field on a neutral field, times 12 games. The UI must label these as
// expected / modeled — they are not predictions and not historical results.
//
// Team ratings are a pure function of budget. Moneyball uses this only to show
// the assumed curve and compare two hypothetical budgets inside the reported
// midpoint span; it does not rank real teams by modeled efficiency.

import { data } from "./data";
import { teamRatings, expectedScore, type Ratings } from "./simulator";
import type { TeamBudget } from "./types";

export const SEASON_GAMES = 12;

let cachedField: { teams: TeamBudget[]; ratings: Ratings } | null = null;

/** Average ratings across the field — the "average opponent". */
export function fieldRatings(teams: TeamBudget[] = data.teams): Ratings {
  if (cachedField && cachedField.teams === teams) return cachedField.ratings;
  const acc = { off: 0, def: 0, st: 0 };
  for (const t of teams) {
    const r = teamRatings(t.budget_mid_m);
    acc.off += r.off;
    acc.def += r.def;
    acc.st += r.st;
  }
  const n = teams.length || 1;
  const ratings = { off: acc.off / n, def: acc.def / n, st: acc.st / n };
  cachedField = { teams, ratings };
  return ratings;
}

/** Win probability for a budget against the average field, neutral site. */
export function neutralWinProb(budgetM: number, field: Ratings): number {
  const r = teamRatings(Math.max(0, budgetM));
  const home = expectedScore(r, field, true).winProb;
  const away = expectedScore(r, field, false).winProb;
  return (home + away) / 2;
}

/** Expected wins over a 12-game season vs the average field. */
export function expectedWins(budgetM: number, field: Ratings = fieldRatings()): number {
  return SEASON_GAMES * neutralWinProb(budgetM, field);
}

export interface CurvePoint {
  budget: number;
  wins: number;
}

/** Sampled cost curve over a budget range. */
export function costCurve(
  field: Ratings = fieldRatings(),
  from = 5,
  to = 80,
  step = 1
): CurvePoint[] {
  const pts: CurvePoint[] = [];
  for (let b = from; b <= to + 1e-9; b += step) {
    const wins = expectedWins(b, field);
    pts.push({
      budget: Math.round(b * 10) / 10,
      wins,
    });
  }
  return pts;
}
