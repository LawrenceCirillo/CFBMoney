import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readCsv } from "./payroll-csv.mjs";
import { matchingRosterPlayers } from "./payroll-names.mjs";
import { valueRoster, POSITION_NORMALIZATION, POSITION_WEIGHTS_TWICE, CLASS_MULTIPLIERS_TWENTIETHS } from "./payroll-valuation.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const snapshot = JSON.parse(readFileSync(resolve(root, "data/espn-season-2026.json"), "utf8"));
const budgets = JSON.parse(readFileSync(resolve(root, "public/data/cfb-2026.json"), "utf8"));
const qb1Rows = readCsv(resolve(root, "data/payroll-inputs/qb1-designations.csv"));
const anchorRows = readCsv(resolve(root, "data/payroll-inputs/anchors.csv"));
const auditOnly = process.argv.includes("--audit");
const globalErrors = [];

const budgetBySlug = new Map();
for (const team of budgets.teams) {
  if (budgetBySlug.has(team.slug)) globalErrors.push(`duplicate budget slug ${team.slug}`);
  budgetBySlug.set(team.slug, team);
}
const qb1BySlug = new Map();
for (const row of qb1Rows) {
  if (qb1BySlug.has(row.team_slug)) globalErrors.push(`duplicate QB1 designation for ${row.team_slug}`);
  qb1BySlug.set(row.team_slug, row.qb1_name);
  if (!budgetBySlug.has(row.team_slug)) globalErrors.push(`QB1 designation for unknown team ${row.team_slug}`);
}
if (budgetBySlug.size !== 68) globalErrors.push(`expected 68 budget teams; got ${budgetBySlug.size}`);
if (Object.keys(snapshot.teams).length !== 68) globalErrors.push(`expected 68 roster teams; got ${Object.keys(snapshot.teams).length}`);
if (qb1BySlug.size !== 68) globalErrors.push(`expected 68 QB1 designations; got ${qb1BySlug.size}`);

const anchorsBySlug = new Map();
const reviewQueue = [];
let on3ExactRosterMatches = 0;
let on3EligibleMatches = 0;
for (const row of anchorRows) {
  const roster = snapshot.teams[row.team_slug]?.roster;
  if (!budgetBySlug.has(row.team_slug)) globalErrors.push(`anchor ${row.name}: unknown team ${row.team_slug}`);
  const matchCount = roster ? matchingRosterPlayers(roster, row.name).length : 0;
  if (row.source === "anchor:on3" && matchCount === 1) on3ExactRosterMatches++;
  const reviewReasons = [];
  if (matchCount !== 1) reviewReasons.push(`${matchCount} suffix-normalized name + school roster matches; expected one`);
  if (row.review_flag) reviewReasons.push(row.review_flag);
  if (!row.source_url) reviewReasons.push("missing source URL");
  if (row.source !== "anchor:on3" && row.source !== "anchor:reported") reviewReasons.push(`unsupported source ${row.source}`);
  const value = Number(row.value);
  if (!Number.isSafeInteger(value) || value < 25_000) globalErrors.push(`anchor ${row.name}: invalid value ${row.value}`);
  if (reviewReasons.length) {
    reviewQueue.push({ teamSlug: row.team_slug, name: row.name, value: row.value, reasons: reviewReasons });
    continue;
  }
  if (row.source === "anchor:on3") on3EligibleMatches++;
  const teamAnchors = anchorsBySlug.get(row.team_slug) ?? [];
  teamAnchors.push({ name: row.name, value, source: row.source, sourceUrl: row.source_url });
  anchorsBySlug.set(row.team_slug, teamAnchors);
}

