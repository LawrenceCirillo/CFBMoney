/** Publish route checks with a disposable PostgreSQL database. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { POST } from "../app/api/seasons/route";
import { resetDb, setDb } from "../db/client";
import { countSeasons, getSeason } from "../db/seasons";
import * as schema from "../db/schema";
import { cappedOptimalAllocation, emptyAllocation } from "../lib/simulator";
import { DATA_FINGERPRINT, SIM_VERSION, replaySeason } from "../lib/season-replay";
import type { SeasonPayload } from "../lib/season-payload";
import { startTestPostgres } from "./test-postgres";

const input = (mode: "quick" | "season", seed: number): SeasonPayload => {
  const base: SeasonPayload = {
    mode, seed, simVersion: SIM_VERSION, dataFingerprint: DATA_FINGERPRINT,
    programSlug: "texas", budgetM: 30, alloc: cappedOptimalAllocation(30),
    gameplan: [], autoGameplan: true,
  };
  return mode === "season" ? { ...base, gameplan: replaySeason(base).games.map((game) => ({
    week: game.week, off: "balanced", def: "base",
  })) } : base;
};

async function publishRaw(raw: string, key?: string, contentLength?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) headers["Idempotency-Key"] = key;
  if (contentLength !== undefined) headers["Content-Length"] = contentLength;
  const response = await POST(new Request("http://localhost/api/seasons", {
    method: "POST", headers, body: raw,
  }));
  return { status: response.status, body: await response.json() as { id?: string; error?: string } };
}

async function publish(body: unknown, key = randomUUID()) {
  return publishRaw(JSON.stringify(body), key);
}

async function main() {
  const testDb = await startTestPostgres("route-test");
  const previousUrl = process.env.DATABASE_URL;
  let pool: Pool | undefined;
  try {
    process.env.DATABASE_URL = testDb.url;
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
      assert.equal(row.publishKey !== null, true);
      const replay = replaySeason(request);
      assert.equal(row.verified, true);
      assert.equal(row.wins, replay.summary.wins);
      assert.deepEqual(row.games.map((g) => [g.oppSlug, g.scoreFor, g.scoreAgainst, g.stage ?? null]),
        replay.games.map((g) => [g.opponent.slug, g.result!.scoreFor, g.result!.scoreAgainst, g.stage ?? null]));
      console.log(`  ok ${mode} POST stores server-derived results`);
    }

    const mixed = input("season", 812);
    const regular = mixed.gameplan.filter((pick) => pick.week <= 12).map((pick) => ({
      ...pick,
      off: pick.week % 2 ? "air" as const : "ground" as const,
      def: pick.week % 2 ? "blitz" as const : "bracket" as const,
    }));
    const provisional = replaySeason({ ...mixed, gameplan: regular });
    mixed.gameplan = provisional.games.map((game) => regular.find((pick) => pick.week === game.week) ??
      { week: game.week, off: "balanced", def: "base" });
    mixed.autoGameplan = false;
    const mixedReplay = replaySeason(mixed);
    const mixedResponse = await publish(mixed);
    assert.equal(mixedResponse.status, 201, `mixed gameplan publish succeeds: ${mixedResponse.body.error}`);
    const mixedRow = await getSeason(mixedResponse.body.id!);
    assert(mixedRow);
    assert.equal(mixedRow.verified, true);
    assert.deepEqual(mixedRow.gameplan, mixed.gameplan);
    assert.deepEqual(mixedRow.starterAlloc, mixed.alloc);
    assert.deepEqual(mixedRow.games.map((game) => game.gameplan), mixedReplay.games.map((game) => game.gameplan));
    assert.deepEqual(mixedRow.games.map((game) => [game.scoreFor, game.scoreAgainst]),
      mixedReplay.games.map((game) => [game.result!.scoreFor, game.result!.scoreAgainst]));
    const storedReplay = replaySeason({
      mode: mixedRow.mode!, simVersion: mixedRow.simVersion!, dataFingerprint: mixedRow.dataFingerprint!,
      seed: mixedRow.seed, programSlug: mixedRow.programSlug, budgetM: mixedRow.budgetM,
      alloc: mixedRow.starterAlloc!, gameplan: mixedRow.gameplan!, autoGameplan: mixedRow.autoGameplan!,
    });
    assert.deepEqual(storedReplay.games.map((game) => [game.opponent.slug, game.result, game.gameplan]),
      mixedReplay.games.map((game) => [game.opponent.slug, game.result, game.gameplan]));
    console.log("  ok mixed weekly picks replay exactly on server and publish verified");

    const cappedBudget = { ...input("quick", 422), budgetM: 55, alloc: cappedOptimalAllocation(55) };
    const cappedResponse = await publish(cappedBudget);
    assert.equal(cappedResponse.status, 201, `capped starter book publish succeeds: ${cappedResponse.body.error}`);
    assert.equal((await getSeason(cappedResponse.body.id!))?.verified, true);
    console.log("  ok $55M book reserves spend above starter caps for depth");

    const valid = input("quick", 999);
    const invalid: [unknown, number, string][] = [
      [{ ...valid, wins: 99 }, 422, "forged wins"],
      [{ ...valid, games: [{ scoreFor: 250 }] }, 422, "forged scores"],
      [{ ...valid, programSlug: "fake-program" }, 422, "unknown program"],
      [{ ...valid, alloc: { ...valid.alloc, QB: 50 } }, 422, "allocation cap"],
      [{ ...valid, alloc: { ...valid.alloc, QB: 5, RB: 5, WR: 8, OL: 8, DL: 8, LB: 4, DB: 4, ST: 2 } }, 422, "allocation total"],
      [{ ...valid, alloc: emptyAllocation() }, 422, "empty roster"],
      [{ ...valid, alloc: { ...valid.alloc, QB: valid.alloc.QB - 0.1 } }, 422, "under-spent roster"],
      [{ ...cappedBudget, alloc: valid.alloc }, 422, "under-spent capped roster"],
      [{ ...mixed, gameplan: mixed.gameplan.slice(0, -1) }, 422, "incomplete manual gameplan"],
      [{ ...mixed, autoGameplan: true, gameplan: mixed.gameplan.slice(0, -1) }, 422, "incomplete auto gameplan"],
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
    assert.equal(await countSeasons(), 4, "invalid requests insert no row");

    const before = await countSeasons();
    assert.equal((await publishRaw("{", randomUUID())).status, 400, "malformed JSON rejected");
    assert.equal((await publishRaw("x".repeat(16 * 1024 + 1), randomUUID())).status, 413,
      "oversized body without Content-Length rejected");
    assert.equal((await publishRaw("x".repeat(16 * 1024 + 1), randomUUID(), "1")).status, 413,
      "false Content-Length cannot bypass streaming cap");
    assert.equal((await publishRaw("{}", randomUUID(), String(16 * 1024 + 1))).status, 413,
      "large declared length rejected early");
    assert.equal((await publishRaw(JSON.stringify(valid))).status, 400,
      "missing idempotency key rejected");
    assert.equal(await countSeasons(), before, "bad requests insert no row");
    console.log("  ok request cap, malformed JSON, and missing key rejected");

    const retryKey = randomUUID();
    const [first, second] = await Promise.all([publish(valid, retryKey), publish(valid, retryKey)]);
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(first.body.id, second.body.id, "concurrent retries share one id");
    assert.equal(await countSeasons(), before + 1, "concurrent retries insert one row");
    console.log("  ok concurrent route retries share one saved season");
  } finally {
    resetDb();
    if (pool) await pool.end();
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    await testDb.close();
  }
  console.log("All publish route tests passed.");
}

main().catch((error) => { console.error(error); process.exit(1); });
