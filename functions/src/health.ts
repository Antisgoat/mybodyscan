import { onRequest } from "firebase-functions/v2/https";
import { withCors } from "./middleware/cors.js";

function getProjectId(): string {
  return (
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    process.env.PROJECT_ID ||
    "unknown"
  );
}

export const health = onRequest(
  { region: "us-central1" },
  withCors((_req, res) => {
    res.status(200).json({
      ok: true,
      time: new Date().toISOString(),
      region: process.env.FUNCTION_REGION || "us-central1",
      projectId: getProjectId(),
    });
  })
);
