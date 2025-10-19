export async function probeFirebaseRuntime() {
  try {
    const resp = await fetch("/__/firebase/init.json", { cache: "no-store" });
    if (!resp.ok) throw new Error(`init.json HTTP ${resp.status}`);
    const json = await resp.json();
    const { projectId, authDomain, apiKey } = json || {};
    console.log("[firebase] runtime init.json:", { projectId, authDomain, apiKey });
    const expected = import.meta.env.VITE_FIREBASE_PROJECT_ID;
    if (expected && projectId && expected !== projectId) {
      console.warn("[firebase] MISMATCH: build projectId =", expected, "runtime projectId =", projectId);
    }
    return { projectId, authDomain, apiKey };
  } catch (e) {
    console.warn("[firebase] failed to fetch runtime init.json", e);
    return null;
  }
}
