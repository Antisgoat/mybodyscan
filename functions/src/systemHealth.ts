import { onRequest } from "firebase-functions/v2/https";

export const systemHealth = onRequest({ region: "us-central1" }, async (req, res) => {
  try {
    const host = req.headers.host ?? "";
    const hasOpenAI = Boolean(process.env.OPENAI_API_KEY?.length);
    const model = hasOpenAI ? "openai-vision" : null;
    const hasStripe = Boolean(process.env.STRIPE_SECRET?.length || process.env.STRIPE_SECRET_KEY?.length);
    const appCheckSoft = process.env.APP_CHECK_ENFORCE_SOFT === "true";
    res.status(200).json({ hasOpenAI, model, hasStripe, appCheckSoft, host });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "internal" });
  }
});
