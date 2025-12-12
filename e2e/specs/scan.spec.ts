import { expect, test } from "@playwright/test";
import { attachConsoleGuard } from "../utils/consoleGuard";

test.describe("Scan workflow", () => {
  test.beforeEach(({ page }) => {
    attachConsoleGuard(page);
  });

  test("renders upload inputs without starting analysis", async ({ page }) => {
    await page.goto("/scan");

    await expect(page).toHaveURL(/\/scan/);

    const poseInputs = page.getByTestId("scan-upload-input");
    await expect(poseInputs).toHaveCount(4);

    const weightInput = page.getByTestId("scan-weight-input");
    const heightInput = page.getByTestId("scan-height-input");
    const submitButton = page.getByTestId("scan-submit-button");

    if (await weightInput.count()) {
      await expect(weightInput.first()).toBeVisible();
    }

    if (await heightInput.count()) {
      await expect(heightInput.first()).toBeVisible();
    }

    await expect(submitButton).toBeVisible();
  });
});
