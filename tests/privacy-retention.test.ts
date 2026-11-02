import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it.each(["src/content/legal/privacy.md", "public/legal/privacy.html"])(
  "discloses the approved private-photo lifecycle in %s",
  (path) => {
    const content = readFileSync(path, "utf8").replace(/\s+/g, " ");
    expect(content).toContain("seven days");
    expect(content).toContain("separate, explicit permission");
    expect(content).toContain("not accessible through the app");
    expect(content).toContain(
      "We do not restore deleted-account photos into normal use"
    );
    expect(content).toContain("November 2, 2026");
  }
);
