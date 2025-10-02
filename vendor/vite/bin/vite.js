#!/usr/bin/env node
import { build } from "../index.js";

async function main() {
  const [, , command] = process.argv;
  if (command === "build") {
    try {
      await build();
      console.log("[vite-stub] build completed");
    } catch (error) {
      console.error("[vite-stub] build failed", error);
      process.exitCode = 1;
    }
    return;
  }
  console.log(`[vite-stub] command '${command ?? ""}' is not implemented`);
}

main();
