import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3107";

export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { ...devices["Desktop Chrome"], baseURL },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3107",
    url: baseURL,
    env: { DATABASE_URL: "" },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
