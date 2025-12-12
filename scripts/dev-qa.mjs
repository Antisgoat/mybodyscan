#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);

async function main() {
  console.log("QA: starting");

  // 1) Coach plan read/write (simulated): ensure UI helper path is correct
  const coachPaths = await readFile(
    new URL("../src/lib/db/coachPaths.ts", import.meta.url),
    "utf8"
  ).catch(() => "");
  assert.ok(
    coachPaths.includes('"coach", "plan"'),
    "coachPlanDoc should target users/{uid}/coach/plan"
  );

  // 2) nutritionSearch config: ensure no hard-coded CF origin and uses fnUrl
  const apiLib = await readFile(
    new URL("../src/lib/api.ts", import.meta.url),
    "utf8"
  );
  assert.ok(
    !apiLib.includes("cloudfunctions.net/nutritionSearch"),
    "nutritionSearch must not hardcode CF origin"
  );
  assert.ok(
    apiLib.includes('fnUrl("/nutrition/search")'),
    'nutritionFnUrl should use fnUrl("/nutrition/search")'
  );

  // 3) Scan mock mode: ensure submitScan falls back when no OPENAI_API_KEY
  const submitSrc = await readFile(
    new URL("../functions/src/scan/submit.ts", import.meta.url),
    "utf8"
  );
  assert.ok(
    submitSrc.includes("buildMockResult"),
    "submitScan should include mock result builder"
  );
  assert.ok(
    submitSrc.includes(
      'engine: process.env.OPENAI_API_KEY ? savedScan.engine : "mock"'
    ),
    "submitScan should mark engine mock when no key"
  );

  console.log("QA: PASS");
}

main().catch((err) => {
  console.error("QA: FAIL", err?.message || err);
  process.exit(1);
});
