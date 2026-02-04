import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const packageJsonPath = path.join(repoRoot, "package.json");
const publicIndex = path.join(repoRoot, "ios/App/App/public/index.html");
const publicAssetsDir = path.join(repoRoot, "ios/App/App/public/assets");
const capacitorConfigPath = path.join(repoRoot, "capacitor.config.ts");
const iosAppDir = path.join(repoRoot, "ios/App/App");
const iosWorkspace = path.join(repoRoot, "ios/App/App.xcworkspace");
const iosProject = path.join(repoRoot, "ios/App/App.xcodeproj");
const iosPbxproj = path.join(repoRoot, "ios/App/App.xcodeproj/project.pbxproj");
const iosAppDelegate = path.join(repoRoot, "ios/App/App/AppDelegate.swift");
const iosPodfile = path.join(repoRoot, "ios/App/Podfile");
const iosPodfileLock = path.join(repoRoot, "ios/App/Podfile.lock");
const iosDuplicateDoctor = path.join(repoRoot, "scripts/doctor-ios-duplicates.mjs");

const pluginPatterns = [
  "@capacitor-firebase/authentication",
  "capacitor-firebase/authentication",
];
const allowedPlugins = new Set([
  "@capacitor/app",
  "@capacitor/browser",
  "@revenuecat/purchases-capacitor",
]);

