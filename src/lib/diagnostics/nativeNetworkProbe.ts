import { getFirebaseConfig } from "@/lib/firebase";
import { functionsBaseUrl, functionsOrigin, functionsRegion } from "@/lib/env";

export type NetworkProbeTarget = {
  id: string;
  label: string;
  url: string;
};

export type NetworkProbeResult = NetworkProbeTarget & {
  ok: boolean;
  status?: number;
  error?: string;
};

const PROBE_TIMEOUT_MS = 4_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  if (ms <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error("probe_timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function normalizeOrigin(input: string): string | null {
  try {
    const url = new URL(input);
    return url.origin;
  } catch {
    return null;
  }
}

function addCacheBust(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("cacheBust", String(Date.now()));
    return parsed.toString();
  } catch {
    return `${url}${url.includes("?") ? "&" : "?"}cacheBust=${Date.now()}`;
  }
}

export function getNetworkProbeTargets(): NetworkProbeTarget[] {
  const config = getFirebaseConfig();
  const projectId = String(config.projectId || "").trim();
  const targets: NetworkProbeTarget[] = [
    {
      id: "identitytoolkit",
      label: "IdentityToolkit",
      url: "https://identitytoolkit.googleapis.com",
    },
    {
      id: "securetoken",
      label: "SecureToken",
      url: "https://securetoken.googleapis.com",
    },
  ];

  if (projectId) {
    targets.push({
      id: "firestore",
      label: "Firestore",
      url: `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
        projectId
      )}/databases/(default)/documents`,
    });
  } else {
    targets.push({
      id: "firestore",
      label: "Firestore",
      url: "https://firestore.googleapis.com",
    });
  }

  const originCandidate =
    normalizeOrigin(functionsOrigin || "") ||
    normalizeOrigin(functionsBaseUrl || "") ||
    (projectId
      ? `https://${functionsRegion}-${projectId}.cloudfunctions.net`
      : null);

  if (originCandidate) {
    targets.push({
      id: "functions",
      label: "Functions",
      url: originCandidate,
    });
  }

  return targets;
}

export async function runNetworkProbe(): Promise<NetworkProbeResult[]> {
  const targets = getNetworkProbeTargets();
  const results: NetworkProbeResult[] = [];

  for (const target of targets) {
    try {
      const response = await withTimeout(
        fetch(addCacheBust(target.url), { cache: "no-store" }),
        PROBE_TIMEOUT_MS
      );
      results.push({
        ...target,
        ok: true,
        status: response.status,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Network probe failed";
      results.push({
        ...target,
        ok: false,
        error: message,
      });
    }
  }

  return results;
}
