/**
 * Live end-to-end test of publish -> share page -> OG image -> leaderboard.
 *
 * Starts from the REAL simulator (same code path as the Build UI), POSTs the
 * season exactly like Season.tsx does, then checks every page that reads it.
 *
 * Requires: production server running with DATABASE_URL set, e.g.
 *   DATABASE_URL="postgres://postgres@localhost:54339/postgres?host=/tmp" \
 *     npx next start -p 3100
 * Run: BASE_URL=http://localhost:3100 npx tsx scripts/test-e2e-share.ts
 */
import {
  GAME_BUDGET_M,
  expectedScore,
  generateSchedule,
  mulberry32,
  optimalAllocation,
  ratingsFromAllocation,
  simulateGame,
  summarizeSeason,
  archetype,
} from "../lib/simulator";
import { data } from "../lib/data";
import { SeasonPayloadSchema, type SeasonPayload } from "../lib/season-payload";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const gmName = process.env.E2E_GM_NAME ?? "E2E Coach";
let failures = 0;
function assert(cond: boolean, label: string, extra?: unknown) {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.error(`  FAIL ${label}`, extra ?? "");
  }
}

async function main() {
  // --- build a season exactly like the client does ---
  const program = data.teams.find((t) => t.slug === "texas")!;
  const alloc = optimalAllocation(GAME_BUDGET_M);
  const userR = ratingsFromAllocation(alloc);
  const seed = 987654321;
  const rng = mulberry32((seed ^ 0x12345) >>> 0);
  const games = generateSchedule(program, data.teams, seed).map((g) => ({
    ...g,
    winProb: expectedScore(userR, g.oppRatings, g.isHome).winProb,
  }));
  for (const g of games) {
    g.result = simulateGame(userR, g.oppRatings, g.isHome, rng);
  }
  const summary = summarizeSeason(games);
  const tags = archetype(alloc);

  const payload: SeasonPayload = {
    gmName,
    programSlug: program.slug,
    programName: program.name,
    programColor: program.color,
    budgetM: GAME_BUDGET_M,
    alloc,
    seed,
    wins: summary.wins,
    losses: summary.losses,
    expectedWins: summary.expectedWins,
    avgMargin: summary.avgMargin,
    off: userR.off,
    def: userR.def,
    st: userR.st,
    tags,
    bestWin: summary.bestWin ?? null,
    worstLoss: summary.worstLoss ?? null,
    games: games.map((g) => ({
      week: g.week,
      oppName: g.opponent.name,
      oppSlug: g.opponent.slug,
      oppColor: g.opponent.color,
      isHome: g.isHome,
      winProb: g.winProb,
      scoreFor: g.result!.scoreFor,
      scoreAgainst: g.result!.scoreAgainst,
      won: g.result!.won,
    })),
  };
  const v = SeasonPayloadSchema.safeParse(payload);
  assert(v.success, "simulator-produced payload validates");

  console.log(`publish: simulated Texas ${summary.wins}-${summary.losses}`);

  // --- POST /api/seasons ---
  const post = await fetch(`${BASE}/api/seasons`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  assert(post.status === 201, `POST /api/seasons -> 201 (got ${post.status})`);
  const { id } = (await post.json()) as { id: string };
  assert(typeof id === "string" && id.length === 10, "share id returned", id);

  // --- invalid payload rejected ---
  const bad = await fetch(`${BASE}/api/seasons`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, wins: 99 }),
  });
  assert(bad.status === 422, `invalid payload -> 422 (got ${bad.status})`);

  // --- share page ---
  const share = await fetch(`${BASE}/s/${id}`);
  const shareHtml = await share.text();
  assert(share.status === 200, `GET /s/[id] -> 200 (got ${share.status})`);
  assert(shareHtml.includes("Texas"), "share page shows program name");
  assert(
    shareHtml.includes(`${summary.wins}–${summary.losses}`),
    "share page shows record"
  );
  assert(shareHtml.includes(gmName), "share page shows GM name");
  // React SSR splits text/expression with comment nodes, so match loosely.
  assert(/Wk\s*(<!-- -->)?\s*1/.test(shareHtml), "share page shows game log");

  // --- OG image ---
  const og = await fetch(`${BASE}/s/${id}/opengraph-image`);
  assert(og.status === 200, `GET opengraph-image -> 200 (got ${og.status})`);
  assert(
    (og.headers.get("content-type") ?? "").includes("image/png"),
    "OG image is PNG",
    og.headers.get("content-type")
  );
  const ogBytes = Buffer.from(await og.arrayBuffer());
  assert(ogBytes.length > 10_000, `OG image has real content (${ogBytes.length} bytes)`);

  // --- leaderboard ---
  const lb = await fetch(`${BASE}/leaderboard`);
  const lbHtml = await lb.text();
  assert(lb.status === 200, `GET /leaderboard -> 200 (got ${lb.status})`);
  assert(lbHtml.includes(gmName), "leaderboard lists the published season");
  assert(lbHtml.includes(`/s/${id}`), "leaderboard links to the share page");

  const lbOver = await fetch(`${BASE}/leaderboard?sort=overachieve`);
  assert(lbOver.status === 200, "GET /leaderboard?sort=overachieve -> 200");

  // --- unknown id 404s ---
  const nf = await fetch(`${BASE}/s/doesnotexist`);
  assert(nf.status === 404, `GET /s/unknown -> 404 (got ${nf.status})`);

  if (failures > 0) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log("\nAll e2e share tests passed.");
}

main().catch((e) => {
  console.error("e2e crashed:", e);
  process.exit(1);
});
