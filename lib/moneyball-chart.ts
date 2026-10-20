import type { TeamBudget } from "./types";

/** One linear rank scale for AP positions and their spend-rank reference. */
export function moneyballChartLayout(teams: TeamBudget[]) {
  const W = 880;
  const H = 760;
  const m = { t: 46, r: 34, b: 56, l: 60 };
  const xs = teams.map((team) => team.budget_mid_m);
  const x0 = Math.floor(xs.length ? Math.min(...xs) : 0) - 2;
  const x1 = Math.ceil(xs.length ? Math.max(...xs) : 10) + 2;
  const yBottom = Math.ceil(Math.max(25, ...teams.map((team) => team.spend_rank), ...teams.map((team) => team.ap_rank ?? 0)) / 10) * 10;
  const X = (budget: number) => m.l + (budget - x0) / (x1 - x0) * (W - m.l - m.r);
  const Y = (rank: number) => m.t + rank / yBottom * (H - m.t - m.b);
  const xTicks: number[] = [];
  for (let tick = Math.ceil(x0 / 10) * 10; tick <= x1; tick += 10) xTicks.push(tick);
  const yTicks = Array.from({ length: yBottom / 5 }, (_, index) => (index + 1) * 5);
  const sorted = [...teams].sort((a, b) => a.budget_mid_m - b.budget_mid_m || a.slug.localeCompare(b.slug));
  const parity = sorted.filter((team, index) => index === 0 || team.budget_mid_m !== sorted[index - 1].budget_mid_m || team.spend_rank !== sorted[index - 1].spend_rank);
  const parityPath = parity.map((team, index) => `${index ? "L" : "M"}${X(team.budget_mid_m)},${Y(team.spend_rank)}`).join(" ");
  return { W, H, m, X, Y, xTicks, yTicks, yBottom, parity, parityPath };
}
