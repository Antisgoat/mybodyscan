import { expect, test } from "@playwright/test";
import {
  acceptPoliciesIfShown,
  attachConsoleGuard,
} from "../utils/consoleGuard";

test.describe("System check utilities", () => {
  test.beforeEach(({ page }) => {
    attachConsoleGuard(page);
  });

  test("renders diagnostics or at least responds to health ping", async ({
    page,
  }) => {
    const response = await page.goto("/system-check");
    await acceptPoliciesIfShown(page);

    const root = page.getByTestId("system-check-root");
    if (await root.isVisible()) {
      await expect(page).toHaveURL(/\/system-check/);
      await expect(root).toBeVisible();
      return;
    }

    // Production intentionally removes internal diagnostics from the public
    // router. Firebase Hosting still returns the SPA shell with HTTP 200, so
    // response.ok() cannot distinguish the protected 404 page from the tool.
    await expect(
      page.getByRole("heading", { name: "Page not found" })
    ).toBeVisible();

    const healthResponse = await page.request.get("/system/health");
    expect(healthResponse.ok()).toBeTruthy();
  });
});
