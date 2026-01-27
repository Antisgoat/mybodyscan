import { getFirebaseConfig } from "@/lib/firebase";
import { isIdentityToolkitProbeEnabled } from "@/lib/firebase/identityToolkitProbe";

export type IdentityToolkitProbeStatus = {
  status: "ok" | "warning" | "error";
  statusCode?: number;
  message?: string;
};

let warnedIdentityToolkit = false;
let lastIdentityToolkitProbe: IdentityToolkitProbeStatus | null = null;

const recordIdentityToolkitProbe = (probe: IdentityToolkitProbeStatus) => {
  lastIdentityToolkitProbe = probe;
  return probe;
};

export function getIdentityToolkitProbeStatus(): IdentityToolkitProbeStatus | null {
  return lastIdentityToolkitProbe;
}

export async function probeFirebaseRuntime(): Promise<{
  identityToolkit: IdentityToolkitProbeStatus | null;
}> {
  if (typeof window === "undefined")
    return { identityToolkit: lastIdentityToolkitProbe };

  if (!isIdentityToolkitProbeEnabled()) {
    if (!warnedIdentityToolkit && import.meta.env.DEV) {
      console.info("[probe] IdentityToolkit probe disabled for this build");
    }
    warnedIdentityToolkit = true;
    return {
      identityToolkit: recordIdentityToolkitProbe({
        status: "warning",
        message: "IdentityToolkit probe disabled for this build",
      }),
    };
  }

  const origin = window.location.origin;
  const keyFromRuntime = (async () => {
    try {
      const resp = await fetch("/__/firebase/init.json", { cache: "no-store" });
      if (!resp.ok) {
        console.warn("[probe] init.json fetch failed", resp.status);
        return { apiKey: undefined, projectId: undefined } as const;
      }
      const json = await resp.json();
      const { projectId, authDomain, apiKey } = json || {};
      console.log("[probe] runtime init.json:", {
        projectId,
        authDomain,
        apiKeyPresent: Boolean(apiKey),
      });
      const expected = getFirebaseConfig()?.projectId;
      if (expected && projectId && expected !== projectId) {
        console.warn(
          "[probe] build/runtime projectId mismatch:",
          expected,
          "vs",
          projectId
        );
      }
      return {
        apiKey: typeof apiKey === "string" ? apiKey : undefined,
        projectId: typeof projectId === "string" ? projectId : undefined,
      } as const;
    } catch (error) {
      console.warn("[probe] init.json fetch error:", error);
      return { apiKey: undefined, projectId: undefined } as const;
    }
  })();

  const identityToolkit = await (async () => {
    try {
      const { apiKey, projectId } = await keyFromRuntime;
      console.log(
        "[probe] origin:",
        origin,
        "apiKey present:",
        Boolean(apiKey)
      );
      if (!apiKey) {
        console.info(
          "[probe] IdentityToolkit probe skipped: no runtime apiKey"
        );
        return recordIdentityToolkitProbe({
          status: "warning",
          message: "IdentityToolkit probe skipped: missing runtime apiKey",
        });
      }

      const normalizedProjectId =
        projectId || getFirebaseConfig()?.projectId;
      if (!normalizedProjectId) {
        return recordIdentityToolkitProbe({
          status: "warning",
          message: "IdentityToolkit probe skipped: missing projectId",
        });
      }

      const url = `https://identitytoolkit.googleapis.com/v2/projects/${encodeURIComponent(
        normalizedProjectId
      )}/clientConfig?key=${encodeURIComponent(apiKey)}`;
      const resp = await fetch(url, { mode: "cors" }).catch((error) => {
        if (!warnedIdentityToolkit) {
          console.info("[probe] IdentityToolkit fetch error (network)", error);
          warnedIdentityToolkit = true;
        }
        return null as any;
      });

      if (!resp) {
        return recordIdentityToolkitProbe({
          status: "warning",
          message: "IdentityToolkit probe failed",
        });
      }

      if (resp.ok) {
        if (!warnedIdentityToolkit) {
          console.info("[probe] IdentityToolkit clientConfig ok", resp.status);
          warnedIdentityToolkit = true;
        }
        return recordIdentityToolkitProbe({
          status: "ok",
          statusCode: resp.status,
        });
      }

      const status = resp.status;
      const reason =
        status === 404
          ? "clientConfig not provisioned for this origin"
          : `clientConfig responded ${status}`;
      const level: IdentityToolkitProbeStatus["status"] =
        status === 404 || status === 403 ? "warning" : "error";
      const logFn = level === "warning" ? console.info : console.warn;
      if (!warnedIdentityToolkit) {
        logFn("[probe] IdentityToolkit clientConfig", { status, reason });
        warnedIdentityToolkit = true;
      }
      return recordIdentityToolkitProbe({
        status: level,
        statusCode: status,
        message: reason,
      });
    } catch (error) {
      if (!warnedIdentityToolkit) {
        console.info("[probe] IdentityToolkit fetch error", error);
        warnedIdentityToolkit = true;
      }
      return recordIdentityToolkitProbe({
        status: "warning",
        message: "IdentityToolkit probe error",
      });
    }
  })();

  return { identityToolkit };
}
