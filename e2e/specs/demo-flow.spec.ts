import { expect, test } from '@playwright/test';
import { attachConsoleGuard } from '../utils/consoleGuard';

test.describe('Demo experience', () => {
  test.beforeEach(({ page }) => {
    attachConsoleGuard(page);
  });

  test('loads demo dashboard when available', async ({ page }) => {
    const response = await page.goto('/demo?demo=1');

    if (!response || response.status() >= 400) {
      test.skip(`Demo path unavailable (${response?.status() ?? 'no response'})`);
    }

    const todayShell = page.getByTestId('today-dashboard');
    if (await todayShell.count()) {
      await expect(todayShell).toBeVisible();
    } else {
      await expect(page.locator('[data-testid="home-dashboard"], main')).toBeVisible();
    }
  });
});
