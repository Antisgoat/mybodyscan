import { expect, test } from '@playwright/test';
import { attachConsoleGuard } from '../utils/consoleGuard';

test.describe('Coach chat', () => {
  test.beforeEach(({ page }) => {
    attachConsoleGuard(page);
  });

  test('mocked coach reply renders assistant response', async ({ page }) => {
    await page.route('**/api/coach/chat', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ reply: 'Hydrate and mobilize before lifting today.', usedLLM: true }),
      });
    });

    await page.goto('/coach/chat', { waitUntil: 'domcontentloaded' });

    await page.evaluate(async () => {
      const firebase = (window as any).__MBS_FIREBASE__;
      if (firebase?.auth) {
        firebase.auth.currentUser = {
          uid: 'coach-e2e',
          email: 'developer@adlrlabs.com',
          getIdToken: async () => 'fake-token',
        };
      }
      const mod = await import('/src/lib/demoOffline.ts');
      mod.clearDemoOffline();
    });

    const input = page.getByTestId('coach-message-input');
    await expect(input).toBeVisible();
    await input.fill('How should I warm up today?');
    await page.getByTestId('coach-send-button').click();

    const assistant = page.locator('text=Hydrate and mobilize before lifting today.');
    await expect(assistant).toBeVisible();
  });

  test('shows toast with retry when API fails', async ({ page }) => {
    await page.route('**/api/coach/chat', async (route) => {
      await route.fulfill({ status: 500, body: 'fail' });
    });

    await page.goto('/coach/chat', { waitUntil: 'domcontentloaded' });

    await page.evaluate(async () => {
      const firebase = (window as any).__MBS_FIREBASE__;
      if (firebase?.auth) {
        firebase.auth.currentUser = {
          uid: 'test-user',
          email: 'tester@example.com',
          getIdToken: async () => 'token',
        };
      }
      const mod = await import('/src/lib/demoOffline.ts');
      mod.clearDemoOffline();
    });

    const input = page.getByTestId('coach-message-input');
    if (await input.isDisabled()) {
      test.skip('Coach chat disabled without auth');
    }
    await input.fill('Test error state');
    await page.getByTestId('coach-send-button').click();

    const toast = page.locator('text=Coach temporarily unavailable');
    await expect(toast).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  });
});
