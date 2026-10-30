import assert from "node:assert/strict";
import { data } from "../lib/data";
import { seasonSnapshot, type SeasonSnapshot } from "../lib/season-snapshot";
import { scoreboard, type Scoreboard } from "../lib/scores";
import { buildTeamContexts, budgetRangeOverlap, recordLabel, savedWeekLabel } from "../lib/team-context";
import { groupRoster, type DisplayPlayer } from "../lib/roster-display";

const teams = data.teams.slice(0, 3);
const fixtureData = { ...data, teams, poll: { ...data.poll, as_of: "2026-10-25" }, fpi: { ...data.fpi, as_of: "2026-10-26" } };
const fixtureSeason: SeasonSnapshot = { ...seasonSnapshot, as_of: "2026-10-27", teams: {
  [teams[0].slug]: { ...seasonSnapshot.teams[teams[0].slug], record: "5-2", games: 7 },
  [teams[1].slug]: { ...seasonSnapshot.teams[teams[1].slug], record: "0-0", games: 0 },
} };
const fixtureScores: Scoreboard = { ...scoreboard, as_of: "2026-10-28", week: 8, games: [{
  id: "synthetic", date: "2026-10-24T19:00Z", final: true,
  home: { slug: teams[0].slug, name: teams[0].name, abbr: teams[0].abbr, score: 31, winner: true, rank: null },
  away: { slug: teams[1].slug, name: teams[1].name, abbr: teams[1].abbr, score: 17, winner: false, rank: null },
}] };
const context = buildTeamContexts(fixtureData, fixtureSeason, fixtureScores);
assert.equal(recordLabel(context.teams[teams[0].slug].record), "5–2");
assert.equal(context.teams[teams[0].slug].games, 7);
assert.equal(recordLabel(context.teams[teams[1].slug].record), "0–0", "explicit source zero remains available");
assert.equal(recordLabel(context.teams[teams[2].slug].record), "Unavailable", "missing record is never invented as 0–0");
assert.equal(context.teams[teams[2].slug].games, null);
assert.equal(savedWeekLabel(context.teams[teams[0].slug].savedWeek), `W 31–17 vs ${teams[1].name}`);
assert.equal(savedWeekLabel(context.teams[teams[1].slug].savedWeek), `L 17–31 at ${teams[0].name}`);
assert.equal(savedWeekLabel(context.teams[teams[2].slug].savedWeek), "No game in the Week 8 snapshot");
const swapped: Scoreboard = { ...fixtureScores, games: fixtureScores.games.map((game) => ({ ...game,
  home: { ...game.home, score: 10, winner: false }, away: { ...game.away, score: 20, winner: true },
})) };
const reverse = buildTeamContexts(fixtureData, fixtureSeason, swapped);
assert.equal(savedWeekLabel(reverse.teams[teams[0].slug].savedWeek), `L 10–20 vs ${teams[1].name}`);
assert.equal(savedWeekLabel(reverse.teams[teams[1].slug].savedWeek), `W 20–10 at ${teams[0].name}`);
assert.deepEqual(context.sources, {
  record: { name: fixtureSeason.source, asOf: "2026-10-27" },
  score: { name: fixtureScores.source, asOf: "2026-10-28" },
  poll: { name: fixtureData.poll.name, asOf: "2026-10-25" },
  fpi: { name: fixtureData.fpi.name, asOf: "2026-10-26" },
}, "each source keeps its own date");
for (const [season, scores] of [[null, null], [{ ...fixtureSeason, season: 2025 }, { ...fixtureScores, season: 2025 }]] as const) {
  const missing = buildTeamContexts(fixtureData, season, scores);
  assert.equal(missing.sources.record, null);
  assert.equal(missing.sources.score, null);
  for (const team of Object.values(missing.teams)) {
    assert.equal(recordLabel(team.record), "Unavailable");
    assert.equal(savedWeekLabel(team.savedWeek), "Unavailable");
    assert.equal(team.games, null);
  }
}
assert.equal(buildTeamContexts(fixtureData, fixtureSeason, { ...fixtureScores, games: [...fixtureScores.games, ...fixtureScores.games] }).teams[teams[0].slug].savedWeek.status,
  "unavailable", "ambiguous duplicate games do not become a guessed latest result");
