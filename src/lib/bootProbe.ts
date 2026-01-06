import { isWeb } from "./platform";
import { BUILD } from "./buildInfo";
import {
  DEMO_ENABLED,
  SHOW_APPLE_WEB,
  SW_ENABLED,
  APPCHECK_SITE_KEY,
} from "./flags";
import { getFirebaseAuthRuntime } from "./firebase";

if (isWeb()) {
  (async () => {
    const origin =
      typeof location !== "undefined" && location?.origin
        ? location.origin
        : "(unknown)";
    const authRuntime = getFirebaseAuthRuntime();
    const key = (import.meta.env.VITE_FIREBASE_API_KEY || "").trim();
    const apiKeyPresent = Boolean(key);
    let identityToolkitReachable: boolean | null = null;
    let identityToolkitReason: string | undefined;
    let stripeSecretPresent: boolean | null = null;
    let openaiKeyPresent: boolean | null = null;
    let appCheckMode: string | undefined;

    try {
      const params = new URLSearchParams();
      if (key) params.set("clientKey", key);
      const response = await fetch(
        `/systemHealth${params.size ? `?${params.toString()}` : ""}`,
        {
          cache: "no-store",
        }
      );
      if (response.ok) {
        const payload = (await response.json().catch(() => null)) as any;
        if (payload) {
          identityToolkitReachable = Boolean(payload.identityToolkitReachable);
          identityToolkitReason = payload.identityToolkitReason;
          stripeSecretPresent =
            typeof payload.stripeSecretPresent === "boolean"
              ? payload.stripeSecretPresent
              : null;
          openaiKeyPresent =
            typeof payload.openaiKeyPresent === "boolean"
              ? payload.openaiKeyPresent
              : null;
          appCheckMode =
            typeof payload.appCheck === "string" ? payload.appCheck : undefined;
        }
      } else if (import.meta.env.DEV) {
        console.warn("[boot] systemHealth request failed", response.status);
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn("[boot] systemHealth probe error", error);
      }
    }

    try {
      console.log("[boot] summary:", {
        origin,
        platform: {
          nativeAuth: authRuntime.mode === "native",
          authMode: authRuntime.mode,
          authPersistence: authRuntime.persistence,
        },
        apiKey: apiKeyPresent,
        identityToolkit: {
          reachable: identityToolkitReachable,
          reason: identityToolkitReason,
        },
        stripe: stripeSecretPresent,
        openai: openaiKeyPresent,
        appCheck: appCheckMode,
        flags: {
          demo: DEMO_ENABLED,
          appleWeb: SHOW_APPLE_WEB,
          sw: SW_ENABLED,
          appCheckKey: Boolean(APPCHECK_SITE_KEY),
        },
        build: {
          commit: BUILD.commit || "",
          branch: BUILD.branch || "",
          time: BUILD.builtAt || "",
          version: BUILD.version || "",
        },
      });

      try {
        window.dispatchEvent(
          new CustomEvent("mbs:boot", {
            detail: {
              apiKey: apiKeyPresent,
              identityToolkit: identityToolkitReachable,
              identityToolkitReason,
              stripeSecretPresent,
              openaiKeyPresent,
            },
          })
        );
      } catch {
        /* empty */
      }
    } catch {
      // ignore summary logging errors
    }
  })();

  if ((import.meta as any)?.env?.DEV && typeof window !== "undefined") {
    window.addEventListener("unhandledrejection", (e) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any,no-console
      console.error("[boot] unhandledrejection:", (e as any)?.reason ?? e);
    });
  }
}
