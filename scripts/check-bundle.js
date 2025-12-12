#!/usr/bin/env node

import { promises as fs } from "fs";
import path from "path";
import zlib from "zlib";

const PROJECT_ROOT = path.resolve(process.cwd(), "dist", "assets");
const MAX_RAW_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_GZIP_BYTES = 2.5 * 1024 * 1024; // 2.5 MB

async function gzipSize(buffer) {
  return zlib.gzipSync(buffer).length;
}

async function checkAssets() {
  const violations = [];
  const entries = await fs.readdir(PROJECT_ROOT, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.match(/\.(js|css)$/)) continue;

    const filePath = path.join(PROJECT_ROOT, entry.name);
    const stats = await fs.stat(filePath);
    const rawSize = stats.size;
    const buffer = await fs.readFile(filePath);
    const gzipBytes = await gzipSize(buffer);

    if (rawSize > MAX_RAW_BYTES || gzipBytes > MAX_GZIP_BYTES) {
      violations.push({ name: entry.name, rawSize, gzipBytes });
    }
  }

  if (violations.length) {
    console.error("Bundle size check failed:\n");
    for (const violation of violations) {
      console.error(
        ` - ${violation.name}: raw ${(violation.rawSize / 1024 / 1024).toFixed(2)} MB, gzip ${(violation.gzipBytes / 1024 / 1024).toFixed(2)} MB`
      );
    }
    console.error(
      "\nTargets: raw <= 8 MB, gzip <= 2.5 MB. Reduce bundle size before deploying."
    );
    process.exit(1);
  } else {
    console.log("Bundle size check passed.");
  }
}

checkAssets().catch((error) => {
  console.error("Failed to run bundle check", error);
  process.exit(1);
});