console.log("  ok home/away wins/losses, explicit zero, no saved-week game, unavailable/year mismatch and independent source dates");

const budget = (low: number, high: number) => ({ budget_low_m: low, budget_high_m: high });
assert.deepEqual(budgetRangeOverlap(budget(40, 50), budget(45, 55)), { kind: "overlap", low: 45, high: 50 });
assert.deepEqual(budgetRangeOverlap(budget(10, 20), budget(20, 30)), { kind: "touch", low: 20, high: 20 });
assert.deepEqual(budgetRangeOverlap(budget(10, 15), budget(20, 25)), { kind: "disjoint" });
assert.deepEqual(budgetRangeOverlap(budget(10.5, 20.5), budget(11.5, 12.5)), { kind: "overlap", low: 11.5, high: 12.5 });
console.log("  ok exact budget overlap, point contact, disjoint and contained decimal ranges");

const player = (name: string, jersey: string, pos: string, side: string): DisplayPlayer => ({ name, jersey, pos, side, year: "SR" });
const roster = [
  player("Same Name", "00", "QB", "offense"), player("Same Name", "1", "QB", "offense"),
  player("Same Name", "00", "QB", "offense"), player("Álvaro Long-Original Name Jr.", "7", "PR", "special"),
  player("Unknown position", "", "ATH", "offense"), player("Injured Quarterback", "12", "QB", "injured"),
  player("Suspended Player", "15", "DL", "suspended"), player("Practice Player", "8", "WR", "practice"),
  player("Reserve Player", "9", "TE", "reserve-list"),
];
const frozen = JSON.stringify(roster);
const grouped = groupRoster(roster);
const entries = grouped.flatMap((unit) => unit.groups.flatMap((group) => group.players));
assert.equal(entries.length, roster.length);
assert.equal(new Set(entries.map((entry) => entry.key)).size, roster.length, "same names, different jerseys and exact duplicate entries retain identity");
assert(entries.every((entry) => roster.includes(entry.player)), "raw player objects are retained");
assert.equal(JSON.stringify(roster), frozen, "display never mutates source names, jerseys, positions, classes or status");
for (const label of ["Offense", "Special teams", "Other", "Injured", "Suspended", "Practice", "Status: reserve-list"]) assert(grouped.some((unit) => unit.label === label), label);
assert(grouped.find((unit) => unit.label === "Special teams")!.groups.some((group) => group.label === "Returners"), "PR display never reuses payroll normalization");
assert(grouped.find((unit) => unit.label === "Injured")!.groups.some((group) => group.label === "Quarterbacks"));
const matching = groupRoster(roster, "alvaro").flatMap((unit) => unit.groups.flatMap((group) => group.players));
assert.deepEqual(matching.map((entry) => entry.player.name), ["Álvaro Long-Original Name Jr."]);
assert.equal(groupRoster(roster, "does not exist").length, 0);
assert.deepEqual(groupRoster(roster, "  "), grouped);
console.log("  ok grouping/search preserves every raw roster record, status and row identity, including unknown positions");

const live = buildTeamContexts(data, seasonSnapshot, scoreboard);
assert.equal(Object.keys(live.teams).length, data.teams.length);
const serialized = JSON.stringify(live);
assert(Buffer.byteLength(serialized) < 64 * 1024, "all-team comparison context stays compact");
for (const forbidden of ['"roster"', '"points_for"', '"pass_yards"', "Akili Smith Jr.", "Kyle Alt", "roster-additions"]) assert(!serialized.includes(forbidden), `compact boundary excludes ${forbidden}`);
let playerCount = 0;
for (const team of data.teams) {
  const source = seasonSnapshot.teams[team.slug];
  const displayed = groupRoster(source.roster).flatMap((unit) => unit.groups.flatMap((group) => group.players));
  assert.equal(displayed.length, source.roster.length, `${team.slug}: every row retained`);
  assert.equal(new Set(displayed.map((entry) => entry.key)).size, source.roster.length);
  playerCount += displayed.length;
}
console.log(`  ok ${data.teams.length} compact contexts (${Buffer.byteLength(serialized)} bytes) and ${playerCount} original roster entries retained`);
console.log("All team-context tests passed.");
