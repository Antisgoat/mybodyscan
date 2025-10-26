import { isWeb } from "./platform";
import { BUILD } from "./buildInfo";
import { DEMO_ENABLED, SHOW_APPLE_WEB, SW_ENABLED, APPCHECK_SITE_KEY } from "./flags";

if (isWeb) {
  (async () => {
    let apiKeyPresent = false;
    let itkStatus = 0;

    try {
      const r = await fetch("/__/firebase/init.json", { cache: "no-store" });
      const j: any = await r.json().catch(() => ({}));
      const key = j?.apiKey;
      apiKeyPresent = Boolean(key);
      console.log("[boot] origin:", location.origin, "apiKey:", apiKeyPresent);

      if (key) {
        try {
          const url = `https://identitytoolkit.googleapis.com/v2/projects/mybodyscan-f3daf/config?key=${encodeURIComponent(key)}`;
          const r2 = await fetch(url, { mode: "cors" });
          itkStatus = r2.status;
          console.log("[boot] IdentityToolkit:", r2.status);
          if (!r2.ok) console.warn("[boot] ITK non-200; key restrictions or API disabled.");
        } catch (e) {
          console.warn("[boot] ITK probe failed:", e);
        }
      } else {
        console.warn("[boot] No apiKey in init.json.");
      }
    } catch (e) {
      console.error("[boot] probe error:", e);
    }

    try {
      console.log("[boot] summary:", {
        origin: location.origin,
        apiKey: apiKeyPresent,
        itk: itkStatus || null,
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
            detail: { apiKey: apiKeyPresent, itk: itkStatus || 0 },
          }),
        );
      } catch {
        /* empty */
      }
    } catch {
      // ignore summary logging errors
    }
  })();

  if ((import.meta as any)?.env?.DEV) {
    window.addEventListener("unhandledrejection", (e) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any,no-console
      console.error("[boot] unhandledrejection:", (e as any)?.reason ?? e);
    });
  }
}
