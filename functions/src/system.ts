import express from "express";
import type { UserRecord } from "firebase-admin/auth";
import { FieldValue, getAuth, getFirestore } from "./firebase.js";
import { cors, requireAuthWithClaims } from "./http.js";

const ADMIN_BOOTSTRAP_DEFAULT = 50;

function getAdminBootstrapCredits(): number {
  const raw = process.env.ADMIN_BOOTSTRAP_CREDITS || process.env.ADMIN_BOOTSTRAP_CREDIT;
  if (!raw) return ADMIN_BOOTSTRAP_DEFAULT;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : ADMIN_BOOTSTRAP_DEFAULT;
}

function parseAdminEmails(): Set<string> {
  const csv = process.env.ADMIN_EMAILS_CSV || process.env.ADMIN_EMAILS || "";
  return new Set(
    csv
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0),
  );
}

const adminEmails = parseAdminEmails();
const db = getFirestore();

export const systemRouter = express.Router();

systemRouter.use(cors);
systemRouter.use(express.json());

systemRouter.post("/bootstrap", async (req, res) => {
  try {
    const { uid, claims } = await requireAuthWithClaims(req);
    const auth = getAuth();
    const decodedEmail = typeof claims?.email === "string" ? claims.email : undefined;
    let email = decodedEmail?.toLowerCase() || undefined;
    let userRecord: UserRecord | null = null;
    if (!email) {
      try {
        const record = await auth.getUser(uid);
        email = record.email?.toLowerCase() || undefined;
        userRecord = record;
      } catch {
        email = undefined;
      }
    }
    const isAdminEmail = email ? adminEmails.has(email) : false;

    let claimsUpdated = false;
    if (isAdminEmail) {
      const record = userRecord ?? (await auth.getUser(uid));
      userRecord = record;
      const existingClaims = userRecord.customClaims || {};
      if (existingClaims.admin !== true) {
        await auth.setCustomUserClaims(uid, { ...existingClaims, admin: true });
        claimsUpdated = true;
      }
    }

    const userRef = db.doc(`users/${uid}`);
    const snap = await userRef.get();
    const bootstrapCredits = getAdminBootstrapCredits();
    let credits: number = 0;
    const updates: Record<string, unknown> = {};
    if (snap.exists) {
      const data = snap.data() as Record<string, unknown>;
      const storedCredits = typeof data?.credits === "number" ? data.credits : null;
      if (storedCredits != null) {
        credits = storedCredits;
      }

      if (isAdminEmail && (storedCredits == null || storedCredits < 1)) {
        updates.credits = bootstrapCredits;
        credits = bootstrapCredits;
      } else if (!isAdminEmail && storedCredits == null) {
        updates.credits = 0;
        credits = 0;
      }

      if (!data?.createdAt) {
        updates.createdAt = data?.createdAt ?? FieldValue.serverTimestamp();
      }

      if (email && data?.email !== email) {
        updates.email = email;
      }
    } else {
      updates.createdAt = FieldValue.serverTimestamp();
      if (email) {
        updates.email = email;
      }
      if (isAdminEmail) {
        updates.credits = bootstrapCredits;
        credits = bootstrapCredits;
      } else {
        updates.credits = 0;
        credits = 0;
      }
    }

    if (Object.keys(updates).length > 0) {
      await userRef.set(updates, { merge: true });
    }

    res.json({ ok: true, admin: isAdminEmail, credits, claimsUpdated });
  } catch (error: any) {
    if (error?.code === "unauthenticated") {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    console.error("system_bootstrap_error", {
      message: error?.message,
    });
    res.status(500).json({ error: "bootstrap_failed" });
  }
});

systemRouter.get("/health", (_req, res) => {
  const secrets = {
    stripePublishable: Boolean(process.env.STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PK),
    stripeSecret: Boolean(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET),
    stripeWebhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_SIGNING_SECRET),
    openai: Boolean(process.env.OPENAI_API_KEY),
    usda: Boolean(process.env.USDA_API_KEY || process.env.USDA_FDC_API_KEY),
    offUserAgent: Boolean(process.env.OFF_USER_AGENT || process.env.OFF_APP_USER_AGENT),
    adminEmails: adminEmails.size > 0,
  } as const;

  res.json({
    ok: true,
    version:
      process.env.GIT_COMMIT ||
      process.env.K_REVISION ||
      process.env.FUNCTIONS_EMULATOR ||
      null,
    secrets,
  });
});
