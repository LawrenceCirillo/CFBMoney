import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../data/scheme-tags.json", import.meta.url));
const output = fileURLToPath(new URL("../data/scheme-tags-client.json", import.meta.url));
const teamsPath = fileURLToPath(new URL("../data/teams.json", import.meta.url));
const raw = JSON.parse(readFileSync(source, "utf8"));
const teams = JSON.parse(readFileSync(teamsPath, "utf8"));
const offTags = new Set(["air-raid", "spread", "pro-style", "power-run"]);
const defTags = new Set(["4-3", "3-4", "4-2-5", "3-3-5", "multiple"]);
const known = new Set(teams.map((team) => team.slug));
const bySlug = {};
for (const team of raw.teams) {
  if (!known.has(team.slug) || bySlug[team.slug]) throw new Error(`Unexpected or duplicate scheme tag: ${team.slug}`);
  if (!offTags.has(team.offTag) || !defTags.has(team.defTag)) throw new Error(`Invalid scheme tag: ${team.slug}`);
  bySlug[team.slug] = { offTag: team.offTag, defTag: team.defTag };
}
if (Object.keys(bySlug).length !== known.size) {
  throw new Error(`Scheme tags cover ${Object.keys(bySlug).length}/${known.size} programs`);
}
writeFileSync(output, `${JSON.stringify({ version: raw._meta.version, teams: bySlug }, null, 2)}\n`);
console.log(`cfb-money: built ${known.size} public scheme tags without review notes`);
