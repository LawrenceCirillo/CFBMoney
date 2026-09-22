/**
 * End-to-end test of the seasons data layer against REAL PostgreSQL.
 *
 * Boots an embedded Postgres (no system install needed), applies the actual
 * generated drizzle migration, then exercises createSeason / getSeason /
 * getLeaderboard / countSeasons plus the zod payload validation.
 *
 * Run with: npx tsx scripts/test-db.ts
 */
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import EmbeddedPostgres from "embedded-postgres";
import { mkdtempSync, realpathSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { setDb, resetDb, dbEnabled } from "../db/client";
import { createSeason, getSeason, getLeaderboard, countSeasons } from "../db/seasons";
import * as schema from "../db/schema";
import { SeasonPayloadSchema, type SeasonPayload } from "../lib/season-payload";

let failures = 0;
function assert(cond: boolean, label: string, extra?: unknown) {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}`, extra ?? "");
  }
}

function makePayload(over: Partial<SeasonPayload> = {}): SeasonPayload {
  const games = Array.from({ length: 12 }, (_, i) => ({
    week: i + 1,
    oppName: `Opponent ${i + 1}`,
    oppSlug: `opponent-${i + 1}`,
    oppColor: "#123456",
    isHome: i % 2 === 0,
    winProb: 0.5 + (i % 3) * 0.1,
    scoreFor: 28,
    scoreAgainst: 21,
    won: i < 9, // 9-3
  }));
  return {
    programSlug: "texas",
    programName: "Texas",
    programColor: "#bf5700",
    budgetM: 30,
    alloc: { QB: 5.4, RB: 2.1, WR: 3, OL: 3.6, DL: 5.4, LB: 4, DB: 4.5, ST: 2 },
    seed: 42,
    wins: 9,
    losses: 3,
    expectedWins: 7.5,
    avgMargin: 8.2,
    off: 74.1,
    def: 71.8,
    st: 66.0,
    tags: ["Air Raid DNA", "Trenches First"],
    bestWin: { opponent: "Georgia", scoreFor: 31, scoreAgainst: 28 },
    worstLoss: { opponent: "Ole Miss", scoreFor: 17, scoreAgainst: 34 },
    games,
    ...over,
  };
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (!address || typeof address === "string") throw new Error("could not reserve a test port");
  return address.port;
}

async function main() {
  console.log("db: real Postgres");
  // TEST_DATABASE_URL: use an already-running test server. Otherwise boot a
  // disposable Postgres cluster under the OS temp directory.
  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  } else {
    const databaseDir = realpathSync(mkdtempSync(join(tmpdir(), "cfb-money-test-")));
    if (realpathSync(join(databaseDir, "..")) !== realpathSync(tmpdir())) {
      throw new Error("test database directory is outside the OS temp directory");
    }
    const port = await availablePort();
    const pg = new EmbeddedPostgres({
      databaseDir,
      port,
      user: "cfbtest",
      password: "cfbtest",
      persistent: false,
      createPostgresUser: typeof process.getuid === "function" && process.getuid() === 0,
    });
    await pg.initialise();
    await pg.start();
    process.env.DATABASE_URL = `postgres://cfbtest:cfbtest@localhost:${port}/postgres`;
    (globalThis as { __pg?: unknown }).__pg = pg;
  }
  // This integration test uses node-postgres even when the app's Neon HTTP
  // driver is installed, so its migrator and database types agree.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const db = drizzle(pool, { schema });
  setDb(db);
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../db/migrations", import.meta.url)) });

  assert(dbEnabled(), "dbEnabled() true with DATABASE_URL");

  console.log("createSeason / getSeason round-trip");
  const id1 = await createSeason(makePayload({ gmName: "  Coach K  " }));
  assert(typeof id1 === "string" && id1.length === 10, "returns 10-char nanoid", id1);
  const s1 = await getSeason(id1);
  assert(s1 !== null, "getSeason finds the row");
  assert(s1?.gmName === "Coach K", "gmName trimmed", s1?.gmName);
  assert(s1?.wins === 9 && s1?.losses === 3, "record preserved");
  assert(
    Array.isArray(s1?.games) && s1?.games.length === 12 && s1?.games[0].oppName === "Opponent 1",
    "games JSONB round-trips"
  );
  assert(s1?.alloc.QB === 5.4, "alloc JSONB round-trips");
  assert(s1?.tags.join(",") === "Air Raid DNA,Trenches First", "tags JSONB round-trips");
  assert(s1?.bestWin?.opponent === "Georgia", "bestWin JSONB round-trips");
  assert(s1?.createdAt instanceof Date, "createdAt defaults to now");

  // Optional gmName -> null
  const idNoName = await createSeason(makePayload({ programSlug: "texas-b" }));
  assert((await getSeason(idNoName))?.gmName === null, "gmName optional -> null");

  const missing = await getSeason("nope1234567");
  assert(missing === null, "getSeason returns null for unknown id");

  console.log("leaderboard ordering");
  await createSeason(
    makePayload({
      programSlug: "ohio-state",
      programName: "Ohio State",
      wins: 11,
      losses: 1,
      expectedWins: 10.2,
      avgMargin: 12.0,
      games: Array.from({ length: 12 }, (_, i) => ({
        week: i + 1,
        oppName: `Opp ${i + 1}`,
        oppSlug: `opp-${i + 1}`,
        oppColor: "#123456",
        isHome: true,
        winProb: 0.9,
        scoreFor: 35,
        scoreAgainst: 14,
        won: i < 11,
      })),
    })
  );
  await createSeason(
    makePayload({
      programSlug: "boston-college",
      programName: "Boston College",
      wins: 7,
      losses: 5,
      expectedWins: 3.1,
      avgMargin: 1.2,
      games: Array.from({ length: 12 }, (_, i) => ({
        week: i + 1,
        oppName: `Opp ${i + 1}`,
        oppSlug: `opp-${i + 1}`,
        oppColor: "#123456",
        isHome: false,
        winProb: 0.35,
        scoreFor: 24,
        scoreAgainst: 23,
        won: i < 7,
      })),
    })
  );

  const byWins = await getLeaderboard("wins");
  assert(
    byWins.map((r) => r.wins).join(",") === "11,9,9,7",
    "sort=wins orders 11,9,9,7",
    byWins.map((r) => r.wins)
  );
  const byOver = await getLeaderboard("overachieve");
  assert(
    byOver[0]?.programSlug === "boston-college" &&
      byOver[1]?.programSlug === "texas" &&
      byOver[2]?.programSlug === "texas-b" &&
      byOver[3]?.programSlug === "ohio-state",
    "sort=overachieve: BC (+3.9), Texas (+1.5), Texas-b (+1.5), OSU (+0.8)",
    byOver.map((r) => `${r.programSlug}:${(r.wins - r.expectedWins).toFixed(1)}`)
  );
  assert(byWins.length === 4 && !("games" in byWins[0]), "leaderboard selects slim columns");

  console.log("countSeasons");
  assert((await countSeasons()) === 4, "counts 4 published seasons");

  console.log("payload validation");
  const overBudget = makePayload({
    alloc: { QB: 20, RB: 20, WR: 0, OL: 0, DL: 0, LB: 0, DB: 0, ST: 0 },
  });
  assert(!SeasonPayloadSchema.safeParse(overBudget).success, "rejects over-budget alloc");
  const mismatch = makePayload({ wins: 10 });
  assert(!SeasonPayloadSchema.safeParse(mismatch).success, "rejects wins/losses mismatch");
  const badColor = makePayload({ programColor: "red" });
  assert(!SeasonPayloadSchema.safeParse(badColor).success, "rejects bad color");
  const badWeeks = makePayload();
  badWeeks.games[0].week = 5;
  assert(!SeasonPayloadSchema.safeParse(badWeeks).success, "rejects non-sequential weeks");
  assert(SeasonPayloadSchema.safeParse(makePayload()).success, "accepts a valid payload");

  resetDb();
  await pool.end();
  delete process.env.DATABASE_URL;
  const pg = (globalThis as { __pg?: { stop: () => Promise<void> } }).__pg;
  if (pg) await pg.stop();

  if (failures > 0) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log("\nAll db tests passed.");
}

main().catch(async (e) => {
  console.error("test crashed:", e);
  const pg = (globalThis as { __pg?: { stop: () => Promise<void> } }).__pg;
  if (pg) await pg.stop().catch(() => undefined);
  process.exit(1);
});
