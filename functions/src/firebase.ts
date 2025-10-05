import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth as _getAuth } from "firebase-admin/auth";
import { getFirestore as _getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { getAppCheck as _getAppCheck } from "firebase-admin/app-check";
import { getStorage as _getStorage } from "firebase-admin/storage";

function ensureAppInitialized(): void {
  try {
    const apps = getApps?.();
    const count = Array.isArray(apps) ? apps.length : 0;
    if (count === 0) {
      initializeApp();
    }
  } catch (_err) {
    // Swallow initialization errors at import-time; functions runtime will re-attempt
    try {
      initializeApp();
    } catch {
      // ignore; calls below may throw and be caught by handlers
    }
  }
}

export function getAuth() {
  ensureAppInitialized();
  return _getAuth();
}

export function getFirestore() {
  ensureAppInitialized();
  return _getFirestore();
}

export function getAppCheck() {
  ensureAppInitialized();
  return _getAppCheck();
}

export function getStorage() {
  ensureAppInitialized();
  return _getStorage();
}

export { Timestamp, FieldValue };
