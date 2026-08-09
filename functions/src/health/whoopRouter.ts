import { createHash, randomBytes } from "node:crypto";
import type { Request, Response, Router } from "express";
import { Timestamp, getFirestore } from "../firebase.js";
import { requireAuth } from "../http.js";
import { requireProEntitlement } from "../lib/proEntitlements.js";
import {
  WHOOP_API_BASE_URL,
  WHOOP_DEFAULT_SCOPES,
  WHOOP_TOKEN_URL,
  buildWhoopAuthorizationUrl,
  normalizeWhoopRecovery,
  readWhoopServerConfig,
  type WhoopTokenRecord,
} from "./whoop.js";

const db = getFirestore();
const STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_REFRESH_SKEW_MS = 60 * 1000;
const WEB_RETURN_URL = "https://mybodyscanapp.com/settings/health";

type StoredWhoopToken = WhoopTokenRecord & {
  connectedAtMs: number;
  lastSyncedAtMs?: number;
};

type WhoopRecoveryCollection = {
  records?: Array<Record<string, unknown>>;
};

function stateHash(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

function tokenRef(uid: string) {
  return db.doc(`users/${uid}/serverHealth/whoop`);
}

function statusCode(error: unknown): number {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "";
  if (code.includes("unauthenticated")) return 401;
  if (code.includes("permission-denied")) return 403;
  return 500;
}

function sendError(res: Response, error: unknown, fallback: string): void {
  const status = statusCode(error);
  res.status(status).json({
    ok: false,
    code:
      status === 401
        ? "auth_required"
        : status === 403
          ? "subscription_required"
          : fallback,
    message:
      status === 401
        ? "Sign in to manage health connections."
        : status === 403
          ? "An active monthly or yearly plan is required."
          : "The health connection is temporarily unavailable.",
  });
}

function redirectResult(
  res: Response,
  result: "connected" | "error",
  code?: string
) {
  const target = new URL(WEB_RETURN_URL);
  target.searchParams.set("whoop", result);
  if (code) target.searchParams.set("reason", code);
  res.setHeader("Location", target.toString());
  res.status(302).end();
}

async function requestTokens(body: URLSearchParams): Promise<StoredWhoopToken> {
  const response = await fetch(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const accessToken =
    typeof payload.access_token === "string" ? payload.access_token : "";
  const refreshToken =
    typeof payload.refresh_token === "string" ? payload.refresh_token : "";
  const expiresIn = Number(payload.expires_in);
  if (
    !response.ok ||
    !accessToken ||
    !refreshToken ||
    !Number.isFinite(expiresIn)
  ) {
    console.warn("whoop_token_exchange_failed", { status: response.status });
    throw new Error("whoop_token_exchange_failed");
  }
  const now = Date.now();
  return {
    accessToken,
    refreshToken,
    expiresAtMs: now + Math.max(60, expiresIn) * 1000,
    scope: typeof payload.scope === "string" ? payload.scope : "",
    updatedAtMs: now,
    connectedAtMs: now,
  };
}

async function getFreshToken(uid: string): Promise<StoredWhoopToken | null> {
  const snap = await tokenRef(uid).get();
  if (!snap.exists) return null;
  const stored = snap.data() as StoredWhoopToken;
  if (
    typeof stored.accessToken !== "string" ||
    typeof stored.refreshToken !== "string"
  ) {
    return null;
  }
  if (Number(stored.expiresAtMs) > Date.now() + TOKEN_REFRESH_SKEW_MS) {
    return stored;
  }
  const config = readWhoopServerConfig();
  if (!config) throw new Error("whoop_not_configured");
  const refreshed = await requestTokens(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: stored.refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: "offline",
    })
  );
  refreshed.connectedAtMs = Number(stored.connectedAtMs) || Date.now();
  await tokenRef(uid).set(refreshed);
  return refreshed;
}

async function start(req: Request, res: Response) {
  try {
    const uid = await requireAuth(req);
    await requireProEntitlement(uid);
    const config = readWhoopServerConfig();
    if (!config) {
      res.status(503).json({
        ok: false,
        code: "whoop_not_configured",
        message: "WHOOP connection is not available yet.",
      });
      return;
    }
    const state = randomBytes(32).toString("base64url");
    const now = Date.now();
    await db.doc(`oauthStates/${stateHash(state)}`).set({
      provider: "whoop",
      uid,
      createdAt: Timestamp.now(),
      expiresAtMs: now + STATE_TTL_MS,
    });
    res.status(200).json({
      ok: true,
      authorizationUrl: buildWhoopAuthorizationUrl({
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        state,
      }),
    });
  } catch (error) {
    sendError(res, error, "whoop_start_failed");
  }
}

