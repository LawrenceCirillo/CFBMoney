import { expect, test } from "@playwright/test";

test("gravity toggle carries from program setup into the season report", async ({ page }) => {
  await page.goto("/build?program=texas");
  await expect(page.getByText(/Gravity preview for Texas: RB \+12%/)).toBeVisible();
  await page.getByRole("button", { name: "Auto-optimize" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const parity = page.getByRole("button", { name: "Off · Pure parity" });
  await parity.click();
  await expect(parity).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Back to roster" }).click();
  await expect(page.getByText(/Gravity preview for Texas/)).toHaveCount(0);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("checkbox", { name: "Auto gameplan for the rest of the season" }).check();
  await page.getByRole("button", { name: "Sim to end" }).click();
  await expect(page.getByText("Gravity off · Pure parity · v1")).toBeVisible();
});

test("playsheet survives navigation and both sim modes render", async ({ page }) => {
  await page.goto("/build");
  await expect(page.getByRole("heading", { name: /Build a roster/ })).toBeVisible();
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
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(continueButton).toBeDisabled();
  await page.getByRole("button", { name: "Auto-optimize" }).click();
  await expect(continueButton).toBeEnabled();

  await continueButton.click();
  await expect(page.getByRole("heading", { name: "Whose season are you playing?" })).toBeVisible();
  await page.getByRole("button", { name: "Back to roster" }).click();
  await expect(page.getByRole("button", { name: "Auto-optimize" })).toBeVisible();
  await expect(leftTackle).toHaveAttribute("aria-label", optimizedLeftTackle!);

  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Whose season are you playing?" })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText(/Step 3 · Season mode/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Your season scores, Week 1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sim to end" })).toBeDisabled();
  await page.getByRole("checkbox", { name: "Auto gameplan for the rest of the season" }).check();
  await page.getByRole("button", { name: "Sim to end" }).click();
  await expect(page.getByRole("region", { name: "Your season scores, Final" })).toBeVisible();
  await expect(page.getByText(/A neutral plan against|No matchup adjustment against/).first()).toBeVisible();
  await page.getByRole("button", { name: "Quick sim" }).click();
  await expect(page.getByRole("region", { name: /Week 3 scores/ })).toBeVisible();
  await expect(page.getByText(/Step 3 · Quick sim/)).toBeVisible();
  await page.getByRole("button", { name: "Sim season" }).click();
  await expect(page.getByText("Game log")).toBeVisible();
});

test("playoff run shows the user's path through the bracket", async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 24 / 2 ** 31; });
  await page.goto("/build");
  await page.getByRole("button", { name: "Auto-optimize" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Whose season are you playing?" })).toBeVisible();
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
  await page.getByRole("button", { name: "Auto-optimize" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Whose season are you playing?" })).toBeVisible();
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
