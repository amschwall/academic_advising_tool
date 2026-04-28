// file: playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

// Set PROD=1 to run E2E tests against a production build (`next start`).
// The build must already exist — run `npm run build` once before `PROD=1 playwright test`.
// In production mode the webServer starts `next start` (faster, no hot reload) and
// the performance SLAs (page load < 1s) are enforced strictly.
const isProd = process.env.PROD === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: 0,
  fullyParallel: true,

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  webServer: {
    command: isProd ? "npm run start" : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    // Production server starts in ~5s; dev server may need more time.
    timeout: isProd ? 30_000 : 60_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
