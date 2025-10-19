export async function probeFirebaseRuntime(): Promise<{ projectId?: string; apiKey?: string; authDomain?: string } | null> {
  try {
    const resp = await fetch("/__/firebase/init.json", { cache: "no-store" });
    if (!resp.ok) throw new Error(`init.json HTTP ${resp.status}`);
    const json = (await resp.json()) as { projectId?: string; apiKey?: string; authDomain?: string };
    const projectId = json?.projectId;
    const apiKey = json?.apiKey;
    const authDomain = json?.authDomain;
    console.log("[firebase] runtime init.json:", { projectId, authDomain, apiKey });
    const expected = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;
    if (expected && projectId && expected !== projectId) {
      console.warn("[firebase] MISMATCH: build env projectId =", expected, "runtime projectId =", projectId);
    }
    return { projectId, apiKey, authDomain };
  } catch (error: unknown) {
    console.warn("[firebase] failed to fetch runtime init.json", error);
    return null;
  }
}
