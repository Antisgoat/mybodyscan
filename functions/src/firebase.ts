import { getApps, initializeApp } from "firebase-admin/app";

if (!getApps || !getApps().length) {
  initializeApp();
}

export { getAuth } from "firebase-admin/auth";
export { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
export { getAppCheck } from "firebase-admin/app-check";
export { getStorage } from "firebase-admin/storage";
