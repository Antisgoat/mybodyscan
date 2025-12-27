import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

type Offender = { file: string; pattern: string };

const FORBIDDEN: Array<{ name: string; regex: RegExp }> = [
  { name: "firebasestorage.googleapis.com", regex: /firebasestorage\.googleapis\.com/i },
  { name: "/v0/b/", regex: /\/v0\/b\//i },
  { name: "o?name=", regex: /o\?name=/i },
  // Defensive: never allow manual object-access endpoints for Firebase Storage.
  {
    name: "firebasestorage object endpoint (/v0/b/.../o...)",
    regex: /firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o(?:\/|%2f|\?)/i,
  },
];

const TEXT_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".css",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Avoid scanning vendored/large directories if they ever land in src/.
      if (entry.name === "vendor" || entry.name === "__generated__") continue;
      walk(full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!TEXT_EXT.has(ext)) continue;
    out.push(full);
  }
  return out;
}

describe("scan storage REST guardrail", () => {
  it("does not contain forbidden Firebase Storage REST patterns in src/", () => {
    const srcRoot = path.resolve(process.cwd(), "src");
    const offenders: Offender[] = [];
    for (const file of walk(srcRoot)) {
      const rel = path.relative(process.cwd(), file);
      const content = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN) {
        if (!pattern.regex.test(content)) continue;
        offenders.push({ file: rel, pattern: pattern.name });
      }
    }
    expect(offenders).toEqual([]);
  });
});

