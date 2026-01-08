import fs from "node:fs/promises";
import path from "node:path";

const FORBIDDEN_STRINGS = [
  "@firebase/auth",
  "firebase/auth",
  "@capacitor-firebase/authentication",
];

// Native builds must never emit or copy this web-wrapper chunk.
const FORBIDDEN_FILENAME_RE = /capacitor-firebase-auth.*\.js$/i;

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

async function readUtf8BestEffort(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function scanDir(label, dirPath, { required }) {
  const st = await statDir(dirPath);
  if (!st) {
    if (required) {
      throw new Error(`[verify:native] Missing directory: ${label} (${dirPath})`);
    }
    return [];
  }

  const hits = [];
  const files = await listFilesRecursive(dirPath);
  for (const file of files) {
    const base = path.basename(file);
    if (FORBIDDEN_FILENAME_RE.test(base)) {
      hits.push({ label, file, forbidden: `filename:${base}` });
    }

    const text = await readUtf8BestEffort(file);
    if (!text) continue;

    for (const needle of FORBIDDEN_STRINGS) {
      if (text.includes(needle)) {
        hits.push({ label, file, forbidden: needle });
      }
    }
  }
  return hits;
}

async function main() {
  const distAssets = path.resolve(process.cwd(), "dist/assets");
  const iosAssets = path.resolve(process.cwd(), "ios/App/App/public/assets");

  const hits = [
    ...(await scanDir("dist/assets", distAssets, { required: true })),
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
    return;
  }

  // eslint-disable-next-line no-console
  console.log("[verify:native] OK: no forbidden auth artifacts found");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(String(err?.message || err));
  process.exit(2);
});
