import { expect, test } from "@playwright/test";
import { data } from "../../lib/data";
import { fmtGap, fmtM, fmtMoney2, fmtPollDate } from "../../lib/format";
import { buildMoneyballInsights } from "../../lib/moneyball-insights";
import { seasonSnapshot } from "../../lib/season-snapshot";
import rawHistory from "../../public/data/moneyball-history-2026.json";

const insights = buildMoneyballInsights(data.teams, seasonSnapshot.teams, rawHistory.currentPoll.ballot);

test("the current positive gap leads; process and provenance follow the stories and chart", async ({ page }) => {
  await page.goto("/moneyball");
  const cards = page.getByRole("article");
  await expect(cards.first()).toHaveAttribute("aria-label", "Biggest positive rank gap");
  for (const team of insights.above) {
    await expect(cards.first().getByRole("link", { name: team.name, exact: true })).toBeVisible();
    await expect(cards.first().getByText(fmtGap(team.value_gap!), { exact: true })).toBeVisible();
  }
  const heroSize = await cards.first().getByLabel(/^Rank gap /).first().evaluate((e) => Number.parseFloat(getComputedStyle(e).fontSize));
  const otherSize = await cards.nth(1).getByLabel(/^Rank gap /).first().evaluate((e) => Number.parseFloat(getComputedStyle(e).fontSize));
  expect(heroSize).toBeGreaterThan(otherSize);
  await expect(page.locator("h1 + p")).toHaveText(insights.takeaway);
  const updated = [data.poll.as_of, seasonSnapshot.as_of, data.fpi.as_of].sort().at(-1)!;
  await expect(page.getByText(`Moneyball · Week ${data.poll.week} · Updated ${fmtPollDate(updated)}`, { exact: true })).toBeVisible();
  const methodology = page.getByRole("region", { name: "Methodology", exact: true });
  await expect(methodology).toContainText("These teams are selected by fixed rules:");
  await expect(methodology).toContainText("AP poll:");
  await expect(methodology).toContainText("not a measurement of financial return");
  await expect(methodology).toContainText("questions to explore, not a verdict");
  expect((await page.locator("main").innerText()).match(/These teams are selected by fixed rules:/g)).toHaveLength(1);
  const chartHeading = page.getByRole("heading", { name: "See every tracked AP-ranked team", exact: true });
  await expect(chartHeading.locator("..").locator("p")).toHaveText("Further left = smaller budget; higher = better AP rank.");
  expect(await page.locator("main").evaluate((main) => {
    const stories = main.querySelector('section[aria-label$="money stories"]')!;
    const next = stories.nextElementSibling!;
    return { nextTitle: next.querySelector("h3")?.textContent, nextText: next.querySelector("p")?.textContent };
  })).toEqual({ nextTitle: "See every tracked AP-ranked team", nextText: "Further left = smaller budget; higher = better AP rank." });
});

test("all unranked top spenders and the AP proxy have snapshot-based budgets and context", async ({ page }) => {
  await page.goto("/moneyball");
  const section = page.getByRole("region", { name: "Spending big, not ranked", exact: true });
  if (!insights.unrankedSpenders.length) {
    await expect(section).toHaveCount(0);
  } else {
    await expect(section.locator("li")).toHaveCount(insights.unrankedSpenders.length);
    for (const team of insights.unrankedSpenders) {
      const card = section.locator("li").filter({ has: page.getByRole("link", { name: team.name, exact: true }) });
      await expect(card).toContainText(insights.facts[team.slug].record);
      await expect(card).toContainText(`Unranked / #${team.spend_rank}`);
      await expect(card).toContainText("midpoint · partial-season");
    }
  }
  const field = page.getByRole("region", { name: "If the playoff started today", exact: true });
  await expect(field).toContainText("AP-poll proxy: the AP Top 12, not the CFP bracket.");
  await expect(field.getByText(insights.fieldMidM == null ? "Unavailable" : fmtM(insights.fieldMidM), { exact: true })).toBeVisible();
  await expect(field.locator("li")).toHaveCount(insights.field.length);
  for (const { team, outspends } of insights.firstOut) {
    await expect(field).toContainText(`outspends ${outspends} of the ${insights.field.length} teams`);
    await expect(field.getByRole("link", { name: `#${team.ap_rank} ${team.name}`, exact: true })).toBeVisible();
  }
});

test("every browse row shows its signed gap, record and cost with one shared qualification", async ({ page }) => {
  await page.goto("/moneyball");
  const browse = page.getByRole("region", { name: `Browse ${insights.ranked.length} tracked AP-ranked teams` });
  for (const team of insights.ranked) {
    const row = browse.locator(`a[href="/team/${team.slug}"]`);
    const fact = insights.facts[team.slug];
    await expect(row.getByLabel(`Rank gap ${fmtGap(team.value_gap!)}`, { exact: true })).toBeVisible();
    await expect(row).toContainText(fact.record);
    await expect(row).toContainText(fact.costPerWinM == null ? "No wins yet" : `${fmtMoney2(fact.costPerWinM)} / win`);
    await expect(row).not.toContainText("At the budget midpoint · crude, partial-season");
    await expect(row).not.toHaveAttribute("aria-label", /crude, partial-season/);
  }
  await expect(browse.getByText("At the budget midpoint · crude, partial-season", { exact: true })).toHaveCount(1);
  await expect(browse).toHaveAttribute("aria-describedby", "browse-cost-note");
});

for (const width of [320, 390]) {
  test(`new story surfaces remain readable at ${width}px in dark mode`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto("/moneyball");
    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    const heroNumber = page.getByRole("article", { name: "Biggest positive rank gap", exact: true }).getByLabel(/^Rank gap /).first();
    const box = await heroNumber.boundingBox();
    expect(box?.width).toBeGreaterThan(0);
    expect(await heroNumber.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
    await expect(page.getByRole("region", { name: "If the playoff started today", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveJSProperty("scrollWidth", width);
  });
}
