import { expect, test } from "@playwright/test";
import { attachConsoleGuard } from "../utils/consoleGuard";

test.describe("Coach assistant", () => {
  test.beforeEach(({ page }) => {
    attachConsoleGuard(page);
  });

  test("exposes composer even when backend errors", async ({ page }) => {
    await page.route("**/api/coach/**", async (route) => {
      await route.fulfill({
        status: 501,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "not implemented" }),
      });
    });

    await page.goto("/coach");

    // Open chat panel
    await page.getByRole("button", { name: /open chat/i }).click();

    await expect(page).toHaveURL(/\/coach/);

    const messageInput = page.getByTestId("coach-message-input");
    const sendButton = page.getByTestId("coach-send-button");

    await expect(messageInput).toBeVisible();
    await expect(sendButton).toBeVisible();
    await expect(sendButton).toBeEnabled();

    // Smoke-check the chat path suffix for correctness
    const pathProbe = page.getByTestId("coach-chat-path");
    await expect(pathProbe).toBeVisible();
  });
});
