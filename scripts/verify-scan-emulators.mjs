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
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";

import { initializeApp } from "firebase/app";

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

  await waitForHttpReady(`http://${storageHost}:${storagePort}/`, 10_000);

  const signedIn = await signInAnonymously(auth);
  const idToken = await signedIn.user.getIdToken();
  const uid = signedIn.user.uid;
  const functionsRequire = createRequire(
    new URL("../functions/package.json", import.meta.url)
  );
  const { initializeApp: initializeAdminApp } =
    functionsRequire("firebase-admin/app");
  const { getAuth: getAdminAuth } = functionsRequire("firebase-admin/auth");
  const { getFirestore: getAdminFirestore, Timestamp: AdminTimestamp } =
    functionsRequire("firebase-admin/firestore");
  const { getStorage: getAdminStorage } = functionsRequire(
    "firebase-admin/storage"
  );
  const adminApp = initializeAdminApp(
    { projectId, storageBucket: bucket },
    `verify-scan-${randomUUID()}`
  );
  const adminDb = getAdminFirestore(adminApp);
  const adminAuth = getAdminAuth(adminApp);
  const adminBucket = getAdminStorage(adminApp).bucket(bucket);
  const creditRef = adminDb.doc(`users/${uid}/private/credits`);
  const initialCreditTime = AdminTimestamp.now();
  await creditRef.set({
    creditBuckets: [
      {
        amount: 2,
        grantedAt: initialCreditTime,
        expiresAt: null,
        sourcePriceId: null,
        context: "local-scan-verification",
      },
    ],
    creditsSummary: {
      totalAvailable: 2,
      lastUpdated: initialCreditTime,
    },
  });

  const startUrl = `http://${functionsHost}:${functionsPort}/${projectId}/${region}/startScanSession`;
  const uploadUrl = `http://${functionsHost}:${functionsPort}/${projectId}/${region}/scanUpload`;
  const bytes = tinyJpegBytes();

  async function uploadThroughFunction(session) {
    const form = new FormData();
    form.set("scanId", session.scanId);
    form.set("correlationId", session.correlationId);
    form.set("currentWeight", "80");
    form.set("goalWeight", "75");
    form.set("currentWeightKg", "80");
    form.set("goalWeightKg", "75");
    form.set("unit", "kg");
    for (const pose of ["front", "back", "left", "right"]) {
      form.append(
        pose,
        new Blob([bytes], { type: "image/jpeg" }),
        `${pose}.jpg`
      );
    }
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "X-Correlation-Id": session.correlationId,
      },
      body: form,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(
        payload?.message || `Upload failed (${response.status})`
      );
      error.status = response.status;
      error.data = payload;
      throw error;
    }
    if (payload?.correlationId !== session.correlationId) {
      throw new Error("scanUpload did not preserve the correlation ID");
    }
    return payload;
  }

  async function startAndUpload(label) {
    const correlationId = `${label}-${randomUUID().slice(0, 8)}`;
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
      throw new Error("startScanSession returned an invalid payload");
    }
    const session = { scanId, storagePaths, correlationId };
    const upload = await uploadThroughFunction(session);
    return { ...session, upload };
  }

  async function waitForTerminal(scanId, expected) {
    const scanRef = adminDb.doc(`users/${uid}/scans/${scanId}`);
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const snap = await scanRef.get();
      const data = snap.exists ? snap.data() : null;
      const status = String(data?.status || "").toLowerCase();
      if (expected.includes(status)) return data;
      if (["complete", "completed", "error", "failed"].includes(status)) {
        throw new Error(`Unexpected terminal scan status: ${status}`);
      }
      await delay(250);
    }
    throw new Error("Timed out waiting for scan completion");
  }

  async function creditBalance() {
    const snap = await creditRef.get();
    return Number(snap.data()?.creditsSummary?.totalAvailable ?? -1);
  }

  const successSession = await startAndUpload("verify-scan-success");
  const firstSubmit = successSession.upload;
  if (firstSubmit.creditsRemaining !== 1) {
    throw new Error("Successful scan did not consume exactly one credit");
  }
  const completed = await waitForTerminal(successSession.scanId, [
    "complete",
    "completed",
  ]);
  if (
    !(completed?.workoutProgram || completed?.workoutPlan) ||
    !completed?.nutritionPlan
  ) {
    throw new Error("Completed scan is missing deterministic plans");
  }
  if ((await creditBalance()) !== 1) {
    throw new Error("Credit balance mismatch after successful scan");
  }
  const debitLedger = await adminDb
    .doc(`credits_ledger/scan:${uid}:${successSession.scanId}`)
    .get();
  if (!debitLedger.exists || debitLedger.data()?.amount !== -1) {
    throw new Error("Successful scan is missing its debit ledger entry");
  }

  const duplicateSubmit = await uploadThroughFunction(successSession);
  if (duplicateSubmit.idempotent !== true) {
    throw new Error("Duplicate scan submission was not idempotent");
  }
  if ((await creditBalance()) !== 1) {
    throw new Error("Duplicate submission consumed an extra credit");
  }

  const mockBaseUrl = process.env.VERIFY_OPENAI_BASE_URL;
  if (!mockBaseUrl) throw new Error("Missing local OpenAI verifier URL");
  const modeResponse = await fetch(`${mockBaseUrl}/__mode/fail`, {
    method: "POST",
  });
  if (!modeResponse.ok)
    throw new Error("Unable to enable failure verification");

  const failureSession = await startAndUpload("verify-scan-failure");
  const failureSubmit = failureSession.upload;
  if (failureSubmit.creditsRemaining !== 0) {
    throw new Error("Failure-path scan did not reserve exactly one credit");
  }
  await waitForTerminal(failureSession.scanId, ["error", "failed"]);
  const refundDeadline = Date.now() + 15_000;
  let failed = null;
  while (Date.now() < refundDeadline) {
    const snap = await adminDb
      .doc(`users/${uid}/scans/${failureSession.scanId}`)
      .get();
    failed = snap.data();
    if (failed?.charged === false && failed?.creditStatus === "refunded") break;
    await delay(100);
  }
  if (failed?.charged !== false || failed?.creditStatus !== "refunded") {
    throw new Error("Failed scan was not marked as refunded");
  }
  if ((await creditBalance()) !== 1) {
    throw new Error("Failed scan did not restore its credit exactly once");
  }
  const refundLedger = await adminDb
    .doc(`credits_ledger/refund:${uid}:${failureSession.scanId}`)
    .get();
  if (!refundLedger.exists || refundLedger.data()?.amount !== 1) {
    throw new Error("Failed scan is missing its refund ledger entry");
  }
  const finalCredits = await creditBalance();

  // Verify the real callable used by Settings deletes every account surface.
  // This runs last because a successful deletion invalidates the test identity.
  await adminDb
    .doc(`users/${uid}`)
    .set({ displayName: "Account deletion verifier" }, { merge: true });
  await adminBucket
    .file(`user_uploads/${uid}/account-deletion-check.txt`)
    .save("local verification only", { contentType: "text/plain" });
  await adminBucket
    .file(`transformation-previews/${uid}/verification/goal-preview.jpg`)
    .save("local verification only", { contentType: "image/jpeg" });
  await adminDb
    .doc(`users/${uid}/notificationTokens/verification-token`)
    .set({ token: "verification-token-value", active: true });
  await adminDb
    .doc("pushTokenOwners/verification-token")
    .set({ uid });

  const deleteUrl = `http://${functionsHost}:${functionsPort}/${projectId}/${region}/deleteMyAccount`;
  const deleteResponse = await fetch(deleteUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ data: {} }),
  });
  const deletePayload = await deleteResponse.json().catch(() => null);
  if (!deleteResponse.ok || deletePayload?.result?.ok !== true) {
    throw new Error(
      `Account deletion callable failed (${deleteResponse.status}): ${JSON.stringify(deletePayload)}`
    );
  }

  const deletedUserTree = await adminDb.doc(`users/${uid}`).get();
  if (deletedUserTree.exists) {
    throw new Error("Account deletion left the Firestore user document behind");
  }
  const deletedScans = await adminDb.collection(`users/${uid}/scans`).get();
  if (!deletedScans.empty) {
    throw new Error("Account deletion left Firestore scans behind");
  }
  const deletedPushOwner = await adminDb
    .doc("pushTokenOwners/verification-token")
    .get();
  if (deletedPushOwner.exists) {
    throw new Error("Account deletion left push-token ownership behind");
  }
  for (const prefix of [
    `scans/${uid}/`,
    `user_uploads/${uid}/`,
    `transformation-previews/${uid}/`,
  ]) {
    const [files] = await adminBucket.getFiles({ prefix });
    if (files.length > 0) {
      throw new Error(`Account deletion left Storage objects under ${prefix}`);
    }
  }
  try {
    await adminAuth.getUser(uid);
    throw new Error("Account deletion left the Auth user behind");
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
  }

  console.log("[verify:scan] ok", {
    successfulScan: successSession.scanId,
    failedScan: failureSession.scanId,
    finalCredits,
    duplicateSubmitIdempotent: true,
    refundVerified: true,
    accountDeletionVerified: true,
  });
  // Ensure `emulators:exec` sees a clean exit (avoid being SIGTERM'd during shutdown).
  process.exit(0);
}

await main().catch((err) => {
  console.error("[verify:scan] failed", {
    message: err?.message,
    status: err?.status,
    data: err?.data,
  });
  process.exit(1);
});
