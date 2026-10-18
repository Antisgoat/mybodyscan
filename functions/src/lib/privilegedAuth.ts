export const DEFAULT_BOOTSTRAP_ADMIN_EMAIL = "developer@adlrlabs.com";

type Claims = Record<string, unknown> | null | undefined;

export type PrivilegedIdentity = {
  uid?: string | null;
  email?: string | null;
  emailVerified?: boolean | null;
  claims?: Claims;
};

export type PrivilegedAccessOptions = {
  allowedEmails?: Iterable<string>;
  allowedUids?: Iterable<string>;
  acceptedClaims?: readonly ("admin" | "staff")[];
};

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function normalizeUid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

export function parseCsvSet(value: unknown, normalize = false): Set<string> {
  if (typeof value !== "string") return new Set();
  return new Set(
    value
      .split(/[\s,]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => (normalize ? entry.toLowerCase() : entry))
  );
}

export function configuredAdminEmails(): Set<string> {
  const configured = parseCsvSet(
    process.env.ADMIN_EMAILS_CSV || process.env.ADMIN_EMAILS || "",
    true
  );
  configured.add(DEFAULT_BOOTSTRAP_ADMIN_EMAIL);
  return configured;
}

export function configuredAdminUids(): Set<string> {
  return parseCsvSet(
    process.env.ADMIN_UIDS_CSV || process.env.ADMIN_UIDS || ""
  );
}

export function configuredStaffUids(): Set<string> {
  return new Set([
    ...configuredAdminUids(),
    ...parseCsvSet(process.env.STAFF_UIDS_CSV || process.env.STAFF_UIDS || ""),
  ]);
}

export function hasAcceptedPrivilegeClaim(
  claims: Claims,
  acceptedClaims: readonly ("admin" | "staff")[] = ["admin", "staff"]
): boolean {
  return acceptedClaims.some((claim) => claims?.[claim] === true);
}

/**
 * Authorizes a privileged identity using stable server-issued claims or an
 * immutable UID. Email is intentionally only a bootstrap fallback and must be
 * both verified by Firebase Auth and an exact allowlist match.
 */
export function isPrivilegedIdentity(
  identity: PrivilegedIdentity,
  options: PrivilegedAccessOptions = {}
): boolean {
  const acceptedClaims = options.acceptedClaims ?? ["admin", "staff"];
  if (hasAcceptedPrivilegeClaim(identity.claims, acceptedClaims)) return true;

  const uid = normalizeUid(identity.uid);
  const allowedUids = new Set(
    Array.from(options.allowedUids ?? []).map((entry) => String(entry).trim())
  );
  if (uid && allowedUids.has(uid)) return true;

  if (identity.emailVerified !== true) return false;
  const email = normalizeEmail(identity.email);
  if (!email) return false;
  const allowedEmails = new Set(
    Array.from(options.allowedEmails ?? []).map((entry) =>
      String(entry).trim().toLowerCase()
    )
  );
  return allowedEmails.has(email);
}

export function tokenIdentity(auth: {
  uid?: string | null;
  token?: Record<string, unknown> | null;
}): PrivilegedIdentity {
  return {
    uid: auth.uid,
    email: auth.token?.email as string | undefined,
    emailVerified: auth.token?.email_verified === true,
    claims: auth.token,
  };
}
