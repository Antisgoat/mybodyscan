import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

const policies = [
  "public/legal/privacy.html",
  "public/legal/terms.html",
  "public/legal/refund.html",
  "src/content/legal/privacy.md",
  "src/content/legal/terms.md",
  "src/pages/legal/Refund.tsx",
];

describe("production legal policy consistency", () => {
  it("uses the approved brand, operator, and fixed effective date", () => {
    for (const file of policies) {
      const content = read(file);
      expect(content, file).toContain("MyBodyScan");
      expect(content, file).toContain("ADLR Labs");
      expect(content, file).toContain("July 22, 2026");
      expect(content, file).not.toContain("ADLR Labs LLC");
    }

    const staticPolicies = policies
      .filter((file) => file.endsWith(".html"))
      .map(read)
      .join("\n");
    expect(staticPolicies).not.toContain('id="d"');
    expect(staticPolicies).not.toContain("new Date()");
  });

  it("keeps visible billing language aligned with the 12-month runtime default", () => {
    expect(read("public/legal/terms.html")).toContain("expire 12 months");
    expect(read("src/content/legal/terms.md")).toContain("expire 12 months");
    expect(read("functions/src/lib/creditPolicy.ts")).toContain(
      "DEFAULT_CREDIT_EXPIRY_MONTHS = 12"
    );
  });

  it("uses the complete legal pages for legacy routes", () => {
    expect(read("src/pages/Privacy.tsx")).toContain(
      'export { default } from "./legal/Privacy"'
    );
    expect(read("src/pages/Terms.tsx")).toContain(
      'export { default } from "./legal/Terms"'
    );
  });

  it("qualifies estimates and optional transformation previews", () => {
    const terms = read("src/content/legal/terms.md");
    expect(terms).toContain("not medical advice");
    expect(terms).toContain("not a prediction");
    expect(terms).toContain("without claiming exact regional fat amounts");
  });
});
