/** Real HTTP publish → share → leaderboard smoke test on a disposable local DB. */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { chromium, expect, type Browser, type Page, type Locator } from "@playwright/test";
import { resetDb, setDb } from "../db/client";
import { countSeasons, getSeason } from "../db/seasons";
import * as schema from "../db/schema";
import { GAME_BUDGET_M, PLAYSHEET_SLOTS, cappedOptimalAllocation, distributeAllocationToSlots } from "../lib/simulator";
import { ACTIVE_RUNS_KEY, emptySession, encodeBuildSession, type ActiveRun } from "../lib/build-session";
import { gameplanNarration } from "../lib/gameplan";
import { gameplanOdds } from "../lib/gameplan-display";
import { DATA_FINGERPRINT, SIM_VERSION, replaySeason } from "../lib/season-replay";
import { SeasonPayloadSchema, type SeasonPayload } from "../lib/season-payload";
import { freePort, startTestPostgres } from "./test-postgres";

import historical from "./fixtures/model-v4-replays.json";
import { getTeam } from "../lib/data";
import goldens from "./fixtures/model-v5-replays.json";

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

async function publish(base: string, payload: unknown, key: string = randomUUID()) {
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
  let browser: Browser | undefined;
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
    const fixtures: { id: string; payload: SeasonPayload }[] = [];
    for (const [mode, seed] of [["quick", 24], ["season", 147]] as const) {
      const payload: SeasonPayload = {
        gmName: `HTTP ${mode} test`, mode, seed, simVersion: SIM_VERSION,
        dataFingerprint: DATA_FINGERPRINT, programSlug: "texas", budgetM: GAME_BUDGET_M,
        alloc: cappedOptimalAllocation(GAME_BUDGET_M, { programSlug: "texas", gravityOn: true }),
        gameplan: [], autoGameplan: true, gravityOn: true, gravityVersion: "v1",
      };
      if (mode === "season") {
        Object.assign(payload, SeasonPayloadSchema.parse(goldens.find((fixture) => fixture.name === "season-manual-four-rounds")!.input));
        assert.equal(replaySeason(payload).games.length, 16);

      }
      assert(SeasonPayloadSchema.safeParse(payload).success);
      const replay = replaySeason(payload);
      const key = randomUUID();
      const posted = await publish(base, payload, key);
      assert.equal(posted.status, 201, `${mode}: ${posted.body.error}`);
      assert(posted.body.id);
      ids.push(posted.body.id);
      fixtures.push({ id: posted.body.id, payload });
      const saved = await getSeason(posted.body.id);
      assert(saved);
      assert.equal(saved.verified, true);
      assert.equal(saved.gravityOn, true);
      assert.equal(saved.gravityVersion, "v1");
      assert.equal(saved.wins, replay.summary.wins);
      assert.equal(saved.losses, replay.summary.losses);
      assert.deepEqual(saved.games.map((g) => [g.oppSlug, g.scoreFor, g.scoreAgainst, g.stage ?? null]),
        replay.games.map((g) => [g.opponent.slug, g.result!.scoreFor, g.result!.scoreAgainst, g.stage ?? null]));
      assert.deepEqual(saved.gameplan, payload.gameplan);
      assert.deepEqual(saved.alloc, replay.fullAlloc);
      assert.deepEqual(saved.starterAlloc, payload.alloc);
      assert(Math.abs(saved.expectedWins - replay.summary.expectedWins) < 1e-5);
      assert.deepEqual(saved.games.map((game) => [game.week, game.oppSlug, game.venue, game.stage, game.playerSeed, game.opponentSeed, game.winProb, game.gameplan, game.scoreFor, game.scoreAgainst, game.won]),
        replay.games.map((game) => [game.week, game.opponent.slug, game.venue, game.stage, game.playerSeed, game.opponentSeed, game.winProb, game.gameplan, game.result!.scoreFor, game.result!.scoreAgainst, game.result!.won]));
      if (mode === "season") assert(saved.games.filter((game) => game.stage).every((game) => game.playerSeed === replay.postseasonSeed), "frozen seed survives HTTP replay/storage");
      assert.deepEqual(saved.games.map((g) => g.gameplan), replay.games.map((g) => g.gameplan));

      const share = await fetch(`${base}/s/${posted.body.id}`);
      const html = await share.text();
      const visibleHtml = html.replace(/<!-- -->/g, "");
      assert.equal(share.status, 200);
      assert(html.includes(`HTTP ${mode} test`));
      assert(html.includes(`${saved.wins}–${saved.losses}`));
      assert(/Gravity\s*(?:<!-- -->)?\s*on/.test(html));
      assert(visibleHtml.includes("Gravity on · v5"));
      assert(!html.includes(saved.dataFingerprint!));
      assert(/Wk\s*(<!-- -->)?\s*1/.test(html));
      if (mode === "season") {
        assert(html.includes("Gameplan record"));
        assert(html.includes("Air it out"));
        assert(html.includes("Blitz heavy"));
        assert(!html.includes("confidence") && !html.includes("note"));
        const first = saved.games[0];
        assert(visibleHtml.includes(gameplanOdds(first.winProb, first.gameplan!).summary), "share displays stored applied odds without replaying the old model");
      }
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
      gameplan: [], autoGameplan: true, gravityOn: true, gravityVersion: "v1",
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

    // This browser talks only to the disposable local server/database above.
    browser = await chromium.launch();
    const recoveryContext = await browser.newContext();
    try {
      const mixed = fixtures.find((fixture) => fixture.payload.mode === "season")!.payload;
      const full = replaySeason(mixed);
      const { gmName: _gmName, ...input } = mixed;
      const run: ActiveRun = { id: randomUUID(), input, pos: distributeAllocationToSlots(input.alloc),
        completedGames: full.games.length, featured: full.games.length - 1, pending: null, publish: null };
      const raw = encodeBuildSession({ ...emptySession(), runs: { season: run } });
      const page = await recoveryContext.newPage();
      await page.goto(base);
      await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: ACTIVE_RUNS_KEY, raw });
      await page.goto(base + "/build");
      await page.getByRole("textbox", { name: "GM name (optional)" }).fill("Recovered mixed-call GM");
      let lostId: string | undefined;
      let lostKey: string | undefined;
      let requests = 0;
      await page.route("**/api/seasons", async (route) => {
        requests++;
        lostKey = route.request().headers()["idempotency-key"];
        const response = await route.fetch();
        assert.equal(response.status(), 201);
        lostId = (await response.json()).id;
        await route.abort("failed"); // Server committed; response never reached the client.
      });
      await page.getByRole("button", { name: "Publish season", exact: true }).click();
      await expect.poll(() => lostId).toBeTruthy();
      await expect(page.getByRole("button", { name: "Publish season", exact: true })).toBeEnabled();
      await page.reload();
      await expect(page.getByRole("button", { name: "Publish season", exact: true })).toBeVisible();
      assert.equal(requests, 1, "restoring must not publish automatically");
      const savedAttempt = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).runs.season.publish, ACTIVE_RUNS_KEY);
      assert.equal(savedAttempt.key, lostKey);
      assert.deepEqual(savedAttempt.payload.gameplan, mixed.gameplan);
      assert.equal(savedAttempt.payload.gmName, "Recovered mixed-call GM");
      await page.unroute("**/api/seasons");
      const retryResponse = page.waitForResponse((response) => response.url() === base + "/api/seasons" && response.request().method() === "POST");
      await page.getByRole("button", { name: "Publish season", exact: true }).click();
      const retry = await retryResponse;
      assert.equal(retry.request().headers()["idempotency-key"], lostKey);
      assert.deepEqual(retry.request().postDataJSON(), savedAttempt.payload);
      assert.equal((await retry.json()).id, lostId);
      await expect(page.getByRole("link", { name: "Open recap", exact: true })).toHaveAttribute("href", `/s/${lostId}`);
      await page.reload();
      await expect(page.getByRole("link", { name: "Open recap", exact: true })).toHaveAttribute("href", `/s/${lostId}`);
      await expect(page.getByRole("button", { name: "Publish season", exact: true })).toHaveCount(0);
      assert.equal(await countSeasons(), 3, "lost response/reloaded retry creates one row");
      const recovered = await getSeason(lostId!);
      assert(recovered);
      assert.deepEqual(recovered.gameplan, mixed.gameplan);
      fixtures.push({ id: lostId!, payload: savedAttempt.payload });
      console.log("  ok browser lost-response retry after reload reuses exact UUID/payload, one row, restored completed publication");

      await page.getByRole("button", { name: "Replay this challenge", exact: true }).click();
      const preserved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), ACTIVE_RUNS_KEY);
      assert.equal(preserved.runs.season.publish.result.id, lostId, "opening a rematch does not replace the original publication");
      const slot = PLAYSHEET_SLOTS.find((slot) => run.pos[slot.key] + 0.5 <= slot.cap)!;
      const slotButton = page.locator(`[data-slot-key="${slot.key}"]:visible`).first();
      const slotLabel = (await slotButton.getAttribute("aria-label"))!.split(",")[0].replace(/\s*\([^)]*\)$/, "");
      await slotButton.click();
      await page.getByRole("button", { name: `Increase ${slotLabel} spend`, exact: true }).click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      const initialRematch = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).runs.season as ActiveRun, ACTIVE_RUNS_KEY);
      assert.notEqual(initialRematch.id, run.id);
      assert.equal(initialRematch.publish, null);
      assert.notDeepEqual(initialRematch.input.alloc, run.input.alloc);
      assert.deepEqual(replaySeason(initialRematch.input, 0).games.map((game) => [game.opponent.slug, game.isHome]), replaySeason(run.input, 0).games.map((game) => [game.opponent.slug, game.isHome]));
      await page.getByRole("button", { name: "Ground & pound", exact: true }).click();
      await page.getByRole("button", { name: "Base defense", exact: true }).click();
      await page.getByRole("button", { name: "Kick off", exact: true }).click();
      await page.getByRole("button", { name: "Play next week", exact: true }).click();
      await page.getByRole("checkbox", { name: "Auto gameplan for the rest of the season", exact: true }).check();
      await page.getByRole("button", { name: "Sim to end", exact: true }).click();
      await page.getByRole("textbox", { name: "GM name (optional)" }).fill("Rematch mixed-call GM");
      const rematchResponse = page.waitForResponse((response) => response.url() === base + "/api/seasons" && response.request().method() === "POST");
      await page.getByRole("button", { name: "Publish season", exact: true }).click();
      const postedRematch = await rematchResponse;
      assert.equal(postedRematch.status(), 201);
      const rematchId = (await postedRematch.json()).id as string;
      const rematchPayload = postedRematch.request().postDataJSON() as SeasonPayload;
      const rematchKey = postedRematch.request().headers()["idempotency-key"];
      assert.notEqual(rematchKey, lostKey);
      assert.notEqual(rematchId, lostId);
      const savedRematch = await getSeason(rematchId);
      assert(savedRematch?.verified);
      const expectedRematch = replaySeason(rematchPayload);
      assert.deepEqual(savedRematch.games.map((game) => [game.oppSlug, game.scoreFor, game.scoreAgainst, game.gameplan]), expectedRematch.games.map((game) => [game.opponent.slug, game.result!.scoreFor, game.result!.scoreAgainst, game.gameplan]));
      assert.equal((await publish(base, rematchPayload, rematchKey)).body.id, rematchId);
      assert.equal((await publish(base, savedAttempt.payload, lostKey)).body.id, lostId);
      assert.equal((await fetch(`${base}/s/${lostId}`)).status, 200);
      assert.equal(await countSeasons(), 4);
      fixtures.push({ id: rematchId, payload: rematchPayload });
      console.log("  ok changed-roster/mixed-call rematch preserves all 12 venues/opponents, replays exactly on the server, and publishes independently/idempotently from its live original share");
    } finally { await recoveryContext.close(); }

    // Fixed inputs exercise both signs and short/long margin and record values.
    for (const [budgetM, seed] of [[55, 81], [55, 113], [10, 269], [10, 268]]) {
      const payload: SeasonPayload = { mode: "quick", seed, simVersion: SIM_VERSION, dataFingerprint: DATA_FINGERPRINT,
        programSlug: "texas", budgetM, alloc: cappedOptimalAllocation(budgetM), gameplan: [], autoGameplan: true,
        gravityOn: false, gravityVersion: "v1", gmName: `Mobile ${budgetM}/${seed}` };
      const posted = await publish(base, payload);
      assert.equal(posted.status, 201);
      fixtures.push({ id: posted.body.id!, payload });
    }
    const archived = await getSeason(ids[0]);
    assert(archived);
    const original = historical.find((fixture) => fixture.input.mode === "season")!;
    const oldGames = original.games.map((game) => ({ week: game.week, oppName: getTeam(game.opponent)!.name,
      oppSlug: game.opponent, oppColor: getTeam(game.opponent)!.color, isHome: game.isHome,
      winProb: game.winProb, stage: game.stage ?? undefined, gameplan: game.gameplan,
      ...game.result })) as schema.StoredGame[];
    const oldWins = oldGames.filter((game) => game.won).length;
    await db.insert(schema.seasons).values({ ...archived,
      ...original.input, starterAlloc: original.input.alloc, mode: "season", verified: true,
      gameplan: oldGames.map((game) => ({ week: game.week, off: game.gameplan!.off, def: game.gameplan!.def })),
      off: original.ratings.off, def: original.ratings.def, st: original.ratings.st,
      games: oldGames, wins: oldWins, losses: oldGames.length - oldWins,
      expectedWins: oldGames.reduce((sum, game) => sum + game.winProb, 0),
      avgMargin: oldGames.reduce((sum, game) => sum + game.scoreFor - game.scoreAgainst, 0) / oldGames.length,
      id: "archive-v4", publishKey: randomUUID(), gmName: "Archived model fixture",
    });
    await db.insert(schema.seasons).values({ ...archived, id: "archive-no-calls", publishKey: randomUUID(), simVersion: 2, mode: "season", gmName: "Legacy without weekly calls", gameplan: [], games: archived.games.map(({ gameplan: _gameplan, ...game }) => game) });
    for (const width of [320, 390]) for (const theme of ["light", "dark"] as const) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: theme });
      try {
        const page = await context.newPage();
        await page.addInitScript((theme) => localStorage.setItem("cfb-money-theme", theme), theme);
        for (const fixture of fixtures) {
          const saved = await getSeason(fixture.id);
          assert(saved);
          await page.goto(`${base}/s/${fixture.id}`);
          await expect(page.getByRole("heading", { name: saved.programName, exact: true })).toBeVisible();
          await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^(?!.*dark)/);
          await expect(page.getByText(`${saved.wins}–${saved.losses}`, { exact: true }).first()).toBeVisible();
          const summary = page.getByText("Season projection", { exact: true }).locator("..");
          await expect(summary.getByText(saved.expectedWins.toFixed(1), { exact: true })).toBeVisible();
          await assertSingleLine(summary.getByText(saved.expectedWins.toFixed(1), { exact: true }));
          await expect(page.getByText("Avg margin", { exact: true }).locator("..").getByText(`${saved.avgMargin > 0 ? "+" : ""}${saved.avgMargin.toFixed(1)}`, { exact: true })).toBeVisible();
          await assertSingleLine(page.getByText("Avg margin", { exact: true }).locator("..").getByText(`${saved.avgMargin > 0 ? "+" : ""}${saved.avgMargin.toFixed(1)}`, { exact: true }));
          await expect(page.getByText("Roster rating", { exact: true }).locator("..").getByText(String(Math.round((saved.off + saved.def) / 2)), { exact: true })).toBeVisible();
          const gameLog = page.getByText("Game log", { exact: true }).locator("..");
          for (const [index, game] of saved.games.entries()) {
            const row = gameLog.locator(":scope > div").nth(index).locator(":scope > div").first();
            await expect(row).toContainText(game.oppName);
            await expect(row).toContainText(`${game.scoreFor}–${game.scoreAgainst}`);
            const opponent = row.locator("p").first();
            assert(await opponent.evaluate((element) => getComputedStyle(element).textOverflow !== "ellipsis" && element.scrollWidth <= element.clientWidth + 1), "full opponent name fits without truncation");
            if (saved.mode === "season" && game.gameplan) {
              const narration = row.getByText(gameplanNarration(game.gameplan, game.won, game.oppName, game.winProb), { exact: true });
              await expect(narration).toBeVisible();
              const textWidth = await narration.evaluate((element) => element.getBoundingClientRect().width);
              const contentWidth = await row.evaluate((element) => {
                const style = getComputedStyle(element);
                return element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
              });
              assert(textWidth >= contentWidth * 0.95, "narration spans the game row rather than wrapping in the narrow opponent column");
            }
          }
          await assertFits(page, `${width} ${theme} recap ${fixture.id}`);
        }
        for (const sort of ["overachieve", "wins"]) {
          await page.goto(`${base}/leaderboard?sort=${sort}`);
          const board = page.getByRole("list", { name: sort === "wins" ? "Most wins leaderboard" : "Biggest overachievers leaderboard" });
          await expect(board).toBeVisible();
          for (const fixture of fixtures) {
            const saved = await getSeason(fixture.id);
            assert(saved);
            const card = board.getByRole("link").filter({ hasText: saved.gmName! });
            await expect(card).toBeVisible();
            await expect(card).toContainText(`${saved.wins}–${saved.losses}`);
            await expect(card).toContainText(saved.expectedWins.toFixed(1));
            const diff = saved.wins - saved.expectedWins;
            await expect(card).toContainText(`${diff > 0 ? "+" : ""}${diff.toFixed(1)}`);
            await expect(card).toContainText(`$${saved.budgetM.toFixed(1)}M`);
            for (const numeric of await card.locator("p.tabular-nums, dd.tabular-nums").all()) await assertSingleLine(numeric);
          }
          await assertFits(page, `${width} ${theme} ${sort} leaderboard`);
          await expect(page.getByRole("heading", { name: "Earlier seasons · unranked archive" })).toBeVisible();
          await expect(page.getByRole("link", { name: /Archived model fixture/ })).toBeVisible();
        }
        await page.goto(`${base}/s/archive-v4`);
        await expect(page.getByText(/Verified under an earlier game model/)).toBeVisible();
        await expect(page.getByText(/Earlier model · three-round record/)).toBeVisible();
        await expect(page.locator('[data-path-stage="fr"]')).toHaveCount(0);
        await expect(page.getByText("Gravity on · v4", { exact: true })).toBeVisible();
        await expect(page.getByText("Season projection", { exact: true }).locator("..").getByText(oldGames.reduce((sum, game) => sum + game.winProb, 0).toFixed(1), { exact: true })).toBeVisible();
        await assertFits(page, `${width} ${theme} archived recap`);
        await page.goto(`${base}/s/archive-no-calls`);
        await expect(page.getByText("Weekly calls were not recorded for this season.", { exact: true })).toBeVisible();
        await expect(page.getByText(/Weekly calls not recorded/).first()).toBeVisible();
        await assertFits(page, `${width} ${theme} legacy without calls`);
      } finally { await context.close(); }
    }
    console.log("  ok populated recaps and both leaderboard sorts at 320/390 in both themes: values, opponents, narration and overflow");
    const titlePathId = fixtures.find((fixture) => fixture.payload.mode === "season")!.id;
    for (const theme of ["light", "dark"] as const) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: theme });
      try {
        const page = await context.newPage();
        await page.addInitScript((theme) => localStorage.setItem("cfb-money-theme", theme), theme);
        await page.goto(`${base}/s/${titlePathId}`);
        const path = page.getByRole("region", { name: "Your playoff path" });
        await expect(path.locator("[data-path-stage]")).toHaveCount(4);
        await expect(path).toContainText("qualification seed #11");
        await expect(path.locator('[data-path-stage="fr"]')).toContainText("Away · higher seed hosts");
        await path.screenshot({ path: resolve(root, "test-results", `plan013-share-v5-${theme}.png`) });
        await assertFits(page, `desktop ${theme} v5 sixteen-game recap`);
        await page.goto(`${base}/s/archive-v4`);
        await expect(page.getByText(/Earlier model · three-round record/)).toBeVisible();
        await expect(page.locator("[data-path-stage]")).toHaveCount(3);
        await expect(page.getByText("Not played · earlier model", { exact: true })).toBeVisible();
        await expect(page.getByRole("region", { name: "Your playoff path" })).not.toContainText("higher seed hosts");
        await expect(page.getByRole("region", { name: "Your playoff path" })).not.toContainText("Opponent projected/TBD");
        await page.getByRole("region", { name: "Your playoff path" }).screenshot({ path: resolve(root, "test-results", `plan013-share-v4-${theme}.png`) });
        await assertFits(page, `desktop ${theme} original v4 recap`);
      } finally { await context.close(); }
    }
    console.log("  ok desktop light/dark v5 four-round and original v4 three-round recaps, saved venues and visual captures");
  } finally {
    if (browser) await browser.close();
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

async function assertFits(page: Page, label: string) {
  for (const numeric of await page.locator("main p.tabular-nums, main dd.tabular-nums").all()) {
    if (await numeric.isVisible()) await assertSingleLine(numeric);
  }
  const problems = await page.evaluate(() => {
    const errors: string[] = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) errors.push("page overflow");
    for (const element of document.querySelectorAll("main p, main dd, main span")) {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height || getComputedStyle(element).display === "none") continue;
      if (rect.left < -1 || rect.right > innerWidth + 1 || element.scrollWidth > element.clientWidth + 1) errors.push(element.textContent?.trim().slice(0, 100) ?? "clipped text");
    }
    return errors;
  });
  assert.deepEqual(problems, [], label);
}

async function assertSingleLine(number: Locator) {
  const lines = await number.evaluate((element) => {
    const range = document.createRange(); range.selectNodeContents(element);
    return [...new Set(Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0).map((rect) => Math.round(rect.top)))];
  });
  assert.equal(lines.length, 1, `Numeric value must occupy one visual line: ${await number.textContent()}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
