import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = (
  process.argv[2] ||
  process.env.MBS_SCREENSHOT_BASE_URL ||
  "https://mybodyscanapp.com"
).replace(/\/+$/, "");
const executablePath =
  process.argv[3] || process.env.MBS_PLAYWRIGHT_EXECUTABLE_PATH || undefined;
const outputDir = resolve(
  process.env.MBS_SCREENSHOT_DIR || "release-artifacts/app-store-screenshots"
);

const screens = [
  ["01-progress-dashboard.png", "/demo"],
  ["02-body-scan-results.png", "/results/demo-scan-003?demo=1"],
  ["03-training-programs.png", "/programs?demo=1"],
  ["04-nutrition-progress.png", "/meals?demo=1"],
];

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({
  viewport: { width: 414, height: 896 },
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true,
  colorScheme: "light",
  reducedMotion: "reduce",
});

await context.addInitScript(() => {
  localStorage.setItem("mbs_demo", "1");
  sessionStorage.setItem("mbs_demo", "1");
  localStorage.setItem("mbs_policy_ok_v1", "1");
  localStorage.setItem("mbs-consent", "accepted");
});

for (const [filename, path] of screens) {
  const page = await context.newPage();
  await page.goto(`${baseUrl}${path}`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await page.waitForTimeout(2_000);
  await page
    .locator('[aria-label="Demo mode active"]')
    .evaluateAll((elements) => {
      for (const element of elements) {
        element.style.display = "none";
      }
    });
  await page.getByText("Demo", { exact: true }).evaluateAll((elements) => {
    for (const element of elements) {
      element.style.display = "none";
    }
  });
  await page.locator('[data-testid="demo-banner"]').evaluateAll((elements) => {
    for (const element of elements) {
      element.style.display = "none";
    }
  });
  await page
    .getByText("Demo preview — read-only experience.", { exact: true })
    .evaluateAll((elements) => {
      for (const element of elements) {
        const container = element.parentElement;
        if (container) container.style.display = "none";
      }
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
  await page.screenshot({
    path: resolve(outputDir, filename),
    fullPage: false,
  });
  await page.close();
  console.log(`[app-store-screenshot] ${filename} <- ${path}`);
}

await browser.close();
console.log(
  `[app-store-screenshot] Wrote ${screens.length} files to ${outputDir}`
);
