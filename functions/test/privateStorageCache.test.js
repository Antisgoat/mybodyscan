import assert from "node:assert/strict";
import test from "node:test";
import { migratePrivateCache } from "../../scripts/private-storage-cache.mjs";

test("private-cache maintenance defaults to a bounded dry run with no writes", async () => {
  const bucket = {
    getFiles: async ({ prefix }) => [
      [
        {
          name: `${prefix}private.jpg`,
          metadata: { generation: "1", metageneration: "2" },
        },
      ],
    ],
    file() {
      throw new Error("dry run must not write");
    },
  };
  const result = await migratePrivateCache(bucket, { maxObjects: 1 });
  assert.equal(result.inspected, 1);
  assert.equal(result.needsUpdate, 1);
  assert.equal(result.updated, 0);
  assert.equal(result.truncated, true);
  await assert.rejects(migratePrivateCache(bucket, { maxObjects: 10001 }));
});
test("private-cache apply changes only cache metadata with race protection", async () => {
  let writes = 0;
  const bucket = {
    getFiles: async ({ prefix }) => [
      [
        {
          name: `${prefix}private.jpg`,
          metadata: {
            generation: "1",
            metageneration: "2",
            metadata: { firebaseStorageDownloadTokens: "preserve" },
          },
        },
      ],
    ],
    file(name, options) {
      assert.ok(!name.startsWith("public/"));
      assert.deepEqual(options.preconditionOpts, {
        ifGenerationMatch: "1",
        ifMetagenerationMatch: "2",
      });
      return {
        async setMetadata(metadata) {
          assert.deepEqual(metadata, {
            cacheControl: "private, no-store, max-age=0",
          });
          writes++;
        },
      };
    },
  };
  const result = await migratePrivateCache(bucket, { apply: true });
  assert.equal(writes, 3);
  assert.equal(result.updated, 3);
  assert.equal(result.truncated, false);
});
