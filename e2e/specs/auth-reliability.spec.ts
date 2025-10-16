import { test, expect } from '@playwright/test';

test.describe('Auth Reliability', () => {
  test('should load auth page without errors', async ({ page }) => {
    // Listen for console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Listen for uncaught exceptions
    const uncaughtErrors: string[] = [];
    page.on('pageerror', error => {
      uncaughtErrors.push(error.message);
    });

    await page.goto('/auth');
    
    // Wait for the page to load
    await expect(page.locator('h1, [data-testid="auth-title"]')).toBeVisible();
    
    // Check that there are no critical errors
    expect(consoleErrors.filter(error => 
      error.includes('AppCheck') || 
      error.includes('use-before-activation') ||
      error.includes('Firebase')
    )).toHaveLength(0);
    
    expect(uncaughtErrors).toHaveLength(0);
  });

  test('should load demo page without AppCheck errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    const uncaughtErrors: string[] = [];
    page.on('pageerror', error => {
      uncaughtErrors.push(error.message);
    });

    await page.goto('/demo');
    
    // Wait for demo to load or show error state
    await expect(page.locator('text=Loading demo, text=Starting demo, text=Running in offline mode, text=We couldn\'t start demo')).toBeVisible();
    
    // Check that there are no AppCheck initialization errors
    expect(consoleErrors.filter(error => 
      error.includes('use-before-activation') ||
      error.includes('AppCheck') && error.includes('error')
    )).toHaveLength(0);
    
    expect(uncaughtErrors).toHaveLength(0);
  });

  test('should show error boundary when error is thrown', async ({ page }) => {
    await page.goto('/test/error');
    
    // Click the trigger error button
    await page.click('button:has-text("Trigger Error")');
    
    // Should show error boundary
    await expect(page.locator('text=Something went wrong')).toBeVisible();
    await expect(page.locator('button:has-text("Reload Page")')).toBeVisible();
  });

  test('should handle email sign-in with proper error messages', async ({ page }) => {
    await page.goto('/auth');
    
    // Fill in invalid credentials
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    
    // Click sign in
    await page.click('button[type="submit"]');
    
    // Should show error message with proper format
    await expect(page.locator('text=Sign-in failed')).toBeVisible();
    await expect(page.locator('text=auth/')).toBeVisible();
  });

  test('should show developer diagnostics for developer@adlrlabs.com', async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'log' && msg.text().includes('[DEV]')) {
        consoleLogs.push(msg.text());
      }
    });

    await page.goto('/auth');
    
    // Fill in developer email
    await page.fill('input[type="email"]', 'developer@adlrlabs.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    
    // Click sign in
    await page.click('button[type="submit"]');
    
    // Should log developer diagnostics
    await page.waitForTimeout(1000); // Wait for async operations
    expect(consoleLogs.some(log => log.includes('Auth error details'))).toBe(true);
  });

  test('should handle offline state gracefully', async ({ page }) => {
    // Simulate offline
    await page.context().setOffline(true);
    
    await page.goto('/demo');
    
    // Should show offline mode or appropriate error
    await expect(page.locator('text=Running in offline mode, text=Network connection failed, text=Unable to start demo')).toBeVisible();
    
    // Restore online state
    await page.context().setOffline(false);
  });
});