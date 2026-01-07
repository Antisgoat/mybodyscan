/**
 * Minimal scan upload + analysis integration verification.
 *
 * Runs against Firebase emulators (auth/firestore/storage/functions).
 *
 * Usually invoked via:
 *   npm run verify:scan
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { initializeApp } from "firebase/app";
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
} from "firebase/firestore";
import {
  connectStorageEmulator,
  getMetadata,
  getStorage,
  ref,
  uploadBytesResumable,
} from "firebase/storage";

function readDefaultProjectId() {
  try {
    const raw = JSON.parse(
      readFileSync(new URL("../.firebaserc", import.meta.url), "utf8")
    );
    return raw?.projects?.default || raw?.defaults?.projectId || null;
  } catch {
    return null;
  }
}

function splitHostPort(value, fallbackPort) {
  const raw = String(value || "").trim();
  if (!raw) return { host: "127.0.0.1", port: fallbackPort };
  const [host, port] = raw.split(":");
  return {
    host: host || "127.0.0.1",
    port: port ? Number(port) : fallbackPort,
  };
}

function tinyJpegBytes() {
  // 1x1 jpeg
  const base64 =
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDABALDgwODAwQEBAXEBkYFREcHiEfGh0dICQjJC4sKCorNzg3Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O//2wBDAQwMDhAQEB0RGh0eOycnOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O//wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/APH/AP/Z";
  return Buffer.from(base64, "base64");
}

async function waitForHttpReady(url, timeoutMs) {
  const deadline = Date.now() + Math.max(500, timeoutMs);
  // Storage emulator responds 404 on "/" — any HTTP response means it's up.
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res) return;
    } catch {
      // not ready yet
    }
    await delay(150);
  }
  throw new Error(`Emulator not reachable: ${url}`);
}

async function uploadOne(storage, path, bytes) {
  const storageRef = ref(storage, path);
  const blob = new Blob([bytes], { type: "image/jpeg" });
  const task = uploadBytesResumable(storageRef, blob, {
    contentType: "image/jpeg",
  });
  await new Promise((resolve, reject) => {
    task.on("state_changed", () => undefined, reject, resolve);
  });
  await getMetadata(storageRef);
}

async function httpJson(url, { idToken, body }) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }
  if (!res.ok) {
    const message =
      data?.message || data?.error?.message || text || `HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function main() {
  const {
    connectAuthEmulator,
    inMemoryPersistence,
    initializeAuth,
    signInAnonymously,
  } = await import("firebase/auth");

  const projectId =
    process.env.GCLOUD_PROJECT ||
    process.env.FIREBASE_PROJECT ||
    readDefaultProjectId();
  if (!projectId) throw new Error("Missing projectId.");
  const region = "us-central1";
  const bucket = process.env.STORAGE_BUCKET || `${projectId}.appspot.com`;

  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
  const { host: firestoreHost, port: firestorePort } = splitHostPort(
    process.env.FIRESTORE_EMULATOR_HOST,
    8080
  );
  const { host: storageHost, port: storagePort } = splitHostPort(
    process.env.FIREBASE_STORAGE_EMULATOR_HOST,
    9199
  );
  const { host: functionsHost, port: functionsPort } = splitHostPort(
    process.env.FUNCTIONS_EMULATOR_HOST,
    5001
  );

  const app = initializeApp({
    apiKey: "fake",
    authDomain: "fake",
    projectId,
    storageBucket: bucket,
  });

  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });

  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, firestoreHost, firestorePort);

  const storage = getStorage(app);
  connectStorageEmulator(storage, storageHost, storagePort);
  await waitForHttpReady(`http://${storageHost}:${storagePort}/`, 10_000);

  const signedIn = await signInAnonymously(auth);
  const idToken = await signedIn.user.getIdToken();
  const uid = signedIn.user.uid;

  const correlationId = `verify-scan-${randomUUID().slice(0, 8)}`;
  const startUrl = `http://${functionsHost}:${functionsPort}/${projectId}/${region}/startScanSession`;
  const submitUrl = `http://${functionsHost}:${functionsPort}/${projectId}/${region}/submitScan`;

  const start = await httpJson(startUrl, {
    idToken,
    body: { currentWeightKg: 80, goalWeightKg: 75, correlationId },
  });

  const scanId = String(start?.scanId || "");
  const storagePaths = start?.storagePaths;
  if (
    !scanId ||
    !storagePaths?.front ||
    !storagePaths?.back ||
    !storagePaths?.left ||
    !storagePaths?.right
  ) {
    throw new Error(
      `startScanSession returned invalid payload: ${JSON.stringify(start)}`
    );
  }

  const bytes = tinyJpegBytes();
  await Promise.all([
    uploadOne(storage, storagePaths.front, bytes),
    uploadOne(storage, storagePaths.back, bytes),
    uploadOne(storage, storagePaths.left, bytes),
    uploadOne(storage, storagePaths.right, bytes),
  ]);

  await httpJson(submitUrl, {
    idToken,
    body: {
      scanId,
      photoPaths: storagePaths,
      currentWeightKg: 80,
      goalWeightKg: 75,
      correlationId,
    },
  });

  const scanRef = doc(firestore, "users", uid, "scans", scanId);
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const snap = await getDoc(scanRef);
    const data = snap.exists() ? snap.data() : null;
    const status = data?.status;
    if (status === "complete" || status === "completed") {
      const workout = data?.workoutProgram || data?.workoutPlan;
      const nutrition = data?.nutritionPlan;
      if (!workout || !nutrition) {
        throw new Error(
          `Scan completed but missing plans: ${JSON.stringify({
            workout: !!workout,
            nutrition: !!nutrition,
          })}`
        );
      }
      console.log("[verify:scan] ok", {
        uid,
        scanId,
        status,
        usedFallback: Boolean(data?.usedFallback),
        lastStep: data?.lastStep || null,
      });
      // Ensure `emulators:exec` sees a clean exit (avoid being SIGTERM'd during shutdown).
      process.exit(0);
    }
    if (status === "error" || status === "failed") {
      throw new Error(
        `[verify:scan] scan failed: ${data?.errorMessage || "unknown_error"}`
      );
    }
    await delay(1000);
  }
  throw new Error("[verify:scan] timed out waiting for scan completion");
}

await main().catch((err) => {
  console.error("[verify:scan] failed", {
    message: err?.message,
    status: err?.status,
    data: err?.data,
  });
  process.exit(1);
});

