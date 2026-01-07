import { getFirebaseConfig } from "@/lib/firebase";
import { isIdentityToolkitProbeEnabled } from "@/lib/firebase/identityToolkitProbe";
import type { IdentityToolkitProbeStatus } from "@/lib/firebase/runtimeConfig";

const AUTH_CONFIG_ENDPOINT = "https://identitytoolkit.googleapis.com/v2";
/**
 * Firebase Auth only serves client config to origins present in the project's Authorized domains list.
 * Keep https://mybodyscan-f3daf.web.app and https://mybodyscanapp.com published there or the fetch below will 404.
 */

export type FirebaseAuthClientConfig = {
  authorizedDomains: string[];
  providerIds: string[];
};

let cachedConfigPromise: Promise<FirebaseAuthClientConfig> | null = null;
let lastClientConfigProbe: IdentityToolkitProbeStatus | null = null;
let warned = false;

function parseAuthorizedDomains(payload: any): string[] {
  if (!payload) return [];
  const domains = payload.authorizedDomains;
  if (Array.isArray(domains)) {
    return domains.filter(
      (domain): domain is string =>
        typeof domain === "string" && domain.length > 0
    );
  }
  return [];
}

function coerceProviderId(candidate: any): string | null {
  if (!candidate) return null;
  if (typeof candidate === "string") return candidate;
  if (typeof candidate !== "object") return null;
  return (
    candidate.providerId ||
    candidate.provider ||
    candidate.id ||
    candidate.identifier ||
    candidate.providerIdForDisplay ||
    null
  );
}

function providerConfigIsEnabled(candidate: any): boolean {
  if (!candidate || typeof candidate !== "object") return true;
  if ("enabled" in candidate && candidate.enabled === false) return false;
  if ("enable" in candidate && candidate.enable === false) return false;
  if ("isEnabled" in candidate && candidate.isEnabled === false) return false;
  if ("disabled" in candidate && candidate.disabled === true) return false;
  return true;
}

function parseProviders(payload: any): string[] {
  const ids = new Set<string>();
  if (!payload) return Array.from(ids);

  const maybeArrays = [
    payload.providerConfigs,
    payload.signInMethodConfigs,
    payload.signIn?.providers,
    payload.signIn?.providerConfigs,
    payload.signIn?.oauthProviders,
    payload.signIn?.federatedSignInConfigs,
    payload.signIn?.federated?.providers,
    payload.oauthIdpConfigs,
    payload.federatedProviderConfigs,
  ];

  for (const source of maybeArrays) {
    if (!source) continue;
    if (Array.isArray(source)) {
      for (const entry of source) {
        const id = coerceProviderId(entry);
        if (!id) continue;
        if (!providerConfigIsEnabled(entry)) continue;
        ids.add(id);
      }
      continue;
    }
    if (typeof source === "object") {
      for (const [key, entry] of Object.entries(source)) {
        const id = coerceProviderId(entry) ?? key;
        if (!id) continue;
        if (!providerConfigIsEnabled(entry)) continue;
        ids.add(id);
      }
    }
  }

  const appleFlags = [
    payload.appleSignInConfig?.enabled,
    payload.signIn?.apple?.enabled,
    payload.signIn?.apple,
    payload.appleSignIn,
  ];
  if (appleFlags.some((flag) => flag === true)) {
    ids.add("apple.com");
  }

  return Array.from(ids);
}

function withEnvFallback(
  config: FirebaseAuthClientConfig
): FirebaseAuthClientConfig {
  const rawEnv = (import.meta.env.VITE_ENABLE_APPLE ??
    import.meta.env.VITE_APPLE_ENABLED) as string | undefined;
  const normalized =
    typeof rawEnv === "string" ? rawEnv.trim().toLowerCase() : undefined;
  const forceOn =
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes" ||
    normalized === "on";
  const forceOff =
    normalized === "false" || normalized === "0" || normalized === "off";

  if (forceOn && !config.providerIds.includes("apple.com")) {
    config.providerIds = [...config.providerIds, "apple.com"];
  }
  if (forceOff) {
    config.providerIds = config.providerIds.filter((id) => id !== "apple.com");
  }
  return config;
}

export function getLastFirebaseAuthClientProbe(): IdentityToolkitProbeStatus | null {
  return lastClientConfigProbe;
}

