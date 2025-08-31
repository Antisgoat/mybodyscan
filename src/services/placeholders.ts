import { v4 as uuidv4 } from "uuid";

export type PlanType = "none" | "monthly" | "annual";
export type MediaType = "photos" | "video";
export type ScanStatus = "queued" | "processing" | "done" | "error";

export type Timestamp = string; // ISO string placeholder

export type Scan = {
  id: string;
  uid: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  mediaType: MediaType;
  status: ScanStatus;
  files: {
    frontUrl?: string;
    leftUrl?: string;
    rightUrl?: string;
    backUrl?: string;
    videoUrl?: string;
  };
  results: {
    bodyFatPct?: number;
    weightKg?: number;
    BMI?: number;
  };
  qualityScore?: number;
  modelVersion?: string;
  notes?: string;
  tags?: string[];
  billing?: {
    mode?: "single" | "credit";
    price?: number;
    currency?: string;
  };
};

const store = new Map<string, Map<string, Scan>>(); // uid -> scanId -> scan

const now = () => new Date().toISOString();

function upsertScan(scan: Scan) {
  if (!store.has(scan.uid)) store.set(scan.uid, new Map());
  store.get(scan.uid)!.set(scan.id, scan);
}

export async function getLastScan(uid: string): Promise<Scan | null> {
  const userScans = store.get(uid);
  if (!userScans) return null;
  const scans = Array.from(userScans.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return scans[0] || null;
}

export async function listScansByUid(uid: string, limit = 50): Promise<Scan[]> {
  const userScans = store.get(uid);
  if (!userScans) return [];
  return Array.from(userScans.values())
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);
}

export async function getScan(uid: string, scanId: string): Promise<Scan | null> {
  const userScans = store.get(uid);
  return userScans?.get(scanId) || null;
}

function simulateProcessingToDone(uid: string, scanId: string) {
  // Simulate processing for demo. Replace with Firestore polling.
  setTimeout(() => {
    const s = store.get(uid)?.get(scanId);
    if (!s) return;
    s.status = "processing";
    s.updatedAt = now();
    upsertScan(s);
  }, 1500);
  setTimeout(() => {
    const s = store.get(uid)?.get(scanId);
    if (!s) return;
    s.status = "done";
    s.updatedAt = now();
    s.results = s.results || {};
    s.results.bodyFatPct = 18.9;
    s.results.weightKg = 74.2;
    s.results.BMI = 23.5;
    s.qualityScore = 0.96;
    s.modelVersion = "v1.0";
    upsertScan(s);
  }, 4500);
}

export async function createScanDraftPhotos(uid: string, files: { front: File; left: File; right: File; back: File }) {
  const id = uuidv4();
  const scan: Scan = {
    id,
    uid,
    createdAt: now(),
    updatedAt: now(),
    mediaType: "photos",
    status: "queued",
    files: {
      frontUrl: `/users/${uid}/raw/${id}_front.jpg`,
      leftUrl: `/users/${uid}/raw/${id}_left.jpg`,
      rightUrl: `/users/${uid}/raw/${id}_right.jpg`,
      backUrl: `/users/${uid}/raw/${id}_back.jpg`,
    },
    results: {},
    notes: "",
    tags: [],
    billing: { mode: "single", price: 999, currency: "usd" },
  };
  upsertScan(scan);
  // Simulate upload + processing pipeline
  simulateProcessingToDone(uid, id);
  return { scanId: id, scan };
}

export async function createScanDraftVideo(uid: string, file: File, durationSec: number) {
  const id = uuidv4();
  const scan: Scan = {
    id,
    uid,
    createdAt: now(),
    updatedAt: now(),
    mediaType: "video",
    status: "queued",
    files: {
      videoUrl: `/users/${uid}/raw/${id}.mp4`,
    },
    results: {},
    notes: "",
    tags: [],
    billing: { mode: "single", price: 999, currency: "usd" },
  };
  upsertScan(scan);
  simulateProcessingToDone(uid, id);
  return { scanId: id, scan };
}

export async function addNote(uid: string, scanId: string, note: string) {
  const s = store.get(uid)?.get(scanId);
  if (s) {
    s.notes = note;
    s.updatedAt = now();
    upsertScan(s);
  }
}

export async function openStripeCheckout(
  _priceId: string,
  _plan: string,
  _mode: "payment" | "subscription"
) {
  // Placeholder – replace with Cloud Function URL
  return { url: "https://example.com/checkout" };
}
