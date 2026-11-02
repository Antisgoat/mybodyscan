/*
 * Patched minimatch is shared by modern and legacy build tools. Older ESLint
 * and Firebase consumers expect require('minimatch') to be callable. Preserve
 * that export shape without changing the upstream matching implementation.
 * The ESM entry point is unchanged. Runs reproducibly after every npm ci.
 */
const fs = require("node:fs");
const path = require("node:path");
const marker = "/* MyBodyScan legacy callable export compatibility */";
const root = path.resolve(__dirname, "..");
const lock = JSON.parse(
  fs.readFileSync(path.join(root, "package-lock.json"), "utf8")
);
const packages = Object.keys(lock.packages).filter((key) =>
  /^node_modules\/(?:.*\/)?minimatch$/.test(key)
);
if (!packages.length) throw new Error("No pinned minimatch packages found.");
for (const packagePath of packages) {
  const folder = path.join(root, packagePath);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(folder, "package.json"), "utf8")
  );
  if (manifest.version !== "11.0.4") {
    throw new Error(
      "Review minimatch export compatibility before changing its pinned version."
    );
  }
  const entry = path.join(folder, manifest.main);
  const original = fs.readFileSync(entry, "utf8");
  if (!original.includes(marker)) {
    fs.writeFileSync(
      entry,
      original +
        `\n${marker}\nconst mbsApi = module.exports;\nconst mbsCallable = (value, pattern, options) => mbsApi.minimatch(value, pattern, options);\nObject.assign(mbsCallable, mbsApi);\nmodule.exports = mbsCallable;\n`
    );
  }
  const matcher = require(entry);
  if (
    typeof matcher !== "function" ||
    !matcher("src/test.ts", "**/*.ts") ||
    typeof matcher.Minimatch !== "function"
  ) {
    throw new Error("minimatch compatibility check failed");
  }
}
console.log(
  `Patched upstream minimatch: ${packages.length} legacy/modern CommonJS exports verified.`
);
