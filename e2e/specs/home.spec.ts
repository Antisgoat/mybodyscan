import { expect, test } from "@playwright/test";
import { attachConsoleGuard } from "../utils/consoleGuard";

test.describe("Home routing", () => {
  test.beforeEach(({ page }) => {
    attachConsoleGuard(page);
  });

  test("opens the configured root experience", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.ok() || response?.status() === 304).toBeTruthy();

    const pathname = new URL(page.url()).pathname;

    const authView = page.getByTestId("auth-view");
    const homeDashboard = page.getByTestId("home-dashboard");

    if (pathname === "/") {
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "See your progress. Know what to do next.",
        }),
      ).toBeVisible();
      return;
    }

    if (await authView.count()) {
      await expect(authView).toBeVisible();
      return;
    }

    if (await homeDashboard.count()) {
      await expect(homeDashboard).toBeVisible();
      return;
    }

    throw new Error(`Unexpected root route destination: ${page.url()}`);
  });
});
