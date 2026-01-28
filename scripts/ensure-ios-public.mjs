import fs from "node:fs/promises";
import path from "node:path";

const PUBLIC_DIR = path.resolve(process.cwd(), "ios/App/App/public");
const INDEX_HTML = path.join(PUBLIC_DIR, "index.html");
const CAP_CONFIG_PATH = path.resolve(
  process.cwd(),
  "ios/App/App/capacitor.config.json"
);

const CAP_CONFIG = {
  appId: "com.mybodyscan.app",
  appName: "MyBodyScan",
  webDir: "public",
  bundledWebRuntime: false,
  ios: {
    contentInset: "automatic",
  },
  android: {
    allowMixedContent: false,
  },
};

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
  }

  let needsConfigWrite = !(await exists(CAP_CONFIG_PATH));
  if (!needsConfigWrite) {
    try {
      const current = JSON.parse(await fs.readFile(CAP_CONFIG_PATH, "utf8"));
      if (current?.plugins?.FirebaseAuthentication) {
        needsConfigWrite = true;
      }
    } catch {
      needsConfigWrite = true;
    }
  }

  if (needsConfigWrite) {
    await fs.writeFile(
      CAP_CONFIG_PATH,
      `${JSON.stringify(CAP_CONFIG, null, 2)}\n`,
      "utf8"
    );
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(String(err?.stack || err?.message || err));
  process.exit(1);
});
