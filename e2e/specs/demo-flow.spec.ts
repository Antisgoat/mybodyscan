import { expect, test } from '@playwright/test';
import { attachConsoleGuard } from '../utils/consoleGuard';

test.describe('Demo experience', () => {
  test.beforeEach(({ page }) => {
    attachConsoleGuard(page);
  });

  test('loads demo dashboard when available', async ({ page }) => {
    const response = await page.goto('/today?demo=1');

    if (!response || response.status() >= 400) {
      test.skip(`Demo path unavailable (${response?.status() ?? 'no response'})`);
    }

    const todayShell = page.getByTestId('today-dashboard');
    await expect(todayShell).toBeVisible();
    await expect(page.getByText(/Demo lets you browse/i)).toBeVisible();
  });
});
