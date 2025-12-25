/**
 * Non-interactive runner for `npm run verify:scan`.
 *
 * Why: the Functions codebase uses `firebase-functions/params` (e.g. `defineString("OPENAI_MODEL")`),
 * and `firebase emulators:exec` will prompt for missing param values unless they are present in a
 * local env file. We generate a temporary `functions/.env.local` so the emulator can boot
 * unattended, then run the emulator exec command, then clean up.
 */
import { writeFileSync, rmSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const root = new URL("..", import.meta.url);
const functionsEnvPath = new URL("../functions/.env.local", import.meta.url);

// Safe, non-secret defaults for emulators.
// - OPENAI_BASE_URL is set to a dead localhost port so the worker fails fast and uses the fallback plan,
//   keeping the verification fast and avoiding external network dependency.
const envLines = [
  "OPENAI_PROVIDER=openai",
  "OPENAI_MODEL=gpt-4o-mini",
  "OPENAI_BASE_URL=http://127.0.0.1:1",
  // Functions param used by deleteScan HTTP handler (and may be read at module load).
  "APP_CHECK_MODE=SOFT",
  // Ensure bucket resolves predictably in emulator.
  "STORAGE_BUCKET=mybodyscan-f3daf.appspot.com",
  "",
];

// Create/overwrite temporary env file.
writeFileSync(functionsEnvPath, envLines.join("\n"), "utf8");

try {
  const firebaseBin = new URL("../node_modules/.bin/firebase", import.meta.url);
  const cmd = process.platform === "win32" ? `${firebaseBin.pathname}.cmd` : firebaseBin.pathname;

  const result = spawnSync(
    cmd,
    [
      "emulators:exec",
      "--only",
      "auth,firestore,storage,functions",
      "node scripts/verify-scan-emulators.mjs",
    ],
    {
      cwd: root.pathname,
      stdio: "inherit",
      env: {
        ...process.env,
        // Provide a dummy key; the worker will fail fast due to OPENAI_BASE_URL anyway.
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || "test-openai-key",
      },
    }
  );

  if (result.error) throw result.error;
  process.exitCode = typeof result.status === "number" ? result.status : 1;
} finally {
  // Cleanup the temp env file so it doesn't pollute real local dev configs.
  if (existsSync(functionsEnvPath)) {
    rmSync(functionsEnvPath);
  }
}

