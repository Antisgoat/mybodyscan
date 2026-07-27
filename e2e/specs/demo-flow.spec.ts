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
      page.getByRole("heading", {
        level: 1,
        name: "Your progress, at a glance",
      })
    ).toBeVisible();
    await expect(page.getByText("MyBodyScan", { exact: true })).toBeVisible();
    await expect(page.getByText(/Demo preview.*read-only/i)).toBeVisible();
  });

  test("previews new subscriber features without horizontal overflow", async ({
    page,
  }) => {
    await page.goto("/demo");
    await acceptPoliciesIfShown(page);

    await page.getByRole("button", { name: "Weekly review" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Weekly review" })
    ).toBeVisible();

    await page.goto("/meals/my-foods");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "My foods & recipes",
      })
    ).toBeVisible();

    const widths = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1);
  });
});
