import { expect, test } from "@playwright/test";

test("centered navbar search opens team pages by click and keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 1136, height: 800 });
  await page.goto("/");

  const navBox = await page.getByRole("navigation", { name: "Primary", exact: true }).boundingBox();
  expect(navBox).not.toBeNull();
  expect(Math.abs(navBox!.x + navBox!.width / 2 - 568)).toBeLessThan(1);

  await page.getByRole("button", { name: "Search teams" }).click();
  const input = page.getByRole("combobox", { name: "Search teams" });
  await input.fill("ohio");
  await page.getByRole("option", { name: /Ohio State/ }).click();
  await expect(page).toHaveURL(/\/team\/ohio-state$/);

  await page.getByRole("button", { name: "Search teams" }).click();
  await input.fill("michigan");
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(page).toHaveURL(/\/team\/michigan-state$/);
});

test("touch search stays in the mobile navbar without focus zoom sizing", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 800 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await page.getByRole("button", { name: "Search teams" }).click();
    const input = page.getByRole("combobox", { name: "Search teams" });
    await expect(input).toBeFocused();
    expect(await input.evaluate((element) => getComputedStyle(element).fontSize)).toBe("16px");
    await input.fill("pitt");
    await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 390);
    await page.getByRole("option", { name: /Pitt/ }).click();
    await expect(page).toHaveURL(/\/team\/pitt$/);
  } finally {
    await context.close();
  }
});
