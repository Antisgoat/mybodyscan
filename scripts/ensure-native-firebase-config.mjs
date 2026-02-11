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

const SUPPORTED_PLATFORMS = new Set(["ios", "android", "all"]);

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

const parsePlatformArg = (argv) => {
  const directPlatformIndex = argv.findIndex((arg) => arg === "--platform");
  if (directPlatformIndex >= 0) {
    return argv[directPlatformIndex + 1];
  }

  const inlinePlatformArg = argv.find((arg) => arg.startsWith("--platform="));
  if (inlinePlatformArg) {
    return inlinePlatformArg.split("=")[1];
  }

  return undefined;
};

const resolvePlatform = (argv) => {
  const requested = String(
    parsePlatformArg(argv) ??
      process.env.MBS_PLATFORM ??
      process.env.CAPACITOR_PLATFORM ??
      "ios"
  )
    .toLowerCase()
    .trim();

  if (!SUPPORTED_PLATFORMS.has(requested)) {
    throw new Error(
      `Unsupported platform '${requested}'. Use one of: ios, android, all (via MBS_PLATFORM or --platform).`
    );
  }

  return requested;
};

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

const runChecks = ({ doctorMode = false, platform = "ios" } = {}) => {
  const iosCheck = checkFile({ label: "iOS", absolutePath: IOS_PLIST_PATH });
  const androidCheck = checkFile({ label: "Android", absolutePath: ANDROID_JSON_PATH });

  const requireIos = platform === "ios" || platform === "all";
  const requireAndroid = platform === "android" || platform === "all";

  const fixtureDetected = isFixturePlist();

  if (doctorMode) {
    console.log(`[ios:doctor] Platform mode: ${platform}`);
    console.log(
      `[ios:doctor] ${iosCheck.ok ? "OK" : requireIos ? "FAIL" : "WARN"}: ${iosCheck.message}`
    );
    console.log(
      `[ios:doctor] ${androidCheck.ok ? "OK" : requireAndroid ? "FAIL" : "WARN"}: ${androidCheck.message}`
    );
    if (requireIos && !iosCheck.ok) {
      console.log("[ios:doctor] FAIL: iOS plist status unknown (file missing).");
    } else if (requireIos && fixtureDetected) {
      console.log(
        `[ios:doctor] FAIL: ${toRelative(IOS_PLIST_PATH)} matches fixture ${toRelative(IOS_FIXTURE_PATH)}.`
      );
    } else {
      console.log("[ios:doctor] OK: iOS plist is not the test fixture.");
    }

    if (
      (!requireIos || iosCheck.ok) &&
      (!requireAndroid || androidCheck.ok) &&
      (!requireIos || !fixtureDetected)
    ) {
      console.log("[ios:doctor] PASS: Native Firebase files are present and shippable.");
      return;
    }

    console.log("\n[ios:doctor] ACTION REQUIRED\n");
    console.log(instructions);
    process.exitCode = 1;
    return;
  }

  const failures = [];
  const warnings = [];

  if (requireIos && !iosCheck.ok) failures.push(iosCheck.message);
  if (requireAndroid && !androidCheck.ok) failures.push(androidCheck.message);

  if (!requireAndroid && !androidCheck.ok) {
    warnings.push(
      `${androidCheck.message} Android is optional right now; set MBS_PLATFORM=android (or all) once Android Firebase is configured.`
    );
  }

  if (requireIos && fixtureDetected) {
    failures.push(
      `Refusing to proceed: ${toRelative(IOS_PLIST_PATH)} is identical to fixture ${toRelative(
        IOS_FIXTURE_PATH
      )}.`
    );
  }

  if (failures.length) {
    throw new Error(`${failures.join("\n")}\n\n${instructions}`);
  }

  if (requireIos) {
    console.log(`[firebase] OK: ${iosCheck.message}`);
    console.log("[firebase] OK: iOS plist is not the test fixture.");
  }

  if (requireAndroid) {
    console.log(`[firebase] OK: ${androidCheck.message}`);
  }

  for (const warning of warnings) {
    console.warn(`[firebase] WARN: ${warning}`);
  }
};

const argv = process.argv.slice(2);
const args = new Set(argv);
runChecks({ doctorMode: args.has("--doctor"), platform: resolvePlatform(argv) });
