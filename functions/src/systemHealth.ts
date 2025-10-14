import { onRequest as onRequestV2 } from "firebase-functions/v2/https";

export const systemHealth = onRequestV2({ cors: true }, (req, res) => {
  const host = req.get("host") ?? "";
  res.status(200).json({
    ok: true,
    hasOpenAI: Boolean(process.env.OPENAI_API_KEY),
    hasStripe: Boolean(
      process.env.STRIPE_SECRET_KEY ||
        process.env.STRIPE_SECRET ||
        process.env.STRIPE_API_KEY
    ),
    appCheckSoft: true,
    host,
    hostBaseUrl: host ? `https://${host}` : "",
    model: process.env.OPENAI_MODEL ?? null,
  });
});
