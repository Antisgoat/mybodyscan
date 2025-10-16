import { expect, test } from '@playwright/test';
import { attachConsoleGuard } from '../utils/consoleGuard';

test.describe('Smoke Tests', () => {
  test.beforeEach(({ page }) => {
    attachConsoleGuard(page);
  });

  test('auth page loads without errors', async ({ page }) => {
    const response = await page.goto('/auth');
    expect(response?.status()).toBe(200);
    
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');
    
    // Check for auth elements
    await expect(page.getByTestId('auth-google-button')).toBeVisible();
    await expect(page.getByTestId('auth-apple-button')).toBeVisible();
    
    // Verify no uncaught errors
    const errors = await page.evaluate(() => (window as any).__consoleErrors || []);
    expect(errors).toHaveLength(0);
  });

  test('demo page loads without uncaught errors', async ({ page }) => {
    const response = await page.goto('/demo');
    expect(response?.status()).toBe(200);
    
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');
    
    // Check for demo content
    await expect(page.getByText(/demo/i)).toBeVisible();
    
    // Verify no uncaught errors
    const errors = await page.evaluate(() => (window as any).__consoleErrors || []);
    expect(errors).toHaveLength(0);
  });

  test('meals search shows empty state then results with mocked API', async ({ page }) => {
    // Mock the nutrition search API
    await page.route('**/api/nutrition/search**', async (route) => {
      const url = new URL(route.request().url());
      const query = url.searchParams.get('q');
      
      if (query === 'test') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            foods: [
              {
                fdcId: 1,
                description: 'Test Food',
                brandOwner: 'Test Brand',
                ingredients: 'Test ingredients',
                foodNutrients: []
              }
            ]
          })
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ foods: [] })
        });
      }
    });

    // Navigate to meals search
    await page.goto('/meals/search');
    await page.waitForLoadState('networkidle');
    
    // Check for empty state initially
    const searchInput = page.getByPlaceholder(/search.*food/i);
    await expect(searchInput).toBeVisible();
    
    // Type search query
    await searchInput.fill('test');
    await searchInput.press('Enter');
    
    // Wait for results to appear
    await expect(page.getByText('Test Food')).toBeVisible({ timeout: 10000 });
    
    // Verify no uncaught errors
    const errors = await page.evaluate(() => (window as any).__consoleErrors || []);
    expect(errors).toHaveLength(0);
  });

  test('error boundary renders on crash route', async ({ page }) => {
    // Navigate to the crash test route
    const response = await page.goto('/__crash');
    expect(response?.status()).toBe(200);
    
    // Wait for error boundary to render
    await page.waitForLoadState('networkidle');
    
    // Check for error boundary content
    await expect(page.getByText('Something went wrong')).toBeVisible();
    await expect(page.getByText('We hit an unexpected error')).toBeVisible();
    
    // Check for reload button
    await expect(page.getByRole('button', { name: /reload/i })).toBeVisible();
    
    // Verify no uncaught errors (the error boundary should catch them)
    const errors = await page.evaluate(() => (window as any).__consoleErrors || []);
    expect(errors).toHaveLength(0);
  });

  test('app handles navigation without errors', async ({ page }) => {
    // Test basic navigation flow
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Navigate to auth
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    
    // Navigate to demo
    await page.goto('/demo');
    await page.waitForLoadState('networkidle');
    
    // Navigate back to home
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Verify no uncaught errors throughout navigation
    const errors = await page.evaluate(() => (window as any).__consoleErrors || []);
    expect(errors).toHaveLength(0);
  });
});