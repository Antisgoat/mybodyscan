import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("production pricing copy", () => {
  it("matches the approved $4.99 / $9.99 / $79.99 launch pricing", () => {
    for (const file of ["src/pages/Plans.tsx", "src/content/pricing.ts"]) {
      const content = read(file);
      expect(content, file).toContain("$4.99");
      expect(content, file).toContain("$9.99");
      expect(content, file).toContain("$79.99");
      expect(content, file).not.toMatch(/\$(?:14\.99|24\.99|199(?:\.00)?)/);
    }
    expect(read("src/pages/Plans.tsx")).toContain(
      "36 scan credits per annual renewal"
    );
    expect(read("src/content/pricing.ts")).toContain(
      "36 scan credits/year"
    );
    expect(read("src/pages/Plans.tsx")).toContain("Save $39.89 (33%)");
  });

  it("does not imply the wellness app replaces licensed or clinical services", () => {
    const plans = read("src/pages/Plans.tsx");
    expect(plans).not.toContain("Save Hundreds Every Month");
    expect(plans).not.toContain("Dietitian visits");
    expect(plans).not.toContain("DEXA scans");
    expect(plans).toContain("Not medical advice");
  });

  it("highlights the connected scan-to-plan feature set without unsupported claims", () => {
    const landing = read("src/pages/PublicLanding.tsx");
    const plans = read("src/pages/Plans.tsx");
    const paywall = read("src/pages/Paywall.tsx");

    for (const feature of [
      "Source-labeled",
      "workout",
      "Nutrition",
      "7-day meal plan",
      "MBS Product Insight",
      "plateau",
      "Transformation Preview",
    ]) {
      expect(`${landing}\n${plans}\n${paywall}`).toContain(feature);
    }

    expect(landing).toContain(
      "Photo-based results are estimates, not medical measurements or"
    );
    expect(landing).not.toMatch(/DEXA-accurate|medical-grade|clinic-grade/i);
    expect(read("src/i18n/seed.ts")).not.toContain(
      "accurate body composition scanning"
    );
    expect(read("src/lib/flags.ts")).toMatch(
      /ENABLE_PUBLIC_MARKETING_PAGE:[\s\S]*VITE_ENABLE_PUBLIC_MARKETING_PAGE,[\s\S]*true/
    );
  });
});
