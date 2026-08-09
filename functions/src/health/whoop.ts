import { defineSecret } from "firebase-functions/params";

export const WHOOP_AUTHORIZATION_URL =
  "https://api.prod.whoop.com/oauth/oauth2/auth";
export const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
export const WHOOP_API_BASE_URL = "https://api.prod.whoop.com/developer/v2";
export const WHOOP_REDIRECT_URI =
  "https://mybodyscanapp.com/api/health/whoop/callback";

export const whoopClientIdParam = defineSecret("WHOOP_CLIENT_ID");
export const whoopClientSecretParam = defineSecret("WHOOP_CLIENT_SECRET");

/** Minimum read-only data needed for recovery-aware coaching. */
export const WHOOP_DEFAULT_SCOPES = [
  "offline",
  "read:recovery",
  "read:sleep",
  "read:cycles",
  "read:workout",
] as const;

export type WhoopReadiness = {
  configured: boolean;
  reason: "ready" | "missing_client_id" | "missing_client_secret";
};

export function getWhoopReadiness(
  env: NodeJS.ProcessEnv = process.env
): WhoopReadiness {
  if (!env.WHOOP_CLIENT_ID?.trim()) {
    return { configured: false, reason: "missing_client_id" };
  }
  if (!env.WHOOP_CLIENT_SECRET?.trim()) {
    return { configured: false, reason: "missing_client_secret" };
  }
  return { configured: true, reason: "ready" };
}

export function readWhoopServerConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} | null {
  const read = (
    param: ReturnType<typeof defineSecret>,
    envName: string
  ): string => {
    try {
      return String(param.value() || process.env[envName] || "").trim();
    } catch {
      return String(process.env[envName] || "").trim();
    }
  };
  const clientId = read(whoopClientIdParam, "WHOOP_CLIENT_ID");
  const clientSecret = read(whoopClientSecretParam, "WHOOP_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: WHOOP_REDIRECT_URI };
}

export function buildWhoopAuthorizationUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes?: readonly string[];
}): string {
  if (args.state.trim().length < 8) {
    throw new Error("whoop_state_too_short");
  }
  const url = new URL(WHOOP_AUTHORIZATION_URL);
  url.searchParams.set("client_id", args.clientId);
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    (args.scopes ?? WHOOP_DEFAULT_SCOPES).join(" ")
  );
  url.searchParams.set("state", args.state);
  return url.toString();
}

/**
 * Keep provider tokens server-side in a document denied by client rules. Never
 * expose a client secret or refresh token to the browser bundle.
 */
export type WhoopTokenRecord = {
  accessToken: string;
  refreshToken: string;
  expiresAtMs: number;
  scope: string;
  updatedAtMs: number;
};

export type WhoopDailyRecovery = {
  date: string;
  recoveryScore: number | null;
  restingHeartRate: number | null;
  hrvRmssdMs: number | null;
  source: "whoop";
};

export function normalizeWhoopRecovery(
  value: unknown,
  date: string
): WhoopDailyRecovery {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const score =
    source.score && typeof source.score === "object"
      ? (source.score as Record<string, unknown>)
      : {};
  const finite = (raw: unknown): number | null => {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  return {
    date,
    recoveryScore: finite(score.recovery_score),
    restingHeartRate: finite(score.resting_heart_rate),
    hrvRmssdMs: finite(score.hrv_rmssd_milli),
    source: "whoop",
  };
}
