import fs from "fs";
import path from "path";

const ROOT_DIR = process.cwd();

const toPosix = (value) => value.split(path.sep).join("/");

const shouldSkipDir = (relativePath) => {
  const normalized = toPosix(relativePath);
  const skipPrefixes = [
    "node_modules",
    ".git",
    "dist",
    "build",
    "coverage",
    "test-results",
    "ios/App/Pods",
    "ios/App/build",
    "android/.gradle",
  ];
  return skipPrefixes.some(
    (prefix) =>
      normalized === prefix || normalized.startsWith(`${prefix}/`)
  );
};

const walkDir = (dir, visitor) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(ROOT_DIR, fullPath);
    if (entry.isDirectory()) {
      if (shouldSkipDir(relativePath)) continue;
      walkDir(fullPath, visitor);
    } else if (entry.isFile()) {
      visitor(fullPath, relativePath);
    }
  }
};

const findFilesByName = (fileName) => {
  const matches = [];
  walkDir(ROOT_DIR, (fullPath, relativePath) => {
    if (path.basename(fullPath) === fileName) {
      matches.push({
        fullPath,
        relativePath: toPosix(relativePath),
      });
    }
  });
  return matches;
};

const rankCandidate = (relativePath, destinationRelative, preferredPrefixes) => {
  if (relativePath === destinationRelative) return 0;
  for (let i = 0; i < preferredPrefixes.length; i += 1) {
    if (relativePath.startsWith(preferredPrefixes[i])) {
      return i + 1;
    }
  }
  return preferredPrefixes.length + 1;
};

const resolveCandidate = ({
  fileName,
  destinationPath,
  preferredPrefixes,
}) => {
  const destinationRelative = toPosix(
    path.relative(ROOT_DIR, destinationPath)
  );
  if (fs.existsSync(destinationPath)) {
    return {
      fullPath: destinationPath,
      relativePath: destinationRelative,
      isDestination: true,
    };
  }

  const matches = findFilesByName(fileName);
  if (!matches.length) return null;

  const sorted = matches.sort((a, b) => {
    const rankA = rankCandidate(
      a.relativePath,
      destinationRelative,
      preferredPrefixes
    );
    const rankB = rankCandidate(
      b.relativePath,
      destinationRelative,
      preferredPrefixes
    );
    if (rankA !== rankB) return rankA - rankB;
    return a.relativePath.length - b.relativePath.length;
  });
  return { ...sorted[0], isDestination: false };
};

const ensureFile = ({ label, fileName, destinationPath, required, preferredPrefixes }) => {
  const candidate = resolveCandidate({
    fileName,
    destinationPath,
    preferredPrefixes,
  });

  const destinationRelative = toPosix(
    path.relative(ROOT_DIR, destinationPath)
  );

  if (!candidate) {
    if (required) {
      throw new Error(
        `Missing ${label} Firebase config: ${fileName}.\n` +
          `Place it at ${destinationRelative} (or anywhere in the repo so it can be copied).`
      );
    }
    console.log(
      `[firebase] ${label}: ${fileName} not found; skipping.`
    );
    return;
  }

  if (candidate.isDestination) {
    console.log(
      `[firebase] ${candidate.relativePath} -> ${destinationRelative} (already present)`
    );
    return;
  }

  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(candidate.fullPath, destinationPath);
  console.log(
    `[firebase] ${candidate.relativePath} -> ${destinationRelative}`
  );
};

const iosDestination = path.join(
  ROOT_DIR,
  "ios",
  "App",
  "App",
  "GoogleService-Info.plist"
);

ensureFile({
  label: "iOS",
  fileName: "GoogleService-Info.plist",
  destinationPath: iosDestination,
  required: true,
  preferredPrefixes: [
    "ios/App/App/",
    "ios/App/",
    "ios/",
    "config/",
    "configs/",
    "firebase/",
  ],
});

const androidDir = path.join(ROOT_DIR, "android");
if (fs.existsSync(androidDir)) {
  const androidDestination = path.join(
    ROOT_DIR,
    "android",
    "app",
    "google-services.json"
  );
  ensureFile({
    label: "Android",
    fileName: "google-services.json",
    destinationPath: androidDestination,
    required: true,
    preferredPrefixes: [
      "android/app/",
      "android/",
      "config/",
      "configs/",
      "firebase/",
    ],
  });
} else {
  console.log("[firebase] Android directory not found; skipping.");
}
