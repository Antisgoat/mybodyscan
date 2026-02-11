import {
  ANDROID_JSON_RELATIVE_PATH,
  IOS_PLIST_RELATIVE_PATH,
  readAndValidateIosPlist,
  readAndroidFirebaseJson,
  resolveNativePlatform,
} from "./native-firebase-config.mjs";

const ROOT_DIR = process.cwd();

const runChecks = ({ doctorMode = false } = {}) => {
  const platform = resolveNativePlatform();
  const needIos = platform === "ios" || platform === "all";
  const needAndroid = platform === "android" || platform === "all";

  if (needIos) {
    readAndValidateIosPlist({ rootDir: ROOT_DIR, requireFile: true });
  }

  if (needAndroid) {
    readAndroidFirebaseJson({ rootDir: ROOT_DIR, requireFile: true });
  }

  if (doctorMode) {
    console.log(`[ios:doctor] PASS: Native Firebase config is valid for MBS_PLATFORM=${platform}.`);
    return;
  }

  const checkedPaths = [
    needIos ? IOS_PLIST_RELATIVE_PATH : null,
    needAndroid ? ANDROID_JSON_RELATIVE_PATH : null,
  ]
    .filter(Boolean)
    .join(", ");

  console.log(`[firebase] OK: Native Firebase config is valid (${checkedPaths}).`);
};

const args = new Set(process.argv.slice(2));

try {
  runChecks({ doctorMode: args.has("--doctor") });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
