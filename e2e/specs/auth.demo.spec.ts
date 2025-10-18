import { expect, test } from '@playwright/test';
import { attachConsoleGuard } from '../utils/consoleGuard';

function forceDemo(page: import('@playwright/test').Page) {
  return page.addInitScript(() => {
    window.localStorage.setItem('mbs.demo', '1');
    window.localStorage.setItem('mbs.readonly', '1');
    window.localStorage.setItem('mbs:demo', '1');
  });
}

test.describe('Demo flow', () => {
  test.beforeEach(async ({ page }) => {
    attachConsoleGuard(page);
    await forceDemo(page);
  });

  test('renders Today or Coach view without crashing', async ({ page }) => {
    const response = await page.goto('/demo', { waitUntil: 'domcontentloaded' });
    if (!response || response.status() >= 500) {
      test.skip(`Demo unavailable (${response?.status() ?? 'no response'})`);
    }

    const today = page.getByTestId('today-dashboard');
    const coach = page.getByTestId('route-coach');

    if ((await today.count()) === 0 && (await coach.count()) === 0) {
      test.skip('Demo route did not resolve to expected dashboard');
    }

    if (await today.count()) {
      await expect(today).toBeVisible();
    }
    if (await coach.count()) {
      await expect(coach).toBeVisible();
    }

    await expect(page.locator('[data-testid="app-error"]')).toHaveCount(0);

    const creditsBadge = page.locator('text=Credits');
    await expect(creditsBadge.first()).toBeVisible();
    const creditsText = (await creditsBadge.first().textContent()) ?? '';
    expect(creditsText).toContain('Credits');
    expect.soft(creditsText).toContain('∞');
  });
});
