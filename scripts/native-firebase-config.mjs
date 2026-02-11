import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const IOS_PLIST_RELATIVE_PATH = "ios/App/App/GoogleService-Info.plist";
export const IOS_FIXTURE_RELATIVE_PATH = "tests/fixtures/GoogleService-Info.plist";
export const ANDROID_JSON_RELATIVE_PATH = "android/app/google-services.json";

export const decodeXmlValue = (value) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

export const parseSimplePlistDict = (contents) => {
  const dictMatch = contents.match(/<dict>([\s\S]*?)<\/dict>/);
  if (!dictMatch) return {};

  const dictContent = dictMatch[1];
  const entries = {};
  const entryRegex =
    /<key>([^<]+)<\/key>\s*(?:<string>([^<]*)<\/string>|<integer>([^<]*)<\/integer>|<(true|false)\s*\/>)/g;

  let match = entryRegex.exec(dictContent);
  while (match) {
    const key = decodeXmlValue(match[1].trim());
    const rawValue = match[2] ?? match[3] ?? match[4] ?? "";
    entries[key] = decodeXmlValue(String(rawValue).trim());
    match = entryRegex.exec(dictContent);
  }

  return entries;
};

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

const hasObviousPlaceholderValues = (dict = {}) => {
  const values = Object.values(dict)
    .map((value) => String(value ?? "").toLowerCase())
    .filter(Boolean);

  const placeholderPatterns = [
    /replace[-_\s]?me/,
    /your[-_\s]?(app|api|project|key|id)/,
    /example/,
    /dummy/,
    /testkey/,
    /abcdef123456/,
  ];

  return values.some((value) => placeholderPatterns.some((pattern) => pattern.test(value)));
};

export const resolveNativePlatform = () => {
  const raw = String(process.env.MBS_PLATFORM || "ios").trim().toLowerCase();
  if (raw === "ios" || raw === "android" || raw === "all") {
    return raw;
  }
  throw new Error(
    `[firebase] Invalid MBS_PLATFORM=\"${raw || "(empty)"}\". Use one of: ios, android, all.`
  );
};

export const readAndValidateIosPlist = ({ rootDir, requireFile = true } = {}) => {
  const plistPath = path.join(rootDir, IOS_PLIST_RELATIVE_PATH);
  const fixturePath = path.join(rootDir, IOS_FIXTURE_RELATIVE_PATH);

  if (!fs.existsSync(plistPath)) {
    if (!requireFile) return null;
    throw new Error(
      `[firebase] Missing iOS Firebase config: ${IOS_PLIST_RELATIVE_PATH}\n` +
        "Download GoogleService-Info.plist from Firebase Console → Project settings → Your iOS app, then place it at that exact path."
    );
  }

  const plistBuffer = fs.readFileSync(plistPath);
  const plistText = plistBuffer.toString("utf8");
  const plistDict = parseSimplePlistDict(plistText);

  const fixtureBuffer = fs.existsSync(fixturePath)
    ? fs.readFileSync(fixturePath)
    : null;

  const matchesFixture =
    fixtureBuffer != null && sha256(plistBuffer) === sha256(fixtureBuffer);

  if (matchesFixture || hasObviousPlaceholderValues(plistDict)) {
    throw new Error(
      `[firebase] Refusing iOS Firebase config at ${IOS_PLIST_RELATIVE_PATH}: file appears to be a test/placeholder plist.\n` +
        "Download the real GoogleService-Info.plist for your iOS Firebase app from Firebase Console and replace this file."
    );
  }

  return {
    path: plistPath,
    relativePath: IOS_PLIST_RELATIVE_PATH,
    dict: plistDict,
  };
};

export const readAndroidFirebaseJson = ({ rootDir, requireFile = true } = {}) => {
  const jsonPath = path.join(rootDir, ANDROID_JSON_RELATIVE_PATH);

  if (!fs.existsSync(jsonPath)) {
    if (!requireFile) return null;
    throw new Error(
      `[firebase] Missing Android Firebase config: ${ANDROID_JSON_RELATIVE_PATH}\n` +
        "Download google-services.json from Firebase Console → Project settings → Your Android app, then place it at that exact path."
    );
  }

  return {
    path: jsonPath,
    relativePath: ANDROID_JSON_RELATIVE_PATH,
    json: JSON.parse(fs.readFileSync(jsonPath, "utf8")),
  };
};
