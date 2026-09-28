import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readCsv } from "./payroll-csv.mjs";
import { valueRoster } from "./payroll-valuation.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const snapshot = JSON.parse(readFileSync(resolve(root, "data/espn-season-2026.json"), "utf8"));
const fixtures = [
  { slug: "iowa", budget: 19_000_000, qb1: "Hank Brown", anchors: [
    { name: "Kamari Moulton", value: 385_000, source: "anchor:on3" },
    { name: "Tradon Bessinger", value: 310_000, source: "anchor:on3-recency-unverified" },
  ] },
  { slug: "boston-college", budget: 10_500_000, qb1: "Mason McKenzie", anchors: [] },
  // The supplied pilot was made at $60M; the current midpoint is $51.5M.
  // This checks the historical fixture, not a production Ohio State payroll.
  { slug: "ohio-state", budget: 60_000_000, qb1: "Julian Sayin", anchors: [
    { name: "Jeremiah Smith", value: 5_000_000, source: "anchor:on3-name-unverified" },
  ] },
];

let totalChecked = 0;
for (const fixture of fixtures) {
  const actual = valueRoster({
    teamSlug: fixture.slug, roster: snapshot.teams[fixture.slug].roster,
    budget: fixture.budget, qb1Name: fixture.qb1,
    anchors: fixture.anchors, allowLegacyAnchorSources: true,
  });
  const expected = readCsv(resolve(root, `tests/fixtures/payrolls/${fixture.slug}-payroll-pilot.csv`));
  assert.equal(expected.length, 100, `${fixture.slug}: fixture rows`);
  assert.equal(actual.players.length, 100, `${fixture.slug}: calculated rows`);
  const expectedByName = new Map(expected.map((row) => [row.name, row]));
  assert.equal(expectedByName.size, 100, `${fixture.slug}: duplicate fixture name`);
  for (const player of actual.players) {
    const row = expectedByName.get(player.name);
    assert.ok(row, `${fixture.slug}: ${player.name} absent from fixture`);
    assert.deepEqual(
      { pos: player.position, class: player.class, valuation: String(player.valuation), source: player.source },
      { pos: row.pos, class: row.class, valuation: row.valuation, source: row.source },
      `${fixture.slug}: ${player.name}`,
    );
    totalChecked++;
  }
  console.log(`PASS ${fixture.slug}: 100/100 exact player rows; sum $${actual.sum.toLocaleString("en-US")}`);
}
console.log(`PASS: ${totalChecked} exact fixture rows across three teams`);
