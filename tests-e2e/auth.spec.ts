import { test, expect } from "@playwright/test";

test.describe("Auth flows (smoke)", () => {
  test.skip(true, "Enable when authorized domains and providers are confirmed");

  test("homepage loads without recaptcha requests", async ({ page }) => {
    const urls: string[] = [];
    page.on("requestfinished", (req) => urls.push(req.url()));
    await page.goto("/");
    const hasRecaptcha = urls.some((u) => u.includes("google.com/recaptcha"));
    expect(hasRecaptcha).toBeFalsy();
  });
});
