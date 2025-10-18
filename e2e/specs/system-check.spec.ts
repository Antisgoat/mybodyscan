import { expect, test } from '@playwright/test';
import { attachConsoleGuard } from '../utils/consoleGuard';

test.describe('System check utilities', () => {
  test.beforeEach(({ page }) => {
    attachConsoleGuard(page);
  });

  test('renders diagnostics or at least responds to health ping', async ({ page }) => {
    const response = await page.goto('/system-check');

    if (response && response.ok()) {
      await expect(page).toHaveURL(/\/system-check/);
      const root = page.getByTestId('system-check-root');
      await expect(root).toBeVisible();
      return;
    }

    const healthResponse = await page.request.get('/__/functions/health');
    expect(healthResponse.ok()).toBeTruthy();
  });
});
