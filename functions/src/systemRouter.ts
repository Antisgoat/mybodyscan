import expressModule from "express";
import type { Request, Response } from "express";
import { FieldValue, getAuth, getFirestore } from "./firebase.js";
import { allowCorsAndOptionalAppCheck, requireAuthWithClaims } from "./http.js";

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
const express = expressModule as any;
const db = getFirestore();

export const systemRouter = express.Router();

systemRouter.use(allowCorsAndOptionalAppCheck);
systemRouter.use(express.json());

systemRouter.post("/bootstrap", async (req: Request, res: Response) => {
  try {
    const { uid, claims } = await requireAuthWithClaims(req);
    const auth = getAuth();
    const decodedEmail = typeof claims?.email === "string" ? claims.email : undefined;
    let email = decodedEmail?.toLowerCase() || undefined;
    let userRecord: { customClaims?: Record<string, unknown>; email?: string | null } | null = null;
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

      if (isAdminEmail && (storedCredits == null || storedCredits < bootstrapCredits)) {
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

systemRouter.get("/whoami", async (req: Request, res: Response) => {
  const header = req.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  let uid: string | null = null;
  let email: string | null = null;
  let credits: number | null = null;
  if (match) {
    try {
      const decoded = await getAuth().verifyIdToken(match[1]);
      uid = decoded?.uid ?? null;
      email = typeof decoded?.email === "string" ? decoded.email.toLowerCase() : null;
      if (uid) {
        try {
          const snap = await db.doc(`users/${uid}`).get();
          const available = snap.get("creditsAvailable");
          const legacy = snap.get("credits");
          const value = typeof available === "number" ? available : typeof legacy === "number" ? legacy : null;
          credits = value != null && Number.isFinite(value) ? Number(value) : null;
        } catch {
          credits = null;
        }
      }
    } catch {
      uid = null;
      email = null;
      credits = null;
    }
  }

  const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || null;
  const appcheck = Boolean(req.get("x-firebase-appcheck"));

  res.json({ uid, email, credits, appcheck, project });
});

systemRouter.get("/health", (_req: Request, res: Response) => {
  const stripeSecretKey = (process.env.STRIPE_SECRET_KEY || "").trim();
  const stripeSecret = (process.env.STRIPE_SECRET || "").trim();
  const stripeSecretSource = stripeSecretKey ? "STRIPE_SECRET_KEY" : stripeSecret ? "STRIPE_SECRET" : null;
  const stripePublishable = (process.env.STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PK || "").trim();
  const appCheckSiteKey = (process.env.VITE_APPCHECK_SITE_KEY || "").trim();
  const stripePublishablePresent = Boolean(stripePublishable);
  const appCheckSiteKeyPresent = Boolean(appCheckSiteKey);

  const secrets = {
    stripePublishable: stripePublishablePresent,
    stripeSecret: Boolean(stripeSecretKey || stripeSecret),
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
    hasStripe: secrets.stripeSecret,
    hasOpenAI: secrets.openai,
    hasUSDA: secrets.usda,
    prices: {
      one: Boolean(process.env.PRICE_ONE || process.env.VITE_PRICE_ONE),
      monthly: Boolean(process.env.PRICE_MONTHLY || process.env.VITE_PRICE_MONTHLY),
      yearly: Boolean(process.env.PRICE_YEARLY || process.env.VITE_PRICE_YEARLY),
    },
    stripeSecretSource,
    stripePublishablePresent,
    appCheckSiteKeyPresent,
  });
});

systemRouter.post("/admin/grant-credits", async (req: Request, res: Response) => {
  const header = req.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  let decoded: { uid: string; email?: string } | null = null;
  try {
    decoded = await getAuth().verifyIdToken(match[1]);
  } catch {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  const email = decoded?.email ? decoded.email.toLowerCase() : "";
  if (!email || !adminEmails.has(email)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const rawAmount = Number(req.body?.amount ?? 0);
  const amount = Number.isFinite(rawAmount) && rawAmount > 0 ? Math.floor(rawAmount) : 1;
  const uid = decoded?.uid;
  if (!uid) {
    res.status(400).json({ error: "invalid_user" });
    return;
  }

  const userRef = db.doc(`users/${uid}`);
  const months = Number(process.env.CREDIT_EXP_MONTHS || 24);

  try {
    await db.runTransaction(async (tx) => {
      const now = new Date();
      const expires = new Date(now.getTime());
      expires.setMonth(expires.getMonth() + (Number.isFinite(months) ? months : 24));

      tx.set(userRef.collection("credits").doc(), {
        amount,
        reason: "admin-grant",
        createdAt: now,
        expiresAt: expires,
        source: "admin",
      });
      tx.set(
        userRef,
        {
          creditsAvailable: FieldValue.increment(amount),
          credits: FieldValue.increment(amount),
          updatedAt: now,
        },
        { merge: true },
      );
    });
  } catch (error: any) {
    console.error("admin_grant_credits_failed", { message: error?.message });
    res.status(500).json({ error: "grant_failed" });
    return;
  }

  res.json({ ok: true, granted: amount });
});
