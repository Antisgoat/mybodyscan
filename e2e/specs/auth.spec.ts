import { expect, test } from "@playwright/test";
import {
  acceptPoliciesIfShown,
  attachConsoleGuard,
} from "../utils/consoleGuard";

test.describe("Authentication page", () => {
  test.beforeEach(({ page }) => {
    attachConsoleGuard(page);
  });

  test("shows social auth providers", async ({ page }) => {
    await page.goto("/auth");
    await acceptPoliciesIfShown(page);

    const googleButton = page.getByRole("button", {
      name: "Continue with Google",
    });
    const appleButton = page.getByRole("button", {
      name: "Continue with Apple",
    });

    await expect(googleButton).toBeVisible();
    await expect(appleButton).toBeVisible();
  });
});
