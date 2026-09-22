// Pull the latest completed week's final scores for the 68 programs.
// Writes data/espn-scores-2026.json. The site reads that file; it does not call ESPN on page load.
//
//   node scripts/fetch-espn-scores.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const teams = JSON.parse(readFileSync(join(root, "data/teams.json"), "utf8"));
const byEspn = new Map(teams.map((team) => [String(team.espn_id), team]));

const SCOREBOARD =
  "https://site.web.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard";

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function ymd(time) {
  const date = new Date(time);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}${month}${day}`;
}

function datesBetween(startIso, endIso) {
  const dates = [];
  const end = new Date(endIso).getTime();
  for (let time = new Date(startIso).getTime(); time < end; time += 24 * 60 * 60 * 1000) {
    dates.push(ymd(time));
  }
  return [...new Set(dates)];
}

function rankOf(competitor) {
  const current = competitor.curatedRank?.current;
  if (!Number.isInteger(current) || current < 1 || current > 25) return null;
  return current;
}

function sideOf(competitor) {
  const ours = byEspn.get(String(competitor.team?.id));
  const score = Number(competitor.score);
  if (!Number.isFinite(score)) throw new Error(`bad score for ${competitor.team?.displayName}`);
  return {
    slug: ours?.slug ?? null,
    abbr: ours?.abbr ?? competitor.team?.abbreviation ?? "—",
    name: ours?.name ?? competitor.team?.shortDisplayName ?? competitor.team?.displayName ?? "—",
    score,
    winner: competitor.winner === true,
    rank: rankOf(competitor),
  };
}

function gameOf(event) {
  const competition = event.competitions?.[0];
  if (!competition || competition.status?.type?.state !== "post") return null;
  const competitors = competition.competitors ?? [];
  if (competitors.length !== 2) return null;
  if (!competitors.some((competitor) => byEspn.has(String(competitor.team?.id)))) return null;
  const away = competitors.find((competitor) => competitor.homeAway === "away");
  const home = competitors.find((competitor) => competitor.homeAway === "home");
  if (!away || !home) return null;
  return {
    id: String(event.id),
    date: event.date,
    away: sideOf(away),
    home: sideOf(home),
  };
}

async function gamesFor(week) {
  const seen = new Set();
  const games = [];
  for (const date of datesBetween(week.startDate, week.endDate)) {
    const board = await getJson(`${SCOREBOARD}?dates=${date}&limit=400`);
    for (const event of board.events ?? []) {
      if (seen.has(event.id)) continue;
      const game = gameOf(event);
      if (!game) continue;
      seen.add(event.id);
      games.push(game);
    }
  }
  return games;
}

function lead(game) {
  const ranks = [game.away.rank, game.home.rank].filter((rank) => rank != null);
  return ranks.length > 0 ? Math.min(...ranks) : 99;
}

const probe = await getJson(`${SCOREBOARD}?limit=1`);
const regular = probe.leagues?.[0]?.calendar?.find((entry) => entry.label === "Regular Season");
if (!regular?.entries?.length) throw new Error("ESPN calendar has no regular season");

const now = Date.now();
const started = regular.entries.filter((week) => new Date(week.startDate).getTime() <= now);
let chosen = null;
let games = [];
for (const week of [...started].reverse()) {
  const found = await gamesFor(week);
  if (found.length > 0) {
    chosen = week;
    games = found;
    break;
  }
}
if (!chosen) throw new Error("no completed week with final scores");

games.sort((a, b) => lead(a) - lead(b) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

const seenTeams = new Set();
for (const game of games) {
  if (game.away.slug) seenTeams.add(game.away.slug);
  if (game.home.slug) seenTeams.add(game.home.slug);
}
const missing = teams.filter((team) => !seenTeams.has(team.slug)).map((team) => team.abbr);
if (missing.length > 0) throw new Error(`week ${chosen.value} is missing ${missing.join(", ")}`);

const file = {
  source: "ESPN",
  url: "https://www.espn.com/college-football/scoreboard",
  as_of: new Date().toISOString().slice(0, 10),
  week: Number(chosen.value),
  label: chosen.label,
  range: String(chosen.detail).replace("-", "–"),
  note: "Final scores for the 68 programs in the latest completed week. A game is listed once.",
  games,
};
writeFileSync(join(root, "data/espn-scores-2026.json"), JSON.stringify(file, null, 2) + "\n");
console.log(`wrote week ${file.week} (${file.range}), ${games.length} games, ${seenTeams.size} teams`);
