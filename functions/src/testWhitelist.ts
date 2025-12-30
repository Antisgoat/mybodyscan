import { UNLIMITED_EMAIL_ALLOWLIST } from "./lib/unlimitedUsers.js";

// Test/ops whitelist for unlimited credits (email-based, case-insensitive).
// NOTE: UID-based allowlisting lives in `lib/unlimitedUsers.ts`.
export const TEST_WHITELIST = ["developer@adlrlabs.com"];

export const isWhitelisted = (email?: string) => {
  if (!email) return false;
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return false;
  return (
    TEST_WHITELIST.includes(normalized) || UNLIMITED_EMAIL_ALLOWLIST.has(normalized)
  );
};
