import nativeSecurityPolicy from "../../config/native-security-policy.json";

const NATIVE_ALLOWED_NETWORK_HOST_PATTERNS =
  nativeSecurityPolicy.nativeAllowedNetworkHosts;

export const NATIVE_ALLOWED_NETWORK_HOSTS = [
  ...NATIVE_ALLOWED_NETWORK_HOST_PATTERNS,
];

function hostMatchesPattern(host: string, pattern: string): boolean {
  if (!host || !pattern) return false;
  const normalizedHost = host.toLowerCase();
  const normalizedPattern = pattern.toLowerCase();
  if (normalizedPattern.startsWith("*.")) {
    const suffix = normalizedPattern.slice(2);
    return normalizedHost === suffix || normalizedHost.endsWith(`.${suffix}`);
  }
  return normalizedHost === normalizedPattern;
}

export function isAllowedNativeNetworkUrl(input: string, base?: string): boolean {
  if (!input) return false;
  try {
    const url = new URL(input, base);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return true;
    }
    if (url.protocol === "http:") {
      return url.hostname === "localhost" || url.hostname === "127.0.0.1";
    }
    if (url.origin === "capacitor://localhost") {
      return true;
    }
    return NATIVE_ALLOWED_NETWORK_HOST_PATTERNS.some((pattern) =>
      hostMatchesPattern(url.hostname, pattern)
    );
  } catch {
    return false;
  }
}

export function createNativePolicyBlockedError(url: string): Error & {
  code: string;
  blockedUrl: string;
  blockedBy: string;
} {
  const error = new Error(
    `Blocked by native security policy: ${url} is not on the native network allowlist.`
  ) as Error & {
    code: string;
    blockedUrl: string;
    blockedBy: string;
  };
  error.code = "native/policy-blocked";
  error.blockedBy = "network-allowlist";
  error.blockedUrl = url;
  return error;
}

export function isPolicyBlockedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";
  return (
    code === "native/policy-blocked" ||
    message.toLowerCase().includes("blocked by native security policy")
  );
}
