import { createHash } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { FieldValue } from "firebase-admin/firestore";

import { getFirestore } from "./firebase.js";
import { getMessaging } from "firebase-admin/messaging";
import { claimPushToken, releasePushToken } from "./pushTokenOwnership.js";
import { onCallWithOptionalAppCheck } from "./util/callable.js";

const db = getFirestore();
const messaging = getMessaging();
const DAY_MS = 24 * 60 * 60 * 1000;

function tokenId(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function validatedToken(value: unknown): string {
  const token = typeof value === "string" ? value.trim() : "";
  if (token.length < 20 || token.length > 4096) {
    throw new HttpsError("invalid-argument", "Invalid push token.");
  }
  return token;
}

function validatedPlatform(value: unknown): "web" | "ios" | "unknown" {
  if (value === "web" || value === "ios") return value;
  return "unknown";
}

export const registerPushToken = onCallWithOptionalAppCheck(
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
    const token = validatedToken(request.data?.token);
    await claimPushToken(db, {
      uid,
      tokenId: tokenId(token),
      token,
      platform: validatedPlatform(request.data?.platform),
    });
    return { ok: true };
  },
  { region: "us-central1" }
);

export const unregisterPushToken = onCallWithOptionalAppCheck(
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
    const token = validatedToken(request.data?.token);
    await releasePushToken(db, uid, tokenId(token));
    return { ok: true };
  },
  { region: "us-central1" }
);

function toMillis(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (
    value &&
    typeof (value as { toMillis?: unknown }).toMillis === "function"
  ) {
    const millis = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(millis) ? millis : null;
  }
  return null;
}

function normalizeGoal(
  value: unknown
): "lose_fat" | "gain_muscle" | "recomp" | null {
  const goal = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (["lose_fat", "fat_loss", "cut", "weight_loss"].includes(goal))
    return "lose_fat";
  if (["gain_muscle", "build_muscle", "hypertrophy", "bulk"].includes(goal))
    return "gain_muscle";
  if (["recomp", "body_recomposition"].includes(goal)) return "recomp";
  return null;
}

