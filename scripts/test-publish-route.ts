/** Publish route checks with a disposable PostgreSQL database. */
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
import { POST } from "../app/api/seasons/route";
import { resetDb, setDb } from "../db/client";
import { countSeasons, getSeason } from "../db/seasons";
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

const input = (mode: "quick" | "season", seed: number): SeasonPayload => ({
  mode, seed, simVersion: SIM_VERSION, dataFingerprint: DATA_FINGERPRINT,
  programSlug: "texas", budgetM: 30, alloc: cappedOptimalAllocation(30),
});

async function publish(body: unknown) {
  const response = await POST(new Request("http://localhost/api/seasons", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  return { status: response.status, body: await response.json() as { id?: string; error?: string } };
}

async function main() {
  const databaseDir = realpathSync(mkdtempSync(join(tmpdir(), "cfb-money-route-test-")));
  if (realpathSync(join(databaseDir, "..")) !== realpathSync(tmpdir())) throw new Error("Unsafe test path");
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
      const request = input(mode, seed);
      const response = await publish(request);
      assert.equal(response.status, 201, `${mode} publish succeeds: ${response.body.error}`);
      assert(response.body.id);
      const row = await getSeason(response.body.id);
      assert(row);
      const replay = replaySeason(request);
      assert.equal(row.verified, true);
      assert.equal(row.wins, replay.summary.wins);
      assert.deepEqual(row.games.map((g) => [g.oppSlug, g.scoreFor, g.scoreAgainst, g.stage ?? null]),
        replay.games.map((g) => [g.opponent.slug, g.result!.scoreFor, g.result!.scoreAgainst, g.stage ?? null]));
      console.log(`  ok ${mode} POST stores server-derived results`);
    }

    const valid = input("quick", 999);
    const invalid: [unknown, number, string][] = [
      [{ ...valid, wins: 99 }, 422, "forged wins"],
      [{ ...valid, games: [{ scoreFor: 250 }] }, 422, "forged scores"],
      [{ ...valid, programSlug: "fake-program" }, 422, "unknown program"],
      [{ ...valid, alloc: { ...valid.alloc, QB: 50 } }, 422, "allocation cap"],
      [{ ...valid, alloc: { ...valid.alloc, QB: 5, RB: 5, WR: 8, OL: 8, DL: 8, LB: 4, DB: 4, ST: 2 } }, 422, "allocation total"],
      [{ ...valid, simVersion: 99 }, 422, "unsupported version"],
      [{ ...valid, seed: 2 ** 31 }, 422, "seed range"],
      [{ ...valid, dataFingerprint: "v1-0000000000000000" }, 409, "stale data"],
      [{ ...valid, played: 4 }, 422, "unfinished client state"],
    ];
    for (const [body, status, label] of invalid) {
      const result = await publish(body);
      assert.equal(result.status, status, `${label}: ${result.body.error}`);
      if (status === 409) assert.match(result.body.error ?? "", /reload/i);
      console.log(`  ok ${label} rejected`);
    }
    assert.equal(await countSeasons(), 2, "invalid requests insert no row");
  } finally {
    resetDb();
    if (pool) await pool.end();
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    await pg.stop().catch(() => undefined);
  }
  console.log("All publish route tests passed.");
}

main().catch((error) => { console.error(error); process.exit(1); });
