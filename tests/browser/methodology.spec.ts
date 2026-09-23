import { expect, test } from "@playwright/test";
import { data } from "../../lib/data";
import { methodologySourceLabels } from "../../lib/methodology";

test("Moneyball and footer open the dated methodology and its sources", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/moneyball");
  await page.getByRole("link", { name: "Read full methodology" }).click();

  await expect(page).toHaveURL(/\/methodology$/);
  for (const heading of [
    "Sources and dates",
    "How the published metrics are calculated",
    "How the game model works",
    "Limits and interpretation",
  ]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  const labels = methodologySourceLabels(data);
  for (const label of Object.values(labels)) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "The Athletic budget report" })).toHaveAttribute(
    "href",
    "https://www.nytimes.com/athletic/interactive/college-football-nil-spending-budgets/",
  );
  await expect(page.getByRole("link", { name: "AP college football poll" })).toHaveAttribute(
    "href",
    "https://apnews.com/hub/ap-top-25-college-football-poll",
  );
  await expect(page.getByRole("link", { name: "ESPN FPI" })).toHaveAttribute(
    "href",
    "https://www.espn.com/college-football/fpi",
  );
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 320);

  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Methodology" }).click();
  await expect(page.getByRole("heading", { name: "What the numbers mean." })).toBeVisible();
});
