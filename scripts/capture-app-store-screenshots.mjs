import { mkdir, readFile } from "node:fs/promises";
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
const requestedProfile = (
  process.env.MBS_SCREENSHOT_PROFILE || "all"
).toLowerCase();

const screens = [
  ["01-body-scan-results.png", "/results/demo-scan-003?demo=1"],
  ["02-training-programs.png", "/programs?demo=1"],
  ["03-nutrition-progress.png", "/meals?demo=1"],
  ["04-personalized-meal-plan.png", "/meals/plan?demo=1"],
  ["05-four-photo-scan.png", "/scan/tips?demo=1"],
  ["06-ai-coach.png", "/coach/chat?demo=1"],
];

const profiles = {
  "iphone-6.5": {
    outputSubdirectory: "iphone-6.5",
    viewport: { width: 414, height: 896 },
    deviceScaleFactor: 3,
    expectedPixels: { width: 1242, height: 2688 },
  },
  "ipad-13": {
    outputSubdirectory: "ipad-13",
    viewport: { width: 1032, height: 1376 },
    deviceScaleFactor: 2,
    expectedPixels: { width: 2064, height: 2752 },
  },
};

const selectedProfiles =
  requestedProfile === "all"
    ? Object.entries(profiles)
    : Object.entries(profiles).filter(([name]) => name === requestedProfile);

if (selectedProfiles.length === 0) {
  throw new Error(
    `Unknown MBS_SCREENSHOT_PROFILE "${requestedProfile}". Use all, ${Object.keys(
      profiles
    ).join(", ")}.`
  );
}

function readPngDimensions(buffer) {
  const pngSignature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== pngSignature) {
    throw new Error("Screenshot output is not a PNG file.");
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

const browser = await chromium.launch({ headless: true, executablePath });

for (const [profileName, profile] of selectedProfiles) {
  const profileOutputDir = resolve(outputDir, profile.outputSubdirectory);
  await mkdir(profileOutputDir, { recursive: true });

  const context = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.deviceScaleFactor,
    hasTouch: true,
    isMobile: profileName.startsWith("iphone"),
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
      .locator(
        '[aria-label="Demo mode active"], [data-testid="demo-banner"]'
      )
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

    const screenshotPath = resolve(profileOutputDir, filename);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await page.close();

    const dimensions = readPngDimensions(await readFile(screenshotPath));
    if (
      dimensions.width !== profile.expectedPixels.width ||
      dimensions.height !== profile.expectedPixels.height
    ) {
      throw new Error(
        `${profileName}/${filename} is ${dimensions.width}x${dimensions.height}; expected ${profile.expectedPixels.width}x${profile.expectedPixels.height}.`
      );
    }

    console.log(
      `[app-store-screenshot] ${profileName}/${filename} (${dimensions.width}x${dimensions.height}) <- ${path}`
    );
  }

  await context.close();
}

await browser.close();
console.log(
  `[app-store-screenshot] Wrote ${
    screens.length * selectedProfiles.length
  } files to ${outputDir}`
);
