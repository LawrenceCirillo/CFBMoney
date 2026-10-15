import { expect, test, type Page } from "@playwright/test";
import { scoreboard } from "../../lib/scores";
import { ACTIVE_RUNS_KEY, type ActiveRun } from "../../lib/build-session";
import { replaySeason } from "../../lib/season-replay";
import { tendencyLabel } from "../../lib/gameplan";

async function savedRun(page: Page, mode: "season" | "quick" = "season"): Promise<ActiveRun> {
  await expect(page.locator("[data-run-id]")).toBeVisible();
  return page.evaluate(({ key, mode }) => JSON.parse(localStorage.getItem(key)!).runs[mode], { key: ACTIVE_RUNS_KEY, mode });
}

async function assertRenderedRun(page: Page, run: ActiveRun) {
  const replay = replaySeason(run.input, run.completedGames);
  const root = page.locator(`[data-run-id="${run.id}"]`);
  await expect(root).toHaveAttribute("data-run-seed", String(run.input.seed));
  const log = page.getByRole("region", { name: run.input.mode === "season" ? "Season game log" : "Quick sim game log", exact: true });
  for (const [index, game] of replay.games.filter((game) => game.result).entries()) {
    const row = log.locator(":scope > div").nth(index);
    await expect(row).toContainText(game.opponent.name);
    await expect(row).toContainText(game.isHome ? "vs" : "at");
    await expect(row).toContainText(`${game.result!.won ? "W" : "L"} ${game.result!.scoreFor}–${game.result!.scoreAgainst}`);
    if (run.input.mode === "season") await expect(row).toContainText(`${tendencyLabel(game.gameplan!.off)} · ${tendencyLabel(game.gameplan!.def)}`);
  }
  await expect(root.getByText(`${run.completedGames}/${replay.games.length}`, { exact: true })).toBeVisible();
  if (run.input.mode === "season" && !replay.complete) {
    const featured = replay.games[run.featured];
    await expect(root.getByRole("heading", { name: featured.opponent.name, exact: true })).toBeVisible();
    await expect(root.getByText(`Week ${featured.week} · ${featured.isHome ? "vs" : "at"}`, { exact: true })).toBeVisible();
  }
}

