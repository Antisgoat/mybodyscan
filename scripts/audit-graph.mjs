// scripts/audit-graph.mjs
// Node 18+/20+ ESM. No external deps.
// Builds a minimal import graph for src/ with tsconfig path alias + import.meta.glob support.
// Also reports: dead files (no inbound edges), case-insensitive filename conflicts, and stray fetch() calls
// to /api/* or Cloud Functions domains that bypass the unified HTTP client.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
const SUPPORTED_EXTS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
];

// ---------- helpers ----------
const normalize = (p) => path.resolve(p).split(path.sep).join(path.posix.sep);
const rel = (p) => normalize(path.relative(ROOT, p));
const readJsonIfExists = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(tsx?|jsx?|mjs|cjs|mts|cts)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------- tsconfig paths ----------
const tsconfig = readJsonIfExists(path.join(ROOT, "tsconfig.json")) || {};
const baseUrl = tsconfig?.compilerOptions?.baseUrl
  ? path.resolve(ROOT, tsconfig.compilerOptions.baseUrl)
  : ROOT;
const pathsMap = Object.entries(tsconfig?.compilerOptions?.paths || {}).map(
  ([alias, targets]) => {
    const hasStar = alias.endsWith("/*");
    const prefix = hasStar ? alias.slice(0, -2) : alias;
    const t = Array.isArray(targets) ? targets : [targets];
    return { alias, prefix, hasStar, targets: t };
  }
);

function candidateFilesForBase(base) {
  const c = [base];
  for (const ext of SUPPORTED_EXTS) c.push(base + ext);
  for (const ext of SUPPORTED_EXTS) c.push(path.join(base, "index" + ext));
  return c.map(normalize);
}

function resolveAlias(spec) {
  for (const rule of pathsMap) {
    if (rule.hasStar) {
      if (spec.startsWith(rule.prefix)) {
        const suffix = spec.slice(rule.prefix.length);
        const tgt = rule.targets[0] || "";
        const tgtBase = tgt.endsWith("/*") ? tgt.slice(0, -2) : tgt;
        return normalize(path.join(baseUrl, tgtBase, suffix));
      }
    } else if (spec === rule.prefix) {
      const tgt = rule.targets[0] || "";
      return normalize(path.join(baseUrl, tgt));
    }
  }
  return null;
}

function resolveImport(spec, fromFile) {
  const alias = resolveAlias(spec);
  if (alias) {
    for (const c of candidateFilesForBase(alias)) if (fileSet.has(c)) return c;
  }

  // absolute (rooted) import
  if (spec.startsWith("/")) {
    const base = path.join(ROOT, spec);
    for (const c of candidateFilesForBase(base)) if (fileSet.has(c)) return c;
    return null;
  }

  // relative
  if (spec.startsWith(".")) {
    const base = path.resolve(path.dirname(fromFile), spec);
    for (const c of candidateFilesForBase(base)) if (fileSet.has(c)) return c;
  }

  return null; // bare module → ignore
}

// ---------- collect files ----------
const filesAbs = walk(SRC_DIR);
const files = filesAbs.map(normalize);
const fileSet = new Set(files);

