import { test, expect } from "@playwright/test";

test.describe("Demo mode", () => {
  test.skip(true, "Enable when demo button is wired");

  test("starting demo sets local flag", async ({ page }) => {
    await page.goto("/");
    // Replace selector with your real Demo button
    await page.getByRole("button", { name: /demo/i }).click();
    const flag = await page.evaluate(() => localStorage.getItem("mbs_demo"));
    expect(flag).toBe("1");
  });
});