test("mixed calls survive reveal interruption, reload, navigation and mode round trips", async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 24 / 2 ** 31; });
  await page.goto("/build");
  await page.getByRole("button", { name: "Auto-optimize" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Whose season are you playing?" })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Air it out", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Air it out", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Blitz heavy", exact: true }).click();
  await page.getByRole("button", { name: "Kick off", exact: true }).click();
  // Reload while the 450 ms cosmetic reveal is pending.
  await expect(page.getByRole("button", { name: "Simulating…", exact: true })).toBeVisible();
  await page.reload();
  const first = await savedRun(page);
  expect(first.completedGames).toBe(1);
  await assertRenderedRun(page, first);
  await page.getByRole("button", { name: "Play next week", exact: true }).click();
  await page.getByRole("button", { name: "Ground & pound", exact: true }).click();
  await page.getByRole("button", { name: "Bracket their WR1", exact: true }).click();
  await page.getByRole("button", { name: "Kick off", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play next week", exact: true })).toBeVisible();
  const second = await savedRun(page);
  expect(second.input.seed).toBe(first.input.seed);
  expect(second.completedGames).toBe(2);
  expect(second.input.gameplan.map(({ off, def }) => [off, def])).toEqual([["air", "blitz"], ["ground", "bracket"]]);
  await page.goto("/moneyball");
  await page.goto("/build");
  await assertRenderedRun(page, second);
  await page.getByRole("button", { name: "Quick sim", exact: true }).click();
  await page.getByRole("button", { name: "Sim week 1", exact: true }).click();
  const quick = await savedRun(page, "quick");
  await page.reload();
  await expect(page.getByRole("button", { name: "Quick sim", exact: true })).toHaveAttribute("aria-pressed", "true");
  await assertRenderedRun(page, quick);
  await page.getByRole("button", { name: "Season mode", exact: true }).click();
  await assertRenderedRun(page, second);
  await page.reload();
  await assertRenderedRun(page, second);
  expect(await savedRun(page)).toEqual(second);
  await page.getByRole("button", { name: "Play next week", exact: true }).click();
  await page.getByRole("checkbox", { name: "Auto gameplan for the rest of the season" }).check();
  await page.getByRole("button", { name: "Kick off", exact: true }).click();
  await expect(page.getByRole("button", { name: "Simulating…", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Quick sim", exact: true }).click();
  await assertRenderedRun(page, quick);
  await page.getByRole("button", { name: "Season mode", exact: true }).click();
  const third = await savedRun(page);
  expect(third.completedGames).toBe(3);
  expect(third.input.gameplan.slice(0, 2)).toEqual(second.input.gameplan);
  await assertRenderedRun(page, third);
  await page.getByRole("button", { name: "Play next week", exact: true }).click();
  await page.getByRole("checkbox", { name: "Auto gameplan for the rest of the season" }).uncheck();
  await page.reload();
  const manualAgain = await savedRun(page);
  expect(manualAgain.completedGames).toBe(3);
  expect(manualAgain.input.gameplan).toEqual(third.input.gameplan);
  expect(manualAgain.input.autoGameplan).toBe(false);
  await assertRenderedRun(page, manualAgain);
});

test("draft edits and a different program require explicit run replacement", async ({ page }) => {
  await page.goto("/build?program=texas");
  await page.getByRole("button", { name: "Auto-optimize" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Whose season are you playing?" })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const texas = await savedRun(page);
  await page.getByRole("button", { name: "Build", exact: false }).filter({ hasText: "1 Build" }).click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start new season with current roster", exact: true })).toBeDisabled();
  await expect(page.getByText(/Spend the exact book to start/)).toBeVisible();
  await page.getByRole("button", { name: "Resume season", exact: true }).click();
  await assertRenderedRun(page, texas);
  await page.getByRole("button", { name: "2 Program", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Whose season are you playing?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start new season with current roster", exact: true }).last()).toBeDisabled();
  await expect(page.getByText("Spend the exact selected book in your roster before starting a new season.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume season", exact: true }).click();
  await assertRenderedRun(page, texas);
  await page.getByRole("button", { name: "New season", exact: true }).click();
  const rerolled = await savedRun(page);
  expect(rerolled.id).not.toBe(texas.id);
  expect(rerolled.input.alloc).toEqual(texas.input.alloc);
  expect(rerolled.input.programSlug).toBe("texas");
  await page.goto("/build?program=iowa");
  await expect(page.getByRole("button", { name: "Auto-optimize" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Active season" })).toContainText("Current roster: Iowa");
  expect((await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).runs.season, ACTIVE_RUNS_KEY)).id).toBe(rerolled.id);
  await page.getByRole("button", { name: "Auto-optimize" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Whose season are you playing?" })).toBeVisible();
  await page.getByRole("button", { name: "Start new season with current roster", exact: true }).last().click();
  const iowa = await savedRun(page);
  expect(iowa.id).not.toBe(rerolled.id);
  expect(iowa.input.programSlug).toBe("iowa");
  expect(iowa.input.gameplan).toEqual([]);
  await assertRenderedRun(page, iowa);
});

test("denied storage keeps the game usable with a visible progress notice", async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException("Quota exceeded", "QuotaExceededError"); }; });
  await page.goto("/build");
  await expect(page.getByText(/Progress cannot be saved on this device/)).toBeVisible();
  await page.getByRole("button", { name: "Auto-optimize" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Whose season are you playing?" })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("checkbox", { name: "Auto gameplan for the rest of the season" }).check();
  await page.getByRole("button", { name: "Sim to end" }).click();
  await expect(page.getByText("Season report", { exact: true })).toBeVisible();
});

test("gravity toggle carries from program setup into the season report", async ({ page }) => {
  await page.goto("/build?program=texas");
  await expect(page.getByText(/Gravity preview for Texas: RB \+12%/)).toBeVisible();
  await page.getByRole("button", { name: "Auto-optimize" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const parity = page.getByRole("button", { name: "Off · Pure parity" });
  await parity.click();
  await expect(parity).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(parity).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Back to roster" }).click();
  await expect(page.getByText(/Gravity preview for Texas/)).toHaveCount(0);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("checkbox", { name: "Auto gameplan for the rest of the season" }).check();
  await page.getByRole("button", { name: "Sim to end" }).click();
  await expect(page.getByText("Gravity off · Pure parity · v4")).toBeVisible();
});

test("playsheet survives navigation and both sim modes render", async ({ page }) => {
  await page.goto("/build");
  await expect(page.getByRole("heading", { name: /Build a roster/ })).toBeVisible();
  const continueButton = page.getByRole("button", { name: "Continue", exact: true });
  await expect(continueButton).toBeDisabled();

  const leftTackle = page.getByRole("button", { name: /^Left Tackle, / });
  await leftTackle.click();
  await page.getByRole("button", { name: "Increase Left Tackle spend" }).click();
  await expect(leftTackle).toHaveAttribute("aria-label", /Left Tackle, \$0\.5M/);
  await expect(continueButton).toBeDisabled();
  await page.getByRole("button", { name: "Auto-optimize" }).click();
  await expect(continueButton).toBeEnabled();
  const optimizedLeftTackle = await leftTackle.getAttribute("aria-label");
  await page.reload();
  await expect(leftTackle).toHaveAttribute("aria-label", optimizedLeftTackle!);
  await expect(continueButton).toBeEnabled();
  await page.goto("/moneyball");
  await page.goto("/build");
  await expect(leftTackle).toHaveAttribute("aria-label", optimizedLeftTackle!);
  await expect(continueButton).toBeEnabled();
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(continueButton).toBeDisabled();
  await page.reload();
  await expect(continueButton).toBeDisabled();
  await page.getByRole("button", { name: "Auto-optimize" }).click();
  await expect(continueButton).toBeEnabled();

  await continueButton.click();
  await expect(page.getByRole("heading", { name: "Whose season are you playing?" })).toBeVisible();
  await page.getByRole("button", { name: "Back to roster" }).click();
  await expect(page.getByRole("button", { name: "Auto-optimize" })).toBeVisible();
  await expect(leftTackle).toHaveAttribute("aria-label", optimizedLeftTackle!);

  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Whose season are you playing?" })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText(/Step 3 · Season mode/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Your season scores, Week 1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sim to end" })).toBeDisabled();
  await page.getByRole("checkbox", { name: "Auto gameplan for the rest of the season" }).check();
  await page.getByRole("button", { name: "Sim to end" }).click();
  await expect(page.getByRole("region", { name: "Your season scores, Final" })).toBeVisible();
  await expect(page.getByText(/A neutral plan against|No matchup adjustment against/).first()).toBeVisible();
  await page.getByRole("button", { name: "Quick sim" }).click();
  await expect(page.getByRole("region", { name: new RegExp(`${scoreboard.label} scores`) })).toBeVisible();
  await expect(page.getByText(/Step 3 · Quick sim/)).toBeVisible();
  await page.getByRole("button", { name: "Sim season" }).click();
  await expect(page.getByText("Game log")).toBeVisible();
});

test("playoff run shows the user's path through the bracket", async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 24 / 2 ** 31; });
  await page.goto("/build");
  await page.getByRole("button", { name: "Auto-optimize" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Whose season are you playing?" })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText(/Step 3 · Season mode/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Sim to end" })).toBeDisabled();
  await page.getByRole("checkbox", { name: "Auto gameplan for the rest of the season" }).check();
  await page.getByRole("button", { name: "Sim to end" }).click();

  const path = page.getByRole("region", { name: "Your playoff path" });
  await expect(path).toBeVisible();
  await expect(page.getByRole("region", { name: "Your season scores, Final" })
    .locator("[data-season-week]").first()).toHaveAttribute("data-season-week", "1");
  await expect(path.getByText("Quarterfinal")).toBeVisible();
  await expect(path.getByText("Semifinal")).toBeVisible();
  await expect(path.getByText("National championship")).toBeVisible();
  await expect(path.getByText(/^(?:Eliminated|National champions)$/)).toBeVisible();
});

test("manual week requires two calls and previews their edge", async ({ page }) => {
  await page.goto("/build");
  await page.getByRole("button", { name: "Auto-optimize" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Whose season are you playing?" })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText(/Step 3 · Season mode/)).toBeVisible();

  const kickoff = page.getByRole("button", { name: "Kick off" });
  await expect(kickoff).toBeDisabled();
  await page.getByRole("button", { name: "Air it out" }).click();
  await expect(kickoff).toBeDisabled();
  await page.getByRole("button", { name: "Blitz heavy" }).click();
  await expect(kickoff).toBeEnabled();
  await expect(page.getByText(/Net edge:/)).toBeVisible();
  await kickoff.click();
  await expect(page.getByRole("button", { name: /Play next week|Open season report/ })).toBeVisible();
  await expect(page.getByText(/Air it out · Blitz heavy/)).toBeVisible();
  await page.getByRole("button", { name: "Play next week" }).click();
  await expect(page.getByRole("region", { name: "Your season scores, Week 2" })).toBeVisible();
});
