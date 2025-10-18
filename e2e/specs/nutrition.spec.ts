import { expect, test } from '@playwright/test';
import { attachConsoleGuard } from '../utils/consoleGuard';

test.describe('Nutrition planner', () => {
  test.beforeEach(({ page }) => {
    attachConsoleGuard(page);
  });

  test('shows search and totals widgets', async ({ page }) => {
    await page.goto('/nutrition');

    await expect(page).toHaveURL(/\/nutrition/);

    const searchBox = page.getByTestId('nutrition-search-input');
    const totalsWidget = page.getByTestId('nutrition-daily-summary');

    await expect(searchBox).toBeVisible();
    await expect(totalsWidget).toBeVisible();
  });
});
