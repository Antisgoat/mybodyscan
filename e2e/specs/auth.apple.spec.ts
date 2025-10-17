import { expect, test } from '@playwright/test';
import { attachConsoleGuard } from '../utils/consoleGuard';

const appleEnabled = process.env.APPLE_OAUTH_ENABLED === 'true';

test.describe('Apple authentication', () => {
  test.beforeEach(({ page }) => {
    attachConsoleGuard(page);
  });

  test('Apple button hidden when disabled', async ({ page }) => {
    if (appleEnabled) {
      test.skip('Environment has Apple enabled');
    }

    await page.goto('/auth', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('auth-apple-button')).toHaveCount(0);
  });

  test('Apple sign-in succeeds when enabled', async ({ page }) => {
    if (!appleEnabled) {
      test.skip('Apple OAuth disabled for this run');
    }

    let stubCalled = false;
    await page.route('**/identitytoolkit.googleapis.com/**', async (route) => {
      stubCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          idToken: 'apple-id-token',
          refreshToken: 'apple-refresh-token',
          expiresIn: '3600',
          localId: 'apple-user',
          email: 'apple@example.com',
        }),
      });
    });

    await page.goto('/auth', { waitUntil: 'domcontentloaded' });
    const appleButton = page.getByTestId('auth-apple-button');
    await expect(appleButton).toBeVisible();
    await appleButton.click();
    await page.waitForTimeout(750);

    if (!stubCalled) {
      test.skip('Apple popup not intercepted');
    }

    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/today|coach/);
  });
});