const results = [];
const reports = [];
for (const [slug, team] of [...budgetBySlug].sort(([a], [b]) => a.localeCompare(b))) {
  const roster = snapshot.teams[slug]?.roster;
  const errors = [];
  if (!roster) errors.push("roster missing from local snapshot");
  else {
    for (const player of roster) {
      const original = player.pos;
      const normalized = POSITION_NORMALIZATION[original] ?? original;
      if (!Object.hasOwn(POSITION_WEIGHTS_TWICE, normalized)) errors.push(`${player.name}: unknown position ${JSON.stringify(original)}`);
      if (!Object.hasOwn(CLASS_MULTIPLIERS_TWENTIETHS, player.year)) errors.push(`${player.name}: unknown class ${JSON.stringify(player.year)}`);
    }
  }
  const qb1Name = qb1BySlug.get(slug);
  if (!qb1Name) errors.push("no QB1 designation");
  else if (roster) {
    const matches = matchingRosterPlayers(roster, qb1Name);
    if (matches.length !== 1) errors.push(`QB1 ${JSON.stringify(qb1Name)} has ${matches.length} suffix-normalized roster matches; expected exactly one`);
  }
  const midpoint = team.budget_mid_m;
  const budget = Number.isFinite(midpoint) ? Math.round(midpoint * 1_000_000) : NaN;
  if (!Number.isSafeInteger(budget) || budget <= 0 || Math.abs(budget / 1_000_000 - midpoint) > 1e-9) errors.push(`invalid budget_mid_m ${JSON.stringify(midpoint)}`);
  const anchors = anchorsBySlug.get(slug) ?? [];
  if (Number.isSafeInteger(budget) && anchors.reduce((sum, anchor) => sum + anchor.value, 0) >= budget) errors.push("anchors >= budget");
  if (errors.length) {
    reports.push({ slug, budget, qb1Name, anchorCount: anchors.length, errors });
    continue;
  }
  try {
    const result = valueRoster({ teamSlug: slug, roster, budget, qb1Name, anchors });
    results.push(result);
    reports.push({ slug, budget, qb1Name, anchorCount: result.anchorCount, floorHits: result.floorHits, sum: result.sum, errors: [] });
  } catch (error) {
    reports.push({ slug, budget, qb1Name, anchorCount: anchors.length, errors: [error.message] });
  }
}
for (const slug of Object.keys(snapshot.teams)) if (!budgetBySlug.has(slug)) globalErrors.push(`roster team ${slug} has no budget`);

console.log(`Payroll verification — ${budgets.season}; roster snapshot ${snapshot.as_of}; mode ${auditOnly ? "audit" : "build"}`);
console.log(`Teams: ${reports.length}; On3 suffix-normalized roster matches: ${on3ExactRosterMatches}; eligible On3 anchors: ${on3EligibleMatches}; human review queue: ${reviewQueue.length}`);
for (const row of reports) {
  const budgetLabel = Number.isFinite(row.budget) ? `$${row.budget.toLocaleString("en-US")}` : "invalid";
  const status = row.errors.length ? `FAIL (${row.errors.length} errors)` : `PASS sum=$${row.sum.toLocaleString("en-US")} floor=${row.floorHits}`;
  console.log(`${row.slug.padEnd(20)} budget=${budgetLabel.padEnd(13)} QB1=${(row.qb1Name ?? "MISSING").padEnd(26)} anchors=${row.anchorCount} ${status}`);
  for (const error of row.errors) console.log(`  - ${error}`);
}
for (const error of globalErrors) console.log(`GLOBAL ERROR: ${error}`);
for (const item of reviewQueue) console.log(`REVIEW ${item.teamSlug} / ${item.name} / $${item.value}: ${item.reasons.join("; ")}`);

const failedTeams = reports.filter((report) => report.errors.length).length;
if (failedTeams || globalErrors.length) {
  console.error(`PAYROLL BUILD BLOCKED: ${failedTeams} team(s) failed validation; ${globalErrors.length} global error(s). No payroll files written.`);
  process.exitCode = 1;
} else if (auditOnly) {
  console.log("AUDIT PASSED: all 68 team sums equal their exact midpoint budgets. No files written (--audit).");
} else {
  const outDir = resolve(root, "data/payrolls");
  mkdirSync(outDir, { recursive: true });
  for (const result of results) writeFileSync(resolve(outDir, `${result.teamSlug}.json`), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`BUILD PASSED: wrote ${results.length} team payrolls to data/payrolls/`);
}
