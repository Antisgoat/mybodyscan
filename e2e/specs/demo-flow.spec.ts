import { expect, test } from "@playwright/test";
import {
  acceptPoliciesIfShown,
  attachConsoleGuard,
} from "../utils/consoleGuard";

test.describe("Demo experience", () => {
  test.beforeEach(({ page }) => {
    attachConsoleGuard(page);
  });

  test("loads demo dashboard when available", async ({ page }) => {
    const response = await page.goto("/demo");

    if (!response || response.status() >= 400) {
      test.skip(
        `Demo path unavailable (${response?.status() ?? "no response"})`
      );
    }

    await acceptPoliciesIfShown(page);
    await expect(page).toHaveURL(/\/demo/);
    await expect(
      page.getByRole("heading", { name: "MyBodyScan", exact: true })
    ).toBeVisible();
    await expect(page.getByText(/Demo preview.*read-only/i)).toBeVisible();
  });
});
