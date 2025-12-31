type StaffProParams = {
  uid?: string | null;
  email?: string | null;
};

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

function parseCsvEnv(name: string): string[] {
  const raw = typeof process !== "undefined" ? (process.env as any)?.[name] : "";
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw
    .split(",")
    .map((v) => String(v || "").trim())
    .filter((v) => v.length > 0);
}

// Hardcoded defaults (must work without env vars).
const DEFAULT_STAFF_PRO_UIDS = [
  "ww481RPvMYZzwn5vLX8FXyRlGVV2",
  "iYnHMbPSV1aJCyc3cIsdz1dLm092",
];

const DEFAULT_STAFF_PRO_EMAILS = [
  "developer@adlrlabs.com",
  "luisjm1620@gmail.com",
  "pmendoza1397@gmail.com",
  "tester@adlrlabs.com",
];

/**
 * STAFF/TEST Pro allowlist.
 *
 * Notes:
 * - UID matching works even when email is hidden (Apple).
 * - Email matching is case-insensitive.
 * - Optional env overrides are supported:
 *   - STAFF_PRO_UIDS="uid1,uid2"
 *   - STAFF_PRO_EMAILS="a@b.com,c@d.com"
 */
export const STAFF_PRO_UID_ALLOWLIST = new Set<string>([
  ...DEFAULT_STAFF_PRO_UIDS,
  ...parseCsvEnv("STAFF_PRO_UIDS"),
]);

export const STAFF_PRO_EMAIL_ALLOWLIST = new Set<string>(
  [...DEFAULT_STAFF_PRO_EMAILS, ...parseCsvEnv("STAFF_PRO_EMAILS")].map((e) =>
    e.toLowerCase()
  )
);

export function isStaffProUid(uid?: string | null): boolean {
  const v = normalizeUid(uid);
  return Boolean(v && STAFF_PRO_UID_ALLOWLIST.has(v));
}

export function isStaffProEmail(email?: string | null): boolean {
  const v = normalizeEmail(email);
  return Boolean(v && STAFF_PRO_EMAIL_ALLOWLIST.has(v));
}

export function isStaffPro(params: StaffProParams): boolean {
  return isStaffProUid(params.uid) || isStaffProEmail(params.email);
}

