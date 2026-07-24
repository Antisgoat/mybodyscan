import fs from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = fs.readFileSync("src/App.tsx", "utf8");
const settingsSource = fs.readFileSync("src/pages/Settings.tsx", "utf8");

function routeBlock(path: string, nextPath: string): string {
  const start = appSource.indexOf(`path="${path}"`);
  const end = appSource.indexOf(`path="${nextPath}"`, start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return appSource.slice(start, end);
}

describe("native in-app purchase routing", () => {
  it("sends native plan links to the RevenueCat paywall", () => {
    const plansRoute = routeBlock("/plans", "/paywall");
    expect(plansRoute).toContain('<Navigate to="/paywall" replace />');
    expect(plansRoute).not.toContain('<Navigate to="/workouts" replace />');
  });

  it("renders the RevenueCat paywall natively and redirects web users to Stripe plans", () => {
    const paywallRoute = routeBlock("/paywall", "/settings");
    expect(paywallRoute).toContain("<Paywall />");
    expect(paywallRoute).toContain('<Navigate to="/plans" replace />');
    expect(paywallRoute).not.toContain('<Navigate to="/workouts" replace />');
  });

  it("opens Apple's subscription management instead of steering iOS users to web billing", () => {
    expect(settingsSource).toContain(
      "https://apps.apple.com/account/subscriptions"
    );
    expect(settingsSource).toContain("Manage App Store subscription");
    expect(settingsSource).not.toContain("Billing available on web");
  });
});
