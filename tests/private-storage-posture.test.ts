import { expect, it, vi } from "vitest";
// @ts-expect-error maintenance scripts are JavaScript and exercised directly.
import { inspectStoragePosture } from "../scripts/private-storage-posture.mjs";

it("summarizes live storage posture without printing private IAM identities", async () => {
  const bucket = {
    getMetadata: vi
      .fn()
      .mockResolvedValue([
        {
          iamConfiguration: {
            publicAccessPrevention: "enforced",
            uniformBucketLevelAccess: { enabled: true },
          },
          softDeletePolicy: { retentionDurationSeconds: "604800" },
          versioning: { enabled: false },
        },
      ]),
    iam: {
      getPolicy: vi
        .fn()
        .mockResolvedValue([
          {
            bindings: [
              {
                role: "private-role",
                members: ["serviceAccount:private@example.test"],
              },
            ],
          },
        ]),
    },
  };
  const result = await inspectStoragePosture(bucket);
  expect(result.publicIamBinding).toBe(false);
  expect(result.publicAccessPrevention).toBe("enforced");
  expect(result.softDeleteRetentionSeconds).toBe("604800");
  expect(JSON.stringify(result)).not.toContain("private@example.test");
  expect(bucket.getMetadata).toHaveBeenCalledTimes(1);
});

it("flags grants to either public principal without changing them", async () => {
  for (const member of ["allUsers", "allAuthenticatedUsers"]) {
    const bucket = {
      getMetadata: async () => [{}],
      iam: { getPolicy: async () => [{ bindings: [{ members: [member] }] }] },
    };
    expect((await inspectStoragePosture(bucket)).publicIamBinding).toBe(true);
  }
});
