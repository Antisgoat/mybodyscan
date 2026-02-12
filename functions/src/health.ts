import { onRequest } from "firebase-functions/v2/https";

const ALLOW = new Set([
  "https://mybodyscanapp.com",
  "https://www.mybodyscanapp.com",
  "https://mybodyscan.app",
  "https://www.mybodyscan.app",
  "http://localhost",
  "http://localhost:5173",
  "http://localhost:4173",
  "capacitor://localhost",
  "ionic://localhost",
]);

function getProjectId(): string {
  return (
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    process.env.PROJECT_ID ||
    "unknown"
  );
}

export const health = onRequest({ region: "us-central1" }, (req, res) => {
  const origin = req.get("Origin") || "";
  if (origin && ALLOW.has(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
  }
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Firebase-AppCheck,X-Correlation-Id");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  res.status(200).json({
    ok: true,
    time: new Date().toISOString(),
    region: process.env.FUNCTION_REGION || "us-central1",
    projectId: getProjectId(),
  });
});
