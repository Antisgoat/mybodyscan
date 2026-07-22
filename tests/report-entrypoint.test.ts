import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("report compatibility entry point", () => {
  it("delegates to the canonical source-labelled Results report", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../src/pages/Report.tsx"),
      "utf8"
    );

    expect(source).toContain('export { default } from "./Results"');
    expect(source).not.toMatch(
      /heightIn:\s*70|age:\s*30|waistIn:\s*32|Risk Level|biological age/i
    );
  });
});
