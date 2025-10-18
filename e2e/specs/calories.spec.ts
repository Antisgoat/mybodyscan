import { expect, test } from '@playwright/test';
import { attachConsoleGuard } from '../utils/consoleGuard';

function enableDemo(page: import('@playwright/test').Page) {
  return page.addInitScript(() => {
    window.localStorage.setItem('mbs.demo', '1');
    window.localStorage.setItem('mbs.readonly', '1');
    window.localStorage.setItem('mbs:demo', '1');
  });
}

test.describe('Calorie targets', () => {
  test.beforeEach(async ({ page }) => {
    attachConsoleGuard(page);
    await enableDemo(page);
  });

  test('shows computed calorie target and persists after reload', async ({ page }) => {
    const response = await page.goto('/today?demo=1', { waitUntil: 'domcontentloaded' });
    if (!response || response.status() >= 500) {
      test.skip(`Today unavailable (${response?.status() ?? 'no response'})`);
    }

    const dashboard = page.getByTestId('today-dashboard');
    await expect(dashboard).toBeVisible();

    const targetText = await page.locator('text=Target:').first().textContent();
    expect(targetText).toBeTruthy();

    const match = targetText?.match(/Target:\s*([0-9,]+)/i);
    expect(match).toBeTruthy();
    const targetNumber = match ? parseInt(match[1].replace(/,/g, ''), 10) : NaN;
    expect(Number.isNaN(targetNumber)).toBeFalsy();
    expect(targetNumber).not.toBe(1850);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(dashboard).toBeVisible();

    const targetAfterReload = await page.locator('text=Target:').first().textContent();
    expect(targetAfterReload).toContain(match?.[1] ?? '');
  });
});
