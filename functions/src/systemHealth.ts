import type { Request, Response } from "express";
import { onRequest } from "firebase-functions/v2/https";

import { getAuth } from "./firebase.js";
import { getEnv, getEnvBool } from "./lib/env.js";
import { getOpenAIKey } from "./openai/client.js";
import { getStripeKey } from "./stripe/config.js";
import { HttpError, send } from "./util/http.js";

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

async function checkIdentityToolkit(clientKey: string | undefined): Promise<IdentityToolkitResult> {
  if (!clientKey) {
    return { reachable: false, reason: "no_client_key" };
  }

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(clientKey)}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnSecureToken: false, email: "healthcheck@example.com" }),
      signal: AbortSignal.timeout(5000),
    });

    if (response.status < 500) {
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

function resolveAppCheck(): "disabled" | "soft" | "strict" {
  const raw = getEnv("APP_CHECK_ENFORCE_SOFT");
  if (raw === undefined) {
    return "disabled";
  }
  return getEnvBool("APP_CHECK_ENFORCE_SOFT", true) ? "soft" : "strict";
}

export const systemHealth = onRequest({ region: "us-central1" }, async (req: Request, res: Response) => {
  if (req.method === "OPTIONS") {
    send(res, 204, null);
    return;
  }

  try {
    if (req.method !== "GET" && req.method !== "POST") {
      throw new HttpError(405, "method_not_allowed");
    }

    const stripeKey = getStripeKey();
    const openAiKey = getOpenAIKey();
    const identityToolkit = await checkIdentityToolkit(extractClientKey(req));
    const authProviders = await fetchAuthProviders();
    const appCheck = resolveAppCheck();

    const payload: Record<string, unknown> = {
      stripeSecretPresent: Boolean(stripeKey.present && stripeKey.value),
      openaiKeyPresent: Boolean(openAiKey.present && openAiKey.value),
      identityToolkitReachable: identityToolkit.reachable,
      authProviders,
      appCheck,
    };

    if (identityToolkit.reason) {
      payload.identityToolkitReason = identityToolkit.reason;
    }

    send(res, 200, payload);
  } catch (error) {
    handleSystemHealthError(res, error);
  }
});

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
