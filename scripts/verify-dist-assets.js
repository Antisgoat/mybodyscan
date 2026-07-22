#!/usr/bin/env node

import { promises as fs } from "fs";
import path from "path";

const DIST_DIR = path.resolve(process.cwd(), "dist");
const INDEX_PATH = path.join(DIST_DIR, "index.html");
const BUILD_TAG_PATH = path.join(DIST_DIR, "build.txt");

function uniq(arr) {
  return Array.from(new Set(arr));
}

function extractAssetPaths(html) {
  // Capture Vite-built asset references like:
  //   src="/assets/index-XXXX.js"
  //   href="/assets/index-XXXX.css"
  const matches = Array.from(
    html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+\.(?:js|css))["']/g)
  ).map((m) => m[1]);
  return uniq(matches);
}

async function exists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function main() {
  const indexHtml = await fs.readFile(INDEX_PATH, "utf8").catch((e) => {
    console.error(`Missing build output: ${INDEX_PATH}`);
    console.error(e?.message || e);
    process.exit(1);
  });

  const assets = extractAssetPaths(indexHtml);
  if (!assets.length) {
    console.error(
      "No /assets/*.js or /assets/*.css references found in dist/index.html."
    );
    process.exit(1);
  }

  const missing = [];
  for (const publicPath of assets) {
    const rel = publicPath.replace(/^\//, ""); // "assets/..."
    const filePath = path.join(DIST_DIR, rel);
    if (!(await exists(filePath))) {
      missing.push({ publicPath, filePath });
    }
  }

  if (missing.length) {
    console.error(
      "Build integrity check failed: dist/index.html references missing files:\n"
    );
    for (const m of missing) {
      console.error(` - ${m.publicPath} (expected at ${m.filePath})`);
    }
    process.exit(1);
  }

  const buildTag = await fs
    .readFile(BUILD_TAG_PATH, "utf8")
    .then((contents) => JSON.parse(contents))
    .catch((error) => {
      console.error(`Missing or invalid build tag: ${BUILD_TAG_PATH}`);
      console.error(error?.message || error);
      process.exit(1);
    });
  if (!String(buildTag?.sha || "").trim()) {
    console.error(
      "Build integrity check failed: dist/build.txt has no commit SHA."
    );
    process.exit(1);
  }

  console.log(
    `Build integrity check passed (${assets.length} assets and build tag verified).`
  );
}

main().catch((e) => {
  console.error("Build integrity check crashed:", e?.stack || e);
  process.exit(1);
});
