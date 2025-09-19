#!/usr/bin/env node
import { readFile } from "node:fs/promises";

async function main() {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  console.log("smoke", { name: pkg.name, version: pkg.version });
  console.log("checks", {
    timestamp: new Date().toISOString(),
    functionsConfigured: Boolean(process.env.VITE_FUNCTIONS_URL),
  });
}

main().catch((err) => {
  console.error("smoke failed", err);
  process.exitCode = 1;
});
