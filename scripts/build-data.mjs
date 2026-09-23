// CFB Money data pipeline.
//   data/teams.json (metadata)
//   data/athletic-nil-budgets-2026.csv (budget ranges)
//   data/ap-poll-2026.csv (preseason + each AP Top 25; latest week is current)
//   data/espn-fpi-sos-2026.json (ESPN FPI schedule ranks, a dated snapshot)
//     -> validates, merges, derives metrics
//     -> public/data/cfb-2026.json (generated, imported by lib/data.ts)
//     -> public/logos/{slug}.png (ESPN dark marks, cached from espn_id)
//
// Spend ranks are derived from Athletic midpoints. AP ranks live in a separate
// file so the ballot and the book never get mixed.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateData } from "./validate-data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const validation = validateData(root);
console.log(`cfb-money: validated AP Week ${validation.pollWeek}, score Week ${validation.scoreWeek} (${validation.byeTeams} byes)`);

function parseCSV(text) {
  const lines = text.trim().split("\n").filter((line) => line && !line.startsWith("#"));
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const row = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

function parsePoll(text) {
  let asOf = "";
  let note = "";
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t.startsWith("# as_of:")) asOf = t.slice("# as_of:".length).trim();
    if (t.startsWith("# note:")) note = t.slice("# note:".length).trim();
  }
  const rows = parseCSV(text);
  const weeks = rows.map((r) => Number(r.week)).filter((w) => w > 0);
  if (!weeks.length) throw new Error("AP poll has no week > 0");
  const week = Math.max(...weeks);
  if (!asOf || !note) throw new Error("AP poll file needs # as_of: and # note: comments");
  const current = rows.filter((r) => Number(r.week) === week);
  if (current.length !== 25) {
    throw new Error(`AP week ${week} has ${current.length} teams, expected 25`);
  }
  const ranks = new Set(current.map((r) => Number(r.rank)));
  if (ranks.size !== 25) throw new Error(`AP week ${week} has duplicate or missing ranks`);
  return { rows, week, asOf, note };
}

const teamsMeta = JSON.parse(readFileSync(join(root, "data/teams.json"), "utf8"));
const csvRows = parseCSV(readFileSync(join(root, "data/athletic-nil-budgets-2026.csv"), "utf8"));
const poll = parsePoll(readFileSync(join(root, "data/ap-poll-2026.csv"), "utf8"));
const pollRows = poll.rows;
const sos = JSON.parse(readFileSync(join(root, "data/espn-fpi-sos-2026.json"), "utf8"));

const missingEspn = teamsMeta.filter((t) => !t.espn_id);
if (missingEspn.length) {
  throw new Error(
    `data/teams.json missing espn_id for: ${missingEspn.map((t) => t.name).join(", ")}`
  );
}

