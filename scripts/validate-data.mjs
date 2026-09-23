// Read-only coverage and chronology checks for every committed 2026 source.
//   node scripts/validate-data.mjs

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectWeekGames, latestEndedWeek, queryDates } from "./fetch-espn-scores.mjs";
import { makeSeasonFile, writeSeasonFile } from "./fetch-espn-season.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEASON = 2026;

function fail(message) {
  throw new Error(message);
}

function readJson(base, path) {
  return JSON.parse(readFileSync(join(base, path), "utf8"));
}

function csv(text, label) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  const headers = lines.shift()?.split(",").map((header) => header.trim());
  if (!headers?.length) fail(`${label} has no header`);
  return lines.map((line, index) => {
    const cells = line.split(",").map((cell) => cell.trim());
    if (cells.length !== headers.length) fail(`${label} row ${index + 1} has ${cells.length} cells`);
    return Object.fromEntries(headers.map((header, i) => [header, cells[i]]));
  });
}

function date(value, label, today) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(`${label} must be an ISO date`);
  }
  const time = Date.parse(value + "T00:00:00Z");
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value ||
      Number(value.slice(0, 4)) !== SEASON || value > today) {
    fail(`${label} is invalid or in the future: ${value}`);
  }
  return time;
}

function unique(values, label) {
  if (new Set(values).size !== values.length) fail(`${label} contains duplicates`);
}

function nonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) fail(`${label} must be nonnegative`);
}

