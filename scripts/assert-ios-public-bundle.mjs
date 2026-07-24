import fs from "node:fs/promises";
import path from "node:path";
import { findMissingLocalAssets } from "./lib/static-bundle-integrity.mjs";

const PUBLIC_DIR = path.resolve(process.cwd(), "ios/App/App/public");
const INDEX_HTML = path.join(PUBLIC_DIR, "index.html");
const ASSETS_DIR = path.join(PUBLIC_DIR, "assets");
const PLACEHOLDER_TOKEN = "Placeholder. Run npm run ios:sync";

async function exists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readFileSafe(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function main() {
  if (!(await exists(INDEX_HTML))) {
    throw new Error(
      `Missing ios/App/App/public/index.html. Run npm run build && npx cap sync ios.`
    );
  }

  const html = await readFileSafe(INDEX_HTML);
  if (html.includes(PLACEHOLDER_TOKEN)) {
    throw new Error(
      "iOS public bundle is still the placeholder. Run npm run build && npx cap sync ios."
    );
  }

  if (!(await exists(ASSETS_DIR))) {
    throw new Error(
      "Missing ios/App/App/public/assets. Run npm run build && npx cap sync ios."
    );
  }

  const assetEntries = await fs.readdir(ASSETS_DIR).catch(() => []);
  if (!assetEntries.length) {
    throw new Error(
      "No assets found in ios/App/App/public/assets. Run npm run build && npx cap sync ios."
    );
  }

  const { references, missing } = await findMissingLocalAssets(
    PUBLIC_DIR,
    html
  );
  const scriptReferences = references.filter((reference) =>
    /\.js$/i.test(reference)
  );
  const stylesheetReferences = references.filter((reference) =>
    /\.css$/i.test(reference)
  );
  if (!scriptReferences.length || !stylesheetReferences.length) {
    throw new Error(
      "iOS public index is missing its built JavaScript or stylesheet reference. Run npm run build:native:ios && npx cap sync ios."
    );
  }

  if (missing.length) {
    const details = missing
      .map(
        ({ publicPath, filePath }) =>
          ` - ${publicPath} (expected at ${filePath})`
      )
      .join("\n");
    throw new Error(
      `iOS public bundle references missing files:\n${details}\nRun npm run build:native:ios && npx cap sync ios.`
    );
  }

  console.log(
    `[ios-public] OK: ${references.length} referenced web assets present in ios/App/App/public`
  );
}

main().catch((err) => {
  console.error(String(err?.message || err));
  process.exit(1);
});
