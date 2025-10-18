import { onRequest as onRequestV2 } from "firebase-functions/v2/https";
import { getEnv, getHostBaseUrl } from "./lib/env.js";
import { withCors } from "./middleware/cors.js";
import { withRequestLogging } from "./middleware/logging.js";

export const systemHealth = onRequestV2(
  { region: "us-central1" },
  withRequestLogging(
    withCors((req, res) => {
      const host = req.get("host") ?? "";
      let configProject: string | null = null;
      const firebaseConfigRaw = getEnv("FIREBASE_CONFIG");
      if (firebaseConfigRaw) {
        try {
          const parsed = JSON.parse(firebaseConfigRaw);
          if (parsed && typeof parsed.projectId === "string") {
            configProject = parsed.projectId;
          }
        } catch {
          configProject = null;
        }
      }

      const projectId =
        getEnv("GCLOUD_PROJECT") ||
        getEnv("PROJECT_ID") ||
        getEnv("GCP_PROJECT") ||
        configProject ||
        null;
      const hostingUrl = getHostBaseUrl() || (host ? `https://${host}` : null);

      res.status(200).json({
        ok: true,
        projectId,
        timestamp: new Date().toISOString(),
        hostingUrl,
      });
    }),
    { sampleRate: 0.5 }
  )
);
