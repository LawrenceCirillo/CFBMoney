import { expect, test } from "@playwright/test";

const routes = ["Spending", "Moneyball", "Compare", "Build", "Leaderboard"];

for (const width of [320, 375, 390, 640, 768, 1280]) {
  test(`primary navigation works at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");

    await expect(page.getByRole("region", { name: /scores/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "CFBMONEY" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Switch to (dark|light) mode/ })).toBeVisible();
    await expect(page.locator("html")).toHaveJSProperty("scrollWidth", width);

    const desktopNav = page.getByRole("navigation", { name: "Primary", exact: true });
    const mobileNav = page.getByRole("navigation", { name: "Mobile primary" });
    const menu = page.getByRole("button", { name: "Menu" });

    if (width >= 1024) {
      await expect(menu).toBeHidden();
      for (const route of routes) {
        await expect(desktopNav.getByRole("link", { name: route })).toBeVisible();
      }
      await expect(mobileNav).toBeHidden();
      return;
    }

    await expect(desktopNav).toBeHidden();
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toHaveAttribute("aria-controls", "mobile-primary-navigation");
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    for (const route of routes) {
      const link = mobileNav.getByRole("link", { name: route });
      await expect(link).toBeVisible();
      const box = await link.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await expect(page.locator("html")).toHaveJSProperty("scrollWidth", width);

    if (width === 320) {
      await mobileNav.getByRole("link", { name: "Build" }).click();
      await expect(page.getByRole("heading", { name: /Build a roster/ })).toBeVisible();
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      await menu.click();
      await mobileNav.getByRole("link", { name: "Leaderboard" }).click();
      await expect(page.getByRole("heading", { name: "Leaderboard", exact: true })).toBeVisible();
      await expect(menu).toHaveAttribute("aria-expanded", "false");
    }
  });
}

test("phone menu can be traversed and closed with the keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");

  const menu = page.getByRole("button", { name: "Menu" });
  const mobileNav = page.getByRole("navigation", { name: "Mobile primary" });
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(mobileNav.getByRole("link", { name: routes[0] })).toBeFocused();

  for (let index = 1; index < routes.length; index++) {
    await page.keyboard.press("Tab");
    await expect(mobileNav.getByRole("link", { name: routes[index] })).toBeFocused();
  }
  await page.keyboard.press("Tab");
  await expect(menu).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(mobileNav.getByRole("link", { name: routes.at(-1)! })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(mobileNav).toBeHidden();
  await expect(menu).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  const themeToggle = page.getByRole("button", { name: /Switch to (dark|light) mode/ });
  await expect(themeToggle).toBeFocused();
  const initialLabel = await themeToggle.getAttribute("aria-label");
  await page.keyboard.press("Enter");
  await expect(themeToggle).not.toHaveAttribute("aria-label", initialLabel!);
});
