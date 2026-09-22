/** Integration checks against a disposable PostgreSQL cluster. */
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LeaderboardPage from "../app/leaderboard/page";
import ShareSeasonPage from "../app/s/[id]/page";
import { resetDb, setDb } from "../db/client";
import { countSeasons, createSeason, getLeaderboard, getLegacyArchive, getSeason } from "../db/seasons";
import * as schema from "../db/schema";
import { cappedOptimalAllocation } from "../lib/simulator";
import { DATA_FINGERPRINT, SIM_VERSION, replaySeason } from "../lib/season-replay";
import type { SeasonPayload } from "../lib/season-payload";

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (!address || typeof address === "string") throw new Error("No test port");
  return address.port;
}

const payload = (mode: "quick" | "season", seed: number): SeasonPayload => ({
  mode, seed, simVersion: SIM_VERSION, dataFingerprint: DATA_FINGERPRINT,
  programSlug: "texas", budgetM: 30, alloc: cappedOptimalAllocation(30),
});

async function main() {
  // tsx compiles Next's JSX as classic React in this direct test harness.
  (globalThis as { React?: typeof React }).React = React;
  const databaseDir = realpathSync(mkdtempSync(join(tmpdir(), "cfb-money-test-")));
  if (realpathSync(join(databaseDir, "..")) !== realpathSync(tmpdir())) {
    throw new Error("Test database directory escaped OS temp");
  }
  const port = await freePort();
  const pg = new EmbeddedPostgres({ databaseDir, port, user: "cfbtest", password: "cfbtest", persistent: false });
  const previousUrl = process.env.DATABASE_URL;
  let pool: Pool | undefined;
  try {
    await pg.initialise();
    await pg.start();
    process.env.DATABASE_URL = `postgres://cfbtest:cfbtest@localhost:${port}/postgres`;
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    const db = drizzle(pool, { schema });
    setDb(db);
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../db/migrations", import.meta.url)) });

    for (const [mode, seed] of [["quick", 24], ["season", 147]] as const) {
      const input = payload(mode, seed);
      const replay = replaySeason(input);
      const id = await createSeason({ ...input, gmName: " Coach K " });
      const row = await getSeason(id);
      assert(row, `${mode} row exists`);
      assert.equal(row.gmName, "Coach K");
      assert.equal(row.verified, true);
      assert.equal(row.mode, mode);
      assert.equal(row.simVersion, SIM_VERSION);
      assert.equal(row.dataFingerprint, DATA_FINGERPRINT);
      assert.equal(row.wins, replay.summary.wins);
      assert.equal(row.losses, replay.summary.losses);
      assert(Math.abs(row.expectedWins - replay.summary.expectedWins) < 1e-5);
      assert(Math.abs(row.off - replay.ratings.off) < 1e-5);
      assert.equal(row.tags.join("|"), replay.tags.join("|"));
      assert.equal(row.games.length, replay.games.length);
      assert.deepEqual(row.games.map((g) => [g.week, g.oppSlug, g.scoreFor, g.scoreAgainst, g.stage ?? null]),
        replay.games.map((g) => [g.week, g.opponent.slug, g.result?.scoreFor, g.result?.scoreAgainst, g.stage ?? null]));
      console.log(`  ok ${mode}: stored result matches canonical replay`);
    }

    // A pre-replay row has no replay metadata. The migration's default keeps it
    // readable while preventing an arbitrary legacy score from receiving rank.
    const legacyInput = payload("quick", 999);
    const legacy = replaySeason(legacyInput);
    await db.insert(schema.seasons).values({
      id: "legacy0001", programSlug: "texas", programName: "Texas", programColor: "#bf5700",
      budgetM: 30, alloc: legacy.fullAlloc, seed: 999,
      wins: 99, losses: 0, expectedWins: 0, avgMargin: 99,
      off: legacy.ratings.off, def: legacy.ratings.def, st: legacy.ratings.st,
      tags: [], bestWin: null, worstLoss: null,
      games: legacy.games.map((g) => ({
        week: g.week, oppName: g.opponent.name, oppSlug: g.opponent.slug,
        oppColor: g.opponent.color, isHome: g.isHome, winProb: g.winProb,
        scoreFor: g.result!.scoreFor, scoreAgainst: g.result!.scoreAgainst, won: g.result!.won,
      })),
    });
    const legacyRow = await getSeason("legacy0001");
    assert(legacyRow);
    assert.equal(legacyRow.verified, false);
    assert.equal(legacyRow.simVersion, null);
    assert.equal(legacyRow.wins, 99);
    assert.equal((await getLegacyArchive())[0]?.id, "legacy0001");
    assert.equal(await countSeasons(), 2);
    assert.equal(await countSeasons(false), 1);
    const byWins = await getLeaderboard("wins");
    const byOver = await getLeaderboard("overachieve");
    assert.equal(byWins.length, 2);
    assert.equal(byOver.length, 2);
    assert(!byWins.some((row) => row.id === "legacy0001"));
    assert(!byOver.some((row) => row.id === "legacy0001"));
    assert(byWins[0].wins >= byWins[1].wins);
    assert(byOver[0].wins - byOver[0].expectedWins >= byOver[1].wins - byOver[1].expectedWins);
    console.log("  ok legacy links survive and never receive verified rank");

    const legacyHtml = renderToStaticMarkup(await ShareSeasonPage({ params: Promise.resolve({ id: "legacy0001" }) }));
    assert.match(legacyHtml, /Unverified legacy result/);
    assert.match(legacyHtml, /99/);
    await db.update(schema.seasons).set({ verified: false });
    const emptyVerifiedHtml = renderToStaticMarkup(await LeaderboardPage({ searchParams: Promise.resolve({}) }));
    assert.match(emptyVerifiedHtml, /No verified seasons yet/);
    assert.match(emptyVerifiedHtml, /unranked archive/);
    assert.match(emptyVerifiedHtml, /legacy0001/);
    console.log("  ok legacy recap and empty verified leaderboard render correctly");
  } finally {
    resetDb();
    if (pool) await pool.end();
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    await pg.stop().catch(() => undefined);
  }
  console.log("All db tests passed.");
}

main().catch((error) => { console.error(error); process.exit(1); });
