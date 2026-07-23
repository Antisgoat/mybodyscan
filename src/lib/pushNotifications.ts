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
import { isNativeCapacitor } from "@/lib/platform";

export type NotificationPreferences = {
  plateauPush: boolean;
};

const DEFAULTS: NotificationPreferences = { plateauPush: false };
const TOKEN_KEY = "mbs:push-token";
type ListenerHandle = { remove: () => Promise<void> };
let nativeListenerUid: string | null = null;
let nativeListenerHandles: ListenerHandle[] = [];

function vapidKey(): string {
  return String(import.meta.env.VITE_FIREBASE_VAPID_KEY || "").trim();
}

export function isPushConfigured(): boolean {
  return isNativeCapacitor() || Boolean(vapidKey());
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

async function registerToken(
  uid: string,
  token: string,
  platform: "web" | "ios"
) {
  if (!token) throw new Error("Firebase did not return a push token.");
  await call("registerPushToken", { token, platform });
  window.localStorage.setItem(TOKEN_KEY, token);
}

async function clearNativeListeners() {
  const handles = nativeListenerHandles;
  nativeListenerHandles = [];
  nativeListenerUid = null;
  await Promise.all(handles.map((handle) => handle.remove().catch(() => undefined)));
}

export async function releasePushSession(): Promise<void> {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (token) {
    await call("unregisterPushToken", { token }).catch(() => undefined);
  }
  window.localStorage.removeItem(TOKEN_KEY);
  if (isNativeCapacitor()) {
    await clearNativeListeners();
  }
}

async function startNativeListeners(uid: string) {
  if (!isNativeCapacitor() || nativeListenerUid === uid) return;
  await clearNativeListeners();
  const { FirebaseMessaging } = await import(
    "@capacitor-firebase/messaging"
  );
  nativeListenerHandles = [
    await FirebaseMessaging.addListener("tokenReceived", ({ token }) => {
      void registerToken(uid, token, "ios").catch(() => undefined);
    }),
    await FirebaseMessaging.addListener(
      "notificationActionPerformed",
      ({ notification }) => {
        const data = notification.data as Record<string, unknown> | undefined;
        const url = typeof data?.url === "string" ? data.url : "";
        if (url.startsWith("/") && !url.startsWith("//")) {
          window.location.assign(url);
        }
      }
    ),
  ];
  nativeListenerUid = uid;
}

async function enableNativePlateauPush(uid: string) {
  const { FirebaseMessaging } = await import(
    "@capacitor-firebase/messaging"
  );
  const support = await FirebaseMessaging.isSupported();
  if (!support.isSupported) {
    throw new Error("Push notifications are not supported on this device.");
  }
  let permission = await FirebaseMessaging.checkPermissions();
  if (permission.receive !== "granted") {
    permission = await FirebaseMessaging.requestPermissions();
  }
  if (permission.receive !== "granted") {
    throw new Error("Notification permission was not granted.");
  }
  const { token } = await FirebaseMessaging.getToken();
  await registerToken(uid, token, "ios");
  await savePreference(uid, true);
  await startNativeListeners(uid);
}

export async function syncNativePushRegistration(uid: string): Promise<void> {
  if (!isNativeCapacitor()) return;
  const preferences = await loadNotificationPreferences(uid);
  if (!preferences.plateauPush) {
    await clearNativeListeners();
    return;
  }
  const { FirebaseMessaging } = await import(
    "@capacitor-firebase/messaging"
  );
  const permission = await FirebaseMessaging.checkPermissions();
  if (permission.receive !== "granted") return;
  const { token } = await FirebaseMessaging.getToken();
  await registerToken(uid, token, "ios");
  await startNativeListeners(uid);
}

export async function enablePlateauPush(uid: string): Promise<void> {
  if (isNativeCapacitor()) {
    await enableNativePlateauPush(uid);
    return;
  }
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
  await registerToken(uid, token, "web");
  await savePreference(uid, true);
}

export async function disablePlateauPush(uid: string): Promise<void> {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (token) {
    await call("unregisterPushToken", { token }).catch(() => undefined);
  }
  if (isNativeCapacitor()) {
    const { FirebaseMessaging } = await import(
      "@capacitor-firebase/messaging"
    );
    await FirebaseMessaging.deleteToken().catch(() => undefined);
    await clearNativeListeners();
  } else if (await isSupported()) {
    await deleteToken(getMessaging(firebaseApp)).catch(() => false);
  }
  window.localStorage.removeItem(TOKEN_KEY);
  await savePreference(uid, false);
}

export { DEFAULTS as DEFAULT_NOTIFICATION_PREFERENCES };
