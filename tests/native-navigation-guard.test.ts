import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("native customer navigation", () => {
  it("uses the app router for signed-in nutrition and account links", () => {
    for (const file of [
      "src/pages/Meals.tsx",
      "src/pages/MealPlan.tsx",
      "src/pages/SettingsAccountPrivacy.tsx",
    ]) {
      expect(read(file), file).not.toMatch(/<a\s+[^>]*href=["']\//);
    }
  });

  it("does not render diagnostics or tester administration in Settings", () => {
    const settings = read("src/pages/Settings.tsx");
    expect(settings).not.toContain("Auth misconfiguration");
    expect(settings).not.toContain("Tester UIDs");
    expect(settings).not.toContain("Grant Pro to Testers");
    expect(settings).not.toContain("System Check");
    expect(settings).not.toContain("system-check");
  });
});
