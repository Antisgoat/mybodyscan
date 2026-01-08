import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const DIST_ASSETS_DIR = path.resolve(process.cwd(), "dist/assets");
const IOS_ASSETS_DIR = path.resolve(process.cwd(), "ios/App/App/public/assets");

const NEEDLES = [
  "@firebase/auth",
  "firebase/auth",
  "capacitor-firebase-auth",
  "@capacitor-firebase/authentication",
];

const FORBIDDEN_JS_BASENAME_RE = /(capacitor-firebase-auth|firebase-).*\.js$/i;

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

async function scanDir(label, dir, options = { requireExists: false }) {
  let stats;
  try {
    stats = await stat(dir);
  } catch {
    if (options.requireExists) {
      throw new Error(`[verify-native-bundle] Missing ${label} dir: ${dir}`);
    }
    return { dir, offenders: [], skipped: true };
  }

  if (!stats.isDirectory()) {
    throw new Error(`[verify-native-bundle] Not a directory: ${dir}`);
  }

  const files = await walk(dir);
  const offenders = [];

  for (const file of files) {
    const base = path.basename(file);
    if (FORBIDDEN_JS_BASENAME_RE.test(base)) {
      offenders.push({
        file,
        needle: `filename:${base}`,
        preview:
          "Forbidden chunk name in native output (expected zero firebase-* / capacitor-firebase-auth-* chunks).",
      });
      continue;
    }
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

  return { dir, offenders, skipped: false };
}

async function main() {
  const dist = await scanDir("dist/assets", DIST_ASSETS_DIR, {
    requireExists: true,
  }).catch((err) => {
    console.error(String(err?.message || err));
    console.error("Run: npm run build:native");
    process.exit(2);
  });
  if (!dist) return;

  // iOS assets are only present after `npx cap sync ios`.
  const ios = await scanDir("ios/App/App/public/assets", IOS_ASSETS_DIR, {
    requireExists: false,
  });

  const offenders = [...dist.offenders, ...ios.offenders];
  if (offenders.length) {
    console.error(
      "[verify-native-bundle] FAILED: native output contains auth-related files/strings.\n" +
        "Hint: ensure `vite build --mode native` is used, and native builds alias-stub firebase/auth + do NOT import @capacitor-firebase/authentication."
    );
    for (const o of offenders) {
      console.error(`- ${o.file}`);
      console.error(`  needle: ${o.needle}`);
      console.error(`  preview: ${o.preview}`);
    }
    process.exit(1);
    return;
  }

  if (ios.skipped) {
    console.log(
      "[verify-native-bundle] OK: dist/assets clean. (iOS assets not present; run `npx cap sync ios` to verify copied assets too.)"
    );
    return;
  }

  console.log(
    "[verify-native-bundle] OK: dist/assets and iOS assets contain no auth strings/chunks."
  );
}

main().catch((err) => {
  console.error("[verify-native-bundle] Error:", err);
  process.exit(2);
});
