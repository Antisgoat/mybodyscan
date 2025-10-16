import { expect, test } from '@playwright/test';
import { attachConsoleGuard } from '../utils/consoleGuard';

test.describe('Meals search smoke', () => {
  test.beforeEach(({ page }) => {
    attachConsoleGuard(page);
  });

  test('shows empty-state then results with mocked API', async ({ page }) => {
    await page.route('**/api/nutrition/search**', async (route) => {
      const url = new URL(route.request().url());
      const q = url.searchParams.get('q') || '';
      const items = q
        ? [
            {
              id: 'chicken-1',
              name: 'Chicken Breast',
              brand: null,
              source: 'USDA',
              basePer100g: { kcal: 165, protein: 31, carbs: 0, fat: 3.6 },
              servings: [{ id: '100g', label: '100 g', grams: 100, isDefault: true }],
            },
          ]
        : [];
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items, primarySource: 'USDA', fallbackUsed: false }),
      });
    });

    await page.goto('/meals/search?demo=1');

    await expect(page.getByTestId('route-meals')).toBeVisible();

    const input = page.getByTestId('nutrition-search');
    await expect(input).toBeVisible();

    // Initially shows prompt to enter a food name
    await expect(page.getByText(/Enter a food name to begin/i)).toBeVisible();

    await input.fill('chicken');
    // Wait for mocked results
    await expect(page.getByText(/Chicken Breast/i)).toBeVisible();
  });
});
