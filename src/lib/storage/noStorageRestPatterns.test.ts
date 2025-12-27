import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

type Offender = { file: string; pattern: string };

// Keep forbidden patterns encoded so this test file itself does not match.
const ENCODED = {
  storageRestHost: "ZmlyZWJhc2VzdG9yYWdlLmdvb2dsZWFwaXMuY29t",
  v0b: "L3YwL2Iv",
  objectNameQuery: "bz9uYW1lPQ==",
} as const;

function decodeBase64(input: string): string {
  try {
    return Buffer.from(input, "base64").toString("utf8");
  } catch {
    return input;
  }
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const FORBIDDEN: Array<{ name: string; regex: RegExp }> = [
  // Decode once to avoid embedding raw substrings in this file.
  // (This test itself is scanned by other guardrails.)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ...(() => {
    const host = decodeBase64(ENCODED.storageRestHost);
    const v0b = decodeBase64(ENCODED.v0b);
    const oName = decodeBase64(ENCODED.objectNameQuery);
    return [
  {
    name: "Storage REST host",
    regex: new RegExp(escapeRegExp(host), "i"),
  },
  {
    name: "Storage REST v0 bucket prefix",
    regex: new RegExp(escapeRegExp(v0b), "i"),
  },
  {
    name: "Storage REST object name query",
    regex: new RegExp(escapeRegExp(oName), "i"),
  },
  // Defensive: never allow manual object-access endpoints for Storage.
  {
    name: "Storage object endpoint",
    regex: new RegExp(
      `${escapeRegExp(host)}${escapeRegExp(v0b)}[^/]+\\/o(?:\\/|%2f|\\?)`,
      "i"
    ),
  },
    ] as Array<{ name: string; regex: RegExp }>;
  })(),
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

