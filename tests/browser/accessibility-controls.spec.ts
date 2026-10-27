import { expect, test } from "@playwright/test";
import { scoreboard, tickerAbbr } from "../../lib/scores";

function luminance(hex: string) {
  const fullHex = /^#[\da-f]{3}$/i.test(hex)
    ? `#${[...hex.slice(1)].map((part) => part.repeat(2)).join("")}`
    : hex;
  const channels = fullHex.match(/[\da-f]{2}/gi)?.map((part) => parseInt(part, 16) / 255);
  if (!channels || channels.length !== 3) throw new Error(`Expected a hex color, got ${hex}`);
  const linear = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(foreground: string, background: string) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

test("Oregon and Iowa Compare names meet contrast against the rendered panel in both themes", async ({ page }) => {
  await page.goto("/compare/oregon-vs-iowa");
  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") await page.getByRole("button", { name: "Switch to dark mode" }).click();
    for (const slug of ["oregon", "iowa"]) {
      const name = page.locator(`[data-compare-name="${slug}"]`);
      await expect(name).toBeVisible();
      const colors = await name.evaluate((element) => {
        const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d")!;
        function rgba(color: string) {
          context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1);
          return Array.from(context.getImageData(0, 0, 1, 1).data);
        }
        const ancestors: Element[] = [];
        for (let node: Element | null = element; node; node = node.parentElement) ancestors.unshift(node);
        let background = [255, 255, 255];
        for (const ancestor of ancestors) {
          const layer = rgba(getComputedStyle(ancestor).backgroundColor);
          const alpha = layer[3] / 255;
          background = background.map((channel, i) => layer[i] * alpha + channel * (1 - alpha));
        }
        const hex = (channels: number[]) => `#${channels.slice(0, 3).map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}`;
        return { foreground: hex(rgba(getComputedStyle(element).color)), background: hex(background) };
      });
      expect(contrast(colors.foreground, colors.background), `${theme} ${slug}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test("status text tokens meet normal-text contrast in both themes", async ({ page }) => {
  await page.goto("/");

  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") {
      await page.getByRole("button", { name: "Switch to dark mode" }).click();
      await expect(page.locator("html")).toHaveClass(/dark/);
    }
    const colors = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      return Object.fromEntries(
        ["ink", "panel", "status-success", "status-loss", "status-caution"].map((key) => [
          key,
          styles.getPropertyValue(`--color-${key}`).trim(),
        ]),
      );
    });
    for (const status of ["status-success", "status-loss", "status-caution"]) {
      for (const surface of ["ink", "panel"]) {
        expect(contrast(colors[status], colors[surface]), `${theme} ${status} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  }
});

test("metric and simulation mode announce their active choice", async ({ page }) => {
  await page.goto("/");
  const spend = page.getByRole("button", { name: "Roster spend" });
  const poll = page.getByRole("button", { name: "AP Top 25" });
  await expect(spend).toHaveAttribute("aria-pressed", "true");
  await expect(poll).toHaveAttribute("aria-pressed", "false");
  await poll.focus();
  await page.keyboard.press("Enter");
  await expect(poll).toHaveAttribute("aria-pressed", "true");
  await expect(spend).toHaveAttribute("aria-pressed", "false");

  await page.goto("/build");
  await expect(page.getByRole("heading", { name: "Whose season are you playing?" })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Auto-optimize" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const season = page.getByRole("button", { name: "Season mode" });
  const quick = page.getByRole("button", { name: "Quick sim" });
  await expect(season).toHaveAttribute("aria-pressed", "true");
  await expect(quick).toHaveAttribute("aria-pressed", "false");
  await quick.focus();
  await page.keyboard.press("Enter");
  await expect(quick).toHaveAttribute("aria-pressed", "true");
  await expect(season).toHaveAttribute("aria-pressed", "false");
});

test("program selector keeps 68 options out of the Tab sequence", async ({ page }) => {
  await page.goto("/compare");
  const first = page.getByRole("button", { name: /First program/ });
  const second = page.getByRole("button", { name: /Second program/ });

  await first.click();
  const input = page.getByRole("combobox", { name: "Find a school for First program" });
  await expect(input).toBeFocused();
  await expect(page.getByRole("option")).toHaveCount(68);
  const before = await input.getAttribute("aria-activedescendant");
  await page.keyboard.press("ArrowDown");
  expect(await input.getAttribute("aria-activedescendant")).not.toBe(before);
  await page.keyboard.press("Escape");
  await expect(first).toBeFocused();

  await first.click();
  await input.fill("a-school-that-does-not-exist");
  await expect(page.getByText("No school matches")).toBeVisible();
  await input.fill("");
  await expect(page.getByRole("option")).toHaveCount(68);
  await page.keyboard.press("Tab");
  await expect(second).toBeFocused();
  await expect(input).toBeHidden();

  await first.click();
  await input.fill("oregon");
  await expect(input).toHaveAttribute("aria-activedescendant", /oregon/);
  await page.keyboard.press("Enter");
  await expect(first).toBeFocused();
  await expect(first).toContainText("Oregon");
  await expect(page).toHaveURL(/\/compare\/oregon-vs-ohio-state$/);
  await expect(page).toHaveTitle("Oregon vs Ohio State · CFB Money");
  await page.reload();
  await expect(page.getByRole("button", { name: /First program/ })).toContainText("Oregon");
});

test("ticker can be paused and pauses when score links have focus", async ({ page }) => {
  await page.goto("/");
  const track = page.locator(".score-ticker-track");
  await expect(track).toHaveCSS("animation-play-state", "running");
  await page.getByRole("button", { name: "Pause scores" }).click();
  await expect(track).toHaveCSS("animation-play-state", "paused");
  await page.getByRole("button", { name: "Play scores" }).click();
  await expect(track).toHaveCSS("animation-play-state", "running");
  await page.locator(".score-ticker-window a").first().focus();
  await expect(track).toHaveCSS("animation-play-state", "paused");
});

test("ticker does not move with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".score-ticker-track")).toHaveCSS("animation-name", "none");
  await expect(page.getByRole("button", { name: "Pause scores" })).toBeHidden();
});

test("ticker distinguishes Arkansas from Arkansas State and respects byes", async ({ page }) => {
  expect(tickerAbbr({ name: "Arkansas", slug: "arkansas", abbr: "ARST" })).toBe("ARK");
  expect(tickerAbbr({ name: "Arkansas St", slug: null, abbr: "ARST" })).toBe("ARK ST");
  await page.goto("/");
  const ticker = page.locator(".score-ticker-window");
  if (scoreboard.games.some((game) => game.away.slug === "arkansas" || game.home.slug === "arkansas")) {
    await expect(ticker.getByText("ARK", { exact: true }).first()).toBeAttached();
  } else {
    await expect(ticker.locator('a[href="/team/arkansas"]')).toHaveCount(0);
  }
});
