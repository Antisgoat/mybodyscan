import test from "node:test";
import assert from "node:assert/strict";
import {
  legacyCheckoutBaseUrl,
  legacyCheckoutQuantity,
} from "../lib/stripe/legacyCheckoutPolicy.js";
test("legacy checkout uses only HTTPS first-party payment return origins", () => {
  assert.equal(legacyCheckoutBaseUrl(), "https://mybodyscanapp.com");
  assert.equal(
    legacyCheckoutBaseUrl("https://mybodyscan-f3daf.web.app/path"),
    "https://mybodyscan-f3daf.web.app"
  );
  for (const value of [
    "https://attacker.example",
    "http://mybodyscanapp.com",
    "https://mybodyscanapp.com.attacker.example",
    "https://user:pass@mybodyscanapp.com",
    "https://mybodyscanapp.com:8443",
  ])
    assert.throws(() => legacyCheckoutBaseUrl(value));
});
test("legacy checkout credit quantities are bounded and integer-valued", () => {
  assert.equal(legacyCheckoutQuantity(undefined), 1);
  assert.equal(legacyCheckoutQuantity("10"), 10);
  for (const value of [-1, 0, 1.5, 101, Infinity, NaN, "invalid"])
    assert.throws(() => legacyCheckoutQuantity(value));
});
