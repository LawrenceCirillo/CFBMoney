/** Availability states against disposable PostgreSQL plus an injected read failure. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LeaderboardError from "../app/leaderboard/error";
import LeaderboardPage from "../app/leaderboard/page";
import ShareSeasonError from "../app/s/[id]/error";
import ShareSeasonPage, { generateMetadata } from "../app/s/[id]/page";
import { resetDb, setDb } from "../db/client";
import { createSeason } from "../db/seasons";
import * as schema from "../db/schema";
import { DATA_FINGERPRINT, SIM_VERSION } from "../lib/season-replay";
import { cappedOptimalAllocation } from "../lib/simulator";
import { startTestPostgres } from "./test-postgres";

async function main() {
  // tsx compiles Next's JSX as classic React in this direct test harness.
  (globalThis as { React?: typeof React }).React = React;
  const testDb = await startTestPostgres("availability");
  const previousUrl = process.env.DATABASE_URL;
  let pool: Pool | undefined;
  try {
    process.env.DATABASE_URL = testDb.url;
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    const db = drizzle(pool, { schema });
    setDb(db);
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../db/migrations", import.meta.url)) });

    const emptyHtml = renderToStaticMarkup(await LeaderboardPage({ searchParams: Promise.resolve({}) }));
    assert.match(emptyHtml, /0 verified seasons published/);
    assert.match(emptyHtml, /No verified seasons yet/);
    assert.doesNotMatch(emptyHtml, /Leaderboard unavailable/);
    console.log("  ok healthy empty leaderboard");

    const id = await createSeason({
      gmName: "Availability Test", mode: "quick", seed: 42, simVersion: SIM_VERSION,
      dataFingerprint: DATA_FINGERPRINT, programSlug: "texas", budgetM: 30,
      alloc: cappedOptimalAllocation(30),
      gameplan: [], autoGameplan: true, gravityOn: true, gravityVersion: "v1",
    }, randomUUID());
    const shareHtml = renderToStaticMarkup(await ShareSeasonPage({ params: Promise.resolve({ id }) }));
    assert.match(shareHtml, /Availability Test/);
    await assert.rejects(
      () => ShareSeasonPage({ params: Promise.resolve({ id: "doesnotexist" }) }),
      /NEXT_HTTP_ERROR_FALLBACK;404/
    );
    console.log("  ok existing share and unknown ID 404");

    // Every read fails before a driver can expose its connection details.
    setDb({ select() { throw new Error("Injected database failure with secret details"); } } as unknown as Parameters<typeof setDb>[0]);
    await assert.rejects(
      () => LeaderboardPage({ searchParams: Promise.resolve({}) }),
      /Leaderboard data unavailable/
    );
    await assert.rejects(
      () => ShareSeasonPage({ params: Promise.resolve({ id }) }),
      /Season data unavailable/
    );
    const metadata = await generateMetadata({ params: Promise.resolve({ id }) });
    assert.equal(metadata.title, "Simulated season · CFB Money");
    const hiddenError = new Error("Injected database failure with secret details");
    const leaderboardErrorHtml = renderToStaticMarkup(
      React.createElement(LeaderboardError, { error: hiddenError, reset() {} })
    );
    const shareErrorHtml = renderToStaticMarkup(
      React.createElement(ShareSeasonError, { error: hiddenError, reset() {} })
    );
    assert.match(leaderboardErrorHtml, /Leaderboard unavailable/);
    assert.match(shareErrorHtml, /Season unavailable/);
    assert.match(leaderboardErrorHtml, /Try again/);
    assert.match(shareErrorHtml, /Try again/);
    assert.doesNotMatch(leaderboardErrorHtml + shareErrorHtml, /secret details/);
    console.log("  ok query failures show unavailable states without leaking driver details");

    setDb(db);
    const recoveredHtml = renderToStaticMarkup(await LeaderboardPage({ searchParams: Promise.resolve({}) }));
    assert.match(recoveredHtml, /Availability Test/);
    console.log("  ok reads recover when the database returns");
  } finally {
    resetDb();
    if (pool) await pool.end();
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    await testDb.close();
  }
  console.log("All availability tests passed.");
}

main().catch((error) => { console.error(error); process.exit(1); });
