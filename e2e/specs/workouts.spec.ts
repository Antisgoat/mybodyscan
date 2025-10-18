import { expect, test } from '@playwright/test';
import { attachConsoleGuard } from '../utils/consoleGuard';

async function forceDemo(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('mbs.demo', '1');
    window.localStorage.setItem('mbs.readonly', '1');
    window.localStorage.setItem('mbs:demo', '1');
  });
}

test.describe('Workouts adjustments', () => {
  test.beforeEach(async ({ page }) => {
    attachConsoleGuard(page);
    await forceDemo(page);
  });

  test('adjust workout modifies sets count', async ({ page }) => {
    await page.route('**/workouts/adjust', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ mods: { intensity: 1, volume: 1 } }),
      });
    });

    await page.goto('/workouts?demo=1', { waitUntil: 'domcontentloaded' });
    const exerciseDetail = page.locator('text=sets ×').first();
    if ((await exerciseDetail.count()) === 0) {
      test.skip('No workout exercises rendered');
    }
    const initialText = (await exerciseDetail.textContent()) ?? '';

    await page.getByRole('button', { name: 'Great' }).click();
    await page.getByRole('button', { name: 'Save adjustment' }).click();

    await expect(page.getByRole('button', { name: 'Saving…' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save adjustment' })).toBeVisible({ timeout: 5000 });

    await expect(exerciseDetail).not.toHaveText(initialText);
    await expect(exerciseDetail).toContainText('sets');
  });

  test('shows toast on error', async ({ page }) => {
    await page.route('**/workouts/adjust', async (route) => {
      await route.fulfill({ status: 500, body: 'fail' });
    });

    await page.goto('/workouts?demo=1', { waitUntil: 'domcontentloaded' });
    if ((await page.getByRole('button', { name: 'Great' }).count()) === 0) {
      test.skip('No workout state to adjust');
    }
    await page.getByRole('button', { name: 'Great' }).click();
    await page.getByRole('button', { name: 'Save adjustment' }).click();

    const toast = page.locator('text=Unable to adjust');
    await expect(toast).toBeVisible();
  });
});
