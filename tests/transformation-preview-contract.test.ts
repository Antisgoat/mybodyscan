import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

it("keeps the client refresh offer aligned with the server prompt version", () => {
  const frontend = readFileSync(
    path.resolve(__dirname, "../src/lib/transformationPreview.ts"),
    "utf8"
  );
  const backend = readFileSync(
    path.resolve(__dirname, "../functions/src/transformationPreview.ts"),
    "utf8"
  );
  const clientVersion = frontend.match(
    /TRANSFORMATION_PREVIEW_PROMPT_VERSION\s*=\s*"([^"]+)"/
  )?.[1];
  const serverVersion = backend.match(
    /TRANSFORMATION_PROMPT_VERSION\s*=\s*"([^"]+)"/
  )?.[1];
  expect(clientVersion).toBeTruthy();
  expect(clientVersion).toBe(serverVersion);
});
