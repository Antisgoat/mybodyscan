import { onRequest } from "firebase-functions/v2/https";
import { getAuth } from "./firebase.js";
import { withCors } from "./middleware/cors.js";
import { getCreditsInfo, grantWhitelistedCredits } from "./credits.js";
import { isWhitelisted } from "./testWhitelist.js";
import { z } from "zod";

const getCreditsInfoSchema = z.object({
  uid: z.string().min(1),
});

const grantCreditsSchema = z.object({
  uid: z.string().min(1),
  userEmail: z.string().email(),
});

async function extractUserEmail(req: any): Promise<string | null> {
  try {
    const auth = getAuth();
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return null;
    
    const decoded = await auth.verifyIdToken(token);
    return decoded.email || null;
  } catch {
    return null;
  }
}

export const getCreditsInfoEndpoint = onRequest(
  { region: "us-central1", invoker: "public" },
  withCors(async (req, res) => {
    try {
      if (req.method !== "POST") {
        res.status(405).json({ error: "method_not_allowed" });
        return;
      }

      const userEmail = await extractUserEmail(req);
      if (!userEmail || !isWhitelisted(userEmail)) {
        res.status(403).json({ error: "access_denied" });
        return;
      }

      const validation = getCreditsInfoSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({ 
          error: "validation_failed", 
          details: validation.error.errors 
        });
        return;
      }

      const { uid } = validation.data;
      const creditsInfo = await getCreditsInfo(uid);
      
      res.status(200).json(creditsInfo);
    } catch (error: any) {
      console.error("getCreditsInfo_error", error);
      res.status(500).json({ error: "server_error" });
    }
  })
);

export const grantWhitelistedCreditsEndpoint = onRequest(
  { region: "us-central1", invoker: "public" },
  withCors(async (req, res) => {
    try {
      if (req.method !== "POST") {
        res.status(405).json({ error: "method_not_allowed" });
        return;
      }

      const userEmail = await extractUserEmail(req);
      if (!userEmail || !isWhitelisted(userEmail)) {
        res.status(403).json({ error: "access_denied" });
        return;
      }

      const validation = grantCreditsSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({ 
          error: "validation_failed", 
          details: validation.error.errors 
        });
        return;
      }

      const { uid, userEmail: targetEmail } = validation.data;
      await grantWhitelistedCredits(uid, targetEmail);
      
      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error("grantWhitelistedCredits_error", error);
      res.status(500).json({ error: "server_error" });
    }
  })
);