#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let spawnError = null;

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      spawnError = error;
    });

    child.on("close", (code, signal) => {
      resolve({
        command: [command, ...args].join(" "),
        code: typeof code === "number" ? code : signal ? 128 : -1,
        signal: signal ?? null,
        stdout,
        stderr,
        error: spawnError ? String(spawnError.message ?? spawnError) : null,
      });
    });
  });
}

export async function runBuilds() {
  const web = await runCommand("npm", ["run", "build"]);
  const functionsDir = resolve(repoRoot, "functions");
  const functions = await runCommand("npm", ["run", "build"], { cwd: functionsDir });
  return { web, functions };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runBuilds();
  console.log(JSON.stringify(result, null, 2));
}
