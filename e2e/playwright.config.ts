import fs from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
const baseURL = process.env.BASE_URL || 'https://mybodyscanapp.com';
const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;
const resolvedStorageState =
  storageState && fs.existsSync(storageState) ? storageState : undefined;

export default defineConfig({
  testDir: './specs',
  retries: isCI ? 1 : 0,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    storageState: resolvedStorageState,
  },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  outputDir: 'test-results',
});
