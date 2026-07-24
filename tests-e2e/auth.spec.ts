import { test, expect } from "@playwright/test";
import { acceptPolicyGate } from "./helpers/policy";

test.describe("Auth flows (smoke)", () => {
  test("App Check loads without blocking the landing page", async ({
    page,
  }) => {
    const appCheckRequest = page
      .waitForRequest(
        (request) => request.url().includes("google.com/recaptcha"),
        { timeout: 10_000 }
      )
      .catch(() => null);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await acceptPolicyGate(page);
    await expect(
      page.getByRole("heading", {
        name: "See your progress. Know what to do next.",
      })
    ).toBeVisible();
    expect(await appCheckRequest).not.toBeNull();
  });
});
