// Pull the latest fully completed regular-season week for the 68 programs.
// Writes data/espn-scores-2026.json only after every tracked event is final.
//
//   node scripts/fetch-espn-scores.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCOREBOARD =
  "https://site.web.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard";

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function validTime(value, label) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error(`invalid ${label}: ${value}`);
  return time;
}

export function queryDates(week) {
  const start = validTime(week.startDate, "week start");
  const end = validTime(week.endDate, "week end");
  if (start >= end) throw new Error("ESPN calendar week has an invalid range");
  const dates = [];
  const first = Date.parse(week.startDate.slice(0, 10) + "T00:00:00Z");
  const last = Date.parse(week.endDate.slice(0, 10) + "T00:00:00Z");
  for (let day = first; day <= last; day += 86_400_000) {
    dates.push(new Date(day).toISOString().slice(0, 10).replaceAll("-", ""));
  }
  return dates;
}

export function latestEndedWeek(entries, now = Date.now()) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("ESPN calendar has no regular-season weeks");
  }
  const weeks = entries.map((week) => ({
    ...week,
    start: validTime(week.startDate, "week start"),
    end: validTime(week.endDate, "week end"),
  }));
  for (const week of weeks) {
    if (!Number.isInteger(Number(week.value)) || week.start >= week.end) {
      throw new Error("ESPN calendar has an invalid regular-season week");
    }
  }
  const ended = weeks.filter((week) => week.end <= now).sort((a, b) => b.end - a.end);
  if (!ended.length) throw new Error("no regular-season week has ended yet");
  return ended[0];
}

function rankOf(competitor) {
  const current = competitor.curatedRank?.current;
  return Number.isInteger(current) && current >= 1 && current <= 25 ? current : null;
}

function scoreOf(competitor, eventId) {
  const raw = competitor.score;
  if (
    !((typeof raw === "string" && /^\d+$/.test(raw)) || Number.isInteger(raw)) ||
    !Number.isSafeInteger(Number(raw)) ||
    Number(raw) < 0
  ) {
    throw new Error(`event ${eventId} has a malformed score`);
  }
  return Number(raw);
}

function sideOf(competitor, byEspn, eventId) {
  const ours = byEspn.get(String(competitor.team?.id));
  return {
    slug: ours?.slug ?? null,
    abbr: ours?.abbr ?? competitor.team?.abbreviation ?? "—",
    name: ours?.name ?? competitor.team?.shortDisplayName ?? competitor.team?.displayName ?? "—",
    score: scoreOf(competitor, eventId),
    winner: competitor.winner === true,
    rank: rankOf(competitor),
  };
}

function lead(game) {
  const ranks = [game.away.rank, game.home.rank].filter((rank) => rank != null);
  return ranks.length ? Math.min(...ranks) : 99;
}

export function collectWeekGames(week, boards, teams) {
  const byEspn = new Map(teams.map((team) => [String(team.espn_id), team]));
  const weekNumber = Number(week.value);
  const games = [];
  const seenEvents = new Set();
  const participating = new Set();
  for (const board of boards) {
    if (!Array.isArray(board.events)) throw new Error("ESPN scoreboard omitted its events array");
    for (const event of board.events) {
      const competition = event.competitions?.[0];
      const competitors = competition?.competitors;
      if (!Array.isArray(competitors)) {
        throw new Error("ESPN scoreboard event shape changed");
      }
      if (!competitors.some((side) => byEspn.has(String(side.team?.id)))) continue;

      const id = String(event.id ?? "");
      if (!/^\d+$/.test(id)) throw new Error("tracked ESPN event has no valid ID");
      const date = validTime(event.date, `event ${id} date`);
      // A daily board on the calendar's last UTC date can also contain a
      // next-week game. Its kickoff falls after this week's end timestamp.
      if (date < week.start || date > week.end) {
        if (event.week?.number === weekNumber) {
          throw new Error(`event ${id} falls outside Week ${weekNumber}`);
        }
        continue;
      }
      if (seenEvents.has(id)) throw new Error(`duplicate ESPN event ID ${id}`);
      seenEvents.add(id);
      if (event.season?.year !== 2026 || event.season?.type !== 2 ||
          event.week?.number !== weekNumber) {
        throw new Error(`event ${id} has an inconsistent season or week`);
      }
      if (competitors.length !== 2 ||
          competitors.filter((side) => side.homeAway === "home").length !== 1 ||
          competitors.filter((side) => side.homeAway === "away").length !== 1) {
        throw new Error(`event ${id} has invalid competitors`);
      }
      if (competition.status?.type?.state !== "post" ||
          competition.status?.type?.completed !== true) {
        throw new Error(`Week ${weekNumber} has an unfinished tracked event ${id}`);
      }
      const away = sideOf(competitors.find((side) => side.homeAway === "away"), byEspn, id);
      const home = sideOf(competitors.find((side) => side.homeAway === "home"), byEspn, id);
      if (away.score === home.score ||
          away.winner === home.winner ||
          away.winner !== (away.score > home.score)) {
        throw new Error(`event ${id} has inconsistent final scores or winner`);
      }
      if (away.slug) participating.add(away.slug);
      if (home.slug) participating.add(home.slug);
      games.push({ id, date: event.date, final: true, away, home });
    }
  }
  if (!games.length) throw new Error(`Week ${weekNumber} has no tracked games`);
  games.sort((a, b) => lead(a) - lead(b) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return {
    games,
    participatingTeams: participating.size,
    byeTeams: teams.length - participating.size,
  };
}

async function main() {
  const teams = JSON.parse(readFileSync(join(root, "data/teams.json"), "utf8"));
  const probe = await getJson(`${SCOREBOARD}?limit=1`);
  const regular = probe.leagues?.[0]?.calendar?.find((entry) => entry.label === "Regular Season");
  const week = latestEndedWeek(regular?.entries);
  const boards = [];
  for (const date of queryDates(week)) {
    boards.push(await getJson(`${SCOREBOARD}?dates=${date}&limit=400`));
  }
  const { games, participatingTeams, byeTeams } = collectWeekGames(week, boards, teams);
  const file = {
    source: "ESPN",
    url: "https://www.espn.com/college-football/scoreboard",
    as_of: new Date().toISOString().slice(0, 10),
    season: 2026,
    week: Number(week.value),
    label: week.label,
    range: String(week.detail).replace("-", "–"),
    note: `Final scores for ${participatingTeams} of ${teams.length} tracked programs in Week ${week.value}; ${byeTeams} byes. A game is listed once.`,
    games,
  };
  writeFileSync(join(root, "data/espn-scores-2026.json"), JSON.stringify(file, null, 2) + "\n");
  console.log(`wrote week ${file.week} (${file.range}): ${games.length} games, ${participatingTeams} teams, ${byeTeams} byes`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
