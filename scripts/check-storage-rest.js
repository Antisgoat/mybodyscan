#!/usr/bin/env node

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import path from "path";
import { describeStorageRestPattern, STORAGE_REST_PATTERNS } from "./storage-rest-patterns.mjs";

const ROOT = process.cwd();
const DIST_DIR = path.resolve(ROOT, "dist");
const ALLOWLIST_BASENAMES = [/^firebase-.*\.js$/i, /^vendor-.*\.js$/i];

function collectBuildAssets(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectBuildAssets(fullPath));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/[.](js|css|html|json|txt)$/i.test(entry.name)) continue;
    files.push(fullPath);
  }
  return files;
}

function main() {
  if (!existsSync(DIST_DIR)) {
    console.error("dist/ not found. Run `npm run build` first.");
    process.exit(1);
  }
  const offenders = [];
  for (const file of collectBuildAssets(DIST_DIR)) {
    const base = path.basename(file);
    if (ALLOWLIST_BASENAMES.some((regex) => regex.test(base))) continue;
    const contents = readFileSync(file, "utf8");
    for (const pattern of STORAGE_REST_PATTERNS) {
      if (pattern.regex.test(contents)) {
        offenders.push({
          file: path.relative(ROOT, file),
          pattern: describeStorageRestPattern(pattern),
        });
      }
    }
  }
  if (offenders.length) {
    console.error("Found forbidden Firebase Storage REST patterns in build output:\n");
    for (const offender of offenders) {
      console.error(` - ${offender.file}: ${offender.pattern}`);
    }
    console.error(
      "\nUploads and downloads must use the Firebase Storage Web SDK (uploadBytesResumable + getDownloadURL).\n" +
        "Remove manual REST URL construction before shipping."
    );
    process.exit(1);
  }
  console.log("No forbidden Firebase Storage REST patterns found in dist/.");
}

main();
