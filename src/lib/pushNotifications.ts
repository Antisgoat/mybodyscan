import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
} from "firebase/messaging";
import { doc, getDoc, serverTimestamp } from "firebase/firestore";

import { call } from "@/lib/callable";
import { db, firebaseApp } from "@/lib/firebase";
import { setDoc } from "@/lib/dbWrite";

export type NotificationPreferences = {
  plateauPush: boolean;
};

const DEFAULTS: NotificationPreferences = { plateauPush: false };
const TOKEN_KEY = "mbs:push-token";

function vapidKey(): string {
  return String(import.meta.env.VITE_FIREBASE_VAPID_KEY || "").trim();
}

export function isPushConfigured(): boolean {
  return Boolean(vapidKey());
}

export async function loadNotificationPreferences(
  uid: string
): Promise<NotificationPreferences> {
  const snap = await getDoc(doc(db, "users", uid, "settings", "notifications"));
  const data = snap.data() as Record<string, unknown> | undefined;
  return { plateauPush: data?.plateauPush === true };
}

async function savePreference(uid: string, plateauPush: boolean) {
  await setDoc(
    doc(db, "users", uid, "settings", "notifications"),
    { plateauPush, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function enablePlateauPush(uid: string): Promise<void> {
  if (!vapidKey()) {
    throw new Error(
      "Push notifications are not configured for this deployment yet."
    );
  }
  if (
    !(await isSupported()) ||
    !("serviceWorker" in navigator) ||
    !("Notification" in window)
  ) {
    throw new Error("Push notifications are not supported in this browser.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }
  const registration = await navigator.serviceWorker.register(
    "/firebase-messaging-sw.js",
    { scope: "/" }
  );
  const messaging = getMessaging(firebaseApp);
  const token = await getToken(messaging, {
    vapidKey: vapidKey(),
    serviceWorkerRegistration: registration,
  });
  if (!token) throw new Error("Firebase did not return a push token.");
  await call("registerPushToken", { token, platform: "web" });
  window.localStorage.setItem(TOKEN_KEY, token);
  await savePreference(uid, true);
}

export async function disablePlateauPush(uid: string): Promise<void> {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (token) {
    await call("unregisterPushToken", { token }).catch(() => undefined);
  }
  if (await isSupported()) {
    await deleteToken(getMessaging(firebaseApp)).catch(() => false);
  }
  window.localStorage.removeItem(TOKEN_KEY);
  await savePreference(uid, false);
}

export { DEFAULTS as DEFAULT_NOTIFICATION_PREFERENCES };
