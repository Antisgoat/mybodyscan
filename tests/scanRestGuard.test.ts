import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FORBIDDEN = [/firebasestorage\.googleapis\.com/i, /\/o\?name=/i];
const SCAN_FILES = [
  "src/lib/api/scan.ts",
  "src/pages/Scan.tsx",
  "src/lib/uploads/uploadPhoto.ts",
  "src/lib/uploads/uploadViaStorage.ts",
  "src/lib/uploads/uploadPreparedPhoto.ts",
];

describe("scan upload paths", () => {
  for (const file of SCAN_FILES) {
    it(`${file} does not reference forbidden storage REST endpoints`, () => {
      const content = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN) {
        expect(content).not.toMatch(pattern);
      }
    });
  }
});
