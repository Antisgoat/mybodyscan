import { getStorage, ref, uploadBytesResumable, type UploadTask } from "firebase/storage";
import { auth } from "@/lib/firebase";

export type Pose = "front" | "back" | "left" | "right";
export type PoseBlobs = Record<Pose, Blob>;
export type UploadProgress = { pose: Pose; bytesTransferred: number; totalBytes: number; percent: number };

export async function uploadScanBlobs(opts: {
  scanId: string;
  blobs: PoseBlobs;
  onProgress?: (p: UploadProgress) => void;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const storage = getStorage();

  const tasks: Promise<void>[] = (Object.keys(opts.blobs) as Pose[]).map((pose) => {
    const blob = opts.blobs[pose];
    const path = `scans/${user.uid}/${opts.scanId}/original/${pose}.jpg`;
    const r = ref(storage, path);
    return new Promise<void>((resolve, reject) => {
      const task: UploadTask = uploadBytesResumable(r, blob, {
        contentType: "image/jpeg",
        cacheControl: "no-store",
      });
      task.on(
        "state_changed",
        (snap) => {
          if (opts.onProgress) {
            const percent = snap.totalBytes ? (snap.bytesTransferred / snap.totalBytes) * 100 : 0;
            opts.onProgress({ pose, bytesTransferred: snap.bytesTransferred, totalBytes: snap.totalBytes, percent });
          }
        },
        (err) => reject(err),
        () => resolve()
      );
    });
  });

  await Promise.all(tasks);
}
