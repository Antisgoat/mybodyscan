import { collection, getDocs, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { toast } from "@/hooks/use-toast";
import { isDemoActive } from "./demoFlag";
import { track } from "./analytics";
import { log } from "./logger";
import { FirebaseError } from "firebase/app";
import { auth as firebaseAuth, db, functions } from "./firebase";

export async function getRemainingCredits(uid: string): Promise<number> {
  const now = new Date();
  const creditsQuery = query(
    collection(db, "users", uid, "credits"),
    where("consumedAt", "==", null)
  );
  const snap = await getDocs(creditsQuery);
  return snap.docs.filter((doc) => {
    const data = doc.data() as { expiresAt?: { toDate?: () => Date } };
    const expiresAt = data.expiresAt?.toDate?.();
    if (!expiresAt) return true;
    return expiresAt.getTime() > now.getTime();
  }).length;
}

export async function consumeOneCredit(): Promise<number> {
  if (isDemoActive()) {
    track("demo_block", { action: "scan" });
    try {
      toast({
        title: "Sign up to use this feature",
        description: "Create a free account to start scanning.",
      });
    } catch {
      // ignore toast failures in non-UI contexts
    }
    window.location.assign("/auth");
    throw new Error("demo-blocked");
  }
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Not signed in");
  try {
    const fn = httpsCallable(functions, "useCredit");
    const result = await fn({ reason: "scan" });
    const payload = result.data as { ok?: boolean; remaining?: number };
    if (!payload?.ok) {
      log("warn", "useCredit:no_credits");
      throw new Error("No credits available");
    }
    log("info", "useCredit:success", { remaining: payload.remaining });
    return payload.remaining ?? 0;
  } catch (err: any) {
    if (err instanceof FirebaseError && err.code === "functions/failed-precondition") {
      log("warn", "useCredit:no_credits");
      throw new Error("No credits available");
    }
    log("warn", "useCredit:error", { message: err?.message });
    throw err;
  }
}
