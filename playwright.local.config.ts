import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests-e2e",
  // Firebase's reserved Hosting init.json endpoint does not exist in Vite.
  // Keep that deployment-only diagnostic in playwright.config.ts.
  testIgnore: "**/boot.spec.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
  },
  webServer: {
    command:
      "npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "android-chrome",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "iphone-webkit",
      use: { ...devices["iPhone 13"] },
    },
  ],
  reporter: [["list"]],
});
