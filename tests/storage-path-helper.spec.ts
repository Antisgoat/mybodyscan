import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.resolve(ROOT, "src");

const CANONICAL_PATH_REGEX = /scans\/[^"'\\s]+\/(?:front|back|left|right)\.jpg/gi;
const ALLOWED_FILES = new Set(
  [
    path.resolve(ROOT, "src", "lib", "uploads", "storagePaths.ts"),
    path.resolve(ROOT, "src", "lib", "scanPaths.ts"),
  ].map((p) => path.normalize(p))
);

function collectFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/[.](cjs|mjs|js|jsx|ts|tsx|json|mdx?)$/i.test(entry.name)) continue;
    files.push(fullPath);
  }
  return files;
}

function isTestFile(file: string): boolean {
  return /[.-](test|spec)\.[tj]sx?$/i.test(file);
}

describe("canonical scan storage path helper", () => {
  it("prevents new literal scan paths outside helpers", () => {
    const offenders: Array<{ file: string; literal: string }> = [];
    for (const file of collectFiles(SRC_DIR)) {
      if (isTestFile(file)) continue;
      if (ALLOWED_FILES.has(path.normalize(file))) continue;
      const contents = readFileSync(file, "utf8");
      let match: RegExpExecArray | null;
      while ((match = CANONICAL_PATH_REGEX.exec(contents)) !== null) {
        offenders.push({
          file: path.relative(ROOT, file),
          literal: match[0],
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});

