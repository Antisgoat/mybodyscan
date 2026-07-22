import { getApps, initializeApp } from "firebase-admin/app";
import { buildAdminAppOptions } from "./adminAppOptions.js";

if (!getApps().length) {
  initializeApp(buildAdminAppOptions());
}

export { getAuth } from "firebase-admin/auth";
export { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
export { getAppCheck } from "firebase-admin/app-check";
export { getStorage } from "firebase-admin/storage";
export { getMessaging } from "firebase-admin/messaging";
