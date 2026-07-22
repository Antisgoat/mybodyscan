#!/usr/bin/env node
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

function getGitSha() {
  try {
    return execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch (error) {
    return "unknown";
  }
}

const sha = getGitSha();
const builtAtISO = new Date().toISOString();
const output = { sha, builtAtISO };
const targetDir = process.argv.includes("--dist") ? "dist" : "public";
const targetPath = resolve(process.cwd(), targetDir, "build.txt");

writeFileSync(targetPath, JSON.stringify(output, null, 2));
console.log(`Build tag written to ${join(targetDir, "build.txt")}:`, output);
