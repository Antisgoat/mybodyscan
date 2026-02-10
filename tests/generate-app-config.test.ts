import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { beforeEach, afterEach, describe, expect, it } from "vitest";

const ROOT_DIR = path.resolve(__dirname, "..");
const IOS_PLIST_PATH = path.join(
  ROOT_DIR,
  "ios",
  "App",
  "App",
  "GoogleService-Info.plist"
);
const FIXTURE_PLIST_PATH = path.join(
  ROOT_DIR,
  "tests",
  "fixtures",
  "GoogleService-Info.plist"
);
const APP_CONFIG_PATH = path.join(
  ROOT_DIR,
  "src",
  "generated",
  "appConfig.ts"
);

let originalPlist: string | null = null;
let originalAppConfig: string | null = null;

beforeEach(() => {
  if (fs.existsSync(IOS_PLIST_PATH)) {
    originalPlist = fs.readFileSync(IOS_PLIST_PATH, "utf8");
  }
  originalAppConfig = fs.existsSync(APP_CONFIG_PATH)
    ? fs.readFileSync(APP_CONFIG_PATH, "utf8")
    : null;
  const fixture = fs.readFileSync(FIXTURE_PLIST_PATH, "utf8");
  fs.writeFileSync(IOS_PLIST_PATH, fixture, "utf8");
});

afterEach(() => {
  if (originalPlist === null) {
    fs.rmSync(IOS_PLIST_PATH, { force: true });
  } else {
    fs.writeFileSync(IOS_PLIST_PATH, originalPlist, "utf8");
  }
  if (originalAppConfig === null) {
    fs.rmSync(APP_CONFIG_PATH, { force: true });
  } else {
    fs.writeFileSync(APP_CONFIG_PATH, originalAppConfig, "utf8");
  }
  originalPlist = null;
  originalAppConfig = null;
});

describe("generate-app-config (native)", () => {
  it("includes appId from GoogleService-Info.plist", () => {
    execFileSync("node", ["scripts/generate-app-config.mjs"], {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        MBS_NATIVE: "1",
        MODE: "production",
        VITE_FIREBASE_APP_ID: "env-app-id-should-not-win",
      },
      stdio: "ignore",
    });

    const appConfig = fs.readFileSync(APP_CONFIG_PATH, "utf8");
    expect(appConfig).toContain('"appId": "1:1234567890:ios:abcdef123456"');
    expect(appConfig).toContain('"measurementId": "G-TEST1234"');
  });
});
