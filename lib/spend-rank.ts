import type { TeamBudget } from "./types";

const EPS = 1e-9;

/** Competition rank (1224): 1 + how many values sit strictly above. Ties share a rank. */
export function competitionRank(value: number, field: number[]): number {
  return 1 + field.filter((v) => v > value + EPS).length;
}

export interface BookStanding {
  rank: number;
  of: number;
  budgetM: number;
  /** Other Power-4 books at this same midpoint. */
  tiedWith: TeamBudget[];
  nearest: TeamBudget;
}

/** Where a program book sits among the 68 Athletic midpoints. */
export function bookStanding(budgetM: number, teams: TeamBudget[]): BookStanding {
  if (teams.length === 0) {
    throw new Error("bookStanding requires at least one team");
  }
  const mids = teams.map((t) => t.budget_mid_m);
  const rank = competitionRank(budgetM, mids);
  const tiedWith = teams
    .filter((t) => Math.abs(t.budget_mid_m - budgetM) < EPS)
    .sort((a, b) => a.name.localeCompare(b.name));
  const nearest = teams.reduce((best, t) => {
    const d = Math.abs(t.budget_mid_m - budgetM);
    const bd = Math.abs(best.budget_mid_m - budgetM);
    if (d < bd - EPS) return t;
    if (Math.abs(d - bd) <= EPS && t.name.localeCompare(best.name) < 0) return t;
    return best;
  });
  return { rank, of: teams.length, budgetM, tiedWith, nearest };
}

export function conferenceSpendRank(team: TeamBudget, teams: TeamBudget[]): {
  rank: number;
  of: number;
} {
  const peers = teams.filter((t) => t.conference === team.conference);
  return {
    rank: competitionRank(
      team.budget_mid_m,
      peers.map((p) => p.budget_mid_m)
    ),
    of: peers.length,
  };
}