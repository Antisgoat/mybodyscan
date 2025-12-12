import { spawn } from "node:child_process";
import process from "node:process";
import waitOn from "wait-on";
import { chromium } from "@playwright/test";

const HOST = "127.0.0.1";
const PORT = Number(process.env.SMOKE_PORT || 5173);
const BASE_URL = `http://${HOST}:${PORT}`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const vite = spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "dev", "--", "--host", HOST, "--port", String(PORT), "--strictPort"],
    {
      stdio: "pipe",
      env: { ...process.env, BROWSER: "none" },
    },
  );

  const logs = [];
  const log = (line) => {
    logs.push(line);
    // keep output small unless failing
    if (process.env.SMOKE_VERBOSE) console.log(line);
  };

  vite.stdout.on("data", (d) => log(String(d).trimEnd()));
  vite.stderr.on("data", (d) => log(String(d).trimEnd()));

  let exited = false;
  vite.on("exit", (code) => {
    exited = true;
    log(`[smoke] vite exited ${code}`);
  });

  const stop = async () => {
    if (vite.pid && !exited) {
      vite.kill("SIGTERM");
      await sleep(500);
      if (!exited) vite.kill("SIGKILL");
    }
  };

  process.on("SIGINT", async () => {
    await stop();
    process.exit(130);
  });

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
      const type = msg.type();
      const text = msg.text();
      consoleEvents.push({ type, text });
    });

    page.on("pageerror", (err) => {
      pageErrors.push({ message: err?.message, stack: err?.stack });
    });

    const res = await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    await sleep(1500);

    // Heuristic: react #185 will appear as console error with minified code in prod, but in dev
    // we at least want the first pageerror / console.error.
    const hasReact185 = consoleEvents.some((e) => /React error #185|Maximum update depth/i.test(e.text));

    if (process.env.SMOKE_DUMP) {
      console.log(JSON.stringify({
        status: res?.status(),
        hasReact185,
        consoleEvents,
        pageErrors,
      }, null, 2));
    }

    if (pageErrors.length) {
      console.error("[smoke] page errors:", pageErrors[0]);
      throw new Error(pageErrors[0].message || "pageerror");
    }

    if (hasReact185) {
      console.error("[smoke] detected react #185 in console");
      throw new Error("react_185_detected");
    }

    await browser.close();
  } finally {
    await stop();
  }
}

main().catch((err) => {
  console.error("[smoke] failed", err);
  process.exit(1);
});
