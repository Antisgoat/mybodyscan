import { spawn } from "node:child_process";
import process from "node:process";
import waitOn from "wait-on";
import { chromium } from "@playwright/test";

const HOST = "127.0.0.1";
const PORT = Number(process.env.SMOKE_PORT || 4173);
const BASE_URL = `http://${HOST}:${PORT}`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...opts });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`));
    });
  });
}

async function main() {
  if (!process.env.SMOKE_SKIP_BUILD) {
    await run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], { env: process.env });
  }

  const preview = spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "preview", "--", "--host", HOST, "--port", String(PORT), "--strictPort"],
    {
      stdio: "pipe",
      env: { ...process.env, BROWSER: "none" },
    },
  );

  const consoleLines = [];
  const capture = (d) => {
    const s = String(d).trimEnd();
    if (!s) return;
    consoleLines.push(s);
    if (process.env.SMOKE_VERBOSE) process.stdout.write(`${s}\n`);
  };

  preview.stdout.on("data", capture);
  preview.stderr.on("data", capture);

  let exited = false;
  preview.on("exit", (code) => {
    exited = true;
    consoleLines.push(`[smoke] preview exited ${code}`);
  });

  const stop = async () => {
    if (preview.pid && !exited) {
      preview.kill("SIGTERM");
      await sleep(500);
      if (!exited) preview.kill("SIGKILL");
    }
  };

  try {
    await waitOn({
      resources: [BASE_URL],
      timeout: 60_000,
      interval: 250,
      tcpTimeout: 5_000,
      window: 1_000,
      validateStatus: (status) => status >= 200 && status < 500,
    });

    const browser = await chromium.launch();
    const page = await browser.newPage();

    const consoleEvents = [];
    const pageErrors = [];

    page.on("console", (msg) => {
      consoleEvents.push({ type: msg.type(), text: msg.text() });
    });

    page.on("pageerror", (err) => {
      pageErrors.push({ message: err?.message, stack: err?.stack });
    });

    const res = await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    await sleep(2500);

    const hasReact185 = consoleEvents.some((e) => /React error #185|Maximum update depth/i.test(e.text));

    if (pageErrors.length || hasReact185) {
      const payload = {
        url: `${BASE_URL}/`,
        status: res?.status(),
        hasReact185,
        pageErrors,
        consoleEvents,
        previewLogs: consoleLines.slice(-200),
      };
      console.error(JSON.stringify(payload, null, 2));
      throw new Error(hasReact185 ? "react_185_detected" : "pageerror");
    }

    await browser.close();
  } finally {
    await stop();
  }
}

main().catch((err) => {
  console.error("[smoke-preview] failed", err);
  process.exit(1);
});
