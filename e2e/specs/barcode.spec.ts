import { expect, test } from '@playwright/test';
import { attachConsoleGuard } from '../utils/consoleGuard';

async function enableDemo(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('mbs.demo', '1');
    window.localStorage.setItem('mbs.readonly', '1');
    window.localStorage.setItem('mbs:demo', '1');
  });
}

test.describe('Barcode nutrition lookup', () => {
  test.beforeEach(async ({ page }) => {
    attachConsoleGuard(page);
    await enableDemo(page);
  });

  test('renders matched item from API', async ({ page }) => {
    await page.route('**/api/nutrition/barcode**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          item: {
            id: 'barcode-123',
            name: 'Protein bar',
            brand: 'Demo Labs',
            source: 'USDA',
            per_serving: { kcal: 220, protein_g: 20, carbs_g: 18, fat_g: 8 },
            basePer100g: { kcal: 210, protein: 19, carbs: 17, fat: 7 },
          },
        }),
      });
    });

    await page.goto('/barcode?demo=1', { waitUntil: 'domcontentloaded' });
    await page.fill('input[placeholder="Manual UPC entry"]', '12345');
    await page.click('text=Lookup');

    const result = page.locator('text=Protein bar');
    await expect(result).toBeVisible();
    await expect(result).toContainText('USDA');
  });

  test('surfaces not found error gracefully', async ({ page }) => {
    await page.route('**/api/nutrition/barcode**', async (route) => {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'not found' }) });
    });

    await page.goto('/barcode?demo=1', { waitUntil: 'domcontentloaded' });
    await page.fill('input[placeholder="Manual UPC entry"]', '0000');
    await page.click('text=Lookup');

    const toast = page.locator('text=No match found');
    await expect(toast).toBeVisible();
  });

  test('handles rate limiting errors with retry copy', async ({ page }) => {
    await page.route('**/api/nutrition/barcode**', async (route) => {
      await route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ message: 'too many' }) });
    });

    await page.goto('/barcode?demo=1', { waitUntil: 'domcontentloaded' });
    await page.fill('input[placeholder="Manual UPC entry"]', '1111');
    await page.click('text=Lookup');

    const toast = page.locator('text=Lookup failed');
    await expect(toast).toBeVisible();
  });
});
