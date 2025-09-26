import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";

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
