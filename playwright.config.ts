import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests-e2e",
  timeout: 60000,
  use: {
    baseURL: process.env.E2E_BASE_URL || "https://mybodyscanapp.com",
    headless: true,
  },
  reporter: [["list"]],
});
