import { expect, test } from "@playwright/test";
import { attachConsoleGuard } from "../utils/consoleGuard";

test.describe("Home routing", () => {
  test.beforeEach(({ page }) => {
    attachConsoleGuard(page);
  });

  test("redirects root to auth or home experience", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.ok() || response?.status() === 304).toBeTruthy();

    await expect(page).toHaveURL(/\/(auth|home)/);

    const authView = page.getByTestId("auth-view");
    const homeDashboard = page.getByTestId("home-dashboard");

    if (await authView.count()) {
      await expect(authView).toBeVisible();
      return;
    }

    if (await homeDashboard.count()) {
      await expect(homeDashboard).toBeVisible();
      return;
    }

    await expect(page.locator("main")).toBeVisible();
  });
});
