import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("production pricing copy", () => {
  it("matches the verified $199 yearly Stripe price", () => {
    for (const file of ["src/pages/Plans.tsx", "src/content/pricing.ts"]) {
      const content = read(file);
      expect(content, file).toContain("$199");
      expect(content, file).not.toContain("$199.99");
    }
    expect(read("src/pages/Plans.tsx")).toContain(
      "36 scan credits per annual renewal"
    );
    expect(read("src/content/pricing.ts")).toContain(
      "36 scan credits per year"
    );
  });

  it("does not imply the wellness app replaces licensed or clinical services", () => {
    const plans = read("src/pages/Plans.tsx");
    expect(plans).not.toContain("Save Hundreds Every Month");
    expect(plans).not.toContain("Dietitian visits");
    expect(plans).not.toContain("DEXA scans");
    expect(plans).toContain("Not medical advice");
  });
});
