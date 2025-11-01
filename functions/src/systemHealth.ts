import type { Request, Response } from "express";
import { onRequest } from "firebase-functions/v2/https";

import { getAuth } from "./firebase.js";
import { getEnv, getAppCheckMode, getHostBaseUrl } from "./lib/env.js";
import { HttpError, send } from "./util/http.js";
import { getOpenAIKey, openAiSecretParam } from "./openai/keys.js";
import {
  getStripeKey,
  legacyStripeWebhookParam,
  stripeSecretKeyParam,
  stripeSecretParam,
  stripeWebhookSecretParam,
} from "./stripe/keys.js";

type IdentityToolkitResult = {
  reachable: boolean;
  reason?: string;
};

type AuthProviderStatus =
  | {
      google: boolean;
      apple: boolean;
      email: boolean;
      unknown?: false;
    }
  | {
      unknown: true;
    };

function extractClientKey(req: Request): string | undefined {
  const queryKey = typeof req.query?.clientKey === "string" ? req.query.clientKey : undefined;
  if (queryKey && queryKey.trim()) {
    return queryKey.trim();
  }
  const headerKey = req.get("x-client-key") || req.get("X-Client-Key") || "";
  if (headerKey && headerKey.trim()) {
    return headerKey.trim();
  }
  if (req.method === "POST" && typeof req.body === "object" && req.body !== null) {
    const bodyKey = (req.body as Record<string, unknown>).clientKey;
    if (typeof bodyKey === "string" && bodyKey.trim()) {
      return bodyKey.trim();
    }
  }
  return undefined;
}

function resolveClientKey(req: Request): string | undefined {
  const envCandidates = [
    getEnv("CLIENT_FIREBASE_API_KEY"),
    getEnv("FIREBASE_API_KEY"),
    getEnv("WEB_API_KEY"),
    getEnv("VITE_FIREBASE_API_KEY"),
  ];

  for (const candidate of envCandidates) {
    if (candidate && candidate.trim()) {
      return candidate.trim();
    }
  }

  return extractClientKey(req);
}

function resolveProjectId(): string | undefined {
  const candidates = [
    process.env.GCLOUD_PROJECT,
    process.env.GCP_PROJECT,
    process.env.PROJECT_ID,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  const firebaseConfig = process.env.FIREBASE_CONFIG;
  if (firebaseConfig) {
    try {
      const parsed = JSON.parse(firebaseConfig) as { projectId?: string; project_id?: string };
      const id = parsed.projectId || parsed.project_id;
      if (typeof id === "string" && id.trim()) {
        return id.trim();
      }
    } catch {
      // ignore malformed config
    }
  }

  return undefined;
}

async function checkIdentityToolkit(projectId: string | undefined, clientKey: string | undefined): Promise<IdentityToolkitResult> {
  if (!projectId) {
    return { reachable: false, reason: "no_project_id" };
  }
  if (!clientKey) {
    return { reachable: false, reason: "no_client_key" };
  }

  const url = `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/config?key=${encodeURIComponent(clientKey)}`;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });

    if (response.ok) {
      return { reachable: true };
    }

    return { reachable: false, reason: `status_${response.status}` };
  } catch (error) {
    const message = error instanceof Error ? error.name : "unknown";
    return { reachable: false, reason: message === "AbortError" ? "timeout" : "network_error" };
  }
}

