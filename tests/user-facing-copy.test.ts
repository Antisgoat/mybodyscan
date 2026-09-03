import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

const userFacingCopyFiles = [
  "functions/src/coachChat.ts",
  "functions/src/lib/openaiConfig.ts",
  "functions/src/scan/engineConfig.ts",
  "public/legal/privacy.html",
  "src/content/legal/privacy.md",
  "src/content/legal/terms.md",
  "src/lib/envStatus.ts",
  "src/lib/scanResultViewModel.ts",
  "src/pages/Billing.tsx",
  "src/pages/Coach/Chat.tsx",
  "src/pages/LiveFlowsQA.tsx",
  "src/pages/Paywall.tsx",
  "src/pages/Plans.tsx",
  "src/pages/Results.tsx",
  "src/pages/Scan.tsx",
  "src/pages/Scan/Capture.tsx",
  "src/pages/Scan/Result.tsx",
  "src/pages/Scan/Start.tsx",
  "src/pages/TransformationPreview.tsx",
  "src/pages/Workouts.tsx",
];

describe("user-facing product language", () => {
  it("uses product-focused wording instead of implementation branding", () => {
    for (const file of userFacingCopyFiles) {
      // Privacy disclosures must name the actual processor. Product/marketing
      // copy should still avoid implementation branding.
      const forbidden = file.includes("legal/privacy")
        ? /\bAI\b|\bLLM\b/
        : /\bAI\b|\bOpenAI\b|\bLLM\b/;
      expect(read(file), file).not.toMatch(forbidden);
    }
  });

  it("clearly identifies the kitchen processor before optional data sharing", () => {
    expect(read("src/content/legal/privacy.md")).toContain(
      "to OpenAI for processing"
    );
    expect(read("src/pages/FridgeMeals.tsx")).toContain(
      "kitchen-processing-consent"
    );
  });
});
