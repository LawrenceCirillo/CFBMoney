/** Integration checks against a disposable PostgreSQL cluster. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
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
import { startTestPostgres } from "./test-postgres";

const payload = (mode: "quick" | "season", seed: number): SeasonPayload => {
  const base: SeasonPayload = {
    mode, seed, simVersion: SIM_VERSION, dataFingerprint: DATA_FINGERPRINT,
    programSlug: "texas", budgetM: 55, alloc: cappedOptimalAllocation(55, { programSlug: "texas", gravityOn: true }),
    gameplan: [], autoGameplan: true, gravityOn: true, gravityVersion: "v1",
  };
  return mode === "season" ? { ...base, gameplan: replaySeason(base).games.map((game) => ({
    week: game.week, off: "balanced", def: "base",
  })) } : base;
};

async function main() {
  // tsx compiles Next's JSX as classic React in this direct test harness.
  (globalThis as { React?: typeof React }).React = React;
  const testDb = await startTestPostgres("db-test");
  const previousUrl = process.env.DATABASE_URL;
  let pool: Pool | undefined;
  try {
    process.env.DATABASE_URL = testDb.url;
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    const db = drizzle(pool, { schema });
    setDb(db);
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../db/migrations", import.meta.url)) });

    for (const [mode, seed] of [["quick", 24], ["season", 147]] as const) {
      const input = payload(mode, seed);
      const replay = replaySeason(input);
      const id = await createSeason({ ...input, gmName: " Coach K " }, randomUUID());
      const row = await getSeason(id);
      assert(row, `${mode} row exists`);
      assert.equal(row.gmName, "Coach K");
      assert.equal(row.verified, true);
      assert.equal(row.mode, mode);
      assert.equal(row.simVersion, SIM_VERSION);
      assert.equal(row.gravityOn, true);
      assert.equal(row.gravityVersion, "v1");
      assert.equal(row.dataFingerprint, DATA_FINGERPRINT);
      assert.equal(row.wins, replay.summary.wins);
      assert.equal(row.losses, replay.summary.losses);
      assert(Math.abs(row.expectedWins - replay.summary.expectedWins) < 1e-5);
      assert(Math.abs(row.off - replay.ratings.off) < 1e-5);
      assert.equal(row.tags.join("|"), replay.tags.join("|"));
      assert.equal(row.games.length, replay.games.length);
      assert.deepEqual(row.games.map((g) => [g.week, g.oppSlug, g.scoreFor, g.scoreAgainst, g.stage ?? null]),
        replay.games.map((g) => [g.week, g.opponent.slug, g.result?.scoreFor, g.result?.scoreAgainst, g.stage ?? null]));
      const shareHtml = renderToStaticMarkup(await ShareSeasonPage({ params: Promise.resolve({ id }) }));
      assert.match(shareHtml, new RegExp(`Season projection</p><p[^>]*>${row.expectedWins.toFixed(1)}</p>`));
      assert.match(shareHtml, /Gravity on · v4/);
      assert(!shareHtml.includes(row.dataFingerprint!));
      console.log(`  ok ${mode}: stored result matches canonical replay`);
    }

    const retryKey = randomUUID();
    const retryInput = payload("quick", 248);
    const [firstId, secondId] = await Promise.all([
      createSeason(retryInput, retryKey), createSeason(retryInput, retryKey),
    ]);
    assert.equal(firstId, secondId, "concurrent publish attempts return the same id");
    assert.equal((await getSeason(firstId))?.publishKey, retryKey);
    assert.equal(await countSeasons(), 3, "concurrent publish attempts insert one row");
    assert.equal(await createSeason(retryInput, retryKey), firstId, "later retry returns the same id");
    assert.equal(await countSeasons(), 3);
    console.log("  ok concurrent and later retries are idempotent");

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
    assert.equal(await countSeasons(), 3);
    assert.equal(await countSeasons(false), 1);
    const byWins = await getLeaderboard("wins");
    const byOver = await getLeaderboard("overachieve");
    assert.equal(byWins.length, 3);
    assert.equal(byOver.length, 3);
    assert(!byWins.some((row) => row.id === "legacy0001"));
    assert(!byOver.some((row) => row.id === "legacy0001"));
    assert(byWins[0].wins >= byWins[1].wins);
    assert(byOver[0].wins - byOver[0].expectedWins >= byOver[1].wins - byOver[1].expectedWins);
    console.log("  ok legacy links survive and never receive verified rank");

    await db.insert(schema.seasons).values({
      ...legacyRow, id: "rules00001", verified: true, simVersion: 1, wins: 98,
    });
    assert.equal(await countSeasons(), 3, "earlier verified rules do not enter current ranks");
    assert.equal(await countSeasons(false), 2);
    assert((await getLegacyArchive()).some((row) => row.id === "rules00001" && row.verified));
    assert(!(await getLeaderboard()).some((row) => row.id === "rules00001"));
    const earlierHtml = renderToStaticMarkup(await ShareSeasonPage({ params: Promise.resolve({ id: "rules00001" }) }));
    assert.match(earlierHtml, /Verified under an earlier game model/);
    console.log("  ok earlier verified ruleset stays shareable but is not ranked with current seasons");

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
    await testDb.close();
  }
  console.log("All db tests passed.");
}

main().catch((error) => { console.error(error); process.exit(1); });
