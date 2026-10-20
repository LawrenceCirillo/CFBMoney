import { fmtMoney2, fmtRange } from "./format";
import { selectMoneyballQuestions } from "./moneyball-questions";
import type { MoneyballHistory } from "./moneyball-movement";
import type { TeamBudget } from "./types";

export interface MoneyballTeam {
  team: TeamBudget;
  record: string;
  wins: number;
  costPerWinM: number | null;
}

export function costPerWinDescription(value: number | null): string {
  return `${value == null ? "No wins yet" : `${fmtMoney2(value)} per win`}, at the budget midpoint; crude, partial-season.`;
}

/** A descriptive snapshot calculation. No game-model ratings or projections. */
export function buildMoneyballInsights(
  teams: TeamBudget[],
  records: Record<string, { record: string } | undefined>,
  ballot: MoneyballHistory["currentPoll"]["ballot"],
) {
  const bySlug = new Map(teams.map((team) => [team.slug, team]));
  const facts = Object.fromEntries(teams.map((team): [string, MoneyballTeam] => {
    const record = records[team.slug]?.record;
    if (!record || !/^\d+-\d+(?:-\d+)?$/.test(record)) {
      throw new Error(`Moneyball needs a valid snapshot record for ${team.slug}`);
    }
    const wins = Number(record.split("-")[0]);
    return [team.slug, { team, record, wins, costPerWinM: wins > 0 ? team.budget_mid_m / wins : null }];
  }));
  const ranked = teams.filter((team) => team.ap_rank != null);
  const cheapestMid = Math.min(...ranked.map((team) => team.budget_mid_m));
  const cheapest = ranked.filter((team) => team.budget_mid_m === cheapestMid).sort((a, b) => a.slug.localeCompare(b.slug));
  const unrankedSpenders = teams.filter((team) => team.spend_rank <= 10 && team.ap_rank == null)
    .sort((a, b) => a.spend_rank - b.spend_rank || a.slug.localeCompare(b.slug));
  const cheapestLabels = cheapest.map((team) => `${team.name} (${fmtRange(team.budget_low_m, team.budget_high_m)})`).join(" / ");
  const takeaway = `${cheapest.length ? `Lowest ranked budget midpoint: ${cheapestLabels}` : "No tracked teams are AP-ranked"}; ${unrankedSpenders.length} top-10 spender${unrankedSpenders.length === 1 ? " is" : "s are"} unranked.`;
  const questions = selectMoneyballQuestions(teams);
  const field = ballot.filter((row) => row.rank <= 12).sort((a, b) => a.rank - b.rank)
    .map((row) => ({ ...row, team: row.slug ? bySlug.get(row.slug) : undefined }));
  const missingBudgets = field.filter((row) => !row.team);
  const completeField = field.length >= 12 && missingBudgets.length === 0;
  const fieldMidM = completeField ? Number(field.reduce((sum, row) => sum + row.team!.budget_mid_m, 0).toFixed(6)) : null;
  const firstOut = ballot.filter((row) => row.rank === 13).flatMap((row) => {
    const team = row.slug ? bySlug.get(row.slug) : undefined;
    if (!completeField || !team) return [];
    const outspends = field.filter((entry) => entry.team!.budget_mid_m < team.budget_mid_m).length;
    return outspends >= Math.ceil(field.length / 2) ? [{ team, outspends }] : [];
  });
  return { facts, ranked, cheapest, unrankedSpenders, takeaway, ...questions, field, missingBudgets, fieldMidM, firstOut };
}
