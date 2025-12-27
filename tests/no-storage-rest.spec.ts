import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describeStorageRestPattern, STORAGE_REST_PATTERNS } from "../scripts/storage-rest-patterns.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SRC_DIRS = [path.resolve(ROOT, "src"), path.resolve(ROOT, "functions", "src")];
const ALLOWLIST = new Set(
  [
    path.resolve(ROOT, "scripts", "storage-rest-patterns.mjs"),
    path.resolve(ROOT, "src", "lib", "storage", "restGuards.ts"),
  ].map((p) => path.normalize(p))
);

function collectFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectFiles(fullPath));
      continue;
    }
    if (!stats.isFile()) continue;
    if (!/[.](cjs|mjs|js|jsx|ts|tsx|json|css|md|svg)$/i.test(entry)) continue;
    files.push(fullPath);
  }
  return files;
}

describe("storage REST usage", () => {
  it("does not include manual Firebase Storage REST calls in source code", () => {
    const offenders: Array<{ file: string; pattern: string }> = [];
    for (const dir of SRC_DIRS) {
      for (const file of collectFiles(dir)) {
        if (ALLOWLIST.has(path.normalize(file))) continue;
        const contents = readFileSync(file, "utf8");
        const compact = contents.replace(/\s+/g, "");
        for (const pattern of STORAGE_REST_PATTERNS) {
          if (pattern.regex.test(contents) || pattern.regex.test(compact)) {
            offenders.push({
              file: path.relative(ROOT, file),
              pattern: describeStorageRestPattern(pattern),
            });
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