function number(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function deriveServerPlateauSignature(
  scans: Array<{ id: string; data: Record<string, unknown> }>,
  goalValue: unknown
): string | null {
  const goal = normalizeGoal(goalValue);
  if (!goal) return null;
  const usable = scans
    .filter(({ data }) => {
      const status = String(data.status || "");
      return (
        (status === "complete" || status === "completed") &&
        data.usedFallback !== true &&
        data.resultSource !== "fallback"
      );
    })
    .map(({ id, data }) => {
      const estimate = (data.estimate || {}) as Record<string, unknown>;
      const input = (data.input || {}) as Record<string, unknown>;
      const metrics = (data.metrics || {}) as Record<string, unknown>;
      return {
        id,
        date: toMillis(data.completedAt) ?? toMillis(data.createdAt),
        bodyFat: number(
          estimate.bodyFatPercent,
          metrics.bodyFatPct,
          metrics.body_fat
        ),
        weight: number(
          input.currentWeightKg,
          metrics.weightKg,
          metrics.weight_kg
        ),
      };
    })
    .filter((scan) => scan.date != null)
    .sort((a, b) => a.date! - b.date!);
  const preferBodyFat = goal === "lose_fat" || goal === "recomp";
  const bodyFat = usable.filter((scan) => scan.bodyFat != null);
  const weight = usable.filter((scan) => scan.weight != null);
  const metric = preferBodyFat && bodyFat.length >= 3 ? "body_fat" : "weight";
  if (goal === "recomp" && metric !== "body_fat") return null;
  const candidates = (metric === "body_fat" ? bodyFat : weight).slice(-5);
  if (candidates.length < 3) return null;
  const first = candidates[0]!;
  const last = candidates[candidates.length - 1]!;
  const spanDays = Math.floor((last.date! - first.date!) / DAY_MS);
  if (spanDays < 21) return null;
  const values = candidates.map((scan) =>
    metric === "body_fat" ? scan.bodyFat! : scan.weight!
  );
  const start = values[0]!;
  const range = Math.max(...values) - Math.min(...values);
  const stable =
    metric === "body_fat"
      ? range <= 1
      : start > 0 && (range / start) * 100 <= 1.25;
  return stable ? `${goal}:${metric}:${last.id}` : null;
}

const PLATEAU_NOTIFICATION = {
  title: "Progress check-in",
  body: "Your recent estimates have stayed in a narrow range. Review your plan—this is a coaching prompt, not proof progress stopped.",
};

export function buildPlateauMulticastMessage(
  platform: "web" | "ios" | "unknown",
  tokens: string[]
) {
  const data = {
    ...PLATEAU_NOTIFICATION,
    url: "/history",
    tag: "plateau-check-in",
  };
  if (platform === "ios") {
    return {
      tokens,
      data,
      notification: PLATEAU_NOTIFICATION,
      apns: { payload: { aps: { sound: "default" } } },
    };
  }
  // Data-only delivery lets the committed web service worker render exactly
  // one notification. Supplying both notification and data can duplicate it.
  return { tokens, data };
}

export const sendPlateauNotifications = onSchedule(
  {
    region: "us-central1",
    schedule: "every day 15:00",
    timeZone: "Etc/UTC",
    timeoutSeconds: 300,
    memory: "512MiB",
    maxInstances: 1,
  },
  async () => {
    const tokenSnap = await db
      .collectionGroup("notificationTokens")
      .where("active", "==", true)
      .get();
    const byUser = new Map<
      string,
      Array<{
        token: string;
        platform: "web" | "ios" | "unknown";
        ref: FirebaseFirestore.DocumentReference;
      }>
    >();
    for (const docSnap of tokenSnap.docs) {
      const uid = docSnap.ref.parent.parent?.id;
      const data = docSnap.data();
      const token = data?.token;
      if (!uid || typeof token !== "string") continue;
      const list = byUser.get(uid) || [];
      list.push({
        token,
        platform: validatedPlatform(data?.platform),
        ref: docSnap.ref,
      });
      byUser.set(uid, list);
    }

    let sent = 0;
    for (const [uid, tokens] of byUser) {
      const [preferencesSnap, profileSnap, scansSnap] = await Promise.all([
        db.doc(`users/${uid}/settings/notifications`).get(),
        db.doc(`users/${uid}/coach/profile`).get(),
        db
          .collection(`users/${uid}/scans`)
          .orderBy("createdAt", "desc")
          .limit(5)
          .get(),
      ]);
      const preferences = preferencesSnap.data() || {};
      if (preferences.plateauPush !== true) continue;
      const lastSentAt = toMillis(preferences.lastPlateauSentAt);
      if (lastSentAt != null && Date.now() - lastSentAt < 14 * DAY_MS) continue;
      const profile = profileSnap.data() || {};
      const signature = deriveServerPlateauSignature(
        scansSnap.docs.map((scan) => ({ id: scan.id, data: scan.data() })),
        profile.goal
      );
      if (!signature || signature === preferences.lastPlateauSignature)
        continue;
      let userSuccessCount = 0;
      for (const platform of ["web", "ios", "unknown"] as const) {
        const platformTokens = tokens
          .filter((entry) => entry.platform === platform)
          .slice(0, 500);
        if (!platformTokens.length) continue;
        try {
          const response = await messaging.sendEachForMulticast(
            buildPlateauMulticastMessage(
              platform,
              platformTokens.map((entry) => entry.token)
            )
          );
          const invalidCleanups = response.responses.flatMap((item, index) => {
            const code = item.error?.code || "";
            return code.includes("registration-token-not-registered") ||
              code.includes("invalid-registration-token")
              ? [releasePushToken(db, uid, platformTokens[index]!.ref.id)]
              : [];
          });
          await Promise.all(invalidCleanups);
          userSuccessCount += response.successCount;
        } catch (error) {
          console.error("plateau_notification_send_failed", {
            uid,
            platform,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      if (userSuccessCount > 0) {
        sent += userSuccessCount;
        await preferencesSnap.ref.set(
          {
            lastPlateauSignature: signature,
            lastPlateauSentAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }
    console.info("plateau_notifications_complete", {
      users: byUser.size,
      sent,
    });
  }
);
