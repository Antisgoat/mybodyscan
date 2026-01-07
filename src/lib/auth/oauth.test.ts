// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", {
    value: ua,
    configurable: true,
  });
}

describe("isIosSafari", () => {
  it("detects iPhone Safari", () => {
    setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1"
    );
    return import("./oauth").then(({ isIosSafari }) => {
      expect(isIosSafari()).toBe(true);
    });
  });

  it("does not treat iOS Chrome as Safari", () => {
    setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1"
    );
    return import("./oauth").then(({ isIosSafari }) => {
      expect(isIosSafari()).toBe(false);
    });
  });
});