/** Dark NCAA marks from ESPN, cached locally so the UI never hotlinks. */
async function cacheLogos(teams) {
  const dir = join(root, "public/logos");
  mkdirSync(dir, { recursive: true });
  const refresh = process.env.CFB_REFRESH_LOGOS === "1";
  let fetched = 0;
  let skipped = 0;
  const ua = "cfb-money-data-pipeline/1.0";
  const queue = [...teams];
  const workers = 6;
  async function worker() {
    while (queue.length) {
      const t = queue.shift();
      if (!t) return;
      const dest = join(dir, `${t.slug}.png`);
      if (!refresh && existsSync(dest)) {
        skipped += 1;
        continue;
      }
      const url = `https://a.espncdn.com/i/teamlogos/ncaa/500-dark/${t.espn_id}.png`;
      const res = await fetch(url, {
        headers: { "User-Agent": ua, Accept: "image/png" },
      });
      if (!res.ok) throw new Error(`logo ${t.slug} (espn ${t.espn_id}): HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 500) {
        throw new Error(`logo ${t.slug} too small (${buf.length} bytes)`);
      }
      writeFileSync(dest, buf);
      fetched += 1;
    }
  }
  await Promise.all(Array.from({ length: workers }, () => worker()));
  console.log(`cfb-money: logos — ${fetched} downloaded, ${skipped} already cached`);
}

await cacheLogos(teamsMeta);

const metaByName = new Map(teamsMeta.map((t) => [t.name, t]));
if (metaByName.size !== teamsMeta.length) throw new Error("Duplicate team name in data/teams.json");

const teams = csvRows.map((r) => {
  const meta = metaByName.get(r.team);
  if (!meta) throw new Error(`No metadata for "${r.team}" — add it to data/teams.json`);
  const low = Number(r.budget_low_m);
  const high = Number(r.budget_high_m);
  if (!(low > 0 && high >= low)) throw new Error(`Bad budget range for ${r.team}: ${low}-${high}`);
  return {
    ...meta,
    budget_low_m: low,
    budget_high_m: high,
    budget_mid_m: Math.round(((low + high) / 2) * 10) / 10,
    preseason_rank: null,
    ap_rank: null,
  };
});

const byName = new Map(teams.map((t) => [t.name, t]));
for (const r of pollRows) {
  const team = byName.get(r.team);
  if (!team) throw new Error(`AP poll team "${r.team}" is not in the Athletic budget file`);
  const week = Number(r.week);
  const rank = Number(r.rank);
  if (!Number.isInteger(rank) || rank < 1 || rank > 25) {
    throw new Error(`Bad AP rank for ${r.team} week ${r.week}: ${r.rank}`);
  }
  if (week === 0) team.preseason_rank = rank;
  else if (week === poll.week) team.ap_rank = rank;
  else if (week > 0 && week < poll.week) continue;
  else throw new Error(`Unexpected AP poll week ${week} for ${r.team}`);
}

// Competition spend ranking by midpoint ("1224").
const bySpend = [...teams].sort((a, b) => b.budget_mid_m - a.budget_mid_m);
let prevMid = null;
let prevRank = 0;
bySpend.forEach((t, i) => {
  if (t.budget_mid_m !== prevMid) {
    prevRank = i + 1;
    prevMid = t.budget_mid_m;
  }
  t.spend_rank = prevRank;
});

// Value gap vs the current ballot: spots ranked better (+) or worse (−) than spend.
teams.forEach((t) => {
  t.value_gap = t.ap_rank != null ? t.spend_rank - t.ap_rank : null;
  const row = sos.teams?.[t.espn_id];
  const played = row?.played;
  const remaining = row?.remaining;
  if (!Number.isInteger(played) || !Number.isInteger(remaining) || played < 1 || remaining < 1) {
    throw new Error(`ESPN FPI SOS missing or invalid for ${t.name} (${t.espn_id})`);
  }
  t.sos_played_rank = played;
  t.sos_remaining_rank = remaining;
});
if (!sos.as_of || !sos.note) throw new Error("ESPN FPI file needs as_of and note");

const totalMid = teams.reduce((s, t) => s + t.budget_mid_m, 0);

const out = {
  season: 2026,
  source: {
    name: "The Athletic",
    url: "https://www.nytimes.com/athletic/interactive/college-football-nil-spending-budgets/",
    note: "Estimated 2026 roster budgets, published as ranges in September 2026.",
  },
  poll: {
    name: "AP Top 25",
    week: poll.week,
    as_of: poll.asOf,
    note: poll.note,
  },
  fpi: {
    name: "ESPN FPI",
    as_of: sos.as_of,
    note: sos.note,
  },
  totals: {
    teams: teams.length,
    total_mid_m: Math.round(totalMid * 10) / 10,
  },
  teams: [...teams].sort((a, b) => b.budget_mid_m - a.budget_mid_m),
};

mkdirSync(join(root, "public/data"), { recursive: true });
writeFileSync(join(root, "public/data/cfb-2026.json"), JSON.stringify(out, null, 2) + "\n");
const ranked = teams.filter((t) => t.ap_rank != null).length;
console.log(
  `cfb-money: wrote public/data/cfb-2026.json — ${teams.length} teams, $${totalMid.toFixed(1)}M total, ${ranked} AP-ranked through week ${poll.week}`
);
