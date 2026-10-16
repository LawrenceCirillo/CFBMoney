import { expect, test, type Page } from "@playwright/test";
import { scoreboard } from "../../lib/scores";
import { ACTIVE_RUNS_KEY, BUILD_DRAFT_KEY, BUILD_SETUP_KEY, type BuildDraft, type ActiveRun } from "../../lib/build-session";
import { allocationFromPlaysheet, cappedOptimalAllocation, distributeAllocationToSlots } from "../../lib/simulator";
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
  await expect(page.getByRole("heading", { name: "Whose season are you playing?" })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Auto-optimize" }).click();
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
  await expect(page.getByRole("heading", { name: "Whose season are you playing?" })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Auto-optimize" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const texas = await savedRun(page);
  await page.getByRole("button", { name: "Build", exact: false }).filter({ hasText: "2 Build" }).click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start new season with current roster", exact: true })).toBeDisabled();
  await expect(page.getByText(/Spend the exact book to start/)).toBeVisible();
  await page.getByRole("button", { name: "Resume season", exact: true }).click();
  await assertRenderedRun(page, texas);
  await page.getByRole("button", { name: "1 Program", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Whose season are you playing?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start new season with current roster", exact: true }).last()).toBeDisabled();
  await expect(page.getByText(/Spend the exact book to start/)).toBeVisible();
  await page.getByRole("button", { name: "Resume season", exact: true }).click();
  await assertRenderedRun(page, texas);
  await page.getByRole("button", { name: "New season", exact: true }).click();
  const rerolled = await savedRun(page);
  expect(rerolled.id).not.toBe(texas.id);
  expect(rerolled.input.alloc).toEqual(texas.input.alloc);
  expect(rerolled.input.programSlug).toBe("texas");
  await page.goto("/build?program=iowa");
  await expect(page.getByRole("button", { name: /^Program Iowa/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Active season" })).toContainText("Current roster: Iowa");
  expect((await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).runs.season, ACTIVE_RUNS_KEY)).id).toBe(rerolled.id);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Auto-optimize" }).click();
  await page.getByRole("button", { name: "Start new season with current roster", exact: true }).click();
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
  await expect(page.getByRole("heading", { name: "Whose season are you playing?" })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Auto-optimize" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("checkbox", { name: "Auto gameplan for the rest of the season" }).check();
  await page.getByRole("button", { name: "Sim to end" }).click();
  await expect(page.getByText("Season report", { exact: true })).toBeVisible();
});

test("gravity toggle carries from program setup into the season report", async ({ page }) => {
  await page.goto("/build?program=texas");
  const parity = page.getByRole("button", { name: "Off · Pure parity" });
  await parity.click();
  await expect(parity).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(parity).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText(/Gravity preview for Texas/)).toHaveCount(0);
  await page.getByRole("button", { name: "Auto-optimize" }).click();
  await page.getByRole("button", { name: "Edit setup" }).click();
  await expect(parity).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("button", { name: "Auto-optimize" })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("checkbox", { name: "Auto gameplan for the rest of the season" }).check();
  await page.getByRole("button", { name: "Sim to end" }).click();
  await expect(page.getByText("Gravity off · Pure parity · v4")).toBeVisible();
});

test("playsheet survives navigation and both sim modes render", async ({ page }) => {
  await page.goto("/build");
  await expect(page.getByRole("heading", { name: /Build a roster/ })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
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

  await page.getByRole("button", { name: "Edit setup" }).click();
  await expect(page.getByRole("heading", { name: "Whose season are you playing?" })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("button", { name: "Auto-optimize" })).toBeVisible();
  await expect(leftTackle).toHaveAttribute("aria-label", optimizedLeftTackle!);
  await continueButton.click();
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
  await expect(page.getByRole("heading", { name: "Whose season are you playing?" })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Auto-optimize" }).click();
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
  await expect(page.getByRole("heading", { name: "Whose season are you playing?" })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Auto-optimize" }).click();
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

async function slotAmounts(page: Page) {
  return page.locator("[data-slot-key]").evaluateAll((buttons) => Object.fromEntries(buttons.filter((button) => button.getClientRects().length).map((button) => [button.getAttribute("data-slot-key"), button.getAttribute("aria-label")])));
}
async function savedDraft(page: Page): Promise<BuildDraft> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), BUILD_DRAFT_KEY);
}

test("full-book funding identifies donors and Undo restores every accessible slot after buttons, keyboard and a pointer gesture", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/build");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const empty = await savedDraft(page);
  await page.getByRole("button", { name: "Auto-optimize" }).click();
  await page.getByRole("button", { name: "Undo last allocation" }).click();
  expect(await savedDraft(page)).toEqual(empty);
  await page.getByRole("button", { name: "Auto-optimize" }).click();
  const before = await savedDraft(page);
  const labels = await slotAmounts(page);
  expect(Object.keys(labels)).toHaveLength(23);
  await page.getByRole("button", { name: /^Left Tackle, / }).click();
  await page.getByRole("button", { name: "Increase Left Tackle spend" }).click();
  const after = await savedDraft(page);
  expect(after.pos.LT).toBeGreaterThan(before.pos.LT);
  const tradeoff = page.getByRole("region", { name: "Allocation tradeoff" });
  await expect(tradeoff.getByText(/Funding:.*from other funded slots/)).toBeVisible();
  await tradeoff.getByText(/Changed slots/).click();
  for (const [key, amount] of Object.entries(after.pos)) if (amount < before.pos[key as keyof typeof before.pos]) {
    await expect(tradeoff.getByText(new RegExp(`^${key}: `))).toBeVisible();
  }
  // Selection alone must not replace the history entry.
  await page.getByRole("button", { name: /^Running Back, / }).click();
  await page.getByRole("button", { name: "Undo last allocation" }).click();
  expect(await slotAmounts(page)).toEqual(labels);
  expect(await savedDraft(page)).toEqual(before);
  await page.getByRole("button", { name: /^Left Tackle, / }).click();
  const slider = page.getByRole("slider", { name: "Left Tackle spend in millions" });
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  expect((await savedDraft(page)).pos.LT).toBeCloseTo(before.pos.LT + 0.1);
  await page.getByRole("button", { name: "Undo last allocation" }).click();
  expect(await slotAmounts(page)).toEqual(labels);
  const bounds = (await slider.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.85, bounds.y + bounds.height / 2, { steps: 8 });
  await expect(tradeoff.getByRole("heading", { name: "Proposed allocation" })).toBeVisible();
  expect(await savedDraft(page)).toEqual(before);
  await page.mouse.up();
  expect((await savedDraft(page)).pos.LT).not.toBe(before.pos.LT);
  await page.getByRole("button", { name: "Undo last allocation" }).click();
  expect(await savedDraft(page)).toEqual(before);
  expect(await slotAmounts(page)).toEqual(labels);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Undo last allocation" }).click();
  expect(await savedDraft(page)).toEqual(before);
});

test("setup book fit is undoable, program selection preserves amounts and exact preview transfers into kickoff", async ({ page }) => {
  await page.goto("/build?program=texas");
  const preview = page.getByRole("region", { name: "Modeled schedule" });
  await preview.getByText("View all 12 opponents and venues").click();
  const seed = Number(await preview.getAttribute("data-setup-seed"));
  await expect(preview.getByText("Allocate the exact book to see neutral expected wins.")).toBeVisible();
  const slate = await preview.locator("[data-preview-week]").evaluateAll((rows) => rows.map((row) => [row.getAttribute("data-opponent"), row.getAttribute("data-home")]));
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Auto-optimize" }).click();
  const full = await savedDraft(page);
  await page.getByRole("button", { name: "Edit setup" }).click();
  const bookSlider = page.getByRole("slider", { name: "Roster budget in millions" });
  await bookSlider.scrollIntoViewIfNeeded();
  const box = (await bookSlider.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2, { steps: 8 });
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 8 });
  await expect(page.getByRole("heading", { name: "Proposed allocation", exact: true })).toBeVisible();
  expect(await savedDraft(page)).toEqual(full);
  await page.mouse.up();
  expect((await savedDraft(page)).budgetM).toBeLessThan(55);
  await page.getByRole("button", { name: "Undo last allocation" }).click();
  expect(await savedDraft(page)).toEqual(full);
  await page.getByRole("button", { name: "Decrease roster budget" }).click();
  expect((await savedDraft(page)).budgetM).toBe(54);
  expect(Object.values((await savedDraft(page)).pos).reduce((sum, value) => sum + Math.round(value * 10), 0)).toBe(540);
  await page.getByRole("button", { name: "Undo last allocation" }).click();
  expect(await savedDraft(page)).toEqual(full);
  await page.getByRole("button", { name: "Program Texas" }).click();
  await page.getByRole("combobox", { name: "Find a school for Program" }).fill("iowa");
  await page.getByRole("option", { name: "Iowa", exact: true }).click();
  expect((await savedDraft(page)).pos).toEqual(full.pos);
  await expect(preview).toHaveAttribute("data-setup-seed", String(seed));
  await page.getByRole("button", { name: "Program Iowa" }).click();
  await page.getByRole("combobox", { name: "Find a school for Program" }).fill("texas");
  await page.getByRole("option", { name: "Texas", exact: true }).click();
  expect(await preview.locator("[data-preview-week]").evaluateAll((rows) => rows.map((row) => [row.getAttribute("data-opponent"), row.getAttribute("data-home")]))).toEqual(slate);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("button", { name: "Auto-optimize" })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const run = await savedRun(page);
  expect(run.input.seed).toBe(seed);
  expect(replaySeason(run.input, 0).games.map((game) => [game.opponent.slug, String(game.isHome)])).toEqual(slate);
});

test("legacy Texas draft and malformed setup recover once without replacing an active run or a requested Iowa program", async ({ page }) => {
  const old = { pos: distributeAllocationToSlots(cappedOptimalAllocation(55)), budgetM: 55, gravityOn: true, programSlug: "texas" };
  await page.addInitScript(({ key, setupKey, old }) => {
    if (!localStorage.getItem(key)) { localStorage.setItem(key, JSON.stringify(old)); localStorage.setItem(setupKey, "{bad"); }
  }, { key: BUILD_DRAFT_KEY, setupKey: BUILD_SETUP_KEY, old });
  await page.goto("/build?program=iowa");
  await expect(page.getByRole("button", { name: "Program Iowa", exact: true })).toBeVisible();
  expect((await savedDraft(page)).pos).toEqual(old.pos);
  const setup = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), BUILD_SETUP_KEY);
  await page.reload();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), BUILD_SETUP_KEY)).toEqual(setup);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Allocate your roster", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Play your season", exact: true })).toBeFocused();
  const active = await savedRun(page);
  await page.goto("/build?program=texas");
  await expect(page.getByRole("button", { name: "Program Texas", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume season", exact: true }).click();
  await assertRenderedRun(page, active);
  expect((await savedRun(page)).input.programSlug).toBe("iowa");
});

for (const width of [320, 390, 1280]) for (const theme of ["light", "dark"]) {
  test(`setup and allocation work at ${width}px in ${theme} with reduced motion`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/build?program=iowa");
    await expect(page.getByRole("heading", { name: "Program setup", exact: true })).toBeFocused();
    if (theme === "dark") await page.getByRole("button", { name: "Switch to dark mode" }).click();
    const steps = await Promise.all(["1 Program", "2 Build", "3 Season"].map((name) => page.getByRole("button", { name, exact: true }).boundingBox()));
    expect(new Set(steps.map((box) => Math.round(box!.y))).size).toBe(1);
    await expect(page.getByRole("slider", { name: "Roster budget in millions" })).toHaveValue("55");
    await expect(page.getByRole("button", { name: "On", exact: true })).toHaveAttribute("aria-pressed", "true");
    const program = page.getByRole("button", { name: "Program Iowa", exact: true });
    await program.focus(); await page.keyboard.press("Enter");
    const search = page.getByRole("combobox", { name: "Find a school for Program" });
    await expect(search).toBeFocused();
    if (width < 640) expect(await search.evaluate((input) => parseFloat(getComputedStyle(input).fontSize))).toBeGreaterThanOrEqual(16);
    await search.fill("iowa"); await page.keyboard.press("Enter");
    await expect(program).toBeFocused();
    const slate = page.getByRole("region", { name: "Modeled schedule" });
    await expect(slate.locator("[data-preview-week]").first()).toBeHidden();
    await slate.getByText("View all 12 opponents and venues").click();
    await expect(slate.locator("[data-preview-week]")).toHaveCount(12);
    await expect(slate.locator("[data-preview-week]").last()).toBeVisible();
    await slate.getByText("View all 12 opponents and venues").click();
    const budget = page.getByRole("slider", { name: "Roster budget in millions" });
    await budget.focus(); await page.keyboard.press("Home");
    await page.getByRole("button", { name: "Off · Pure parity" }).click();
    await slate.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`setup-${width}-${theme}.png`) });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Allocate your roster", exact: true })).toBeFocused();
    const next = page.getByRole("button", { name: "Continue", exact: true });
    await expect(next).toBeDisabled();
    await page.getByRole("button", { name: "Increase Quarterback spend" }).click();
    await expect(next).toBeDisabled();
    await page.getByRole("button", { name: "Auto-optimize" }).click();
    const full = await savedDraft(page);
    expect(allocationFromPlaysheet(full.pos)).toEqual(cappedOptimalAllocation(10, { programSlug: "iowa", gravityOn: false }));
    await page.getByRole("button", { name: /^Left Tackle/ }).click();
    await page.getByRole("button", { name: "Increase Left Tackle spend" }).click();
    await expect(page.getByRole("region", { name: "Allocation tradeoff" }).getByText(/Funding:/)).toBeVisible();
    await page.getByRole("region", { name: "Allocation tradeoff" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`tradeoff-${width}-${theme}.png`) });
    await page.getByRole("button", { name: "Undo last allocation" }).click();
    expect(await savedDraft(page)).toEqual(full);
    const slider = page.getByRole("slider", { name: "Left Tackle spend in millions" });
    const drag = (await slider.boundingBox())!;
    await page.mouse.move(drag.x + drag.width * 0.4, drag.y + drag.height / 2);
    await page.mouse.down();
    await page.mouse.move(drag.x + drag.width * 0.7, drag.y + drag.height / 2, { steps: 8 });
    const summary = page.getByRole("region", { name: "Funding beside editor" });
    await expect(summary).toContainText("Proposed");
    await expect(summary).toContainText("added");
    await expect(summary).toContainText("reduced");
    await expect(summary).toContainText(/OFF.*DEF.*ST/);
    for (const control of [summary, slider, page.getByRole("button", { name: "Decrease Left Tackle spend" }), page.getByRole("button", { name: "Increase Left Tackle spend" })]) {
      expect(await control.evaluate((element) => {
        const r = element.getBoundingClientRect();
        return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      }), "live summary and selected controls are fully within the viewport and unobscured during drag").toBe(true);
    }
    expect(await savedDraft(page)).toEqual(full);
    await page.screenshot({ path: testInfo.outputPath(`during-drag-${width}-${theme}.png`) });
    await page.mouse.up();
    await summary.getByRole("link", { name: "Details of allocation change" }).click();
    await expect(page.getByRole("region", { name: "Allocation tradeoff" })).toBeFocused();
    await page.getByRole("button", { name: "Undo last allocation" }).click();
    expect(await savedDraft(page)).toEqual(full);
    await next.evaluate((element) => element.scrollIntoView({ block: "center" }));
    expect(await next.evaluate((element) => {
      const r = element.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight && element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }), "expanded editor leaves Continue reachable and unobscured").toBe(true);
    await page.getByRole("button", { name: "Edit setup" }).click();
    await expect(page.getByRole("heading", { name: "Program setup", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Increase roster budget" }).click();
    const larger = await savedDraft(page);
    expect(larger.budgetM).toBe(11); expect(larger.pos).toEqual(full.pos);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Allocate your roster", exact: true })).toBeFocused();
    await expect(next).toBeDisabled();
    await page.getByRole("button", { name: "Undo last allocation" }).click();
    expect(await savedDraft(page)).toEqual(full);
    await next.click();
    await expect(page.getByRole("heading", { name: "Play your season", exact: true })).toBeFocused();
    await page.reload();
    await expect(page.getByText(/Step 3 · Season mode/)).toBeVisible();
    expect((await savedRun(page)).input.gravityOn).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
