import { pathToFileURL } from "node:url";
import { Storage } from "@google-cloud/storage";

const CACHE_CONTROL = "private, no-store, max-age=0";
const PREFIXES = ["scans/", "transformation-previews/", "user_uploads/"];

/** Metadata only. Never download photos, rotate tokens, or print private paths. */
export async function migratePrivateCache(
  bucket,
  { apply = false, maxObjects = 1000 } = {}
) {
  if (
    !Number.isSafeInteger(maxObjects) ||
    maxObjects < 1 ||
    maxObjects > 10000
  ) {
    throw new Error("maxObjects must be an integer between 1 and 10000");
  }
  const summary = {
    mode: apply ? "apply" : "dry-run",
    inspected: 0,
    needsUpdate: 0,
    updated: 0,
    conflicts: 0,
    truncated: false,
  };
  for (const prefix of PREFIXES) {
    let pageToken;
    do {
      const remaining = maxObjects - summary.inspected;
      if (remaining <= 0) {
        summary.truncated = true;
        return summary;
      }
      const [files, next] = await bucket.getFiles({
        prefix,
        pageToken,
        autoPaginate: false,
        maxResults: Math.min(100, remaining),
      });
      for (const file of files) {
        if (!file.name.startsWith(prefix))
          throw new Error("Unexpected object prefix");
        summary.inspected++;
        const metadata = file.metadata;
        if (metadata?.cacheControl === CACHE_CONTROL) continue;
        if (!metadata?.generation || !metadata?.metageneration)
          throw new Error("Missing object preconditions");
        summary.needsUpdate++;
        if (!apply) continue;
        try {
          const target = bucket.file(file.name, {
            preconditionOpts: {
              ifGenerationMatch: metadata.generation,
              ifMetagenerationMatch: metadata.metageneration,
            },
          });
          await target.setMetadata({ cacheControl: CACHE_CONTROL });
          summary.updated++;
        } catch (error) {
          if (Number(error?.code) === 412 || Number(error?.code) === 404)
            summary.conflicts++;
          else
            throw new Error(
              "Private cache metadata update failed; no object contents changed"
            );
        }
      }
      pageToken = next?.pageToken;
    } while (pageToken);
  }
  return summary;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const storage = new Storage({ projectId: "mybodyscan-f3daf" });
    const summary = await migratePrivateCache(
      storage.bucket("mybodyscan-f3daf.firebasestorage.app"),
      {
        apply: process.argv.includes("--apply"),
        maxObjects: Number(process.env.PRIVATE_CACHE_MAX_OBJECTS || 1000),
      }
    );
    console.log(JSON.stringify(summary));
    if (summary.truncated || summary.conflicts) process.exitCode = 2;
  } catch {
    console.error(
      "Private-cache maintenance failed. Check the deployment identity and permissions; no photo contents or download tokens were changed."
    );
    process.exitCode = 1;
  }
}
