import fs from "node:fs/promises";
import path from "node:path";

function uniq(values) {
  return Array.from(new Set(values));
}

export function extractLocalAssetPaths(html) {
  const references = Array.from(
    html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)
  ).map((match) => match[1]);

  return uniq(
    references
      .filter(
        (reference) => reference.startsWith("/") && !reference.startsWith("//")
      )
      .map((reference) => reference.split(/[?#]/, 1)[0])
      .filter((reference) => reference && reference !== "/")
  );
}

export function resolvePublicAssetPath(rootDir, publicPath) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(publicPath);
  } catch {
    throw new Error(`Invalid encoded asset path: ${publicPath}`);
  }

  const relativePath = decodedPath.replace(/^\/+/, "");
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Asset path escapes the bundle root: ${publicPath}`);
  }
  return resolved;
}

export async function findMissingLocalAssets(rootDir, html) {
  const references = extractLocalAssetPaths(html);
  const missing = [];

  for (const publicPath of references) {
    const filePath = resolvePublicAssetPath(rootDir, publicPath);
    const isFile = await fs
      .stat(filePath)
      .then((stat) => stat.isFile())
      .catch(() => false);
    if (!isFile) {
      missing.push({ publicPath, filePath });
    }
  }

  return { references, missing };
}
