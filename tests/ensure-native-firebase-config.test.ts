import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";

const ROOT_DIR = path.resolve(__dirname, "..");

const REALISH_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>GOOGLE_APP_ID</key>
  <string>1:9999999999:ios:real999999</string>
  <key>API_KEY</key>
  <string>AIzaSyRealIosOnlyKey</string>
  <key>PROJECT_ID</key>
  <string>mbs-ios-only</string>
  <key>GCM_SENDER_ID</key>
  <string>9999999999</string>
</dict>
</plist>
`;

const copyScript = (tmpRoot: string, relPath: string) => {
  const from = path.join(ROOT_DIR, relPath);
  const to = path.join(tmpRoot, relPath);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
};

describe("ensure-native-firebase-config", () => {
  it("passes in default iOS mode when android google-services.json is absent", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mbs-ios-only-"));

    copyScript(tmpRoot, "scripts/ensure-native-firebase-config.mjs");
    copyScript(tmpRoot, "scripts/native-firebase-config.mjs");
    copyScript(tmpRoot, "tests/fixtures/GoogleService-Info.plist");

    const iosPlistPath = path.join(
      tmpRoot,
      "ios",
      "App",
      "App",
      "GoogleService-Info.plist"
    );
    fs.mkdirSync(path.dirname(iosPlistPath), { recursive: true });
    fs.writeFileSync(iosPlistPath, REALISH_PLIST, "utf8");

    expect(() => {
      execFileSync("node", ["scripts/ensure-native-firebase-config.mjs"], {
        cwd: tmpRoot,
        env: { ...process.env },
        stdio: "pipe",
      });
    }).not.toThrow();
  });

  it("fails with a clear message when iOS plist is missing", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mbs-ios-missing-"));

    copyScript(tmpRoot, "scripts/ensure-native-firebase-config.mjs");
    copyScript(tmpRoot, "scripts/native-firebase-config.mjs");

    expect(() => {
      execFileSync("node", ["scripts/ensure-native-firebase-config.mjs"], {
        cwd: tmpRoot,
        env: { ...process.env },
        stdio: "pipe",
      });
    }).toThrowError(/Missing iOS Firebase config: ios\/App\/App\/GoogleService-Info\.plist/);
  });

});
