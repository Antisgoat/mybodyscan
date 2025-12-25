import { expect, test } from "@playwright/test";
import { attachConsoleGuard } from "../utils/consoleGuard";

test.describe("Scan workflow", () => {
  test.beforeEach(({ page }) => {
    attachConsoleGuard(page);
  });

  test("renders upload inputs without starting analysis", async ({ page }) => {
    await page.goto("/scan");

    // Production requires auth; if we get redirected, skip this smoke check unless a storageState is provided.
    const url = page.url();
    if (url.includes("/auth")) {
      test.skip(true, "Scan page requires authentication (redirected to /auth).");
    }

    await expect(page).toHaveURL(/\/scan/);

    const poseInputs = page.getByTestId("scan-photo-input");
    await expect(poseInputs).toHaveCount(4);

    const submitButton = page.getByTestId("scan-submit-button");
    const currentWeight = page.getByTestId("scan-current-weight-input");
    const goalWeight = page.getByTestId("scan-goal-weight-input");

    await expect(currentWeight).toBeVisible();
    await expect(goalWeight).toBeVisible();

    await expect(submitButton).toBeVisible();
  });
});
