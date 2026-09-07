import { defineConfig, devices } from "@playwright/test";

// Local-only image pipeline tests. No production login, storage, or AI calls.
export default defineConfig({
  testDir: "./tests-photos",
  timeout: 60_000,
  use: { baseURL: "http://127.0.0.1:5175" },
  webServer: {
    command: "npx --no-install vite --host 127.0.0.1 --port 5175 --strictPort",
    url: "http://127.0.0.1:5175",
    reuseExistingServer: false,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "iphone-webkit", use: { ...devices["iPhone 13"] } },
  ],
});
