import { test, expect } from "@playwright/test";
import { acceptPolicyGate } from "./helpers/policy";

test.describe("Demo mode", () => {
  test("starting demo sets local flag", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("mbs_policy_ok_v1");
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await acceptPolicyGate(page, { required: true });
    await page.getByRole("link", { name: "Browse the demo" }).click();
    await expect(page).toHaveURL(/\/demo$/);
    await expect(
      page.getByText("Demo preview — read-only experience.")
    ).toBeVisible();
    const flag = await page.evaluate(() => localStorage.getItem("mbs_demo"));
    expect(flag).toBe("1");
  });
});
