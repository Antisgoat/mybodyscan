import { test, expect } from "@playwright/test";
import { acceptPolicyGate } from "./helpers/policy";

test.describe("Auth flows (smoke)", () => {
  test("App Check loads without blocking the landing page", async ({
    page,
  }) => {
    const appCheckRequest = page
      .waitForRequest(
        (request) =>
          /google\.com\/recaptcha\/enterprise|firebaseappcheck\.googleapis\.com/i.test(
            request.url()
          ),
        { timeout: 20_000 }
      )
      .catch(() => null);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await acceptPolicyGate(page);
    await expect(
      page.getByRole("heading", {
        name: "See your progress. Know what to do next.",
      })
    ).toBeVisible();
    // The landing page initializes App Check lazily. System Check requests a
    // token and therefore proves the configured Enterprise provider can run.
    await page.goto("/system-check", { waitUntil: "domcontentloaded" });
    expect(await appCheckRequest).not.toBeNull();
  });
});
