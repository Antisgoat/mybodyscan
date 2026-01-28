import fs from "fs";
import os from "os";
import path from "path";

const cwd = process.cwd();
const home = os.homedir();
const packageJson = path.join(cwd, "package.json");
const capacitorConfig = path.join(cwd, "capacitor.config.ts");

if (path.resolve(cwd) === path.resolve(home)) {
  console.error(
    "Refusing to run from your home directory. cd ~/Documents/GitHub/mybodyscan then re-run."
  );
  process.exit(1);
}

if (!fs.existsSync(packageJson) || !fs.existsSync(capacitorConfig)) {
  console.error(
    "Expected to run from the mybodyscan repo root (missing package.json or capacitor.config.ts)."
  );
  process.exit(1);
}
