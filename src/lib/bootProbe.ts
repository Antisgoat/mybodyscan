import { isWeb } from "./platform";

if (isWeb) {
  (async () => {
    try {
      const r = await fetch("/__/firebase/init.json", { cache: "no-store" });
      const j: any = await r.json().catch(() => ({}));
      const key = j?.apiKey;
      console.log("[boot] origin:", location.origin, "apiKey:", Boolean(key));
      if (key) {
        const url = `https://identitytoolkit.googleapis.com/v2/projects/mybodyscan-f3daf/config?key=${encodeURIComponent(
          key
        )}`;
        const r2 = await fetch(url, { mode: "cors" });
        console.log("[boot] IdentityToolkit:", r2.status);
        if (!r2.ok) console.warn("[boot] ITK non-200; key restrictions or API disabled.");
      } else {
        console.warn("[boot] No apiKey in init.json.");
      }
    } catch (e) {
      console.error("[boot] probe error:", e);
    }
  })();

  if ((import.meta as any)?.env?.DEV) {
    window.addEventListener("unhandledrejection", (e) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      console.error("[boot] unhandledrejection:", (e as any)?.reason ?? e);
    });
  }
}
