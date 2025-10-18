#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const distDir = resolve(projectRoot, "dist");
const targetDir = join(distDir, "system");

mkdirSync(targetDir, { recursive: true });

const payload = {
  ok: true,
  appCheckSoft: true,
  ts: new Date().toISOString(),
};

const outputPath = join(targetDir, "health.json");
writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`[health] wrote ${outputPath}`);
