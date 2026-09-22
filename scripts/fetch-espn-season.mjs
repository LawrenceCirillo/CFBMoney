// Pull a dated ESPN snapshot of 2026 rosters and team stats for the 68 programs.
// Writes data/espn-season-2026.json. The site reads that file; it does not call ESPN on page load.
//
//   node scripts/fetch-espn-season.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const teams = JSON.parse(readFileSync(join(root, "data/teams.json"), "utf8"));

const SIDES = {
  offense: "offense",
  defense: "defense",
  specialTeam: "special",
  injuredReserveOrOut: "injured",
  suspended: "suspended",
  practiceSquad: "practice",
};

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function num(categories, category, name) {
  const cat = categories.find((c) => c.name === category);
  const stat = cat?.stats.find((s) => s.name === name);
  return stat == null ? null : stat.value;
}

function recordOf(team) {
  const total = team.record?.items?.find((item) => item.type === "total");
  if (!total) throw new Error(`no record for ${team.displayName}`);
  const stat = (name) => total.stats.find((s) => s.name === name)?.value;
  return {
    record: total.summary,
    games: stat("gamesPlayed"),
    points_for: stat("pointsFor"),
    points_against: stat("pointsAgainst"),
  };
}

function rosterOf(payload) {
  const players = [];
  for (const group of payload.athletes ?? []) {
    const side = SIDES[group.position];
    if (!side) continue;
    for (const athlete of group.items ?? []) {
      if (!athlete.displayName) continue;
      players.push({
        name: athlete.displayName,
        jersey: athlete.jersey ?? "",
        pos: athlete.position?.abbreviation ?? "",
        year: athlete.experience?.abbreviation ?? "",
        side,
      });
    }
  }
  return players;
}

async function pull(team) {
  const base = `https://site.web.api.espn.com/apis/site/v2/sports/football/college-football/teams/${team.espn_id}`;
  const [info, statistics, roster] = await Promise.all([
    getJson(base),
    getJson(`${base}/statistics`),
    getJson(`${base}/roster`),
  ]);
  const categories = statistics.results?.stats?.categories;
  if (!categories) throw new Error(`no stats for ${team.name}`);
  const rec = recordOf(info.team);
  const season = {
    ...rec,
    pass_yards: num(categories, "passing", "passingYards"),
    rush_yards: num(categories, "rushing", "rushingYards"),
    takeaways: num(categories, "miscellaneous", "totalTakeaways"),
    giveaways: num(categories, "miscellaneous", "totalGiveaways"),
    roster: rosterOf(roster),
  };
  for (const key of ["games", "points_for", "points_against", "pass_yards", "rush_yards", "takeaways", "giveaways"]) {
    if (typeof season[key] !== "number" || !Number.isFinite(season[key])) {
      throw new Error(`${team.name} missing ${key}`);
    }
  }
  if (!season.record || season.roster.length < 40) {
    throw new Error(`${team.name} roster too small (${season.roster.length}) or missing record`);
  }
  return season;
}

const out = {};
const queue = [...teams];
const workers = Array.from({ length: 4 }, async () => {
  while (queue.length) {
    const team = queue.shift();
    out[team.slug] = await pull(team);
    console.log(`${team.slug} ${out[team.slug].record} roster ${out[team.slug].roster.length}`);
  }
});
await Promise.all(workers);

if (Object.keys(out).length !== teams.length) {
  throw new Error(`expected ${teams.length} teams, wrote ${Object.keys(out).length}`);
}

const file = {
  source: "ESPN",
  url: "https://www.espn.com/college-football/teams",
  as_of: "2026-09-22",
  season: 2026,
  note: "2026 regular-season rosters and team totals through games played as of Sept. 22.",
  teams: out,
};
writeFileSync(join(root, "data/espn-season-2026.json"), JSON.stringify(file) + "\n");
console.log(`wrote data/espn-season-2026.json (${teams.length} teams)`);
