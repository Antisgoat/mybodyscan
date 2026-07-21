import { expect, test } from "@playwright/test";
import {
  acceptPoliciesIfShown,
  attachConsoleGuard,
  wasRedirectedToAuth,
} from "../utils/consoleGuard";

test.describe("Settings", () => {
  test.skip(
    !process.env.PLAYWRIGHT_STORAGE_STATE,
    "Settings smoke requires PLAYWRIGHT_STORAGE_STATE."
  );

  test.beforeEach(({ page }) => {
    attachConsoleGuard(page);
  });

  test("renders account settings shell", async ({ page }) => {
    await page.goto("/settings");
    await acceptPoliciesIfShown(page);
    test.skip(
      wasRedirectedToAuth(page),
      "Settings page requires an authenticated storage state."
    );

    await expect(page).toHaveURL(/\/settings/);

    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  });
});
