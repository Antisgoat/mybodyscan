import fs from "node:fs/promises";
import path from "node:path";

const PUBLIC_DIR = path.resolve(process.cwd(), "ios/App/App/public");
const INDEX_HTML = path.join(PUBLIC_DIR, "index.html");
const ASSETS_DIR = path.join(PUBLIC_DIR, "assets");

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function exists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function placeholderHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>MyBodyScan</title>
  </head>
  <body>
    Placeholder. Run npm run ios:sync to copy real web assets.
  </body>
</html>
`;
}

async function main() {
  await ensureDir(PUBLIC_DIR);

  // Safe fallback: if someone nukes the folder, Xcode builds should still succeed.
  // Capacitor will overwrite this during `cap sync` anyway.
  if (!(await exists(INDEX_HTML))) {
    await fs.writeFile(INDEX_HTML, placeholderHtml(), "utf8");
    return;
  }

  // Repair: if someone committed a built index.html referencing hashed assets,
  // but the assets folder isn't present (i.e. cap sync hasn't run yet),
  // force a safe placeholder to avoid a white screen.
  try {
    const html = await fs.readFile(INDEX_HTML, "utf8");
    const looksBuilt =
      html.includes('src="./assets/') ||
      html.includes("src='./assets/") ||
      html.includes('href="./assets/') ||
      html.includes("href='./assets/");
    if (looksBuilt && !(await exists(ASSETS_DIR))) {
      await fs.writeFile(INDEX_HTML, placeholderHtml(), "utf8");
    }
  } catch {
    // ignore
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(String(err?.stack || err?.message || err));
  process.exit(1);
});