function validateSources(sources, today) {
  const { teams, budgets, poll, fpi, scores, season } = sources;
  if (!Array.isArray(teams) || teams.length !== 68) fail("teams.json must contain 68 programs");
  for (const team of teams) {
    if (!team.slug || !team.name || !team.espn_id || !team.abbr) fail("team metadata is incomplete");
  }
  unique(teams.map((team) => team.slug), "team slugs");
  unique(teams.map((team) => team.name), "team names");
  unique(teams.map((team) => String(team.espn_id)), "ESPN team IDs");
  const slugs = new Set(teams.map((team) => team.slug));
  const ids = new Set(teams.map((team) => String(team.espn_id)));
  const names = new Set(teams.map((team) => team.name));

  if (budgets.length !== 68) fail("budget CSV must contain 68 programs");
  unique(budgets.map((row) => row.team), "budget teams");
  if (budgets.some((row) => !names.has(row.team) ||
      !(Number(row.budget_low_m) > 0) ||
      !(Number(row.budget_high_m) >= Number(row.budget_low_m)))) {
    fail("budget CSV has unknown programs or invalid ranges");
  }

  const pollDate = date(poll.asOf, "AP as_of", today);
  if (!poll.note) fail("AP poll note is missing");
  if (!poll.rows.length) fail("AP poll has no rows");
  for (const row of poll.rows) {
    const week = Number(row.week);
    const rank = Number(row.rank);
    if (!names.has(row.team) || !Number.isInteger(week) || week < 0 ||
        !Number.isInteger(rank) || rank < 1 || rank > 25) {
      fail("AP poll has an unknown team, week, or rank");
    }
  }
  const pollWeek = Math.max(...poll.rows.map((row) => Number(row.week)));
  if (pollWeek < 1 || pollWeek > 16) fail("AP poll current week is invalid");
  const current = poll.rows.filter((row) => Number(row.week) === pollWeek);
  if (current.length !== 25) fail(`AP week ${pollWeek} must contain 25 teams`);
  unique(current.map((row) => row.team), "current AP teams");
  unique(current.map((row) => Number(row.rank)), "current AP ranks");
  if (current.some((row) => Number(row.rank) < 1 || Number(row.rank) > 25)) {
    fail("current AP ranks must be 1–25");
  }

  if (fpi.source !== "ESPN FPI" || fpi.season !== SEASON || !fpi.note) {
    fail("FPI source metadata is incomplete");
  }
  const fpiDate = date(fpi.as_of, "FPI as_of", today);
  if (Object.keys(fpi.teams ?? {}).length !== 68 ||
      Object.keys(fpi.teams).some((id) => !ids.has(id))) {
    fail("FPI must cover exactly the 68 ESPN team IDs");
  }
  for (const [id, row] of Object.entries(fpi.teams)) {
    if (!Number.isInteger(row.played) || row.played < 1 ||
        !Number.isInteger(row.remaining) || row.remaining < 1) {
      fail(`FPI ranks are invalid for ESPN team ${id}`);
    }
  }

  if (scores.source !== "ESPN" || scores.season !== SEASON ||
      !Number.isInteger(scores.week) || scores.week < 1 || scores.week > 16 ||
      !Array.isArray(scores.games) || !scores.games.length || !scores.note) {
    fail("score snapshot metadata is invalid");
  }
  const scoreDate = date(scores.as_of, "scores as_of", today);
  unique(scores.games.map((game) => game.id), "score event IDs");
  const participating = new Set();
  let lastGameDay = "";
  for (const game of scores.games) {
    const gameTime = Date.parse(game.date);
    if (!Number.isFinite(gameTime) || new Date(gameTime).getUTCFullYear() !== SEASON) {
      fail(`score event ${game.id} has a date after its snapshot`);
    }
    const gameDay = new Date(gameTime).toISOString().slice(0, 10);
    if (gameDay > scores.as_of) fail(`score event ${game.id} is newer than its snapshot`);
    if (gameDay > lastGameDay) lastGameDay = gameDay;
    if (!/^\d+$/.test(String(game.id)) || game.final !== true ||
        !game.away || !game.home || game.away.slug === game.home.slug) {
      fail(`score event ${game.id} is malformed or not final`);
    }
    for (const side of [game.away, game.home]) {
      if (side.slug !== null && !slugs.has(side.slug)) fail(`score event ${game.id} has an unknown team`);
      if (!side.name || !side.abbr || !Number.isSafeInteger(side.score) || side.score < 0 ||
          typeof side.winner !== "boolean") {
        fail(`score event ${game.id} has an invalid team or score`);
      }
      if (side.slug) participating.add(side.slug);
    }
    if (game.away.score === game.home.score ||
        game.away.winner === game.home.winner ||
        game.away.winner !== (game.away.score > game.home.score)) {
      fail(`score event ${game.id} has an invalid final result`);
    }
  }
  if (scores.week > pollWeek + 1 || pollWeek > scores.week + 1) {
    fail(`AP week ${pollWeek} and score week ${scores.week} differ by more than one`);
  }

  if (season.source !== "ESPN" || season.season !== SEASON || !season.note) {
    fail("season snapshot metadata is invalid");
  }
  const seasonDate = date(season.as_of, "season as_of", today);
  const seasonLabel = new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(new Date(season.as_of + "T00:00:00Z"));
  if (!season.note.includes(seasonLabel)) fail("season snapshot note does not match its date");
  if (fpi.as_of < lastGameDay || season.as_of < lastGameDay) {
    fail(`FPI or roster snapshot predates the latest scored game (${lastGameDay})`);
  }
  if (Object.keys(season.teams ?? {}).length !== 68 ||
      Object.keys(season.teams).some((slug) => !slugs.has(slug))) {
    fail("season snapshot must cover exactly 68 programs");
  }
  for (const [slug, row] of Object.entries(season.teams)) {
    if (!row.record || !Array.isArray(row.roster) || row.roster.length < 40) {
      fail(`${slug} has a missing record or short roster`);
    }
    for (const key of ["games", "points_for", "points_against", "pass_yards", "rush_yards", "takeaways", "giveaways"]) {
      nonNegative(row[key], `${slug} ${key}`);
    }
    if (row.roster.some((player) => !player.name || !player.pos ||
        !["offense", "defense", "special", "injured", "suspended", "practice"].includes(player.side))) {
      fail(`${slug} has a malformed roster player`);
    }
  }

  return {
    pollWeek, scoreWeek: scores.week, games: scores.games.length,
    participatingTeams: participating.size, byeTeams: teams.length - participating.size,
    dates: { ap: poll.asOf, fpi: fpi.as_of, scores: scores.as_of, rosters: season.as_of },
    skewDays: {
      fpiFromAp: Math.round((fpiDate - pollDate) / 86_400_000),
      scoresFromAp: Math.round((scoreDate - pollDate) / 86_400_000),
      rostersFromAp: Math.round((seasonDate - pollDate) / 86_400_000),
    },
  };
}

