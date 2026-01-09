import fs from "fs";
import path from "path";

const root = process.cwd();
const srcDir = path.join(root, "src");

const needles = [
  "@capacitor-firebase/authentication",
  "capacitor-firebase-auth",
  "firebase/auth",
  "@firebase/auth",
  "firebase/compat",
  'from "firebase"',
  "from 'firebase'",
  'import "firebase"',
  "import 'firebase'",
];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(ent.name)) out.push(p);
  }
  return out;
}

function findLines(txt, needle) {
  const lines = txt.split(/\r?\n/);
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(needle)) hits.push(i + 1);
  }
  return hits;
}

const files = fs.existsSync(srcDir) ? walk(srcDir) : [];
let total = 0;

for (const f of files) {
  const txt = fs.readFileSync(f, "utf8");
  for (const n of needles) {
    const lines = findLines(txt, n);
    if (lines.length) {
      total += lines.length;
      console.log(`${path.relative(root, f)} : ${n} : ${lines.join(",")}`);
    }
  }
}

if (!total) {
  console.log("NO_MATCHES_IN_SRC");
}

