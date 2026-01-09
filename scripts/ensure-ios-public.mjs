import fs from "node:fs/promises";
import path from "node:path";

const PUBLIC_DIR = path.resolve(process.cwd(), "ios/App/App/public");
const INDEX_HTML = path.join(PUBLIC_DIR, "index.html");

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

async function main() {
  await ensureDir(PUBLIC_DIR);

  // Safe fallback: if someone nukes the folder, Xcode builds should still succeed.
  // Capacitor will overwrite this during `cap sync` anyway.
  if (!(await exists(INDEX_HTML))) {
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>MyBodyScan</title>
  </head>
  <body>
    <noscript>This app requires JavaScript.</noscript>
    <div id="root"></div>
  </body>
</html>
`;
    await fs.writeFile(INDEX_HTML, html, "utf8");
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(String(err?.stack || err?.message || err));
  process.exit(1);
});

