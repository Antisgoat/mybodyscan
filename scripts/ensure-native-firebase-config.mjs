import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT_DIR = process.cwd();

const IOS_PLIST_PATH = path.join(
  ROOT_DIR,
  "ios",
  "App",
  "App",
  "GoogleService-Info.plist"
);
const IOS_FIXTURE_PATH = path.join(
  ROOT_DIR,
  "tests",
  "fixtures",
  "GoogleService-Info.plist"
);
const ANDROID_JSON_PATH = path.join(
  ROOT_DIR,
  "android",
  "app",
  "google-services.json"
);

const toRelative = (absolutePath) => path.relative(ROOT_DIR, absolutePath).split(path.sep).join("/");

const readFileBuffer = (filePath) => {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath);
};

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

const isFixturePlist = () => {
  const iosPlist = readFileBuffer(IOS_PLIST_PATH);
  if (!iosPlist) return false;

  const fixturePlist = readFileBuffer(IOS_FIXTURE_PATH);
  if (!fixturePlist) return false;

  return sha256(iosPlist) === sha256(fixturePlist);
};

const instructions = `How to install real Firebase native config files:
1) Open Firebase Console: https://console.firebase.google.com/
2) Select your project.
3) Project settings -> General -> Your apps.
4) Download the iOS plist for the MyBodyScan iOS app and save it to:
   - ${toRelative(IOS_PLIST_PATH)}
5) Download the Android JSON for the MyBodyScan Android app and save it to:
   - ${toRelative(ANDROID_JSON_PATH)}
6) Re-run your command (build/sync/reset).

Important:
- Do NOT use ${toRelative(IOS_FIXTURE_PATH)} in the iOS app folder.
- The file in ios/App/App must be your real production Firebase plist.`;

const checkFile = ({ label, absolutePath }) => {
  if (!fs.existsSync(absolutePath)) {
    return {
      ok: false,
      message: `Missing ${label} Firebase config at ${toRelative(absolutePath)}.`,
    };
  }
  return {
    ok: true,
    message: `${label} Firebase config found at ${toRelative(absolutePath)}.`,
  };
};

const runChecks = ({ doctorMode = false } = {}) => {
  const iosCheck = checkFile({ label: "iOS", absolutePath: IOS_PLIST_PATH });
  const androidCheck = checkFile({ label: "Android", absolutePath: ANDROID_JSON_PATH });

  const fixtureDetected = isFixturePlist();

  if (doctorMode) {
    console.log(`[ios:doctor] ${iosCheck.ok ? "OK" : "FAIL"}: ${iosCheck.message}`);
    console.log(`[ios:doctor] ${androidCheck.ok ? "OK" : "FAIL"}: ${androidCheck.message}`);
    if (!iosCheck.ok) {
      console.log("[ios:doctor] FAIL: iOS plist status unknown (file missing).");
    } else if (fixtureDetected) {
      console.log(
        `[ios:doctor] FAIL: ${toRelative(IOS_PLIST_PATH)} matches fixture ${toRelative(IOS_FIXTURE_PATH)}.`
      );
    } else {
      console.log("[ios:doctor] OK: iOS plist is not the test fixture.");
    }

    if (iosCheck.ok && androidCheck.ok && !fixtureDetected) {
      console.log("[ios:doctor] PASS: Native Firebase files are present and shippable.");
      return;
    }

    console.log("\n[ios:doctor] ACTION REQUIRED\n");
    console.log(instructions);
    process.exitCode = 1;
    return;
  }

  const failures = [];
  if (!iosCheck.ok) failures.push(iosCheck.message);
  if (!androidCheck.ok) failures.push(androidCheck.message);
  if (fixtureDetected) {
    failures.push(
      `Refusing to proceed: ${toRelative(IOS_PLIST_PATH)} is identical to fixture ${toRelative(
        IOS_FIXTURE_PATH
      )}.`
    );
  }

  if (failures.length) {
    throw new Error(`${failures.join("\n")}\n\n${instructions}`);
  }

  console.log(`[firebase] OK: ${iosCheck.message}`);
  console.log(`[firebase] OK: ${androidCheck.message}`);
  console.log("[firebase] OK: iOS plist is not the test fixture.");
};

const args = new Set(process.argv.slice(2));
runChecks({ doctorMode: args.has("--doctor") });
