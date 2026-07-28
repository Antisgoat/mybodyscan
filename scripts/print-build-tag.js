#!/usr/bin/env node
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

function getGitSha() {
  const fromEnvironment = [
    process.env.GIT_COMMIT,
    process.env.GITHUB_SHA,
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.CI_COMMIT_SHA,
  ]
    .map((value) => String(value ?? "").trim())
    .find(Boolean);
  if (fromEnvironment) {
    return fromEnvironment.slice(0, 7);
  }
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
