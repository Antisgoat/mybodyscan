import { expect, test } from '@playwright/test';
import { attachConsoleGuard } from '../utils/consoleGuard';

test.describe('Crash route error boundary', () => {
  test.beforeEach(({ page }) => {
    // Do not guard console errors here; we expect an error to be thrown
    // but boundary should render a friendly UI without exploding the test
  });

  test('renders error boundary UI on forced crash route', async ({ page }) => {
    const response = await page.goto('/__crash');
    expect(response?.status()).toBeLessThan(500);

    // ErrorBoundary should render friendly message
    await expect(page.getByText(/Something went wrong/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Reload/i })).toBeVisible();
  });
});
