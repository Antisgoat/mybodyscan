import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const layout = fs.readFileSync(
  path.resolve(__dirname, "../src/layouts/AuthedLayout.tsx"),
  "utf8"
);

describe("authenticated header touch targets", () => {
  it.each(["Open account menu", "Open navigation menu"])(
    "keeps %s at least 44px square",
    (label) => {
      const labelIndex = layout.indexOf(`aria-label="${label}"`);
      expect(labelIndex).toBeGreaterThan(0);

      const buttonSource = layout.slice(labelIndex - 220, labelIndex);
      expect(buttonSource).toContain('className="h-11 w-11 p-0"');
      expect(buttonSource).not.toContain('className="h-8 w-8 p-0"');
    }
  );
});