export async function loadFirebaseAuthClientConfig(): Promise<FirebaseAuthClientConfig> {
  if (cachedConfigPromise) return cachedConfigPromise;

  if (typeof window === "undefined") {
    cachedConfigPromise = Promise.resolve(
      withEnvFallback({ authorizedDomains: [], providerIds: [] })
    );
    return cachedConfigPromise;
  }

  const runtimeConfig = getFirebaseConfig();

  const apiKey = runtimeConfig.apiKey;
  const projectId = runtimeConfig.projectId;

  if (!apiKey || !projectId) {
    lastClientConfigProbe = {
      status: "warning",
      message:
        "Missing apiKey or projectId; IdentityToolkit clientConfig probe skipped",
    };
    cachedConfigPromise = Promise.resolve(
      withEnvFallback({ authorizedDomains: [], providerIds: [] })
    );
    return cachedConfigPromise;
  }

  if (!isIdentityToolkitProbeEnabled()) {
    lastClientConfigProbe = {
      status: "warning",
      message: "IdentityToolkit clientConfig probe disabled in this build",
    };
    cachedConfigPromise = Promise.resolve(
      withEnvFallback({ authorizedDomains: [], providerIds: [] })
    );
    return cachedConfigPromise;
  }

  const url = `${AUTH_CONFIG_ENDPOINT}/projects/${encodeURIComponent(projectId)}/clientConfig?key=${encodeURIComponent(apiKey)}`;

  cachedConfigPromise = (async () => {
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res) {
        throw new Error(
          "IdentityToolkit clientConfig returned an empty response"
        );
      }
      if (!res.ok) {
        const status = res.status;
        const reason =
          status === 404
            ? "clientConfig not provisioned for this origin"
            : status === 403
              ? "clientConfig blocked (403)"
              : `clientConfig responded ${status}`;
        lastClientConfigProbe = {
          status: status === 404 || status === 403 ? "warning" : "error",
          statusCode: status,
          message: reason,
        };
        const logFn =
          status === 404 || status === 403 ? console.info : console.warn;
        if (!warned) {
          logFn("[probe] IdentityToolkit clientConfig", { status, reason });
          warned = true;
        }
        return withEnvFallback({ authorizedDomains: [], providerIds: [] });
      }
      const payload = await res.json().catch(
        () =>
          ({
            authorizedDomains: [],
            providerIds: [],
          }) as FirebaseAuthClientConfig
      );
      const authorizedDomains = parseAuthorizedDomains(payload);
      const providerIds = parseProviders(payload);
      lastClientConfigProbe = { status: "ok", statusCode: res.status };
      return withEnvFallback({ authorizedDomains, providerIds });
    } catch (err) {
      if (!warned) {
        console.info("[probe] IdentityToolkit fetch error", err);
        warned = true;
      }
      lastClientConfigProbe = {
        status: "warning",
        message: "IdentityToolkit clientConfig fetch failed",
      };
      // NOTE: IdentityToolkit returns 404 when the current origin isn't in Firebase Auth's
      // authorized domains list. This must be fixed in the Firebase console, not here.
      return withEnvFallback({ authorizedDomains: [], providerIds: [] });
    }
  })();

  return cachedConfigPromise;
}

function domainMatches(host: string, domain: string): boolean {
  const trimmed = domain.trim().toLowerCase();
  if (!trimmed) return false;
  const hostLower = host.toLowerCase();
  if (hostLower === trimmed) return true;
  if (hostLower.endsWith(`.${trimmed}`)) return true;
  return false;
}

export function warnIfDomainUnauthorized(): void {
  if (!import.meta.env.DEV) return;
  if (typeof window === "undefined") return;

  void loadFirebaseAuthClientConfig().then((config) => {
    if (!config.authorizedDomains.length) return;
    const host = window.location.hostname;
    const isAuthorized = config.authorizedDomains.some((domain) =>
      domainMatches(host, domain)
    );
    if (!isAuthorized) {
      console.warn(
        `[auth] ${window.location.origin} is not in your Firebase authorized domains. Add it via Firebase Console → Auth → Settings → Authorized domains.`
      );
    }
  });
}

export function isProviderEnabled(
  providerId: string,
  config: FirebaseAuthClientConfig
): boolean {
  return config.providerIds.includes(providerId);
}