async function callback(req: Request, res: Response) {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const providerError =
    typeof req.query.error === "string" ? req.query.error : "";
  if (providerError || !code || state.length < 8) {
    redirectResult(res, "error", providerError || "invalid_callback");
    return;
  }
  try {
    const config = readWhoopServerConfig();
    if (!config) throw new Error("whoop_not_configured");
    const ref = db.doc(`oauthStates/${stateHash(state)}`);
    const uid = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const data = snap.data();
      transaction.delete(ref);
      if (
        !snap.exists ||
        data?.provider !== "whoop" ||
        typeof data?.uid !== "string" ||
        Number(data?.expiresAtMs) < Date.now()
      ) {
        throw new Error("invalid_or_expired_state");
      }
      return data.uid as string;
    });
    const tokens = await requestTokens(
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
      })
    );
    await tokenRef(uid).set(tokens);
    redirectResult(res, "connected");
  } catch (error) {
    console.warn("whoop_callback_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    redirectResult(res, "error", "connection_failed");
  }
}

async function status(req: Request, res: Response) {
  try {
    const uid = await requireAuth(req);
    const configured = Boolean(readWhoopServerConfig());
    const snap = configured ? await tokenRef(uid).get() : null;
    const data = snap?.data() as StoredWhoopToken | undefined;
    res.status(200).json({
      ok: true,
      configured,
      connected: Boolean(configured && snap?.exists && data?.refreshToken),
      connectedAtMs: Number(data?.connectedAtMs) || null,
      lastSyncedAtMs: Number(data?.lastSyncedAtMs) || null,
    });
  } catch (error) {
    sendError(res, error, "whoop_status_failed");
  }
}

async function sync(req: Request, res: Response) {
  try {
    const uid = await requireAuth(req);
    await requireProEntitlement(uid);
    const token = await getFreshToken(uid);
    if (!token) {
      res.status(409).json({
        ok: false,
        code: "whoop_not_connected",
        message: "Connect WHOOP before syncing recovery data.",
      });
      return;
    }
    const response = await fetch(`${WHOOP_API_BASE_URL}/recovery?limit=1`, {
      headers: { authorization: `Bearer ${token.accessToken}` },
    });
    const payload = (await response
      .json()
      .catch(() => ({}))) as WhoopRecoveryCollection;
    if (!response.ok) {
      console.warn("whoop_recovery_sync_failed", { status: response.status });
      throw new Error("whoop_recovery_sync_failed");
    }
    const record = Array.isArray(payload.records) ? payload.records[0] : null;
    const rawDate = String(record?.updated_at || record?.created_at || "");
    const date = /^\d{4}-\d{2}-\d{2}/.test(rawDate)
      ? rawDate.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const recovery = record ? normalizeWhoopRecovery(record, date) : null;
    const now = Date.now();
    if (recovery) {
      await db.doc(`users/${uid}/healthDaily/${date}`).set(
        {
          whoop: recovery,
          whoopSyncedAt: Timestamp.now(),
        },
        { merge: true }
      );
    }
    await tokenRef(uid).set({ lastSyncedAtMs: now }, { merge: true });
    res.status(200).json({ ok: true, recovery, lastSyncedAtMs: now });
  } catch (error) {
    sendError(res, error, "whoop_sync_failed");
  }
}

async function disconnect(req: Request, res: Response) {
  try {
    const uid = await requireAuth(req);
    const token = await getFreshToken(uid);
    if (token?.accessToken) {
      const revoke = await fetch(`${WHOOP_API_BASE_URL}/user/access`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token.accessToken}` },
      });
      if (!revoke.ok && revoke.status !== 401) {
        res.status(502).json({
          ok: false,
          code: "whoop_revoke_failed",
          message: "WHOOP could not be disconnected. Please try again.",
        });
        return;
      }
    }
    await tokenRef(uid).delete();
    res.status(200).json({ ok: true, connected: false });
  } catch (error) {
    sendError(res, error, "whoop_disconnect_failed");
  }
}

/** Best-effort provider revocation followed by unconditional local deletion. */
export async function deleteWhoopDataForAccount(uid: string): Promise<void> {
  try {
    const token = await getFreshToken(uid);
    if (token?.accessToken) {
      const revoke = await fetch(`${WHOOP_API_BASE_URL}/user/access`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token.accessToken}` },
      });
      if (!revoke.ok && revoke.status !== 401) {
        console.warn("whoop_account_delete_revoke_failed", {
          uid,
          status: revoke.status,
        });
      }
    }
  } catch (error) {
    console.warn("whoop_account_delete_revoke_failed", {
      uid,
      message: error instanceof Error ? error.message : "unknown",
    });
  }
  await tokenRef(uid)
    .delete()
    .catch(() => undefined);
  const states = await db
    .collection("oauthStates")
    .where("uid", "==", uid)
    .get();
  await Promise.all(states.docs.map((state) => state.ref.delete()));
}

export function registerWhoopRoutes(router: Router): void {
  router.post("/health/whoop/start", start);
  router.get("/health/whoop/callback", callback);
  router.get("/health/whoop/status", status);
  router.post("/health/whoop/sync", sync);
  router.post("/health/whoop/disconnect", disconnect);
}

export const whoopRouterInternals = {
  stateHash,
};
