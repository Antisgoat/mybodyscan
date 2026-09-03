// @vitest-environment node
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createTemporaryEnv } from "../scripts/lib/temporary-env.mjs";

const directories: string[] = [];
function pathForTest() {
  const directory = mkdtempSync(join(tmpdir(), "mbs-env-test-"));
  directories.push(directory);
  return join(directory, ".env.local");
}
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
it("does not overwrite an existing operator env", () => {
  const file = pathForTest();
  writeFileSync(file, "OPERATOR_VALUE=keep-this-test-placeholder");
  expect(() => createTemporaryEnv(file, "MOCK=true")).toThrow(/already exists/);
  expect(readFileSync(file, "utf8")).toBe(
    "OPERATOR_VALUE=keep-this-test-placeholder"
  );
});
it("cleans up only its own temporary env", () => {
  const file = pathForTest();
  const cleanup = createTemporaryEnv(file, "MOCK=true");
  expect(readFileSync(file, "utf8")).toBe("MOCK=true");
  cleanup();
  expect(existsSync(file)).toBe(false);
  cleanup();
});
