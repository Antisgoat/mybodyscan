import { onRequest } from "firebase-functions/v2/https";

// Booleans from env strings ("true"/"false" tolerant)
const on = (v?: string) => (v ?? "").toLowerCase() === "true";

export const systemHealth = onRequest(async (req, res) => {
  const stripeSecretPresent = !!(process.env.STRIPE_SECRET || process.env.STRIPE_SECRET_KEY);
  const openaiKeyPresent = !!process.env.OPENAI_API_KEY;
  const usdaKeyPresent = !!process.env.USDA_FDC_API_KEY;

  const appCheckMode = process.env.APPCHECK_MODE || "disabled";

  const authProviders = {
    google: on(process.env.AUTH_GOOGLE_ENABLED),
    apple: on(process.env.AUTH_APPLE_ENABLED),
    email: on(process.env.AUTH_EMAIL_ENABLED),
    demo: on(process.env.AUTH_DEMO_ENABLED),
  } as const;

  // Identity Toolkit reachability probe
  const apiKey =
    process.env.FIREBASE_WEB_API_KEY ||
    process.env.VITE_FIREBASE_API_KEY ||
    process.env.FIREBASE_API_KEY ||
    "";

  let identityToolkitReachable = false;
  let identityToolkitReason = "";

  if (!apiKey) {
    identityToolkitReason = "no_client_key";
  } else {
    try {
      const r = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ returnSecureToken: true }),
        },
      );
      if (!r.ok) {
        identityToolkitReason = `http_${r.status}`;
      } else {
        const j = (await r.json().catch(() => ({}))) as { idToken?: string };
        identityToolkitReachable = typeof j?.idToken === "string" && j.idToken.length > 0;
        if (!identityToolkitReachable) identityToolkitReason = "no_id_token";
      }
    } catch (e: any) {
      identityToolkitReason = `error_${(e?.code || e?.name || "unknown").toString()}`;
    }
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(200).send({
    host: req.get("host"),
    timestamp: new Date().toISOString(),
    appCheckMode,
    authProviders,
    stripeSecretPresent,
    openaiKeyPresent,
    usdaKeyPresent,
    identityToolkitReachable,
    identityToolkitReason,
  });
});
