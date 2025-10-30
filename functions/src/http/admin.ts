import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { onRequest } from "firebase-functions/v2/https";
import { getAuth, Timestamp, getFirestore } from "../firebase.js";
import { requireAuthWithClaims } from "../http.js";
import { addCredits } from "../credits.js";
import { updateUserClaims } from "../claims.js";
import { runUserOperation } from "../lib/ops.js";

const db = getFirestore();
const auth = getAuth();

const ORIGIN_ALLOWLIST = new Set([
  "https://mybodyscanapp.com",
  "https://www.mybodyscanapp.com",
  "https://mybodyscan-f3daf.web.app",
  "https://mybodyscan-f3daf.firebaseapp.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

const STAFF_EMAIL_ALLOWLIST = new Set(["developer@adlrlabs.com"]);

function applyCors(req: Request, res: Response): { ended: boolean } {
  const origin = req.headers.origin as string | undefined;
  if (origin && ORIGIN_ALLOWLIST.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    res.status(204).end();
    return { ended: true };
  }
  return { ended: false };
}

function forbidden(res: Response) {
  res.status(403).json({ error: "forbidden" });
}

async function requireStaff(req: Request): Promise<{ uid: string; email: string | null }> {
  const { uid, claims } = await requireAuthWithClaims(req);
  const tokenEmail = typeof claims?.email === "string" ? claims.email.toLowerCase() : null;
  const tokenStaff = claims?.staff === true;
  if (tokenStaff || (tokenEmail && STAFF_EMAIL_ALLOWLIST.has(tokenEmail))) {
    return { uid, email: tokenEmail };
  }
  const record = await auth.getUser(uid);
  const claimStaff = (record.customClaims as any)?.staff === true;
  const userEmail = record.email ? record.email.toLowerCase() : tokenEmail;
  if (claimStaff || (userEmail && STAFF_EMAIL_ALLOWLIST.has(userEmail))) {
    return { uid, email: userEmail || null };
  }
  throw new Error("not_staff");
}

function sanitizeQuery(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.trim().toLowerCase();
}

async function fetchUserCredits(uid: string): Promise<{ credits: number | null; unlimited: boolean }> {
  try {
    const snap = await db.doc(`users/${uid}/private/credits`).get();
    const credits = snap.exists ? Number((snap.data() as any)?.creditsSummary?.totalAvailable ?? 0) : null;
    const unlimitedSnap = await db.doc(`users/${uid}/private/admin`).get();
    const unlimited = Boolean((unlimitedSnap.data() as any)?.unlimitedCredits === true);
    return { credits: Number.isFinite(credits || 0) ? credits : null, unlimited };
  } catch (error) {
    console.warn("admin_fetch_user_credits_error", { uid, message: (error as Error)?.message });
    return { credits: null, unlimited: false };
  }
}

async function searchUsers(prefix: string) {
  const limit = 25;
  if (!prefix || prefix.length < 2) return [];
  const matches: Array<Record<string, unknown>> = [];
  let pageToken: string | undefined;
  let pages = 0;
  const MAX_PAGES = 5;

  while (matches.length < limit && pages < MAX_PAGES) {
    const result = await auth.listUsers(1000, pageToken);
    for (const user of result.users) {
      const email = user.email?.toLowerCase() || "";
      if (!email || !email.startsWith(prefix)) continue;
      const meta = await fetchUserCredits(user.uid);
      matches.push({
        uid: user.uid,
        email: user.email,
        createdAt: user.metadata?.creationTime || null,
        lastLogin: user.metadata?.lastSignInTime || null,
        unlimitedClaim: Boolean((user.customClaims as any)?.unlimitedCredits === true),
        unlimitedMirror: meta.unlimited,
        credits: meta.credits,
      });
      if (matches.length >= limit) break;
    }
    if (!result.pageToken || matches.length >= limit) break;
    pageToken = result.pageToken;
    pages += 1;
  }

  return matches.slice(0, limit);
}

function resolveOpId(req: Request, provided?: string | null): string {
  if (provided && typeof provided === "string" && provided.trim()) {
    return provided.trim().slice(0, 80);
  }
  const headerId = req.get("x-request-id") || req.get("x-cloud-trace-context");
  if (headerId && headerId.trim()) {
    return headerId.split("/")[0]!.slice(0, 80);
  }
  return randomUUID();
}

async function handleGrantCredits(req: Request, res: Response, staffUid: string) {
  const body = typeof req.body === "object" && req.body ? (req.body as any) : {};
  const uid = typeof body.uid === "string" ? body.uid.trim() : "";
  const amount = Number(body.amount ?? 0);
  if (!uid || !Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }
  const opId = `admin_${resolveOpId(req, body.opId)}`;
  try {
    const result = await runUserOperation(uid, opId, { type: "admin_grant", amount, source: staffUid }, async () => {
      await addCredits(uid, amount, `Admin grant by ${staffUid}`, 12);
      await db.doc(`users/${uid}/private/admin`).set(
        { lastGrantBy: staffUid, lastGrantAt: Timestamp.now(), lastGrantAmount: amount },
        { merge: true },
      );
    });
    res.json({ ok: true, opId, alreadyCompleted: result.alreadyCompleted });
  } catch (error) {
    console.error("admin_grant_error", { uid, message: (error as Error)?.message });
    res.status(500).json({ error: "grant_failed" });
  }
}

async function handleToggleUnlimited(req: Request, res: Response, staffUid: string) {
  const body = typeof req.body === "object" && req.body ? (req.body as any) : {};
  const uid = typeof body.uid === "string" ? body.uid.trim() : "";
  const value = body.value === true || body.value === "true";
  if (!uid) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }
  try {
    const record = await auth.getUser(uid);
    const existingClaims = record.customClaims || {};
    await auth.setCustomUserClaims(uid, { ...existingClaims, unlimitedCredits: value });
    await db.doc(`users/${uid}/private/admin`).set(
      {
        unlimitedCredits: value,
        unlimitedUpdatedAt: Timestamp.now(),
        unlimitedUpdatedBy: staffUid,
      },
      { merge: true },
    );
    res.json({ ok: true, unlimited: value });
  } catch (error) {
    console.error("admin_toggle_unlimited_error", { uid, message: (error as Error)?.message });
    res.status(500).json({ error: "toggle_failed" });
  }
}

async function handleRefreshClaims(req: Request, res: Response) {
  const body = typeof req.body === "object" && req.body ? (req.body as any) : {};
  const uid = typeof body.uid === "string" ? body.uid.trim() : "";
  if (!uid) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }
  try {
    await updateUserClaims(uid);
    res.json({ ok: true });
  } catch (error) {
    console.error("admin_refresh_claims_error", { uid, message: (error as Error)?.message });
    res.status(500).json({ error: "refresh_failed" });
  }
}

