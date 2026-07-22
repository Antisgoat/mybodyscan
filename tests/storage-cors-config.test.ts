import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type CorsRule = {
  origin: string[];
  method: string[];
  responseHeader: string[];
  maxAgeSeconds: number;
};

const canonical = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../scripts/cors.json"), "utf8")
) as CorsRule[];
const infrastructure = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../infra/storage-cors.json"), "utf8")
) as { cors: CorsRule[] };
const storageRules = fs.readFileSync(
  path.resolve(__dirname, "../storage.rules"),
  "utf8"
);

describe("Storage CORS configuration", () => {
  it("keeps the infrastructure mirror and every production origin in sync", () => {
    expect(infrastructure.cors).toEqual(canonical);
    expect(canonical).toHaveLength(1);
    expect(canonical[0].origin).toEqual(
      expect.arrayContaining([
        "https://mybodyscanapp.com",
        "https://www.mybodyscanapp.com",
        "https://mybodyscan.app",
        "https://www.mybodyscan.app",
        "https://mybodyscan-f3daf.web.app",
        "https://mybodyscan-f3daf.firebaseapp.com",
      ])
    );
  });

  it("keeps generated transformation previews owner-readable and server-write-only", () => {
    expect(storageRules).toMatch(
      /match \/transformation-previews\/\{uid\}\/\{scanId\}\/\{fileName\}/
    );
    expect(storageRules).toMatch(
      /match \/transformation-previews[\s\S]*allow read: if isOwner\(uid\);[\s\S]*allow write: if false;/
    );
  });
});
