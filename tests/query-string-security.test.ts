import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// GHSA-6pq8-jhm2-2vcw: untrusted array elements must not crash comma serialization.
for (const [name, path] of [
  ["web toolchain", "../package.json"],
  ["Functions runtime", "../functions/package.json"],
] as const) {
  const qs = createRequire(new URL(path, import.meta.url))("qs");
  describe(`${name} query-string safety`, () => {
    for (const encodeValuesOnly of [false, true]) {
      it(`handles hostile toString values (encodeValuesOnly=${encodeValuesOnly})`, () => {
        const input = JSON.parse('{"a":[{"toString":"x"}]}');
        expect(() =>
          qs.stringify(input, { arrayFormat: "comma", encodeValuesOnly })
        ).not.toThrow();
      });
    }
    it("preserves ordinary form and query serialization", () => {
      expect(qs.stringify({ name: "meal plan", count: 2 })).toBe(
        "name=meal%20plan&count=2"
      );
      expect(qs.parse("name=meal%20plan&count=2")).toEqual({
        name: "meal plan",
        count: "2",
      });
    });
  });
}