async function fetchAuthProviders(): Promise<AuthProviderStatus> {
  try {
    const manager = getAuth().projectConfigManager();
    const config = await manager.getProjectConfig();
    const json = config.toJSON() as Record<string, unknown>;

    const signIn = (json?.signIn ?? {}) as Record<string, unknown>;
    const providerSettings = Array.isArray(signIn?.providerSettings) ? (signIn.providerSettings as Array<Record<string, unknown>>) : [];

    const findProvider = (id: string): boolean => {
      const entry = providerSettings.find((setting) => {
        const providerId = (setting.providerId ?? setting.provider) as string | undefined;
        return typeof providerId === "string" && providerId.toLowerCase() === id;
      });
      if (!entry) return false;
      if (typeof entry.enabled === "boolean") return entry.enabled;
      if (typeof entry.status === "string") {
        return entry.status.toLowerCase() === "enabled";
      }
      return true;
    };

    const emailConfig = (signIn?.email ?? {}) as { enabled?: boolean };

    return {
      google: findProvider("google.com"),
      apple: findProvider("apple.com"),
      email: Boolean(emailConfig?.enabled),
    };
  } catch (error) {
    console.warn("systemHealth.authProviders_error", {
      message: error instanceof Error ? error.message : String(error),
    });
    return { unknown: true };
  }
}

function normalizeClientProviders(candidate: unknown): AuthProviderStatus | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  const google = typeof record.google === "boolean" ? record.google : undefined;
  const apple = typeof record.apple === "boolean" ? record.apple : undefined;
  const email = typeof record.email === "boolean" ? record.email : undefined;

  if (google === undefined || apple === undefined || email === undefined) {
    return null;
  }

  return { google, apple, email };
}

function resolveAppCheckMode(): "disabled" | "soft" | "strict" {
  return getAppCheckMode();
}

export const systemHealth = onRequest(
  {
    region: "us-central1",
    secrets: [openAiSecretParam, stripeSecretParam, stripeSecretKeyParam, stripeWebhookSecretParam, legacyStripeWebhookParam],
  },
  async (req: Request, res: Response) => {
    if (req.method === "OPTIONS") {
      send(res, 204, null);
      return;
    }

    try {
      if (req.method !== "GET" && req.method !== "POST") {
        throw new HttpError(405, "method_not_allowed");
      }

      let stripeSecretPresent = false;
      try {
        getStripeKey();
        stripeSecretPresent = true;
      } catch (error) {
        if (!(error && typeof error === "object" && (error as { code?: string }).code === "payments_disabled")) {
          console.warn("systemHealth.stripe_secret_check_failed", {
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      let openaiKeyPresent = false;
      try {
        getOpenAIKey();
        openaiKeyPresent = true;
      } catch (error) {
        if (!(error && typeof error === "object" && (error as { code?: string }).code === "openai_missing_key")) {
          console.warn("systemHealth.openai_key_check_failed", {
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const clientKey = resolveClientKey(req);
      const projectId = resolveProjectId();
      const identityToolkit = await checkIdentityToolkit(projectId, clientKey);
      let authProviders = await fetchAuthProviders();

      if (authProviders.unknown && req.method === "POST" && req.body && typeof req.body === "object") {
        const body = req.body as Record<string, unknown>;
        const clientProvided = normalizeClientProviders(body.authProviders ?? body.providers);
        if (clientProvided) {
          authProviders = clientProvided;
        }
      }

      const hostCandidate = getHostBaseUrl() || req.get("origin") || req.get("Origin") || req.get("host") || null;
      const host = typeof hostCandidate === "string" && hostCandidate.trim().length ? hostCandidate.trim() : null;

      const payload: Record<string, unknown> = {
        stripeSecretPresent,
        openaiKeyPresent,
        identityToolkitReachable: identityToolkit.reachable,
        appCheckMode: resolveAppCheckMode(),
        host,
        timestamp: new Date().toISOString(),
        authProviders,
      };

      if (identityToolkit.reason) {
        payload.identityToolkitReason = identityToolkit.reason;
      }

      send(res, 200, payload);
    } catch (error) {
      handleSystemHealthError(res, error);
    }
  },
);

function handleSystemHealthError(res: Response, error: unknown): void {
  if (error instanceof HttpError) {
    send(res, error.status, { error: error.code });
    return;
  }

  console.error("systemHealth_unhandled", {
    message: error instanceof Error ? error.message : String(error),
  });
  send(res, 500, { error: "internal_error" });
}
