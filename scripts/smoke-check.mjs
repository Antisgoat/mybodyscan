#!/usr/bin/env node
 

const defaultUrl = "https://mybodyscanapp.com/system/health";
const argUrl = process.argv[2];
const envUrl = process.env.SMOKE_URL || process.env.SMOKE_ENDPOINT;
const target = (argUrl || envUrl || defaultUrl).trim();

async function run() {
  try {
    const controller = AbortSignal.timeout(5000);
    const response = await fetch(target, {
      headers: { Accept: "application/json" },
      signal: controller,
    });
    if (!response.ok) {
      console.error(`Smoke check failed: ${response.status} ${response.statusText}`);
      process.exitCode = 1;
      return;
    }
    const json = await response.json();
    console.log(`Smoke check ok for ${target}`);
    console.log(JSON.stringify(json, null, 2));
  } catch (error) {
    console.error(`Smoke check error for ${target}:`, error);
    process.exitCode = 1;
  }
}

await run();