function fail(message) {
  console.error(`❌ [smoke:native] ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`✅ ${message}`);
}

async function fileExists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function assertRepoRoot() {
  if (!(await fileExists(packageJsonPath))) {
    fail(`Missing ${packageJsonPath}. Run from repo root.`);
  }
  pass("Repo root detected.");
}

async function assertPublicIndex() {
  if (!(await fileExists(publicIndex))) {
    fail(`Missing ${publicIndex}. Run npm run ios:reset or npx cap sync ios.`);
  }
  const stats = await fs.stat(publicIndex);
  if (stats.size < 1000) {
    fail(`ios/App/App/public/index.html is too small (${stats.size} bytes).`);
  }
  if (!(await fileExists(publicAssetsDir))) {
    fail(`Missing ${publicAssetsDir}. Run npm run ios:reset or npx cap sync ios.`);
  }
  pass("iOS web bundle exists and is large enough.");
}

async function assertWorkspace() {
  if (!(await fileExists(iosWorkspace))) {
    fail(`Missing ${iosWorkspace}. Run npm run ios:reset.`);
  }
  if (await fileExists(iosProject)) {
    console.warn(
      "[smoke:native] WARN: Open ios/App/App.xcworkspace (not ios/App/App.xcodeproj)."
    );
  }
  const openedContainer = process.env.XCODE_CONTAINER || process.env.MBS_XCODE_CONTAINER;
  if (openedContainer && openedContainer.includes(".xcodeproj")) {
    fail(`Xcode container is ${openedContainer}. Use ios/App/App.xcworkspace.`);
  }
  pass("Xcode workspace verified.");
}

function assertCapPlugins() {
  const result = spawnSync("npx", ["cap", "ls", "ios"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const errText = (result.stderr || result.stdout || "").trim();
    fail(`npx cap ls ios failed: ${errText || "unknown error"}`);
  }
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  const detectedPlugins = new Set();
  for (const line of output.split("\n")) {
    const match = line.trim().match(/^(@[^@\s]+\/[^@\s]+)@/);
    if (match) {
      detectedPlugins.add(match[1]);
    }
  }
  if (!detectedPlugins.size) {
    fail("Unable to parse plugins from npx cap ls ios output.");
  }
  for (const plugin of detectedPlugins) {
    if (!allowedPlugins.has(plugin)) {
      fail(`npx cap ls ios reports unexpected plugin: ${plugin}.`);
    }
  }
  for (const plugin of allowedPlugins) {
    if (!detectedPlugins.has(plugin)) {
      fail(`npx cap ls ios missing required plugin: ${plugin}.`);
    }
  }
  if (/capacitor-firebase/i.test(output)) {
    fail("npx cap ls ios reports a capacitor-firebase plugin. Remove native Firebase plugins.");
  }
  for (const pattern of pluginPatterns) {
    if (output.includes(pattern)) {
      fail(`npx cap ls ios reports disallowed plugin: ${pattern}.`);
    }
  }
  pass("Capacitor iOS plugins match expected list (RevenueCat only).");
}

async function assertNoServerUrl() {
  if (!(await fileExists(capacitorConfigPath))) {
    fail(`Missing ${capacitorConfigPath}. Run from repo root.`);
  }
  const contents = await fs.readFile(capacitorConfigPath, "utf8");
  const hasServerUrl =
    /server\s*:\s*\{[\s\S]*?url\s*:/m.test(contents) ||
    /server\.url/.test(contents);
  if (hasServerUrl) {
    fail("capacitor.config.ts contains server.url; remove dev server config.");
  }
  pass("No dev server.url in capacitor.config.ts.");
}

function assertNoSwiftFirebaseImports() {
  const pattern =
    "Firebase|FirebaseCore|FirebaseApp|FirebaseOptions|import Firebase|GoogleUtilities";
  assertRgClean("ios/App/App Swift files", pattern, [
    "--glob",
    "**/*.swift",
    path.join(repoRoot, "ios/App/App"),
  ]);
}

async function assertAppDelegateIsCapacitorOnly() {
  if (!(await fileExists(iosAppDelegate))) {
    fail(`Missing ${iosAppDelegate}. Run npm run ios:reset.`);
  }
  const contents = await fs.readFile(iosAppDelegate, "utf8");
  if (/(FirebaseCore|FirebaseApp|import Firebase)/.test(contents)) {
    fail("AppDelegate.swift contains Firebase imports. Remove native Firebase usage.");
  }
  pass("AppDelegate.swift contains no Firebase imports.");
}

async function assertNoFirebaseInPbxproj() {
  if (!(await fileExists(iosPbxproj))) {
    return;
  }
  const contents = await fs.readFile(iosPbxproj, "utf8");
  const forbiddenSnippets = [
    "Firebase",
    "FirebaseCore",
    "FirebaseApp",
    "FirebaseOptions",
    "GoogleService-Info.plist",
    "Ensure Firebase",
    "GoogleUtilities",
  ];
  for (const snippet of forbiddenSnippets) {
    if (contents.includes(snippet)) {
      fail(
        `Firebase reference detected in ios/App/App.xcodeproj/project.pbxproj (${snippet}).`
      );
    }
  }
  if (contents.includes("PBXShellScriptBuildPhase")) {
    const shellScriptMatches = contents.match(/shellScript = "([^"]*)";/g) || [];
    for (const match of shellScriptMatches) {
      if (/(Firebase|GoogleService-Info\.plist|Ensure Firebase|GoogleUtilities)/.test(match)) {
        fail(
          "Run Script build phase contains Firebase-related references in project.pbxproj."
        );
      }
    }
  }
  if (contents.includes("DerivedData") || contents.includes("/Users/")) {
    fail(
      "project.pbxproj contains DerivedData or absolute user paths. Remove those build settings."
    );
  }
  pass("No Firebase references detected in project.pbxproj.");
}

async function assertNoAppFolderCopiedInPbxproj() {
  if (!(await fileExists(iosPbxproj))) {
    return;
  }
  const contents = await fs.readFile(iosPbxproj, "utf8");
  const disallowedMarkers = [
    "/* App in Resources */",
    "/* App in Copy Files */",
    "/* App in Embed Frameworks */",
  ];
  for (const marker of disallowedMarkers) {
    if (contents.includes(marker)) {
      fail(
        `project.pbxproj copies the App source folder into the bundle (${marker}). Remove it from Resources/Copy Files phases.`
      );
    }
  }
  const phaseBlocks = [
    { label: "PBXResourcesBuildPhase", regex: /PBXResourcesBuildPhase[\s\S]*?files = \(([\s\S]*?)\);/g },
    { label: "PBXCopyFilesBuildPhase", regex: /PBXCopyFilesBuildPhase[\s\S]*?files = \(([\s\S]*?)\);/g },
  ];
  for (const phase of phaseBlocks) {
    let match;
    while ((match = phase.regex.exec(contents))) {
      if (match[1].includes("/* App") || match[1].includes(" App in ")) {
        fail(
          `${phase.label} includes a file named App. This would copy App into App.app/App and cause duplicate outputs.`
        );
      }
    }
  }
  pass("project.pbxproj does not copy the App source folder into the bundle.");
}

function assertNoCapFirebaseAuthPackage() {
  const result = spawnSync(
    "npm",
    ["ls", "@capacitor-firebase/authentication", "--depth=0", "--json"],
    {
      cwd: repoRoot,
      encoding: "utf8",
    }
  );
  const output = result.stdout || "{}";
  let data;
  try {
    data = JSON.parse(output);
  } catch {
    data = {};
  }
  if (data.dependencies && data.dependencies["@capacitor-firebase/authentication"]) {
    fail("npm ls reports @capacitor-firebase/authentication is installed.");
  }
  pass("npm ls confirms no @capacitor-firebase/authentication package.");
}

function assertNoDuplicateBuildOutputs() {
  const result = spawnSync("node", [iosDuplicateDoctor], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (output) {
    console.log(output);
  }
  if (result.status !== 0) {
    fail("Duplicate build outputs detected in project.pbxproj.");
  }
  pass("project.pbxproj does not contain duplicate build file entries.");
}

function assertRgClean(label, pattern, paths) {
  const args = [];
  const existingPaths = [];
  for (let i = 0; i < paths.length; i += 1) {
    const entry = paths[i];
    if (entry.startsWith("-")) {
      args.push(entry);
      if (entry === "--glob") {
        const globValue = paths[i + 1];
        if (globValue) {
          args.push(globValue);
          i += 1;
        }
      }
      continue;
    }
    if (fsSync.existsSync(entry)) {
      existingPaths.push(entry);
    }
  }
  if (!existingPaths.length) {
    pass(`${label} skipped (no matching paths).`);
    return;
  }
  const result = spawnSync("rg", ["-n", pattern, ...args, ...existingPaths], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status === 0) {
    const output = (result.stdout || "").trim();
    fail(`${label}:\n${output}`);
  }
  if (result.status !== 1) {
    fail(`rg failed while scanning ${label}: ${(result.stderr || "").trim()}`);
  }
  pass(`${label} is clean.`);
}

function assertNoFirebaseStringsInIos() {
  const pattern =
    "Firebase|FirebaseCore|FirebaseApp|FirebaseOptions|GoogleService-Info.plist|Ensure Firebase|GoogleUtilities";
  assertRgClean("ios/App/App Swift files", pattern, [
    "--glob",
    "**/*.swift",
    path.join(repoRoot, "ios/App/App"),
  ]);
  assertRgClean("ios/App/App.xcodeproj/project.pbxproj", pattern, [iosPbxproj]);
  assertRgClean("ios/App/Podfile", pattern, [iosPodfile]);
  assertRgClean("ios/App/Podfile.lock", pattern, [iosPodfileLock]);
}

async function assertNoFirebaseInPodfiles() {
  const forbiddenSnippets = [
    "Firebase",
    "FirebaseCore",
    "FirebaseApp",
    "FirebaseOptions",
    "GoogleUtilities",
    "GoogleService-Info.plist",
    "Ensure Firebase",
  ];
  const podfiles = [iosPodfile, iosPodfileLock];
  for (const file of podfiles) {
    if (!(await fileExists(file))) {
      continue;
    }
    const contents = await fs.readFile(file, "utf8");
    for (const snippet of forbiddenSnippets) {
      if (contents.includes(snippet)) {
        fail(`Firebase reference detected in ${path.relative(repoRoot, file)} (${snippet}).`);
      }
    }
  }
  pass("Podfiles are free of Firebase references.");
}

async function main() {
  await assertRepoRoot();
  await assertWorkspace();
  await assertAppDelegateIsCapacitorOnly();
  await assertPublicIndex();
  assertCapPlugins();
  await assertNoServerUrl();
  assertNoSwiftFirebaseImports();
  await assertNoFirebaseInPbxproj();
  await assertNoAppFolderCopiedInPbxproj();
  assertNoDuplicateBuildOutputs();
  assertNoCapFirebaseAuthPackage();
  assertNoFirebaseStringsInIos();
  await assertNoFirebaseInPodfiles();
  console.log("✅ [smoke:native] PASS");
}

main().catch((error) => {
  fail(String(error?.stack || error?.message || error));
});
