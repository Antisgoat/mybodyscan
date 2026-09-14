import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("system check navigation", () => {
  it("keeps diagnostics internal while preserving operator routes", () => {
    const app = read("src/App.tsx");
    expect(app).toContain('path="/system-check"');
    expect(app).toContain("allowInternalTools && (");

    for (const file of [
      "src/lib/demoFlag.tsx",
      "src/pages/DevAudit.tsx",
      "package.json",
    ]) {
      const content = read(file);
      expect(content, file).toContain("/system-check");
      expect(content, file).not.toContain("/system/check");
    }

    for (const file of [
      "src/components/AppFooter.tsx",
      "src/components/Footer.tsx",
      "src/layouts/AuthedLayout.tsx",
      "src/pages/Settings.tsx",
    ]) {
      expect(read(file), file).not.toContain("/system-check");
    }
  });
});
