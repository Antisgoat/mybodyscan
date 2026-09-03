import { expect, test } from "@playwright/test";
import { acceptPolicyGate } from "./helpers/policy";

test("food diary, search, and kitchen helper fit the member viewport", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    // WebKit can block Google's optional reCAPTCHA telemetry. Token issuance
    // is not covered here; auth.spec separately checks initialization.
    if (
      /google\.com\/recaptcha\/enterprise\/clr\?.*due to access control checks/.test(
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
    ["/meals", "Food diary"],
    ["/meals/search", "Search Foods"],
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
  }
  await expect(
    page.getByRole("button", { name: "Choose food photos" })
  ).toBeDisabled();
  expect(errors).toEqual([]);
});