async function handleEvents(req: Request, res: Response) {
  const body = typeof req.body === "object" && req.body ? (req.body as any) : {};
  const limit = Number(body.limit ?? 5);
  const clamped = Number.isFinite(limit) && limit > 0 ? Math.min(50, Math.floor(limit)) : 5;
  try {
    const snap = await db
      .collection("stripeEvents")
      .orderBy("created", "desc")
      .limit(clamped)
      .get();
    const events = snap.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json({ ok: true, events });
  } catch (error) {
    console.error("admin_events_error", { message: (error as Error)?.message });
    res.status(500).json({ error: "events_failed" });
  }
}

async function handleTelemetry(req: Request, res: Response) {
  const body = typeof req.body === "object" && req.body ? (req.body as any) : {};
  const limit = Number(body.limit ?? 50);
  const clamped = Number.isFinite(limit) && limit > 0 ? Math.min(100, Math.floor(limit)) : 50;
  try {
    const snap = await db
      .collection("telemetryEvents")
      .orderBy("createdAt", "desc")
      .limit(clamped)
      .get();
    const events = snap.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json({ ok: true, events });
  } catch (error) {
    console.error("admin_telemetry_error", { message: (error as Error)?.message });
    res.status(500).json({ error: "telemetry_failed" });
  }
}

export const adminGateway = onRequest({ region: "us-central1" }, async (req: Request, res: Response) => {
  const cors = applyCors(req, res);
  if (cors.ended) return;

  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  let staffInfo: { uid: string; email: string | null };
  try {
    staffInfo = await requireStaff(req);
  } catch (error) {
    console.warn("admin_access_denied", { message: (error as Error)?.message });
    forbidden(res);
    return;
  }

  const path = (req.path || req.url || "").replace(/^\/+|\/+$/g, "");

  switch (path) {
    case "admin/users/search": {
      const query = sanitizeQuery((req.body as any)?.query);
      const users = await searchUsers(query);
      res.json({ ok: true, users });
      return;
    }
    case "admin/users/grantCredits": {
      await handleGrantCredits(req, res, staffInfo.uid);
      return;
    }
    case "admin/users/toggleUnlimited": {
      await handleToggleUnlimited(req, res, staffInfo.uid);
      return;
    }
    case "admin/users/refreshClaims": {
      await handleRefreshClaims(req, res);
      return;
    }
    case "admin/events/recent": {
      await handleEvents(req, res);
      return;
    }
    case "admin/telemetry/recent": {
      await handleTelemetry(req, res);
      return;
    }
    default: {
      res.status(404).json({ error: "not_found" });
    }
  }
});
