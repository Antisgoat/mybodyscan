import { test, expect } from "@playwright/test";

test.describe("Demo mode", () => {
  test("starting demo sets local flag", async ({ page }) => {
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
    await page.getByRole("link", { name: "Browse the demo" }).click();
    await expect(page).toHaveURL(/\/demo$/);
    await expect(
      page.getByText("Demo preview — read-only experience.")
    ).toBeVisible();
    const flag = await page.evaluate(() => localStorage.getItem("mbs_demo"));
    expect(flag).toBe("1");
  });
});
