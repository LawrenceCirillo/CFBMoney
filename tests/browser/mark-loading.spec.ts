import { expect, test } from "@playwright/test";

test("a page with no team list loads at most one shared mark image", async ({ page }) => {
  const markRequests: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() !== "image") return;
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/marks/") || path.startsWith("/logos/")) markRequests.push(path);
  });

  await page.goto("/methodology");
  await page.waitForLoadState("load");

  expect(markRequests).toHaveLength(1);
  expect(markRequests[0]).toMatch(/^\/marks\/ticker[^/]*\.webp$/);
});