function loadSources(base) {
  const pollText = readFileSync(join(base, "data/ap-poll-2026.csv"), "utf8");
  const asOf = pollText.match(/^# as_of:\s*(.+)$/m)?.[1]?.trim();
  const note = pollText.match(/^# note:\s*(.+)$/m)?.[1]?.trim();
  return {
    teams: readJson(base, "data/teams.json"),
    budgets: csv(readFileSync(join(base, "data/athletic-nil-budgets-2026.csv"), "utf8"), "budget CSV"),
    poll: { asOf, note, rows: csv(pollText, "AP poll") },
    fpi: readJson(base, "data/espn-fpi-sos-2026.json"),
    scores: readJson(base, "data/espn-scores-2026.json"),
    season: readJson(base, "data/espn-season-2026.json"),
  };
}

export function validateData(base = root, today = new Date().toISOString().slice(0, 10)) {
  return validateSources(loadSources(base), today);
}

function runFixture(name) {
  if (name === "season-date") {
    const old = makeSeasonFile({}, new Date("2026-09-23T05:00:00Z"));
    const next = makeSeasonFile({}, new Date("2026-10-01T05:00:00Z"));
    const path = join(tmpdir(), `cfb-season-date-${randomUUID()}.json`);
    try {
      writeSeasonFile(path, old);
      const savedOld = JSON.parse(readFileSync(path, "utf8"));
      assert.equal(savedOld.as_of, "2026-09-23");
      assert.match(savedOld.note, /Sep 23, 2026/);
      writeSeasonFile(path, next);
      const savedNext = JSON.parse(readFileSync(path, "utf8"));
      assert.equal(savedNext.as_of, "2026-10-01");
      assert.match(savedNext.note, /Oct 1, 2026/);
    } finally {
      if (existsSync(path)) unlinkSync(path);
    }
    console.log("season-date fixture passed");
    return;
  }
  if (name === "bad-data") {
    const sources = loadSources(root);
    sources.scores.games.push({ ...sources.scores.games[0] });
    validateSources(sources, new Date().toISOString().slice(0, 10));
    fail("duplicate-score fixture unexpectedly passed");
  }
  const teams = [
    { espn_id: "1", slug: "a" },
    { espn_id: "2", slug: "b" },
    { espn_id: "3", slug: "bye" },
  ];
  const week = latestEndedWeek([{
    value: "7", startDate: "2026-10-05T07:00Z", endDate: "2026-10-12T06:59Z",
  }], Date.parse("2026-10-13T00:00Z"));
  const event = {
    id: "123", date: "2026-10-10T18:00Z", season: { year: 2026, type: 2 },
    week: { number: 7 },
    competitions: [{
      status: { type: { state: name === "unfinished-week" ? "in" : "post", completed: name !== "unfinished-week" } },
      competitors: [
        { team: { id: "1" }, homeAway: "away", score: "14", winner: false },
        { team: { id: "2" }, homeAway: "home", score: "21", winner: true },
      ],
    }],
  };
  if (name === "bad-score") event.competitions[0].competitors[0].score = "unknown";
  if (name === "wrong-week") event.week.number = 8;
  const events = name === "duplicate-event" ? [event, event] : [event];
  if (name === "bye-week") {
    events.push({
      ...event, id: "124", date: "2026-10-12T12:00Z",
      week: { number: 8 },
      competitions: [{ ...event.competitions[0], status: { type: { state: "pre", completed: false } } }],
    });
  }
  const result = collectWeekGames(week, [{ events }], teams);
  if (name !== "bye-week") fail(`unknown fixture ${name}`);
  assert.equal(queryDates(week).at(-1), "20261012");
  assert.equal(result.games.length, 1);
  assert.equal(result.participatingTeams, 2);
  assert.equal(result.byeTeams, 1);
  console.log("bye-week fixture passed: 1 final game, 2 teams, 1 bye");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const fixture = process.argv[2] === "--fixture" ? process.argv[3] : null;
    if (fixture) runFixture(fixture);
    else {
      const result = validateData();
      console.log(`validated AP Week ${result.pollWeek}, scores Week ${result.scoreWeek}: ${result.games} games, ${result.participatingTeams} teams, ${result.byeTeams} byes`);
      console.log(`snapshot dates: ${JSON.stringify(result.dates)}; days from AP: ${JSON.stringify(result.skewDays)}`);
    }
  } catch (error) {
    console.error(`data validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
