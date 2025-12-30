export type UnlimitedUserParams = {
  uid?: string | null;
  email?: string | null;
};

/**
 * Canonical allowlist for unlimited credits.
 *
 * Important:
 * - UID matching MUST work even when email is missing (Apple).
 * - Email matching is case-insensitive.
 */
export const UNLIMITED_UID_ALLOWLIST = new Set<string>([
  "ww481RPvMYZzwn5vLX8FXyRlGVV2",
  "iYnHMbPSV1aJCyc3cIsdz1dLm092",
]);

export const UNLIMITED_EMAIL_ALLOWLIST = new Set<string>([
  "luisjm1620@gmail.com",
  "pmendoza1397@gmail.com",
  "tester@adlrlabs.com",
].map((e) => e.toLowerCase()));

function normalizeEmail(email?: string | null): string | null {
  if (typeof email !== "string") return null;
  const v = email.trim().toLowerCase();
  return v ? v : null;
}

function normalizeUid(uid?: string | null): string | null {
  if (typeof uid !== "string") return null;
  const v = uid.trim();
  return v ? v : null;
}

export function isUnlimitedUser(params: UnlimitedUserParams): boolean {
  const uid = normalizeUid(params.uid);
  if (uid && UNLIMITED_UID_ALLOWLIST.has(uid)) return true;

  const email = normalizeEmail(params.email);
  if (email && UNLIMITED_EMAIL_ALLOWLIST.has(email)) return true;

  return false;
}

