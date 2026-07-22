import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("production document metadata", () => {
  it("uses the canonical MyBodyScan domain without template attribution", () => {
    const document = read("index.html");

    expect(document).toContain(
      '<link rel="canonical" href="https://mybodyscanapp.com/" />'
    );
    expect(document).toContain("MyBodyScan");
    expect(document).not.toContain("lovable_dev");
    expect(document).not.toContain("@lovable");
  });

  it("keeps public support links and status copy production-safe", () => {
    const footer = read("src/components/Footer.tsx");
    const errorBoundary = read("src/components/AppErrorBoundary.tsx");
    const billing = read("src/components/BillingButtons.tsx");

    expect(footer).toContain("new Date().getFullYear()");
    expect(footer).toContain("support@mybodyscanapp.com");
    expect(errorBoundary).toContain("support@mybodyscanapp.com");
    expect(`${footer}\n${errorBoundary}`).not.toContain(
      "support@mybodyscan.com"
    );
    expect(billing).not.toContain("no Stripe key");
  });
});
