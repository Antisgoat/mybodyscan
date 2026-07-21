import { expect, test } from "@playwright/test";
import {
  acceptPoliciesIfShown,
  attachConsoleGuard,
  wasRedirectedToAuth,
} from "../utils/consoleGuard";

test.describe("Nutrition planner", () => {
  test.skip(
    !process.env.PLAYWRIGHT_STORAGE_STATE,
    "Nutrition smoke requires PLAYWRIGHT_STORAGE_STATE."
  );

  test.beforeEach(({ page }) => {
    attachConsoleGuard(page);
  });

  test("shows search and totals widgets", async ({ page }) => {
    await page.goto("/nutrition");
    await acceptPoliciesIfShown(page);
    test.skip(
      wasRedirectedToAuth(page),
      "Nutrition page requires an authenticated storage state."
    );

    await expect(page).toHaveURL(/\/nutrition/);

    const searchBox = page.getByTestId("nutrition-search-input");
    const totalsWidget = page.getByTestId("nutrition-totals");

    await expect(searchBox).toBeVisible();
    await expect(totalsWidget).toBeVisible();
  });
});
