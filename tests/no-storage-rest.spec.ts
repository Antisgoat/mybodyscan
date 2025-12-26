import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.resolve(ROOT, "src");

const BANNED_PATTERNS = [
  "firebasestorage.googleapis.com",
  "/v0/b/",
  "o?name=",
];

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (!stats.isFile()) continue;
    if (!/[.](cjs|mjs|js|jsx|ts|tsx|json|css|md|svg)$/i.test(entry)) continue;
    files.push(fullPath);
  }
  return files;
}

describe("storage REST usage", () => {
  it("does not include manual Firebase Storage REST calls in src/", () => {
    const offenders: Array<{ file: string; pattern: string }> = [];
    for (const file of collectSourceFiles(SRC_DIR)) {
      const contents = readFileSync(file, "utf8");
      for (const pattern of BANNED_PATTERNS) {
        if (contents.includes(pattern)) {
          offenders.push({ file: path.relative(ROOT, file), pattern });
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
