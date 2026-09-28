import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { valueRoster } from "./payroll-valuation.mjs";
import { withoutGenerationalSuffix } from "./payroll-names.mjs";
import { readCsv } from "./payroll-csv.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const snapshot = JSON.parse(readFileSync(resolve(root, "data/espn-season-2026.json"), "utf8"));
const original = snapshot.teams["boston-college"].roster;
const base = { teamSlug: "boston-college", roster: original, budget: 10_500_000, qb1Name: "Mason McKenzie" };
const changed = (index, field, value) => original.map((player, i) => i === index ? { ...player, [field]: value } : player);

assert.throws(() => valueRoster({ ...base, roster: changed(0, "pos", "UNLISTED") }), /unknown position label/);
assert.throws(() => valueRoster({ ...base, roster: changed(0, "year", "") }), /unknown class label/);
assert.throws(() => valueRoster({ ...base, qb1Name: "Not On Roster" }), /0 suffix-normalized roster matches/);
assert.throws(() => valueRoster({ ...base, anchors: [{ name: original[0].name, value: 10_500_000, source: "anchor:on3", sourceUrl: "https://example.org" }] }), /anchor sum.*>= budget/);
assert.throws(() => valueRoster({ ...base, anchors: [{ name: original[0].name, value: 50_000, source: "anchor:on3-recency-unverified", sourceUrl: "https://example.org" }] }), /unverified anchor source/);
assert.throws(() => valueRoster({ ...base, budget: 100_000 }), /below \$25000 floor after correction/);
assert.equal(withoutGenerationalSuffix("Michael Hawkins Jr."), "Michael Hawkins");
assert.equal(withoutGenerationalSuffix("John Johnson III"), "John Johnson");
assert.equal(withoutGenerationalSuffix("Jane Doe, Sr."), "Jane Doe");
assert.equal(valueRoster({ ...base, qb1Name: "Mason McKenzie Jr." }).players.filter((player) => player.qb1)[0].name, "Mason McKenzie");
const suffixedRoster = original.map((player) => player.name === "Mason McKenzie" ? { ...player, name: "Mason McKenzie III" } : player);
const matchedAnchor = valueRoster({ ...base, roster: suffixedRoster, anchors: [{ name: "Mason McKenzie", value: 50_000, source: "anchor:on3", sourceUrl: "https://example.org" }] });
assert.equal(matchedAnchor.players.find((player) => player.name === "Mason McKenzie III").source, "anchor:on3");
assert.throws(() => valueRoster({ ...base, roster: changed(0, "name", "Mason McKenzie II") }), /2 suffix-normalized roster matches/);
const louisvilleRoster = snapshot.teams.louisville.roster;
assert.equal(louisvilleRoster.filter((player) => player.name === "Marlon Harbin").length, 2);
assert.equal(valueRoster({ teamSlug: "louisville", roster: louisvilleRoster, budget: 23_500_000, qb1Name: "Lincoln Kienholz" }).sum, 23_500_000);
assert.throws(() => valueRoster({
  teamSlug: "louisville", roster: louisvilleRoster, budget: 23_500_000, qb1Name: "Lincoln Kienholz",
  anchors: [{ name: "Marlon Harbin", value: 50_000, source: "anchor:on3", sourceUrl: "https://example.org" }],
}), /2 suffix-normalized roster matches/);
for (const [teamSlug, qb1Name, budget] of [
  ["byu", "Bear Bachmeier", 22_500_000],
  ["utah", "Devon Dampier", 20_000_000],
]) {
  const roster = snapshot.teams[teamSlug].roster;
  assert.equal(roster.length, 99, `${teamSlug}: exact duplicate removed`);
  assert.equal(new Set(roster.map((player) => JSON.stringify(player))).size, 99, `${teamSlug}: no exact duplicate remains`);
  assert.equal(valueRoster({ teamSlug, roster, budget, qb1Name }).sum, budget);
}
const additions = readCsv(resolve(root, "data/payroll-inputs/roster-additions.csv"));
assert.equal(additions.length, 5);
for (const addition of additions) {
  const roster = snapshot.teams[addition.team_slug].roster;
  assert.equal(roster.length, 101, `${addition.team_slug}: verified addition retained`);
  assert.equal(roster.filter((player) => player.name === addition.name && player.pos === addition.position && player.year === addition.class).length, 1);
}
console.log("PASS: unknown position, unknown class, missing QB1, anchor over budget, unverified anchor, and post-correction floor fail loudly");
console.log("PASS: BYU and Utah use 99 distinct roster records after exact duplicate removal");
console.log("PASS: five verified QB1 additions are present in their 101-player rosters");
