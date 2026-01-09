import fs from "node:fs/promises";
import path from "node:path";

const FORBIDDEN_TOKENS = [
  "@firebase/auth",
  "firebase/auth",
  "@capacitor-firebase/authentication",
  "capacitor-firebase-auth",
];

const SOURCE_ALLOWLIST = new Set([
  // The only file allowed to reference Firebase JS Auth.
  path.resolve(process.cwd(), "src/auth/impl.web.ts"),
]);

const SOURCE_FORBIDDEN_PATTERNS = [
  // Non-negotiable: no Firebase JS Auth imports outside impl.web.ts
  /(^|\s)from\s+["']firebase\/auth(?:\/[^"']*)?["']/,
  /(^|\s)from\s+["']@firebase\/auth(?:\/[^"']*)?["']/,
  /(^|\s)from\s+["']firebase\/compat\/auth["']/,
  /\bimport\s*\(\s*["']firebase\/auth(?:\/[^"']*)?["']\s*\)/,
  /\bimport\s*\(\s*["']@firebase\/auth(?:\/[^"']*)?["']\s*\)/,

  // Non-negotiable: no firebase root/compat app imports in app source.
  /(^|\s)from\s+["']firebase["']/,
  /(^|\s)from\s+["']firebase\/compat["']/,
  /\bimport\s*\(\s*["']firebase["']\s*\)/,
  /\bimport\s*\(\s*["']firebase\/compat["']\s*\)/,
];

async function statDir(dir) {
  try {
    const st = await fs.stat(dir);
    return st.isDirectory() ? st : null;
  } catch {
    return null;
  }
}

async function listFilesRecursive(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...(await listFilesRecursive(full)));
    else if (ent.isFile()) out.push(full);
  }
  return out;
}

async function listSourceFiles(dir) {
  const all = await listFilesRecursive(dir);
  return all.filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext);
  });
}

async function readUtf8BestEffort(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

function isForbiddenFilename(filePath) {
  // Non-negotiable: fail if ANY emitted filename matches this pattern.
  return /capacitor-firebase-auth.*\.js/.test(path.basename(filePath));
}

async function scanDir(label, dirPath, { required }) {
  const st = await statDir(dirPath);
  if (!st) {
    if (required) {
      const err = new Error(
        `[verify:native] Missing directory: ${label} (${dirPath})`
      );
      // Ensure a build/CI failure (non-negotiable).
      err.code = "verify/missing-dist";
      throw err;
    }
    return [];
  }

  const hits = [];
  const files = await listFilesRecursive(dirPath);
  for (const file of files) {
    if (isForbiddenFilename(file)) {
      hits.push({ label, file, forbidden: "filename:/capacitor-firebase-auth.*\\.js/" });
    }

    const text = await readUtf8BestEffort(file);
    if (!text) continue;

    for (const token of FORBIDDEN_TOKENS) {
      if (text.includes(token)) {
        hits.push({ label, file, forbidden: `token:${token}` });
      }
    }
  }
  return hits;
}

async function scanSourceImports() {
  const srcDir = path.resolve(process.cwd(), "src");
  const st = await statDir(srcDir);
  if (!st) return [];

  const hits = [];
  const files = await listSourceFiles(srcDir);
  for (const file of files) {
    const text = await readUtf8BestEffort(file);
    if (!text) continue;
    const abs = path.resolve(file);
    if (SOURCE_ALLOWLIST.has(abs)) continue;
    for (const re of SOURCE_FORBIDDEN_PATTERNS) {
      if (re.test(text)) {
        hits.push({ label: "src", file, forbidden: `source_import:${String(re)}` });
      }
    }
  }
  return hits;
}

async function main() {
  const distAssets = path.resolve(process.cwd(), "dist/assets");
  const iosPublic = path.resolve(process.cwd(), "ios/App/App/public");
  const iosAssets = path.resolve(process.cwd(), "ios/App/App/public/assets");

  const hits = [
    ...(await scanSourceImports()),
    ...(await scanDir("dist/assets", distAssets, { required: true })),
    ...(await scanDir("ios/App/App/public", iosPublic, { required: true })),
    ...(await scanDir("ios/App/App/public/assets", iosAssets, { required: false })),
  ];

  if (hits.length) {
    // eslint-disable-next-line no-console
    console.error(
      `[verify:native] FAIL: found forbidden auth artifacts (${hits.length})`
    );
    for (const h of hits) {
      // eslint-disable-next-line no-console
      console.error(`- ${h.label}: ${h.file}\n  -> ${h.forbidden}`);
    }
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log("[verify:native] OK: no forbidden auth artifacts found");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(String(err?.message || err));
  process.exit(1);
});
