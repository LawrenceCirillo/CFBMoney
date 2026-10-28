import { expect, test } from "@playwright/test";
import { data } from "../../lib/data";

test("server paint has final-width bars and stable placeholders before scripts or logos arrive", async ({ page }) => {
  // Hold the actual failure conditions: no hydration and delayed logo responses.
  await page.route("**/_next/static/**/*.js", (route) => route.abort());
  let releaseLogos!: () => void;
  const ready = new Promise<void>((resolve) => { releaseLogos = resolve; });
  await page.route(/\/marks\/(?!ticker)[^/]+\.webp$/, async (route) => {
    await ready;
    await route.continue();
  });
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const rows = page.locator('main a[aria-label$="View team page."]');
    await expect(rows).toHaveCount(data.teams.length);
    const max = Math.max(...data.teams.map((team) => team.budget_mid_m));
    for (const [index, row] of (await rows.all()).entries()) {
      const logo = row.locator("img");
      await expect(logo).toHaveAttribute("loading", index < 15 ? "eager" : "lazy");
      await expect(logo).toHaveAttribute("fetchpriority", index < 15 ? "high" : "auto");
      const slug = (await row.getAttribute("href"))!.split("/").at(-1)!;
      const team = data.teams.find((entry) => entry.slug === slug)!;
      const fill = row.locator(".h-2 > span");
      expect(await fill.evaluate((element) => Number.parseFloat((element as HTMLElement).style.width))).toBeCloseTo(Math.max(2.5, team.budget_mid_m / max * 100), 3);
      if (index < 10) {
        const slot = logo.locator("..");
        await expect(slot).toHaveCSS("width", "32px");
        await expect(slot).toHaveCSS("height", "32px");
        await expect(slot).toHaveClass(/rounded-full/);
        await expect(slot).toHaveCSS("background-color", "rgb(244, 244, 245)");
      }
    }
  } finally {
    releaseLogos();
  }
});

for (const theme of ["light", "dark"]) {
  test(`logos loaded before hydration clear their placeholders in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.addInitScript((saved) => localStorage.setItem("cfb-money-theme", saved), theme);
    let releaseScripts!: () => void;
    const ready = new Promise<void>((resolve) => { releaseScripts = resolve; });
    await page.route("**/_next/static/**/*.js", async (route) => {
      await ready;
      await route.continue();
    });
    try {
      await page.goto("/", { waitUntil: "commit" });
      const logos = page.locator('main a[aria-label$="View team page."] img[loading="eager"]');
      await expect(logos).toHaveCount(15);
      await expect.poll(() => logos.evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
      releaseScripts();
      for (const logo of await logos.all()) await expect(logo.locator("..")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^(?!.*dark)/);
    } finally {
      releaseScripts();
    }
  });

  test(`homepage logos settle without shifting rows and filters still animate in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.addInitScript((saved) => localStorage.setItem("cfb-money-theme", saved), theme);
    let releaseLogos!: () => void;
    const ready = new Promise<void>((resolve) => { releaseLogos = resolve; });
    await page.route(/\/marks\/(?!ticker)[^/]+\.webp$/, async (route) => {
      await ready;
      await route.continue();
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const first = page.locator('main a[aria-label$="View team page."]').first();
    const logo = first.locator("img");
    const slot = logo.locator("..");
    await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^(?!.*dark)/);
    const before = await first.boundingBox();
    const slotBefore = await slot.boundingBox();
    expect(await slot.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
    releaseLogos();
    await expect.poll(() => logo.evaluate((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)).toBe(true);
    await expect(slot).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    expect(await first.boundingBox()).toEqual(before);
    expect(await slot.boundingBox()).toEqual(slotBefore);
    await page.getByRole("button", { name: "Value vs. ranking", exact: true }).click();
    await expect(page.getByRole("button", { name: "Value vs. ranking", exact: true })).toHaveAttribute("aria-pressed", "true");
    const valueRows = page.locator('main a[aria-label$="View team page."]');
    await expect(valueRows).toHaveCount(data.teams.filter((team) => team.ap_rank != null).length);
    await expect.poll(() => valueRows.first().locator(".h-2").evaluate((track) => {
      return track.firstElementChild!.getBoundingClientRect().width / track.getBoundingClientRect().width;
    })).toBeCloseTo(1, 3);
  });
}
