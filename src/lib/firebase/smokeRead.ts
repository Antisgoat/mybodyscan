import { doc, getDoc } from "firebase/firestore";

import { error as toastError } from "@/lib/toast";

import { db } from "./client";

let lastUid: string | null = null;
let inFlight: Promise<void> | null = null;

export async function smokeFirestoreRead(uid: string): Promise<void> {
  if (!uid) return;
  if (lastUid === uid && inFlight) {
    return inFlight;
  }

  lastUid = uid;
  inFlight = (async () => {
    try {
      const ref = doc(db, "users", uid);
      await getDoc(ref);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.info("[firebase] smoke read ok", { uid });
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[firebase] smoke read failed", error);
      toastError(
        "We couldn't load your account data. Please check your connection or sign in again."
      );
    }
  })();

  return inFlight;
}
