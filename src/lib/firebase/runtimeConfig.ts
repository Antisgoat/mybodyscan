export function probeFirebaseRuntime() {
  if (typeof window === "undefined") return;

  const origin = window.location.origin;
  const keyFromRuntime = (async () => {
    try {
      const resp = await fetch("/__/firebase/init.json", { cache: "no-store" });
      if (!resp.ok) {
        console.warn("[probe] init.json fetch failed", resp.status);
        return undefined;
      }
      const json = await resp.json();
      const { projectId, authDomain, apiKey } = json || {};
      console.log("[probe] runtime init.json:", {
        projectId,
        authDomain,
        apiKeyPresent: Boolean(apiKey),
      });
      const expected = import.meta.env.VITE_FIREBASE_PROJECT_ID;
      if (expected && projectId && expected !== projectId) {
        console.warn(
          "[probe] build/runtime projectId mismatch:",
          expected,
          "vs",
          projectId,
        );
      }
      return typeof apiKey === "string" ? apiKey : undefined;
    } catch (error) {
      console.warn("[probe] init.json fetch error:", error);
      return undefined;
    }
  })();

  void (async () => {
    const apiKey = await keyFromRuntime;
    console.log("[probe] origin:", origin, "apiKey present:", Boolean(apiKey));
    if (!apiKey) {
      console.warn("[probe] No runtime apiKey. Check Hosting and /__/firebase/init.json.");
      return;
    }

    const url = `https://identitytoolkit.googleapis.com/v2/projects/mybodyscan-f3daf/clientConfig?key=${apiKey}`;
    try {
      const resp = await fetch(url, { mode: "cors" });
      console.log("[probe] IdentityToolkit status:", resp.status);
      if (!resp.ok) {
        console.warn(
          "[probe] IdentityToolkit not reachable. If status is 404/CORS, the Web API key restrictions are blocking this origin:",
          origin,
        );
      }
    } catch (error) {
      console.warn("[probe] IdentityToolkit fetch error:", error);
    }
  })();
}
