import { expect, test, type Page } from "@playwright/test";
import { data } from "../../lib/data";
import { seasonSnapshot } from "../../lib/season-snapshot";
import { scoreboard } from "../../lib/scores";
import { budgetRangeOverlap, buildTeamContexts, recordLabel, savedWeekLabel } from "../../lib/team-context";
import { fmtM, fmtPollDate, fmtPollRank, fmtRange } from "../../lib/format";

const contexts = buildTeamContexts(data, seasonSnapshot, scoreboard);
const noGame = data.teams.find((team) => team.slug !== "georgia" && contexts.teams[team.slug].savedWeek.status === "no-game")!;

async function theme(page: Page, value: "light" | "dark") {
  if (value === "dark") await page.getByRole("button", { name: "Switch to dark mode" }).click();
  if (value === "dark") await expect(page.locator("html")).toHaveClass(/dark/);
  else await expect(page.locator("html")).not.toHaveClass(/dark/);
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

for (const width of [320, 390, 1280]) {
  for (const mode of ["light", "dark"] as const) {
    for (const slug of ["oregon", "georgia", noGame.slug]) {
      test(`team ${slug} keeps real and modeled context distinct at ${width}px ${mode}`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/team/${slug}`);
        await theme(page, mode);
        const team = data.teams.find((entry) => entry.slug === slug)!;
        const context = contexts.teams[slug];
        await expect(page.getByRole("heading", { name: team.name, exact: true })).toBeVisible();
        await expect(page.locator("[data-team-record]")).toContainText(recordLabel(context.record));
        await expect(page.locator("[data-team-record]")).toContainText(fmtPollDate(seasonSnapshot.as_of));
        await expect(page.locator("[data-team-poll]")).toContainText(`Week ${data.poll.week}`);
        await expect(page.locator("[data-team-poll]")).toContainText(fmtPollRank(team.ap_rank));
        await expect(page.locator("[data-team-poll]")).toContainText(fmtPollDate(data.poll.as_of));
        await expect(page.locator("[data-team-result]")).toContainText(savedWeekLabel(context.savedWeek));
        await expect(page.locator("[data-team-result]")).toContainText(fmtPollDate(scoreboard.as_of));
        await expect(page.locator("[data-real-sos]")).toContainText(`#${team.sos_played_rank}`);
        await expect(page.locator("[data-real-sos]")).toContainText(`#${team.sos_remaining_rank}`);
        await expect(page.locator("[data-real-sos]")).toContainText(fmtPollDate(data.fpi.as_of));
        const build = page.locator("[data-build-context]");
        await expect(build.getByRole("heading", { name: "Program gravity" })).toBeAttached();
        await expect(build.getByRole("heading", { name: "Modeled schedule difficulty" })).toBeAttached();
        await expect(build).toContainText("sample 2026-seed schedule. Your season seed sets the actual slate.");
        expect(await build.evaluate((element) => Boolean(element.compareDocumentPosition(document.querySelector("[data-team-roster]")!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
        await expect(build.locator(`a[href="/build?program=${slug}"]`)).toHaveCount(1);
        const roster = page.locator("[data-team-roster]");
        await expect(roster.getByRole("status")).toContainText(`${seasonSnapshot.teams[slug].roster.length} players`);
        await noOverflow(page);
        if (slug === "oregon" && width !== 320) await page.screenshot({ path: info.outputPath(`team-${width}-${mode}.png`), fullPage: true });
      });
    }
    test(`Compare stays readable at ${width}px ${mode}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/compare/oregon-vs-iowa");
      await theme(page, mode);
      await expect(page.locator('[data-compare-row="Record"]')).toContainText(recordLabel(contexts.teams.oregon.record));
      await expect(page.locator('[data-compare-row="Record"]')).toContainText(recordLabel(contexts.teams.iowa.record));
      await expect(page.locator(`[data-compare-row="Week ${scoreboard.week} result"]`)).toContainText(savedWeekLabel(contexts.teams.iowa.savedWeek));
      for (const slug of ["oregon", "iowa"]) {
        await expect(page.locator(`[data-compare-name="${slug}"]`)).toHaveAttribute("href", `/team/${slug}`);
        const image = page.locator(`[data-compare-name="${slug}"] img`);
        await expect(image).toBeVisible();
        await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      }
      await noOverflow(page);
      if (width !== 320) await page.screenshot({ path: info.outputPath(`compare-${width}-${mode}.png`), fullPage: true });
    });
  }
}

test("roster search reveals full names and clearing restores keyboard collapse choices", async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/team/iowa");
  const roster = page.locator("[data-team-roster]");
  const input = page.getByRole("searchbox", { name: "Find a player by name" });
  await expect(input).toHaveCSS("font-size", "16px");
  const quarterbacks = roster.getByRole("button", { name: /^Quarterbacks/ });
  await quarterbacks.focus();
  await page.keyboard.press("Enter");
  await expect(quarterbacks).toHaveAttribute("aria-expanded", "true");
  const panelId = await quarterbacks.getAttribute("aria-controls");
  await expect(page.locator(`[id="${panelId}"]`)).toBeVisible();
  const longName = [...seasonSnapshot.teams.iowa.roster].sort((a, b) => b.name.length - a.name.length)[0].name;
  await input.fill(longName);
  await expect(roster.getByRole("rowheader", { name: longName, exact: true })).toBeVisible();
  await expect(roster.getByRole("status")).toContainText(`1 matching player of ${seasonSnapshot.teams.iowa.roster.length}`);
  await expect(roster.locator('[aria-expanded="true"]')).toHaveCount(1);
  expect(await roster.getByRole("rowheader", { name: longName, exact: true }).evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("roster-search-320.png"), fullPage: true });
  await input.fill("no-such-player-999");
  await expect(roster.getByText(/No players match/)).toBeVisible();
  await roster.getByRole("button", { name: "Clear search" }).click();
  await expect(input).toBeFocused();
  await expect(quarterbacks).toHaveAttribute("aria-expanded", "true");
  const defense = roster.getByRole("button", { name: /^Defensive line/ });
  await expect(defense).toHaveAttribute("aria-expanded", "false");
  await roster.getByRole("button", { name: "Expand all groups" }).click();
  await expect(roster.locator("[data-roster-player]:visible")).toHaveCount(seasonSnapshot.teams.iowa.roster.length);
  await noOverflow(page);
  await roster.getByRole("button", { name: "Collapse all groups" }).click();
  await expect(roster.locator("[data-roster-player]:visible")).toHaveCount(0);
});

test("Compare selectors update compact context, dates, URL, title, reload, copy and team links together", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { (window as unknown as { copiedUrl: string }).copiedUrl = text; } } });
  });
  await page.goto("/compare/texas-vs-ohio-state");
  for (const [label, slug] of [["First", "oregon"], ["Second", "georgia"]]) {
    const selector = page.getByRole("button", { name: new RegExp(`${label} program`) });
    await selector.click();
    await page.getByRole("combobox", { name: `Find a school for ${label} program` }).fill(slug);
    await page.keyboard.press("Enter");
    await expect(selector).toBeFocused();
    await expect(page.locator(`[data-compare-name="${slug}"]`)).toBeVisible();
  }
  await expect(page).toHaveURL(/\/compare\/oregon-vs-georgia$/);
  await expect(page).toHaveTitle("Oregon vs Georgia · CFB Money");
  const records = page.locator('[data-compare-row="Record"]');
  await expect(records).toContainText(recordLabel(contexts.teams.oregon.record));
  await expect(records).toContainText(recordLabel(contexts.teams.georgia.record));
  await expect(records).toContainText(fmtPollDate(seasonSnapshot.as_of));
  const result = page.locator(`[data-compare-row="Week ${scoreboard.week} result"]`);
  await expect(result).toContainText(savedWeekLabel(contexts.teams.oregon.savedWeek));
  await expect(result).toContainText(savedWeekLabel(contexts.teams.georgia.savedWeek));
  await expect(result).toContainText(fmtPollDate(scoreboard.as_of));
  await expect(page.locator(`[data-compare-row="AP · Week ${data.poll.week}"]`)).toContainText(fmtPollDate(data.poll.as_of));
  await expect(page.getByText(/FPI ranks among FBS/)).toContainText(fmtPollDate(data.fpi.as_of));
  const a = data.teams.find((t) => t.slug === "oregon")!, b = data.teams.find((t) => t.slug === "georgia")!;
  const overlap = budgetRangeOverlap(a, b);
  const label = overlap.kind === "disjoint" ? "Reported ranges do not overlap." : overlap.kind === "touch" ? `Ranges meet at ${fmtM(overlap.low)}.` : `Reported ranges overlap at ${fmtRange(overlap.low, overlap.high)}.`;
  await expect(page.locator("[data-budget-overlap]")).toContainText(label);
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByRole("button", { name: "Link copied" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { copiedUrl: string }).copiedUrl)).toBe(`${new URL(page.url()).origin}/compare/oregon-vs-georgia`);
  await page.reload();
  await expect(result).toContainText(savedWeekLabel(contexts.teams.georgia.savedWeek));
  const flight = await page.evaluate(() => (window as unknown as { __next_f: [number, unknown][] }).__next_f.filter((entry) => typeof entry[1] === "string").map((entry) => entry[1]).join(""));
  expect(flight).toContain('"contexts":');
  expect(flight).toContain('"oregon":');
  expect(flight).not.toMatch(/"(?:roster|points_for|pass_yards)":|Akili Smith Jr\.|Kyle Alt|roster-additions/);
  await page.locator('[data-compare-name="georgia"]').click();
  await expect(page).toHaveURL(/\/team\/georgia$/);
});
