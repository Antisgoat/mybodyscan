#!/usr/bin/env node

import { promises as fs } from "fs";
import path from "path";
import {
  extractLocalAssetPaths,
  findMissingLocalAssets,
} from "./lib/static-bundle-integrity.mjs";

const DIST_DIR = path.resolve(process.cwd(), "dist");
const INDEX_PATH = path.join(DIST_DIR, "index.html");
const BUILD_TAG_PATH = path.join(DIST_DIR, "build.txt");

function extractAssetPaths(html) {
  // Capture Vite-built asset references like:
  //   src="/assets/index-XXXX.js"
  //   href="/assets/index-XXXX.css"
  return extractLocalAssetPaths(html).filter((reference) =>
    /^\/assets\/[^"']+\.(?:js|css)$/i.test(reference)
  );
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

  const { missing: localMissing } = await findMissingLocalAssets(
    DIST_DIR,
    indexHtml
  );
  const assetSet = new Set(assets);
  const missing = localMissing.filter(({ publicPath }) =>
    assetSet.has(publicPath)
  );

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
