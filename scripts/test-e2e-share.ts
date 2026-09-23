/** Real HTTP publish → share → leaderboard smoke test on a disposable local DB. */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { resetDb, setDb } from "../db/client";
import { countSeasons, getSeason } from "../db/seasons";
import * as schema from "../db/schema";
import { GAME_BUDGET_M, cappedOptimalAllocation } from "../lib/simulator";
import { DATA_FINGERPRINT, SIM_VERSION, replaySeason } from "../lib/season-replay";
import { SeasonPayloadSchema, type SeasonPayload } from "../lib/season-payload";
import { freePort, startTestPostgres } from "./test-postgres";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function waitForServer(base: string, app: ChildProcess, output: () => string) {
  for (let attempt = 0; attempt < 90; attempt++) {
    if (app.exitCode !== null) throw new Error(`Local app exited early: ${output()}`);
    try {
      const response = await fetch(base, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Local app did not start: ${output()}`);
}

async function publish(base: string, payload: unknown, key = randomUUID()) {
  const response = await fetch(`${base}/api/seasons`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(payload),
  });
  return { status: response.status, body: await response.json() as { id?: string; error?: string } };
}

async function main() {
  const testDb = await startTestPostgres("share-http");
  const previousUrl = process.env.DATABASE_URL;
  let pool: Pool | undefined;
  let app: ChildProcess | undefined;
  try {
    process.env.DATABASE_URL = testDb.url;
    pool = new Pool({ connectionString: testDb.url, max: 2 });
    const db = drizzle(pool, { schema });
    setDb(db);
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../db/migrations", import.meta.url)) });

    const port = await freePort();
    const base = `http://127.0.0.1:${port}`;
    let serverOutput = "";
    app = spawn(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"),
      "start", "--hostname", "127.0.0.1", "--port", String(port)], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: testDb.url, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    for (const stream of [app.stdout, app.stderr]) {
      stream?.on("data", (chunk: Buffer) => {
        serverOutput = (serverOutput + chunk.toString()).slice(-4000);
      });
    }
    await waitForServer(base, app, () => serverOutput);

    const ids: string[] = [];
    for (const [mode, seed] of [["quick", 24], ["season", 147]] as const) {
      const payload: SeasonPayload = {
        gmName: `HTTP ${mode} test`, mode, seed, simVersion: SIM_VERSION,
        dataFingerprint: DATA_FINGERPRINT, programSlug: "texas", budgetM: GAME_BUDGET_M,
        alloc: cappedOptimalAllocation(GAME_BUDGET_M),
      };
      assert(SeasonPayloadSchema.safeParse(payload).success);
      const replay = replaySeason(payload);
      const key = randomUUID();
      const posted = await publish(base, payload, key);
      assert.equal(posted.status, 201, `${mode}: ${posted.body.error}`);
      assert(posted.body.id);
      ids.push(posted.body.id);
      const saved = await getSeason(posted.body.id);
      assert(saved);
      assert.equal(saved.verified, true);
      assert.equal(saved.wins, replay.summary.wins);
      assert.equal(saved.losses, replay.summary.losses);
      assert.deepEqual(saved.games.map((g) => [g.oppSlug, g.scoreFor, g.scoreAgainst, g.stage ?? null]),
        replay.games.map((g) => [g.opponent.slug, g.result!.scoreFor, g.result!.scoreAgainst, g.stage ?? null]));

      const share = await fetch(`${base}/s/${posted.body.id}`);
      const html = await share.text();
      assert.equal(share.status, 200);
      assert(html.includes(`HTTP ${mode} test`));
      assert(html.includes(`${saved.wins}–${saved.losses}`));
      assert(/Wk\s*(<!-- -->)?\s*1/.test(html));
      const retry = await publish(base, payload, key);
      assert.equal(retry.status, 201);
      assert.equal(retry.body.id, posted.body.id);
      console.log(`  ok ${mode} publish, canonical row, share, and idempotent retry`);
    }

    assert.equal(await countSeasons(), 2);
    const payload: SeasonPayload = {
      gmName: "Rejected", mode: "quick", seed: 42, simVersion: SIM_VERSION,
      dataFingerprint: DATA_FINGERPRINT, programSlug: "texas", budgetM: GAME_BUDGET_M,
      alloc: cappedOptimalAllocation(GAME_BUDGET_M),
    };
    assert.equal((await publish(base, { ...payload, wins: 99 })).status, 422);
    assert.equal((await publish(base, { ...payload, dataFingerprint: "v1-0000000000000000" })).status, 409);
    assert.equal(await countSeasons(), 2, "rejected input must not create rows");
    console.log("  ok forged result and stale version rejected without inserts");

    for (const path of ["/leaderboard", "/leaderboard?sort=overachieve"]) {
      const response = await fetch(base + path);
      const html = await response.text();
      assert.equal(response.status, 200);
      for (const id of ids) assert(html.includes(`/s/${id}`));
    }
    const og = await fetch(`${base}/s/${ids[0]}/opengraph-image`);
    assert.equal(og.status, 200);
    assert.match(og.headers.get("content-type") ?? "", /image\/png/);
    assert((await og.arrayBuffer()).byteLength > 10_000);
    assert.equal((await fetch(`${base}/s/doesnotexist`)).status, 404);
    console.log("  ok leaderboard, OG image, and unknown-share 404");
  } finally {
    if (app && app.exitCode === null) {
      app.kill();
      await Promise.race([
        new Promise((resolve) => app!.once("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);
    }
    resetDb();
    if (pool) await pool.end();
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    await testDb.close();
  }
  console.log("All isolated HTTP share tests passed.");
}

main().catch((error) => { console.error(error); process.exit(1); });
