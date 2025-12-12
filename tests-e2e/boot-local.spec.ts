import { test, expect } from "@playwright/test";

test("app boots without React #185 / global error boundary", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  const pageErrors: string[] = [];
  page.on("pageerror", (err) => {
    pageErrors.push(err?.message || String(err));
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  // Fail fast on the known crash signature.
  expect(consoleErrors.join("\n")).not.toMatch(/React error #185|Maximum update depth/i);
  expect(pageErrors.join("\n")).not.toMatch(/Maximum update depth/i);

  // Fail if the global boundary renders.
  await expect(page.locator("text=We hit a snag.")).toHaveCount(0);
});
