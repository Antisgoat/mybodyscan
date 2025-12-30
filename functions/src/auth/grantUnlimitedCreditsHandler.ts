import { HttpsError } from "firebase-functions/v2/https";

export type GrantUnlimitedCreditsRequest = {
  emails?: unknown;
  email?: unknown;
  uids?: unknown;
  uid?: unknown;
  enabled?: unknown;
};

export type GrantUnlimitedCreditsUpdated = {
  /** The resolved email, if present (may be empty when target was UID-only). */
  email: string;
  uid: string;
  enabled: boolean;
};

export type GrantUnlimitedCreditsFailed = {
  /** Target identifier (email or uid) */
  target: string;
  reason: string;
};

export type GrantUnlimitedCreditsResult = {
  ok: true;
  enabled: boolean;
  updated: GrantUnlimitedCreditsUpdated[];
  failed: GrantUnlimitedCreditsFailed[];
  /** Back-compat: provided when exactly one user was updated. */
  uid?: string;
};

export type GrantUnlimitedCreditsDeps = {
  /**
   * Caller email allowlist (lowercased).
   * Server-side enforcement — do not rely on UI gating.
   */
  adminEmailAllowlist: Set<string>;
  nowIso: () => string;

  getUserByEmail: (
    email: string
  ) => Promise<{ uid: string; email?: string | null; customClaims?: unknown }>;

  getUserByUid: (
    uid: string
  ) => Promise<{ uid: string; email?: string | null; customClaims?: unknown }>;

  setCustomUserClaims: (uid: string, claims: Record<string, unknown>) => Promise<void>;

  /**
   * Writes Firestore mirrors so unlimited applies immediately in UI and
   * is queryable/auditable server-side.
   */
  writeUnlimitedCreditsMirror: (params: {
    uid: string;
    enabled: boolean;
    grantedByEmail: string;
    grantedByUid: string;
    atIso: string;
  }) => Promise<void>;
};

function normalizeEmails(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : [];
  const emails = raw
    .map((v) => (typeof v === "string" ? v : ""))
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(emails));
}

function normalizeUids(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : [];
  const uids = raw
    .map((v) => (typeof v === "string" ? v : ""))
    .map((v) => v.trim())
    .filter(Boolean);
  return Array.from(new Set(uids));
}

function normalizeSingleEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  return email ? email : null;
}

function normalizeSingleUid(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const uid = input.trim();
  return uid ? uid : null;
}

function normalizeEnabled(input: unknown): boolean {
  if (input === false) return false;
  if (input === true) return true;
  // Default: grant
  return true;
}

function isUserNotFound(error: unknown): boolean {
  const code = (error as any)?.code;
  return (
    code === "auth/user-not-found" ||
    code === "user-not-found" ||
    code === "not-found"
  );
}

export async function grantUnlimitedCreditsHandler(
  request: {
    auth?: { uid: string; token?: Record<string, unknown> };
    data?: GrantUnlimitedCreditsRequest;
  },
  deps: GrantUnlimitedCreditsDeps
): Promise<GrantUnlimitedCreditsResult> {
  const auth = request.auth;
  if (!auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }

  const tokenEmailRaw = auth.token?.email;
  const callerEmail =
    typeof tokenEmailRaw === "string" ? tokenEmailRaw.trim().toLowerCase() : "";
  if (!callerEmail) {
    // Requirement: if caller email is missing, reject.
    throw new HttpsError("permission-denied", "Caller email required");
  }

  const allowlisted = deps.adminEmailAllowlist.has(callerEmail);
  if (!allowlisted) {
    throw new HttpsError("permission-denied", "Admin allowlist required");
  }

  const enabled = normalizeEnabled(request.data?.enabled);
  const emails = (() => {
    const list = normalizeEmails(request.data?.emails);
    if (list.length) return list;
    const single = normalizeSingleEmail(request.data?.email);
    if (single) return [single];
    return [];
  })();

  const uids = (() => {
    const list = normalizeUids(request.data?.uids);
    if (list.length) return list;
    const single = normalizeSingleUid(request.data?.uid);
    if (single) return [single];
    return [];
  })();

  // Back-compat: previous implementation granted to the caller with no payload.
  const targets =
    emails.length || uids.length ? { emails, uids } : { emails: [callerEmail], uids: [] };

  if (!targets.emails.length && !targets.uids.length) {
    throw new HttpsError("invalid-argument", "email(s) or uid(s) is required");
  }

  const updated: GrantUnlimitedCreditsUpdated[] = [];
  const failed: GrantUnlimitedCreditsFailed[] = [];
  const atIso = deps.nowIso();

  for (const email of targets.emails) {
    try {
      const target = await deps.getUserByEmail(email);
      const uid = String(target.uid || "");
      if (!uid) {
        failed.push({ target: email, reason: "missing_uid" });
        continue;
      }

      const existingClaims =
        target.customClaims && typeof target.customClaims === "object"
          ? (target.customClaims as Record<string, unknown>)
          : {};

      await deps.setCustomUserClaims(uid, {
        ...existingClaims,
        unlimitedCredits: enabled,
      });

      await deps.writeUnlimitedCreditsMirror({
        uid,
        enabled,
        grantedByEmail: callerEmail,
        grantedByUid: auth.uid,
        atIso,
      });

      updated.push({ email, uid, enabled });
    } catch (error: unknown) {
      if (isUserNotFound(error)) {
        failed.push({ target: email, reason: "user_not_found" });
        continue;
      }
      failed.push({
        target: email,
        reason: (error as Error)?.message || "unknown_error",
      });
    }
  }

  for (const uidTarget of targets.uids) {
    try {
      const target = await deps.getUserByUid(uidTarget);
      const uid = String(target.uid || "");
      if (!uid) {
        failed.push({ target: uidTarget, reason: "missing_uid" });
        continue;
      }

      const existingClaims =
        target.customClaims && typeof target.customClaims === "object"
          ? (target.customClaims as Record<string, unknown>)
          : {};

      await deps.setCustomUserClaims(uid, {
        ...existingClaims,
        unlimitedCredits: enabled,
      });

      await deps.writeUnlimitedCreditsMirror({
        uid,
        enabled,
        grantedByEmail: callerEmail,
        grantedByUid: auth.uid,
        atIso,
      });

      const resolvedEmail =
        typeof target.email === "string" ? target.email.trim().toLowerCase() : "";
      updated.push({ email: resolvedEmail, uid, enabled });
    } catch (error: unknown) {
      if (isUserNotFound(error)) {
        failed.push({ target: uidTarget, reason: "user_not_found" });
        continue;
      }
      failed.push({
        target: uidTarget,
        reason: (error as Error)?.message || "unknown_error",
      });
    }
  }

  const result: GrantUnlimitedCreditsResult = {
    ok: true,
    enabled,
    updated,
    failed,
  };
  if (updated.length === 1) {
    result.uid = updated[0]!.uid;
  }
  return result;
}

