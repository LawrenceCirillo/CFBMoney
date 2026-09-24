import type { TeamBudget } from "./types";

/** Fixed selection rules keep the weekly examples tied to the data snapshot. */
export function selectMoneyballQuestions(teams: TeamBudget[]) {
  const ranked = teams.filter((team) => team.ap_rank != null && team.value_gap != null);
  const bySlug = (a: TeamBudget, b: TeamBudget) => a.slug.localeCompare(b.slug);
  const positive = ranked.filter((team) => team.value_gap! > 0);
  const negative = ranked.filter((team) => team.value_gap! < 0);
  const maxPositive = Math.max(...positive.map((team) => team.value_gap!));
  const minNegative = Math.min(...negative.map((team) => team.value_gap!));
  const above = positive.filter((team) => team.value_gap === maxPositive).sort(bySlug);
  const below = negative.filter((team) => team.value_gap === minNegative).sort(bySlug);
  const shown = new Set([...above, ...below].map((team) => team.slug));
  const otherRanked = ranked.filter((team) => !shown.has(team.slug));
  const minPlayedSos = Math.min(...otherRanked.map((team) => team.sos_played_rank));
  const hardestOther = otherRanked.filter((team) => team.sos_played_rank === minPlayedSos).sort(bySlug);

  return { above, below, hardestOther };
}
