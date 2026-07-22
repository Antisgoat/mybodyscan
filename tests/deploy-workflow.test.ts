import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WORKFLOW = fs.readFileSync(
  path.resolve(__dirname, "../.github/workflows/deploy-functions-on-main.yml"),
  "utf8"
);
const SMOKE_WORKFLOW = fs.readFileSync(
  path.resolve(__dirname, "../.github/workflows/prod-smoke.yml"),
  "utf8"
);
const VERIFY_WORKFLOW = fs.readFileSync(
  path.resolve(__dirname, "../.github/workflows/verify.yml"),
  "utf8"
);
const FIRESTORE_INDEXES = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../firestore.indexes.json"), "utf8")
);

describe("production deployment authentication", () => {
  it("uses repository-restricted keyless Google authentication", () => {
    expect(WORKFLOW).toContain("id-token: write");
    expect(WORKFLOW).toContain("google-github-actions/auth@v3");
    expect(WORKFLOW).toContain(
      "workloadIdentityPools/github-actions/providers/mybodyscan"
    );
    expect(WORKFLOW).toContain(
      "github-mybodyscan-deploy@mybodyscan-f3daf.iam.gserviceaccount.com"
    );
    expect(WORKFLOW).not.toContain("FIREBASE_SERVICE_ACCOUNT_JSON");
    expect(WORKFLOW).toContain("npm run storage:cors:apply");
  });

  it("keeps production cloud credentials out of tests and emulators", () => {
    const verifyIndex = WORKFLOW.indexOf(
      "Verify scan, credit, refund, and account deletion pipeline"
    );
    const authIndex = WORKFLOW.indexOf("Authenticate to Google Cloud");
    const deployIndex = WORKFLOW.indexOf(
      "Deploy production in dependency order"
    );

    expect(verifyIndex).toBeGreaterThan(-1);
    expect(authIndex).toBeGreaterThan(verifyIndex);
    expect(deployIndex).toBeGreaterThan(authIndex);
  });

  it("preserves existing production indexes without a forced deletion", () => {
    expect(WORKFLOW).not.toMatch(/firestore:indexes[^\n]*--force/);
    expect(FIRESTORE_INDEXES.indexes).toEqual(
      expect.arrayContaining([
        {
          collectionGroup: "scans",
          queryScope: "COLLECTION_GROUP",
          fields: [
            { fieldPath: "uid", order: "ASCENDING" },
            { fieldPath: "createdAt", order: "DESCENDING" },
          ],
        },
        {
          collectionGroup: "scans",
          queryScope: "COLLECTION_GROUP",
          fields: [
            { fieldPath: "uid", order: "ASCENDING" },
            { fieldPath: "status", order: "ASCENDING" },
            { fieldPath: "createdAt", order: "DESCENDING" },
          ],
        },
      ])
    );
  });

  it("does not declare redundant one-field composite indexes", () => {
    for (const index of FIRESTORE_INDEXES.indexes) {
      expect(index.fields.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("does not require a GitHub secret for committed public Firebase config", () => {
    expect(SMOKE_WORKFLOW).not.toContain("secrets.FIREBASE_WEB_API_KEY");
  });

  it("runs PR verification with App Check configured like production", () => {
    expect(VERIFY_WORKFLOW).toContain(
      "VITE_APPCHECK_SITE_KEY: ci-enterprise-verification"
    );
  });
});
