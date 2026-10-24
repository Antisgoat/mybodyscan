import { HttpsError } from "firebase-functions/v2/https";
import { URL } from "node:url";

export function legacyCheckoutBaseUrl(raw = "https://mybodyscanapp.com") {
  const parsed = new URL(raw || "https://mybodyscanapp.com");
  const allowed = new Set([
    "mybodyscanapp.com",
    "www.mybodyscanapp.com",
    "mybodyscan-f3daf.web.app",
    "mybodyscan-f3daf.firebaseapp.com",
  ]);
  if (
    parsed.protocol !== "https:" ||
    !allowed.has(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    parsed.port
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Checkout URL is not configured correctly."
    );
  }
  return parsed.origin;
}

export function legacyCheckoutQuantity(value: unknown) {
  const quantity = Number(value ?? 1);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) {
    throw new HttpsError(
      "invalid-argument",
      "Choose between 1 and 100 scan credits."
    );
  }
  return quantity;
}
