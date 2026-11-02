import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
describe("patched build-tool matching compatibility", () => {
  for (const parent of ["eslint", "firebase-tools"]) {
    it(`preserves the legacy callable API used by ${parent}`, () => {
      const parentRequire = createRequire(
        require.resolve(`${parent}/package.json`)
      );
      const matcher = parentRequire("minimatch");
      expect(typeof matcher).toBe("function");
      expect(matcher("src/page.ts", "**/*.ts")).toBe(true);
      expect(matcher("src/page.js", "**/*.ts")).toBe(false);
      expect(matcher.defaults({ nocase: true })("PAGE.TS", "*.ts")).toBe(true);
      expect(new matcher.Minimatch("src/**").match("src/page.ts")).toBe(true);
      expect(matcher.minimatch("a.ts", "*.ts")).toBe(true);
    });
  }
  it("keeps modern glob consumers working with patched minimatch", () => {
    const globRequire = createRequire(require.resolve("rimraf"));
    const { globSync } = globRequire("glob");
    expect(
      globSync("src/pages/FridgeMeals.tsx", { cwd: process.cwd() })
    ).toEqual(["src/pages/FridgeMeals.tsx"]);
  });
});
