// lib/moneyball.ts
//
// Moneyball analytics: what does a win cost?
//
// Every figure here is MODEL-BASED, derived from the simulator's own math
// (lib/simulator.ts): a budget buys talent with diminishing returns, talent
// maps to ratings, ratings map to win probability against the average 68-team
// field on a neutral field, times 12 games. The UI must label these as
// expected / modeled — they are not predictions and not historical results.
//
// Because team ratings are a pure function of budget, every team sits exactly
// on the cost curve. The interesting outputs are therefore:
//   - the shape of the curve itself (diminishing returns),
//   - the sweet spot: the budget that minimizes $/win,
//   - the marginal price of each additional win,
//   - the efficiency ranking: which real budgets sit nearest the sweet spot.

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

/** Average cost per expected win. Infinity when no wins are expected. */
export function costPerWin(budgetM: number, field: Ratings = fieldRatings()): number {
  const w = expectedWins(budgetM, field);
  return w > 1e-9 ? budgetM / w : Infinity;
}

export interface CurvePoint {
  budget: number;
  wins: number;
  costPerWin: number;
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
      costPerWin: wins > 1e-9 ? b / wins : Infinity,
    });
  }
  return pts;
}

/**
 * Budget required to reach `w` expected wins, by bisection.
 * Returns Infinity when unreachable (the curve asymptotes just under 12).
 */
export function budgetForWins(w: number, field: Ratings = fieldRatings()): number {
  if (w <= 0) return 0;
  let lo = 0.01;
  let hi = 50;
  while (expectedWins(hi, field) < w && hi < 1e7) hi *= 2;
  if (expectedWins(hi, field) < w) return Infinity;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (expectedWins(mid, field) < w) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The budget that minimizes $/win — the most efficient dollar in the sport. */
export function sweetSpot(field: Ratings = fieldRatings()): CurvePoint {
  const curve = costCurve(field, 5, 120, 0.5);
  return curve.reduce((a, b) => (b.costPerWin < a.costPerWin ? b : a));
}

export interface WinPrice {
  /** the k-th expected win */
  win: number;
  /** marginal $M to go from (k-1) to k expected wins, centered */
  priceM: number;
}

/**
 * The price tag on each win: winPrice(k) = budgetFor(k-0.5) - budgetFor(k-1.5).
 * The 12th win is priced around 11.5 expected wins since 12 is asymptotic.
 */
export function winPrices(
  first = 5,
  last = 12,
  field: Ratings = fieldRatings()
): WinPrice[] {
  const out: WinPrice[] = [];
  for (let k = first; k <= last; k++) {
    const hi = budgetForWins(k - 0.5, field);
    const lo = budgetForWins(k - 1.5, field);
    out.push({ win: k, priceM: hi - lo });
  }
  return out;
}

export interface TeamEfficiency {
  team: TeamBudget;
  wins: number;
  costPerWin: number;
}

/** All teams ranked by $/expected win, cheapest first. */
export function teamEfficiency(
  teams: TeamBudget[] = data.teams,
  field: Ratings = fieldRatings(teams)
): TeamEfficiency[] {
  return teams
    .map((team) => {
      const wins = expectedWins(team.budget_mid_m, field);
      return { team, wins, costPerWin: team.budget_mid_m / wins };
    })
    .sort((a, b) => a.costPerWin - b.costPerWin);
}
