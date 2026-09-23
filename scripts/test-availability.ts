/** Availability states against disposable PostgreSQL plus an injected read failure. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
import LeaderboardError from "../app/leaderboard/error";
import LeaderboardPage from "../app/leaderboard/page";
import ShareSeasonError from "../app/s/[id]/error";
import ShareSeasonPage, { generateMetadata } from "../app/s/[id]/page";
import { resetDb, setDb } from "../db/client";
import { createSeason } from "../db/seasons";
import * as schema from "../db/schema";
import { DATA_FINGERPRINT, SIM_VERSION } from "../lib/season-replay";
import { cappedOptimalAllocation } from "../lib/simulator";

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (!address || typeof address === "string") throw new Error("No test port");
  return address.port;
}

async function main() {
  // tsx compiles Next's JSX as classic React in this direct test harness.
  (globalThis as { React?: typeof React }).React = React;
  const databaseDir = realpathSync(mkdtempSync(join(tmpdir(), "cfb-availability-")));
  if (realpathSync(join(databaseDir, "..")) !== realpathSync(tmpdir())) {
    throw new Error("Test database directory escaped OS temp");
  }
  const port = await freePort();
  const pg = new EmbeddedPostgres({
    databaseDir, port, user: "cfbtest", password: "cfbtest", persistent: false,
  });
  const previousUrl = process.env.DATABASE_URL;
  let pool: Pool | undefined;
  try {
    await pg.initialise();
    await pg.start();
    process.env.DATABASE_URL = `postgres://cfbtest:cfbtest@localhost:${port}/postgres`;
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
    await pg.stop().catch(() => undefined);
  }
  console.log("All availability tests passed.");
}

main().catch((error) => { console.error(error); process.exit(1); });
