import { expect, test } from '@playwright/test';
import { attachConsoleGuard } from '../utils/consoleGuard';

test.describe('Settings', () => {
  test.beforeEach(({ page }) => {
    attachConsoleGuard(page);
  });

  test('renders account settings shell', async ({ page }) => {
    await page.goto('/settings');

    await expect(page).toHaveURL(/\/settings/);

    const settingsShell = page.getByTestId('settings-root');
    await expect(settingsShell).toBeVisible();
  });
});
