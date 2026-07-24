import { test, expect } from "@playwright/test";

test.describe("Auth flows (smoke)", () => {
  test("App Check loads without blocking the landing page", async ({
    page,
  }) => {
    const urls: string[] = [];
    page.on("request", (req) => urls.push(req.url()));
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const policyDialog = page.getByRole("dialog", {
      name: "Welcome to MyBodyScan",
    });
    if (await policyDialog.isVisible()) {
      for (const checkbox of await policyDialog.getByRole("checkbox").all()) {
        if (!(await checkbox.isChecked())) await checkbox.check();
      }
      await policyDialog.getByRole("button", { name: "I Accept" }).click();
    }
    await page.waitForTimeout(1_500);
    await expect(
      page.getByRole("heading", {
        name: "See your progress. Know what to do next.",
      })
    ).toBeVisible();
    expect(urls.some((url) => url.includes("google.com/recaptcha"))).toBe(true);
  });
});
