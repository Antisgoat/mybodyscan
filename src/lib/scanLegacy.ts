import { httpsCallable } from "firebase/functions";
import { auth as firebaseAuth, db, storage, functions } from "./firebase";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
async function authedPost(path: string, body: Record<string, unknown>) {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("auth");
  const [token] = await Promise.all([
    user.getIdToken(),
  ]);
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      // App Check removed
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `request_failed_${response.status}`);
  }
  return response.json();
}

export async function startScan() {
  const data = await authedPost("/api/scan/start", {});
  return data as { scanId: string; uploadPathPrefix: string; status?: string };
}

export async function uploadScanPhotos(scan: { uploadPathPrefix: string }, files: File[]) {
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
  return authedPost("/api/scan/submit", { scanId, files }) as Promise<{ scanId: string; status?: string }>;
}

export async function runBodyScan(file: string) {
  const runBodyScanFn = httpsCallable(functions, "runBodyScan");
  const { data } = await runBodyScanFn({ file });
  return data as { scanId: string; uploadPathPrefix?: string; status?: string };
}

export async function uploadScanFile(uid: string, scanId: string, file: File) {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `scans/${uid}/${scanId}/original.${ext}`;
  await uploadBytes(ref(storage, path), file);
  return path;
}

export function listenToScan(uid: string, scanId: string, onUpdate: (scan: any) => void, onError: () => void) {
  const docRef = collection(db, `users/${uid}/scans`);
  const q = query(docRef, orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    const scan = snap.docs.find((d) => d.id === scanId);
    if (scan) onUpdate({ id: scan.id, ...scan.data() });
  }, onError);
}

export function watchScans(uid: string, cb: (items: any[]) => void) {
  const q = query(collection(db, `users/${uid}/scans`), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
