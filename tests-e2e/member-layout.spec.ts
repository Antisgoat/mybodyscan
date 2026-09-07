import { expect, test } from "@playwright/test";
import { acceptPolicyGate } from "./helpers/policy";

test("food diary, search, and kitchen helper fit the member viewport", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    // WebKit can block Google's optional reCAPTCHA telemetry. Token issuance
    // is not covered here; auth.spec separately checks initialization.
    if (
      /google\.com\/recaptcha\/enterprise\/clr\?.*due to access control checks/.test(
        error.message
      ) ||
      // iPhone WebKit can report Firestore's long-poll listener as a page
      // error even though the listener reconnects and the UI renders normally.
      /firestore\.googleapis\.com\/google\.firestore\.v1\.Firestore\/Listen\/channel\?.*due to access control checks/.test(
        error.message
      )
    )
      return;
    errors.push(error.message);
  });
  await page.goto("/demo", { waitUntil: "domcontentloaded" });
  await acceptPolicyGate(page);
  await expect(
    page.getByText("Demo preview — read-only experience.")
  ).toBeVisible();

  for (const [route, heading] of [
    ["/home", "Your progress, at a glance"],
    ["/meals", "Food diary"],
    ["/meals/search", "Search Foods"],
    ["/meals/photo", "Snap. Review. Log."],
    ["/meals/fridge", "What can you make right now?"],
  ]) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: heading, exact: true })
    ).toBeVisible();
    const sizes = await page.evaluate(() => ({
      content: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(
      sizes.content,
      `${route} must not scroll sideways`
    ).toBeLessThanOrEqual(sizes.viewport + 1);
    await expect(page.getByText("We hit a snag.", { exact: true })).toHaveCount(
      0
    );
    if (route === "/home") {
      await expect(
        page.getByRole("navigation", { name: "Personalized photo tools" })
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: /Your gym. Your plan/ })
      ).toHaveAttribute("href", "/settings/gym");
      await expect(
        page.getByRole("link", { name: /Make what's in your fridge/ })
      ).toHaveAttribute("href", "/meals/fridge");
      await page.screenshot({
        path: testInfo.outputPath("home.png"),
        fullPage: true,
      });
    }
    if (route === "/meals/photo") {
      await expect(page.getByRole("button", { name: "Take photo", exact: true })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Choose photo", exact: true })).toBeDisabled();
      await expect(page.getByRole("checkbox")).toBeDisabled();
      await page.screenshot({ path: testInfo.outputPath("meal-photo.png"), fullPage: true });
    }
  }
  await expect(
    page.getByRole("button", { name: "Choose food photos" })
  ).toBeDisabled();
  expect(errors).toEqual([]);
});
