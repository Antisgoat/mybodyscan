import { auth, db, storage } from "./firebase";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";

const FUNCTIONS_URL = import.meta.env.VITE_FUNCTIONS_URL as string;
const USE_STUB = import.meta.env.VITE_SCANS_STUB === "true";

async function callFn(path: string, body: any) {
  const t = await auth.currentUser?.getIdToken();
  if (!t) throw new Error("auth");
  const r = await fetch(`${FUNCTIONS_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function startScan() {
  if (USE_STUB) {
    return {
      scanId: crypto.randomUUID(),
      uploadPathPrefix: "",
      status: "queued",
    };
  }
  return callFn("/startScanSession", {});
}

export async function uploadScanPhotos(scan: { uploadPathPrefix: string }, files: File[]) {
  if (USE_STUB) return true;
  const paths: string[] = [];
  for (const f of files) {
    const ext = f.name.split(".").pop() || "jpg";
    const path = `${scan.uploadPathPrefix}${crypto.randomUUID()}.${ext}`;
    await uploadBytes(ref(storage, path), f);
    paths.push(path);
  }
  return paths;
}

export async function submitScan(scanId: string, files: string[]) {
  if (USE_STUB) return { scanId, status: "ready" };
  return callFn("/submitScan", { scanId, files });
}

export async function runBodyScan(file: string) {
  if (USE_STUB) {
    return {
      scanId: crypto.randomUUID(),
      result: { bodyFatPct: 18.7, weightKg: 78.1, bmi: 24.6, mock: true },
    };
  }
  return callFn("/runBodyScan", { file });
}

export async function uploadScanFile(uid: string, scanId: string, file: File) {
  if (USE_STUB) return true;
  const ext = file.name.split(".").pop() || "jpg";
  const path = `scans/${uid}/${scanId}/original.${ext}`;
  await uploadBytes(ref(storage, path), file);
  return path;
}

export async function processScan(scanId: string) {
  if (USE_STUB) return { scanId, status: "processing" };
  return callFn("/processScan", { scanId });
}

export function listenToScan(uid: string, scanId: string, onUpdate: (scan: any) => void, onError: () => void) {
  if (USE_STUB) {
    setTimeout(() => onUpdate({ status: "completed", scanId }), 2000);
    return () => {};
  }
  const docRef = collection(db, `users/${uid}/scans`);
  const q = query(docRef, orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    const scan = snap.docs.find(d => d.id === scanId);
    if (scan) onUpdate({ id: scan.id, ...scan.data() });
  }, onError);
}

export function watchScans(uid: string, cb: (items: any[]) => void) {
  if (USE_STUB) {
    cb([]);
    return () => {};
  }
  const q = query(collection(db, `users/${uid}/scans`), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
