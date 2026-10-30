import type { CfbData } from "./types";
import type { SeasonSnapshot } from "./season-snapshot";
import type { Scoreboard } from "./scores";

export type SourceStamp = { name: string; asOf: string };
export type SavedWeekResult =
  | { status: "unavailable"; week: number | null }
  | { status: "no-game"; week: number }
  | { status: "played"; week: number; opponent: string; opponentSlug: string | null;
      venue: "home" | "away"; outcome: "W" | "L" | "T"; scoreFor: number; scoreAgainst: number; date: string };
export type TeamContext = { record: string | null; games: number | null; savedWeek: SavedWeekResult };
export type TeamContexts = {
  season: number;
  sources: { record: SourceStamp | null; score: SourceStamp | null; poll: SourceStamp | null; fpi: SourceStamp | null };
  teams: Record<string, TeamContext>;
};

function stamp(name: string | undefined, asOf: string | undefined): SourceStamp | null {
  return name && asOf ? { name, asOf } : null;
}

/** Server-built compact props. Never copy roster arrays or season totals here. */
export function buildTeamContexts(
  data: Pick<CfbData, "season" | "teams" | "poll" | "fpi">,
  season: SeasonSnapshot | null | undefined,
  scores: Scoreboard | null | undefined,
): TeamContexts {
  const records = season?.season === data.season ? season : null;
  const week = scores?.season === data.season && Number.isInteger(scores.week) && scores.week > 0 ? scores : null;
  const teams: Record<string, TeamContext> = {};
  for (const team of data.teams) {
    const saved = records?.teams[team.slug];
    const games = week?.games.filter((game) => game.home.slug === team.slug || game.away.slug === team.slug);
    let result: SavedWeekResult = { status: "unavailable", week: week?.week ?? null };
    if (week && games?.length === 0) result = { status: "no-game", week: week.week };
    else if (week && games?.length === 1) {
      const game = games[0];
      const home = game.home.slug === team.slug;
      const side = home ? game.home : game.away;
      const opponent = home ? game.away : game.home;
      if (game.final === true && Number.isFinite(side.score) && Number.isFinite(opponent.score)) {
        result = { status: "played", week: week.week, opponent: opponent.name, opponentSlug: opponent.slug,
          venue: home ? "home" : "away", outcome: side.winner ? "W" : opponent.winner ? "L" : "T",
          scoreFor: side.score, scoreAgainst: opponent.score, date: game.date };
      }
    }
    teams[team.slug] = {
      record: typeof saved?.record === "string" && saved.record.trim() ? saved.record : null,
      games: saved && Number.isInteger(saved.games) && saved.games >= 0 ? saved.games : null,
      savedWeek: result,
    };
  }
  return { season: data.season, sources: {
    record: stamp(records?.source, records?.as_of), score: stamp(week?.source, week?.as_of),
    poll: stamp(data.poll?.name, data.poll?.as_of), fpi: stamp(data.fpi?.name, data.fpi?.as_of),
  }, teams };
}

export function recordLabel(record: string | null | undefined): string {
  return record ? record.replaceAll("-", "–") : "Unavailable";
}

export function savedWeekLabel(result: SavedWeekResult | undefined): string {
  if (!result || result.status === "unavailable") return "Unavailable";
  if (result.status === "no-game") return `No game in the Week ${result.week} snapshot`;
  return `${result.outcome} ${result.scoreFor}–${result.scoreAgainst} ${result.venue === "home" ? "vs" : "at"} ${result.opponent}`;
}

export type RangeOverlap = { kind: "overlap" | "touch"; low: number; high: number } | { kind: "disjoint" };
export function budgetRangeOverlap(a: { budget_low_m: number; budget_high_m: number }, b: { budget_low_m: number; budget_high_m: number }): RangeOverlap {
  const low = Math.max(a.budget_low_m, b.budget_low_m);
  const high = Math.min(a.budget_high_m, b.budget_high_m);
  return low > high ? { kind: "disjoint" } : { kind: low === high ? "touch" : "overlap", low, high };
}