// regexes (simple, not full parser)
const importFromRegex =
  /\bimport(?:\s+[^"'()]*)?\s*from\s*["'`](.+?)["'`]|^\s*import\s*["'`](.+?)["'`]/gm;
const exportFromRegex =
  /\bexport\s+(?:\*|\{[^}]*\})\s+from\s*["'`](.+?)["'`]/gm;
const dynamicImportRegex = /import\(\s*["'`](.+?)["'`]\s*\)/g;
const importMetaGlobRegex = /import\.meta\.glob\(\s*["'`](.+?)["'`]/g;

const edges = [];
const importers = new Map(); // target -> Set(importer)

function addEdge(importer, resolved) {
  if (!resolved) return;
  edges.push([importer, resolved]);
  if (!importers.has(resolved)) importers.set(resolved, new Set());
  importers.get(resolved).add(importer);
}

// glob resolver (minimal **, *, ? support)
function globToRegExp(absPattern) {
  const g = normalize(absPattern);
  let out = "";
  for (let i = 0; i < g.length; i++) {
    const ch = g[i];
    if (ch === "*") {
      if (g[i + 1] === "*") {
        out += ".*";
        i++;
      } else out += "[^/]*";
    } else if (ch === "?") out += ".";
    else out += escapeRe(ch);
  }
  return new RegExp("^" + out + "$");
}

function resolveGlob(pattern, fromFile) {
  const base = pattern.startsWith("/")
    ? normalize(path.join(ROOT, pattern))
    : normalize(path.resolve(path.dirname(fromFile), pattern));
  const re = globToRegExp(base);
  return files.filter((f) => re.test(f));
}

// ---------- build graph ----------
for (const abs of filesAbs) {
  const importer = normalize(abs);
  const content = fs.readFileSync(abs, "utf8");
  const addBySpec = (spec) => addEdge(importer, resolveImport(spec, abs));

  for (const m of content.matchAll(importFromRegex)) addBySpec(m[1] || m[2]);
  for (const m of content.matchAll(exportFromRegex)) addBySpec(m[1]);
  for (const m of content.matchAll(dynamicImportRegex)) addBySpec(m[1]);
  for (const m of content.matchAll(importMetaGlobRegex)) {
    const matches = resolveGlob(m[1], abs);
    for (const target of matches) addEdge(importer, target);
  }
}

// ---------- entry files ----------
const entryCandidates = [
  "src/main.tsx",
  "src/main.ts",
  "src/main.jsx",
  "src/index.tsx",
  "src/index.ts",
  "src/index.jsx",
  "src/App.tsx",
  "src/app.tsx",
  "src/router.tsx",
  "src/routes.tsx",
].map(normalize);
const entrySet = new Set(entryCandidates);

// ---------- dead files ----------
const deadFiles = files
  .filter((f) => !entrySet.has(rel(f)))
  .filter((f) => !importers.get(f)?.size);

// ---------- case conflicts ----------
const caseKey = (f) => {
  const dir = path.posix.dirname(f).toLowerCase();
  const base = path.posix.basename(f).toLowerCase();
  return dir + "/" + base;
};
const byKey = new Map();
for (const f of files) {
  const k = caseKey(f);
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(f);
}
const caseConflicts = Array.from(byKey.values()).filter(
  (list) => list.length > 1
);

// ---------- stray fetch() calls ----------
const strayFetchCalls = [];
for (const abs of filesAbs) {
  const f = normalize(abs);
  const content = fs.readFileSync(abs, "utf8");
  const alsoUnified =
    /apiFetchWithFallback|apiFetchJson|apiFetch|api(Get|Post|Put|Delete)/.test(
      content
    );
  const lines = content.split(/\r?\n/);
  const apiRe = /fetch\s*\(\s*(['"])\/api\//;
  const fnRe = /fetch\s*\(\s*(['"]).*?(cloudfunctions\.net|a\.run\.app)/;
  lines.forEach((line, idx) => {
    if (!/fetch\s*\(/.test(line)) return;
    if (apiRe.test(line) || fnRe.test(line)) {
      strayFetchCalls.push({
        file: rel(f),
        line: idx + 1,
        snippet: line.trim().slice(0, 220),
        alsoUsesUnified: alsoUnified,
      });
    }
  });
}

const result = {
  meta: {
    generatedAt: new Date().toISOString(),
    root: rel(ROOT) || ".",
    srcDirExists: fs.existsSync(SRC_DIR),
  },
  importGraphSummary: {
    totalFiles: files.length,
    totalEdges: edges.length,
    entryFilesPresent: entryCandidates.filter((f) => fileSet.has(f)),
    aliasRules: pathsMap.map((p) => p.alias),
  },
  graph: {
    edges: edges.map(([from, to]) => [rel(from), rel(to)]),
  },
  deadFiles: deadFiles.map(rel).sort(),
  caseConflicts: caseConflicts.map((group) => group.map(rel).sort()),
  strayFetchCalls,
};

console.log(JSON.stringify(result, null, 2));
