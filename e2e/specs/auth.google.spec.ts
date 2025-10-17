import { expect, test } from '@playwright/test';
import { attachConsoleGuard } from '../utils/consoleGuard';

test.describe('Google authentication', () => {
  test.beforeEach(({ page }) => {
    attachConsoleGuard(page);
  });

  test('stubs Google sign-in and navigates to Today', async ({ page }) => {
    let stubCalled = false;
    await page.route('**/identitytoolkit.googleapis.com/**', async (route) => {
      stubCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          idToken: 'test-id-token',
          refreshToken: 'refresh-token',
          expiresIn: '3600',
          localId: 'tester',
          email: 'developer@adlrlabs.com',
        }),
      });
    });

    await page.goto('/auth', { waitUntil: 'domcontentloaded' });

    const googleButton = page.getByTestId('auth-google-button');
    await expect(googleButton).toBeVisible();

    await googleButton.click();
    await page.waitForTimeout(500);

    if (!stubCalled) {
      test.skip('Popup flow not intercepted');
    }

    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/today|coach/);

    await expect(page.locator('header')).toContainText(/MyBodyScan/);

    const profileTrigger = page.getByTestId('profile-menu-trigger');
    await expect(profileTrigger).toBeVisible();
    await profileTrigger.click();
    await expect(page.getByTestId('profile-menu-email')).toContainText('developer@adlrlabs.com');
  });
});
