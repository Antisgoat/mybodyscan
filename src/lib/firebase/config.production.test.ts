import { describe, expect, it } from "vitest";
import { normalizeStorageBucket } from "./config";

describe("Firebase production storage configuration", () => {
  it("preserves the current firebasestorage.app bucket name", () => {
    expect(normalizeStorageBucket("mybodyscan-f3daf.firebasestorage.app")).toBe(
      "mybodyscan-f3daf.firebasestorage.app"
    );
  });

  it("extracts a bucket name from a bucket-scoped URL", () => {
    expect(
      normalizeStorageBucket(
        "https://storage.example.invalid/b/example.firebasestorage.app/o"
      )
    ).toBe("example.firebasestorage.app");
  });
});
