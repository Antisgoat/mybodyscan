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

  it("does not require a GitHub secret for committed public Firebase config", () => {
    expect(SMOKE_WORKFLOW).not.toContain("secrets.FIREBASE_WEB_API_KEY");
  });
});
