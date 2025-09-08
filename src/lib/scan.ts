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

export function watchScans(uid: string, cb: (items: any[]) => void) {
  if (USE_STUB) {
    cb([]);
    return () => {};
  }
  const q = query(collection(db, `users/${uid}/scans`), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
