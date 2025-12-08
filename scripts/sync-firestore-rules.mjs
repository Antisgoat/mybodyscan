import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const databaseRulesPath = resolve(root, "database.rules.json");
const firestoreRulesPath = resolve(root, "firestore.rules");

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    console.error(`Unable to read ${path}:`, error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return "";
  }
}

const databaseRules = read(databaseRulesPath);
const firestoreRules = read(firestoreRulesPath);
const matches = databaseRules === firestoreRules;
const checkOnly = process.argv.includes("--check");

if (checkOnly) {
  if (!matches) {
    console.error("firestore.rules is out of sync with database.rules.json. Run npm run rules:sync.");
    process.exit(1);
  }
  console.log("firestore.rules matches database.rules.json");
  process.exit(0);
}

if (matches) {
  console.log("firestore.rules already matches database.rules.json");
  process.exit(0);
}

writeFileSync(firestoreRulesPath, databaseRules, "utf8");
console.log("firestore.rules refreshed from database.rules.json");
