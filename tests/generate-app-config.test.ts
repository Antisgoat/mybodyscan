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
const APP_CONFIG_PATH = path.join(ROOT_DIR, "src", "generated", "appConfig.ts");

const REALISH_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>GOOGLE_APP_ID</key>
  <string>1:9876543210:ios:realabcdef987654</string>
  <key>API_KEY</key>
  <string>AIzaSyRealKey9876543210</string>
  <key>PROJECT_ID</key>
  <string>mbs-ios-live</string>
  <key>GCM_SENDER_ID</key>
  <string>9876543210</string>
</dict>
</plist>
`;

let originalPlist: string | null = null;
let originalAppConfig: string | null = null;

beforeEach(() => {
  if (fs.existsSync(IOS_PLIST_PATH)) {
    originalPlist = fs.readFileSync(IOS_PLIST_PATH, "utf8");
  }
  originalAppConfig = fs.existsSync(APP_CONFIG_PATH)
    ? fs.readFileSync(APP_CONFIG_PATH, "utf8")
    : null;
  fs.writeFileSync(IOS_PLIST_PATH, REALISH_PLIST, "utf8");
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
  it("includes iOS Firebase fields from GoogleService-Info.plist", () => {
    execFileSync("node", ["scripts/generate-app-config.mjs"], {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        MBS_NATIVE: "1",
        MBS_PLATFORM: "ios",
        MODE: "production",
        VITE_FIREBASE_AUTH_DOMAIN: "",
        VITE_FIREBASE_PROJECT_ID: "",
        VITE_FIREBASE_STORAGE_BUCKET: "",
      },
      stdio: "ignore",
    });

    const appConfig = fs.readFileSync(APP_CONFIG_PATH, "utf8");
    expect(appConfig).toContain('"appId": "1:9876543210:ios:realabcdef987654"');
    expect(appConfig).toContain('"messagingSenderId": "9876543210"');
    expect(appConfig).toContain('"storageBucket": "mbs-ios-live.appspot.com"');
  });
});
