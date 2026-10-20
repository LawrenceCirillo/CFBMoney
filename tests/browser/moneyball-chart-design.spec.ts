import { expect, test } from "@playwright/test";
import { data, rankedTeams } from "../../lib/data";
import { fmtM } from "../../lib/format";
import { buildMoneyballInsights } from "../../lib/moneyball-insights";
import { seasonSnapshot } from "../../lib/season-snapshot";
import history from "../../public/data/moneyball-history-2026.json";

const ranked = rankedTeams();
const insights = buildMoneyballInsights(data.teams, seasonSnapshot.teams, history.currentPoll.ballot);

for (const theme of ["light", "dark"]) {
  test(`parity, tick hierarchy, shared qualification and playoff ladder work in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/moneyball");
    if (theme === "dark") await page.getByRole("button", { name: "Switch to dark mode", exact: true }).click();
    const chart = page.getByRole("group", { name: `Roster spend vs. AP rank through Week ${data.poll.week}`, exact: true });
    const parity = chart.locator(".moneyball-parity-line");
    await expect(parity).toBeVisible();
    await expect(parity).toHaveAttribute("pointer-events", "none");
    await expect(parity).toHaveAttribute("aria-hidden", "true");
    expect(await chart.evaluate((svg) => {
      const path = svg.querySelector(".moneyball-parity-line")!;
      const firstLogo = svg.querySelector("a")!;
      return !!(path.compareDocumentPosition(firstLogo) & Node.DOCUMENT_POSITION_FOLLOWING);
    })).toBe(true);
    const ticks = chart.locator(".moneyball-axis-tick");
    expect(await ticks.count()).toBeGreaterThan(8);
    for (const tick of await ticks.all()) {
      await expect(tick).toHaveAttribute("font-size", "14");
      await expect(tick).toHaveAttribute("font-weight", "500");
      await expect(tick).toHaveCSS("font-variant-numeric", "tabular-nums");
    }
    await expect(chart.locator("a")).toHaveCount(ranked.length);
    for (const link of await chart.locator("a").all()) await expect(link.locator("circle").nth(1)).toHaveCSS("fill", "rgb(255, 255, 255)");
    const cluster = ["texas-tech", "ole-miss", "tennessee", "alabama"];
    const boxes = [];
    for (const slug of cluster) {
      const link = chart.locator(`a[href="/team/${slug}"]`);
      await link.hover();
      await expect(page.getByRole("tooltip")).toContainText(data.teams.find((team) => team.slug === slug)!.name);
      boxes.push((await link.locator("image").boundingBox())!);
    }
    for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
      const first = boxes[a], second = boxes[b];
      expect(first.x + first.width <= second.x || second.x + second.width <= first.x || first.y + first.height <= second.y || second.y + second.height <= first.y).toBe(true);
    }
    await page.keyboard.press("Escape");

    const browse = page.getByRole("region", { name: `Browse ${ranked.length} tracked AP-ranked teams` });
    const caveat = "At the budget midpoint · crude, partial-season";
    await expect(browse.getByText(caveat, { exact: true })).toHaveCount(1);
    await expect(browse.locator("ol")).not.toContainText(caveat);
    for (const card of await page.locator("article").all()) await expect(card).toContainText(caveat);
    const unranked = page.getByRole("region", { name: "Spending big, not ranked", exact: true });
    for (const card of await unranked.locator("li").all()) await expect(card).toContainText(caveat);
    await expect(page.getByRole("region", { name: "Methodology", exact: true })).toContainText("Cost per win divides the full-season budget midpoint");

    const signals = await page.locator("main .text-status-success, main .text-status-loss").allTextContents();
    expect(signals.length).toBeGreaterThan(0);
    for (const signal of signals) expect(signal.trim()).toMatch(/^(?:[+−±]\d+|AP (?:up|down) \d+)$/);

    const field = page.getByRole("region", { name: "If the playoff started today", exact: true });
    const rows = field.locator("ol > li");
    await expect(rows).toHaveCount(insights.field.length);
    for (const [index, row] of insights.field.entries()) {
      await expect(rows.nth(index)).toContainText(`#${row.rank}`);
      await expect(rows.nth(index)).toContainText(row.name);
      if (row.team) {
        await expect(rows.nth(index)).toContainText(fmtM(row.team.budget_mid_m));
        await expect(rows.nth(index).locator("img")).toHaveAttribute("src", `/marks/${row.team.slug}.webp`);
      }
    }
    const rowPositions = await rows.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().y));
    expect(rowPositions.every((y, index) => index === 0 || y > rowPositions[index - 1])).toBe(true);
    await expect(field.getByText(insights.fieldMidM == null ? "Unavailable" : fmtM(insights.fieldMidM), { exact: true })).toBeVisible();
  });
}
