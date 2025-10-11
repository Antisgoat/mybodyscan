import { expect, test } from '@playwright/test';
import { attachConsoleGuard } from '../utils/consoleGuard';

test.describe('Authentication page', () => {
  test.beforeEach(({ page }) => {
    attachConsoleGuard(page);
  });

  test('shows social auth providers', async ({ page }) => {
    await page.goto('/auth');

    const googleButton = page.getByTestId('auth-google-button');
    const appleButton = page.getByTestId('auth-apple-button');

    await expect(googleButton).toBeVisible();
    await expect(appleButton).toBeVisible();
  });
});
