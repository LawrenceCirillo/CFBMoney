import { expect, test } from "@playwright/test";
import { data, rankedTeams } from "../../lib/data";
import rawHistory from "../../public/data/moneyball-history-2026.json";
import { movementLabel, type MoneyballHistory } from "../../lib/moneyball-movement";

const history = rawHistory as MoneyballHistory;
const ranked = rankedTeams();

test("desktop copy, untracked AP ranks and saved comparisons are explicit", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/moneyball");
  const text = await page.locator("main").innerText();
  expect(text.match(/the 68 tracked budget midpoints/g)).toHaveLength(1);
  expect(text).not.toContain("68tracked");
  expect(text).toContain("ties share a rank");
  const browse = page.getByRole("region", { name: `Browse ${ranked.length} tracked AP-ranked teams` });
  await expect(browse).toBeVisible();
  await expect(browse.getByRole("link")).toHaveCount(ranked.length);
  for (const row of history.currentPoll.ballot.filter((team) => team.slug === null)) {
    await expect(browse.getByText(new RegExp(`#${row.rank} ${row.name} is outside`))).toBeVisible();
  }
  const hint = page.getByText("Swipe across the chart to inspect it at full size.", { exact: true });
  await expect(hint).toBeHidden();
  await page.setViewportSize({ width: 720, height: 900 });
  await expect(hint).toBeHidden();
});

test("every ranked team has stored AP and spend movement, including new entrants", async ({ page }) => {
  await page.goto("/moneyball");
  const browse = page.getByRole("region", { name: `Browse ${ranked.length} tracked AP-ranked teams` });
  for (const team of ranked) {
    const saved = history.teams.find((row) => row.slug === team.slug)!;
    const link = browse.locator(`a[href="/team/${team.slug}"]`);
    await expect(link).toContainText(`AP ${movementLabel(saved.ap)}`);
    await expect(link).toContainText(`Spend ${movementLabel(saved.spend)}`);
  }
  if (data.poll.week === 8) {
    await expect(browse.locator('a[href="/team/texas"]')).toContainText("AP down 12");
    await expect(browse.locator('a[href="/team/houston"]')).toContainText("AP up 6");
    await expect(browse.locator('a[href="/team/florida"]')).toContainText("AP new to Top 25");
    await expect(browse).toContainText("Week 7 (Oct. 11)");
    await expect(browse).toContainText("Week 8 (Oct. 18)");
  }
  await page.reload();
  await expect(browse.getByRole("link")).toHaveCount(ranked.length);
});

test("spotlight cards have the same lead stat and definition order", async ({ page }) => {
  await page.goto("/moneyball");
  const cards = page.locator("article");
  await expect(cards).toHaveCount(3);
  for (const card of await cards.all()) {
    await expect(card.getByLabel(/^Rank gap /).first()).toHaveText(/^[+−±]\d+$/);
    await expect(card.getByText(/^AP #\d+ versus spend #\d+: \d+ rank places apart\.$/)).toBeVisible();
    await expect(card.locator("dt")).toHaveText(["Estimated budget", "Record", "Crude cost per win", "AP / spend rank", "Played SOS rank"]);
  }
});

for (const theme of ["light", "dark"]) {
  test(`all chart logo tooltips work on hover and keyboard in ${theme} mode`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/moneyball");
    if (theme === "dark") await page.getByRole("button", { name: "Switch to dark mode" }).click();
    const chart = page.getByRole("group", { name: `Roster spend vs. AP rank through Week ${data.poll.week}`, exact: true });
    const tooltip = page.getByRole("tooltip");
    for (const team of ranked) {
      const link = chart.locator(`a[href="/team/${team.slug}"]`);
      await link.hover();
      await expect(tooltip).toContainText(team.name);
      await expect(tooltip).toContainText(`Spend #${team.spend_rank} · AP #${team.ap_rank}`);
      const saved = history.teams.find((row) => row.slug === team.slug)!;
      await expect(tooltip).toContainText(`AP ${movementLabel(saved.ap)}`);
      await expect(tooltip).toContainText(`Spend ${movementLabel(saved.spend)}`);
      await expect(tooltip).toBeInViewport();
      await page.keyboard.press("Escape");
      await expect(tooltip).toBeHidden();
    }
    const first = chart.locator("a").first();
    await first.hover();
    await tooltip.hover();
    await expect(tooltip).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(tooltip).toBeHidden();
    await first.focus();
    await expect(tooltip).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tooltip).toBeHidden();
    await expect(first).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(tooltip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/team\//);
  });
}

test.describe("touch chart", () => {
  test.use({ isMobile: true, hasTouch: true });
  for (const width of [320, 390]) for (const theme of ["light", "dark"]) {
    test(`preserves the full-size horizontal chart and browse list at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 850 });
      await page.goto("/moneyball");
      if (theme === "dark") await page.getByRole("button", { name: "Switch to dark mode", exact: true }).click();
      await expect(page.getByText("Swipe across the chart to inspect it at full size.", { exact: true })).toBeVisible();
      const region = page.getByRole("region", { name: "Spend versus poll chart", exact: true });
      await expect(region.locator(".moneyball-parity-line")).toBeVisible();
      await expect(page.getByText("Line = spend rank at that budget; distance from the line is the rank gap.", { exact: true })).toBeVisible();
      expect(await region.evaluate((element) => element.scrollWidth)).toBeGreaterThan(await region.evaluate((element) => element.clientWidth));
      await region.evaluate((element) => element.scrollTo({ left: element.scrollWidth }));
      await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      const browse = page.getByRole("region", { name: `Browse ${ranked.length} tracked AP-ranked teams` });
      await expect(browse.getByRole("link")).toHaveCount(ranked.length);
      await expect(page.locator("html")).toHaveJSProperty("scrollWidth", width);
    });
  }
});
