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
const PROD_PROBE = fs.readFileSync(
  path.resolve(__dirname, "../scripts/probe.mjs"),
  "utf8"
);
const PRODUCTION_SMOKE = fs.readFileSync(
  path.resolve(__dirname, "../scripts/smoke.sh"),
  "utf8"
);
const FIRESTORE_INDEXES = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../firestore.indexes.json"), "utf8")
);
const FUNCTIONS_ENV = fs.readFileSync(
  path.resolve(__dirname, "../functions/.env.mybodyscan-f3daf"),
  "utf8"
);
const PACKAGE_JSON = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8")
);
const FUNCTIONS_PACKAGE_JSON = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../functions/package.json"), "utf8")
);
const FIREBASE_JSON = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../firebase.json"), "utf8")
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

  it("commits only safe non-secret Functions parameters for CI", () => {
    const keys = FUNCTIONS_ENV.split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split("=", 1)[0])
      .sort();

    expect(keys).toEqual([
      "APP_CHECK_MODE",
      "OPENAI_BASE_URL",
      "OPENAI_MODEL",
      "OPENAI_PROVIDER",
    ]);
    expect(FUNCTIONS_ENV).not.toMatch(
      /(?:API_KEY|SECRET|PASSWORD|PRIVATE_KEY|WEBHOOK)=/
    );
  });

  it("uses the current Firebase CLI toolchain", () => {
    expect(PACKAGE_JSON.devDependencies["firebase-tools"]).toBe("15.24.0");
    expect(PACKAGE_JSON.devDependencies.picomatch).toBe("4.0.5");
  });

  it("deploys Functions on the supported Node 22 runtime", () => {
    expect(FUNCTIONS_PACKAGE_JSON.engines.node).toBe("22");
    expect(FUNCTIONS_PACKAGE_JSON.dependencies["firebase-admin"]).toBe(
      "^14.2.0"
    );
    expect(FUNCTIONS_PACKAGE_JSON.dependencies["firebase-functions"]).toBe(
      "7.3.0"
    );
    expect(FIREBASE_JSON.functions[0].runtime).toBe("nodejs22");
    expect(FIREBASE_JSON.functions[0].predeploy).toEqual([
      'npm --prefix "$RESOURCE_DIR" run build',
    ]);
    expect(WORKFLOW).toContain("node-version: 22");
    expect(VERIFY_WORKFLOW).toContain("node-version: 22");
  });

  it("pins the production credit expiry to the published 12-month policy", () => {
    expect(
      FIREBASE_JSON.functions[0].environmentVariables.CREDIT_EXP_MONTHS
    ).toBe("12");
  });

  it("pins Java 21 anywhere the current Firebase emulators run", () => {
    expect(WORKFLOW).toContain("actions/setup-java@v4");
    expect(WORKFLOW).toMatch(/java-version:\s*["']?21/);
    expect(VERIFY_WORKFLOW.match(/actions\/setup-java@v4/g)).toHaveLength(2);
    expect(VERIFY_WORKFLOW.match(/java-version:\s*["']?21/g)).toHaveLength(2);
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

  it("deploys the collection-group index required by plateau notifications", () => {
    expect(FIRESTORE_INDEXES.fieldOverrides).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          collectionGroup: "notificationTokens",
          fieldPath: "active",
          indexes: expect.arrayContaining([
            {
              order: "ASCENDING",
              queryScope: "COLLECTION_GROUP",
            },
          ]),
        }),
      ])
    );
  });

  it("does not require a GitHub secret for committed public Firebase config", () => {
    expect(SMOKE_WORKFLOW).not.toContain("secrets.FIREBASE_WEB_API_KEY");
  });

  it("runs PR verification with App Check configured like production", () => {
    expect(VERIFY_WORKFLOW).toContain(
      "VITE_APPCHECK_SITE_KEY: ci-enterprise-verification"
    );
  });

  it("injects the production Web Push public key only at deploy time", () => {
    expect(WORKFLOW).toContain(
      "VITE_FIREBASE_VAPID_KEY: ${{ secrets.VITE_FIREBASE_VAPID_KEY }}"
    );
    expect(WORKFLOW).not.toMatch(/VITE_FIREBASE_VAPID_KEY:\s+[A-Za-z0-9_-]{40}/);
  });

  it("deletes the temporary production probe account after scan cleanup", () => {
    const scanCleanupIndex = PROD_PROBE.indexOf('name: "scanDelete"');
    const accountCleanupIndex = PROD_PROBE.indexOf('name: "accountDelete"');

    expect(scanCleanupIndex).toBeGreaterThan(-1);
    expect(accountCleanupIndex).toBeGreaterThan(scanCleanupIndex);
    expect(PROD_PROBE).toContain('functionName: "deleteAccount"');
  });

  it("keeps disposable smoke output private and recognizes expected access gates", () => {
    expect(PRODUCTION_SMOKE).toContain('display_url="${url%%\\?*}"');
    expect(PRODUCTION_SMOKE).not.toContain("LOCAL_ID");
    expect(PRODUCTION_SMOKE).toContain(
      'echo "[smoke] ${name}: ${method} ${display_url}"'
    );
    expect(PRODUCTION_SMOKE).not.toContain(
      'echo "[smoke] ${name}: ${method} ${url}"'
    );
    expect(PRODUCTION_SMOKE).toContain(
      'response_status="$(json_field status)"'
    );
    expect(PRODUCTION_SMOKE).toContain('response_status" == "ok"');
    expect(PRODUCTION_SMOKE).toContain('call_endpoint "nutritionBarcode"');
    expect(PRODUCTION_SMOKE).toContain("json_array_length results");
    expect(PRODUCTION_SMOKE).not.toContain("nutritionSearch skipped");
    expect(PRODUCTION_SMOKE).toContain("permission-denied");
    expect(PRODUCTION_SMOKE).toContain("missing_email");
  });
});
