import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildMoneyballHistory, rankMovement } from "./moneyball-history.mjs";

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const csv = readFileSync(new URL("../data/ap-poll-2026.csv", import.meta.url), "utf8");
const current = json("../public/data/cfb-2026.json");
const saved = json("../data/spend-rank-history-2026.json");
const history = buildMoneyballHistory(csv, current, saved);
assert.equal(JSON.stringify(history), JSON.stringify(buildMoneyballHistory(csv, current, saved)), "Byte-stable rebuild");
assert.deepEqual(history, json("../public/data/moneyball-history-2026.json"), "Committed history matches its inputs");
assert.equal(history.teams.length, 68);
if (current.poll.week === 8) {
  assert.equal(history.previousPoll.week, 7);
  assert.equal(history.previousPoll.as_of, "2026-10-11");
  assert.equal(history.currentPoll.ballot.find((team) => team.name === "Boise State").rank, 21);
  assert.equal(history.currentPoll.ballot.find((team) => team.name === "Boise State").slug, null);
  assert.equal(history.teams.find((team) => team.slug === "texas").ap.change, -12);
  assert.equal(history.teams.find((team) => team.slug === "houston").ap.change, 6);
  for (const slug of ["florida", "arizona"]) {
    assert.equal(history.teams.find((team) => team.slug === slug).ap.status, "entered");
    assert.equal(history.teams.find((team) => team.slug === slug).ap.change, null);
  }
  assert(history.teams.every((team) => team.spend.change === 0), "September books did not move between these snapshots");
}

const teams = Array.from({ length: 25 }, (_, i) => ({ name: `Team ${i + 1}`, slug: `team-${i + 1}`, ap_rank: i + 1, budget_mid_m: 30 - i, spend_rank: i + 1 }));
const fixture = { season: 2026, poll: { week: 8, as_of: "2026-10-18" }, teams };
const ballot = (week, rows = teams) => rows.map((team) => `${week},${team.name},${team.ap_rank}`).join("\n");
const polls = (weeks) => "week,team,rank\n" + weeks.map((week) => ballot(week)).join("\n");
const baseline = { season: 2026, snapshots: [{ week: 7, captured_as_of: "2026-10-15", source_commit: "a".repeat(40), teams: teams.map(({ slug, spend_rank, budget_mid_m }) => ({ slug, spend_rank, budget_mid_m })) }] };
const moved = structuredClone(fixture);
[moved.teams[3].ap_rank, moved.teams[9].ap_rank] = [10, 4];
moved.teams[1].budget_mid_m = 31;
moved.teams[0].spend_rank = 2;
moved.teams[1].spend_rank = 1;
const comparison = buildMoneyballHistory("week,team,rank\n" + ballot(7) + "\n" + ballot(8, moved.teams), moved, baseline);
assert.equal(comparison.teams.find((team) => team.slug === "team-10").ap.change, 6);
assert.equal(comparison.teams.find((team) => team.slug === "team-4").ap.change, -6);
assert.equal(comparison.teams.find((team) => team.slug === "team-2").spend.change, 1, "Spend movement uses the saved book, not the current book twice");
assert.equal(comparison.previousPoll.as_of, null, "Do not invent an older publication date");
const gap = buildMoneyballHistory(polls([0, 3, 8]), fixture, baseline);
assert.equal(gap.previousPoll.week, 3, "Compare the greatest saved predecessor across missing weeks");
assert.equal(gap.spendBaseline, null, "An unrelated book snapshot cannot stand in for the predecessor");
assert(gap.teams.every((team) => team.spend.status === "unavailable"));
const first = buildMoneyballHistory(polls([8]), fixture, baseline);
assert.equal(first.previousPoll, null);
assert(first.teams.every((team) => team.ap.status === "unavailable"));
assert.equal(buildMoneyballHistory(polls([0, 8]), fixture, baseline).previousPoll.week, 0);
assert.equal(rankMovement(20, null, true).status, "entered");
assert.equal(rankMovement(null, 20, true).status, "dropped");
assert.equal(rankMovement(null, null, true).status, "unranked");
assert.equal(rankMovement(20, null, true).change, null, "Unranked is never a fictitious #26");
assert.equal(rankMovement(4, 4, true).change, 0);
assert.throws(() => buildMoneyballHistory("week,team,rank\n" + ballot(7, teams.slice(0, 24)) + "\n" + ballot(8), fixture, baseline), /25 entries/);
const duplicate = teams.map((team, i) => i === 24 ? { ...team, name: teams[0].name } : team);
assert.throws(() => buildMoneyballHistory("week,team,rank\n" + ballot(7, duplicate) + "\n" + ballot(8), fixture, baseline), /Duplicate AP names/);
const badRanks = teams.map((team, i) => i === 1 ? { ...team, ap_rank: 3 } : team);
assert.throws(() => buildMoneyballHistory("week,team,rank\n" + ballot(7, badRanks) + "\n" + ballot(8), fixture, baseline), /competition ranks/);
const tied = teams.map((team, i) => i === 14 ? { ...team, ap_rank: 14 } : team);
assert.doesNotThrow(() => buildMoneyballHistory("week,team,rank\n" + ballot(7, tied) + "\n" + ballot(8), fixture, baseline), "Real AP ties preserve competition ranks");
const badBook = structuredClone(baseline);
badBook.snapshots[0].teams[0].spend_rank = 4;
assert.throws(() => buildMoneyballHistory(polls([7, 8]), fixture, badBook), /historical spend rank/);
console.log("Moneyball history passed: saved AP and spend movement, entrants/exits, real ties, gaps, unavailable baselines, strict validation and deterministic output.");
