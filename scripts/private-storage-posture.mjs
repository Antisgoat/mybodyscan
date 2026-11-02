import { pathToFileURL } from "node:url";
import { Storage } from "@google-cloud/storage";

/** Read-only: summarize security metadata without object content, paths or tokens. */
export async function inspectStoragePosture(bucket) {
  const [[metadata], [policy]] = await Promise.all([
    bucket.getMetadata(),
    bucket.iam.getPolicy({ requestedPolicyVersion: 3 }),
  ]);
  const publicIamBinding = (policy.bindings ?? []).some((binding) =>
    (binding.members ?? []).some(
      (member) => member === "allUsers" || member === "allAuthenticatedUsers"
    )
  );
  return {
    mode: "read-only",
    publicIamBinding,
    publicAccessPrevention:
      metadata.iamConfiguration?.publicAccessPrevention ?? "unverified",
    uniformBucketAccess:
      metadata.iamConfiguration?.uniformBucketLevelAccess?.enabled === true,
    objectVersioning: metadata.versioning?.enabled === true,
    softDeleteRetentionSeconds:
      metadata.softDeletePolicy?.retentionDurationSeconds ?? null,
    defaultRetentionSeconds: metadata.retentionPolicy?.retentionPeriod ?? null,
    lifecycleRuleCount: Array.isArray(metadata.lifecycle?.rule)
      ? metadata.lifecycle.rule.length
      : 0,
    note: "IAM metadata alone does not verify object ACLs, Firebase rules, all access logs, or provider recovery copies.",
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const storage = new Storage({ projectId: "mybodyscan-f3daf" });
    console.log(
      JSON.stringify(
        await inspectStoragePosture(
          storage.bucket("mybodyscan-f3daf.firebasestorage.app")
        )
      )
    );
  } catch {
    // Provider error text can include credentials or private resource identifiers.
    console.error(
      "Storage posture could not be verified; no data or settings were changed."
    );
    process.exitCode = 1;
  }
}
