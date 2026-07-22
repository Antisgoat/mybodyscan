import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGE_JSON = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8")
) as { scripts?: Record<string, string> };

describe("production build tag", () => {
  it("writes the release tag into dist after Vite builds", () => {
    const command = PACKAGE_JSON.scripts?.["build:prod"] ?? "";
    expect(command).toContain("vite build");
    expect(command).toContain("print-build-tag.js --dist");
    expect(command.indexOf("vite build")).toBeLessThan(
      command.indexOf("print-build-tag.js --dist")
    );
  });
});
