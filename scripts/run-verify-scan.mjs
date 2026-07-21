/**
 * Non-interactive runner for `npm run verify:scan`.
 *
 * Why: the Functions codebase uses `firebase-functions/params` (e.g. `defineString("OPENAI_MODEL")`),
 * and `firebase emulators:exec` will prompt for missing param values unless they are present in a
 * local env file. We generate a temporary `functions/.env.local` so the emulator can boot
 * unattended, then run the emulator exec command, then clean up.
 */
import { writeFileSync, rmSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:http";

const root = new URL("..", import.meta.url);
const functionsEnvPath = new URL("../functions/.env.local", import.meta.url);
const emulatorBucket = "mybodyscan-f3daf.firebasestorage.app";

const mockVisionResult = {
  estimate: {
    bodyFatPercent: 22.4,
    notes: "Local verification estimate only.",
    keyObservations: ["Four photo inputs were received."],
    goalRecommendations: ["Use consistent lighting and pose for trends."],
  },
  recommendations: ["Repeat scans under comparable conditions."],
  improvementAreas: ["Track trends over time."],
};
let mockOpenAiMode = "success";

const mockOpenAi = createServer((req, res) => {
  req.resume();
  req.on("end", () => {
    if (req.url === "/__mode/fail") {
      mockOpenAiMode = "fail";
      res.writeHead(204).end();
      return;
    }
    if (mockOpenAiMode === "fail") {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ error: { message: "local verification failure" } })
      );
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        id: "local-scan-verification",
        model: "gpt-4o-mini",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify(mockVisionResult),
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })
    );
  });
});

try {
  await new Promise((resolve, reject) => {
    mockOpenAi.once("error", reject);
    mockOpenAi.listen(0, "127.0.0.1", resolve);
  });
  const address = mockOpenAi.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to start local OpenAI verifier.");
  }

  // Safe, non-secret defaults for emulators. The local mock verifies the
  // successful analysis path without using network access or credentials.
  const envLines = [
    "OPENAI_PROVIDER=openai",
    "OPENAI_MODEL=gpt-4o-mini",
    `OPENAI_BASE_URL=http://127.0.0.1:${address.port}`,
    "APP_CHECK_MODE=SOFT",
    `STORAGE_BUCKET=${emulatorBucket}`,
    "",
  ];
  writeFileSync(functionsEnvPath, envLines.join("\n"), "utf8");

  const firebaseBin = new URL("../node_modules/.bin/firebase", import.meta.url);
  const cmd =
    process.platform === "win32"
      ? `${firebaseBin.pathname}.cmd`
      : firebaseBin.pathname;

  const child = spawn(
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
        // The verification client and Admin SDK must target the same bucket.
        STORAGE_BUCKET: process.env.STORAGE_BUCKET || emulatorBucket,
        // The local mock accepts this non-secret placeholder.
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || "test-openai-key",
        VERIFY_OPENAI_BASE_URL: `http://127.0.0.1:${address.port}`,
      },
    }
  );
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code));
  });
  process.exitCode = typeof exitCode === "number" ? exitCode : 1;
} finally {
  // Cleanup the temp env file so it doesn't pollute real local dev configs.
  if (existsSync(functionsEnvPath)) {
    rmSync(functionsEnvPath);
  }
  await new Promise((resolve) => mockOpenAi.close(resolve));
}
