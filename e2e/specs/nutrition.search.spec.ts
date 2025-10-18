import { expect, test } from '@playwright/test';
import { attachConsoleGuard } from '../utils/consoleGuard';

const usdaKeyPresent = Boolean(process.env.VITE_USDA_API_KEY);

async function setupDemo(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('mbs.demo', '1');
    window.localStorage.setItem('mbs.readonly', '1');
    window.localStorage.setItem('mbs:demo', '1');
  });
}

test.describe('Nutrition search', () => {
  test.beforeEach(async ({ page }) => {
    attachConsoleGuard(page);
    await setupDemo(page);
  });

  test('renders USDA powered results when API key available', async ({ page }) => {
    if (!usdaKeyPresent) {
      test.skip('USDA key not configured');
    }

    await page.route('**/api/nutrition/search?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          primarySource: 'USDA',
          fallbackUsed: false,
          items: [
            {
              id: 'usda-chicken',
              name: 'Grilled chicken breast',
              brand: 'USDA Foods',
              source: 'USDA',
              kcal: 210,
              protein: 32,
              carbs: 0,
              fat: 6,
              servingGrams: 140,
              per: 'serving',
              basePer100g: { kcal: 150, protein: 30, carbs: 1, fat: 4 },
            },
          ],
        }),
      });
    });

    await page.goto('/meals?demo=1', { waitUntil: 'domcontentloaded' });
    const searchInput = page.getByTestId('nutrition-search');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('chicken');

    const result = page.locator('text=Grilled chicken breast');
    await expect(result).toBeVisible();
    await expect(result).toContainText('USDA');
  });

  test('falls back to OFF results when USDA missing', async ({ page }) => {
    if (usdaKeyPresent) {
      test.skip('USDA key present; fallback not triggered');
    }

    await page.route('**/api/nutrition/search?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          primarySource: 'OFF',
          fallbackUsed: true,
          items: [
            {
              id: 'off-oats',
              name: 'Overnight oats',
              brand: 'Open Food Facts Pantry',
              source: 'OFF',
              kcal: 320,
              protein: 12,
              carbs: 44,
              fat: 9,
              servingGrams: 200,
              per: 'serving',
              basePer100g: { kcal: 160, protein: 6, carbs: 22, fat: 4 },
            },
          ],
        }),
      });
    });

    await page.goto('/meals?demo=1', { waitUntil: 'domcontentloaded' });
    const searchInput = page.getByTestId('nutrition-search');
    await searchInput.fill('oats');

    const result = page.locator('text=Overnight oats');
    await expect(result).toBeVisible();
    await expect(result).toContainText('Open Food Facts');

    const notice = page.locator('text=USDA key missing');
    await expect.soft(notice).toBeVisible();
  });

  test('shows empty state when search returns 404', async ({ page }) => {
    await page.route('**/api/nutrition/search?**', async (route) => {
      await route.fulfill({ status: 404, body: '' });
    });

    await page.goto('/meals?demo=1', { waitUntil: 'domcontentloaded' });
    const searchInput = page.getByTestId('nutrition-search');
    await searchInput.fill('unknown');
    await page.waitForTimeout(300);

    await expect(page.locator('text=Enter a food name to begin.')).toHaveCount(0);
    await expect(page.locator('text=No matches')).toBeVisible();
  });
});
