import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const pbxprojPath = path.join(repoRoot, "ios/App/App.xcodeproj/project.pbxproj");

function fail(message) {
  console.error(`❌ [doctor-ios-duplicates] ${message}`);
  process.exit(1);
}

function warn(message) {
  console.warn(`⚠️ [doctor-ios-duplicates] ${message}`);
}

function parseBuildPhaseIds(block) {
  const ids = [];
  const regex = /([A-F0-9]{24})/g;
  let match;
  while ((match = regex.exec(block))) {
    ids.push(match[1]);
  }
  return ids;
}

function parseBuildFiles(block) {
  const entries = [];
  const regex = /([A-F0-9]{24}) \/\* ([^*]+) \*\//g;
  let match;
  while ((match = regex.exec(block))) {
    entries.push({ id: match[1], comment: match[2] });
  }
  return entries;
}

function findTargetBuildPhases(contents) {
  const sectionMatch = contents.match(
    /\/\* Begin PBXNativeTarget section \*\/([\s\S]*?)\/\* End PBXNativeTarget section \*\//
  );
  if (!sectionMatch) {
    fail("Unable to locate PBXNativeTarget section.");
  }
  const section = sectionMatch[1];
  const targetMatch = section.match(/\/\* App \*\/ = \{[\s\S]*?\};/);
  if (!targetMatch) {
    fail("Unable to locate PBXNativeTarget for App.");
  }
  const buildPhasesMatch = targetMatch[0].match(/buildPhases = \(([\s\S]*?)\);/);
  if (!buildPhasesMatch) {
    fail("Unable to locate buildPhases for App target.");
  }
  return parseBuildPhaseIds(buildPhasesMatch[1]);
}

function findPhaseBlock(contents, phaseId) {
  const phaseRegex = new RegExp(
    `${phaseId} \/\\*[^*]*\\*\/ = \\{isa = (PBX\\w+BuildPhase);[\\s\\S]*?files = \\(([\\s\\S]*?)\\);`,
    "m"
  );
  const match = contents.match(phaseRegex);
  if (!match) {
    return null;
  }
  return {
    isa: match[1],
    filesBlock: match[2],
  };
}

function reportDuplicates(label, entries) {
  const seenIds = new Map();
  const seenComments = new Map();
  const duplicateIds = new Set();
  const duplicateComments = new Set();

  for (const entry of entries) {
    if (seenIds.has(entry.id)) {
      duplicateIds.add(entry.id);
    } else {
      seenIds.set(entry.id, entry.comment);
    }
    if (seenComments.has(entry.comment)) {
      duplicateComments.add(entry.comment);
    } else {
      seenComments.set(entry.comment, entry.id);
    }
  }

  console.log(`\n[doctor-ios-duplicates] ${label}: ${entries.length} entries`);
  if (duplicateIds.size) {
    console.log("  Duplicate PBXBuildFile IDs:");
    for (const id of duplicateIds) {
      console.log(`  - ${id} (${seenIds.get(id)})`);
    }
  }
  if (duplicateComments.size) {
    console.log("  Duplicate comments:");
    for (const comment of duplicateComments) {
      console.log(`  - ${comment}`);
    }
  }

  return duplicateIds.size > 0 || duplicateComments.size > 0;
}

async function main() {
  let contents;
  try {
    contents = await fs.readFile(pbxprojPath, "utf8");
  } catch (error) {
    fail(`Unable to read ${pbxprojPath}: ${error?.message || error}`);
  }

  const phaseIds = findTargetBuildPhases(contents);
  if (!phaseIds.length) {
    warn("No build phases found for target App.");
  }

  let hasDuplicates = false;
  for (const phaseId of phaseIds) {
    const phase = findPhaseBlock(contents, phaseId);
    if (!phase) {
      continue;
    }
    if (phase.isa === "PBXResourcesBuildPhase" || phase.isa === "PBXCopyFilesBuildPhase") {
      const entries = parseBuildFiles(phase.filesBlock);
      const label = `${phase.isa} (${phaseId})`;
      if (reportDuplicates(label, entries)) {
        hasDuplicates = true;
      }
    }
  }

  if (hasDuplicates) {
    fail("Duplicate PBXBuildFile entries found in App build phases.");
  }
  console.log("✅ [doctor-ios-duplicates] No duplicate build file entries detected.");
}

main().catch((error) => {
  fail(String(error?.stack || error?.message || error));
});
