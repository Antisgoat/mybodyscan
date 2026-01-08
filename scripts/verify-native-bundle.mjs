import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const ASSETS_DIR = path.resolve(
  process.cwd(),
  "ios/App/App/public/assets"
);

const NEEDLES = [
  "@firebase/auth",
  "firebase/auth",
  "capacitor-firebase-auth",
  "@capacitor-firebase/authentication",
];

const TEXT_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".css",
  ".html",
  ".map",
  ".txt",
  ".json",
]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

function isProbablyTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

function summarizeMatch(content, idx) {
  const start = Math.max(0, idx - 80);
  const end = Math.min(content.length, idx + 80);
  return content
    .slice(start, end)
    .replaceAll("\r", "")
    .replaceAll("\n", "\\n");
}

async function main() {
  let stats;
  try {
    stats = await stat(ASSETS_DIR);
  } catch {
    console.error(
      `[verify-native-bundle] Missing assets dir: ${ASSETS_DIR}\n` +
        "Run: npm run ios:sync"
    );
    process.exit(2);
    return;
  }

  if (!stats.isDirectory()) {
    console.error(`[verify-native-bundle] Not a directory: ${ASSETS_DIR}`);
    process.exit(2);
    return;
  }

  const files = await walk(ASSETS_DIR);
  const offenders = [];

  for (const file of files) {
    if (!isProbablyTextFile(file)) continue;
    const content = await readFile(file, "utf8").catch(() => null);
    if (content == null) continue;

    for (const needle of NEEDLES) {
      const idx = content.indexOf(needle);
      if (idx !== -1) {
        offenders.push({
          file,
          needle,
          preview: summarizeMatch(content, idx),
        });
      }
    }
  }

  if (offenders.length) {
    console.error(
      "[verify-native-bundle] FAILED: native iOS assets contain auth-related strings:"
    );
    for (const o of offenders) {
      console.error(`- ${o.file}`);
      console.error(`  needle: ${o.needle}`);
      console.error(`  preview: ${o.preview}`);
    }
    process.exit(1);
    return;
  }

  console.log("[verify-native-bundle] OK: no auth strings found in iOS assets.");
}

main().catch((err) => {
  console.error("[verify-native-bundle] Error:", err);
  process.exit(2);
});
