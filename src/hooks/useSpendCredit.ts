import { app } from "@/lib/firebase";
import { getFunctions, httpsCallable } from "firebase/functions";

export function useSpendCredit() {
  async function spend(reason?: string) {
    const fn = httpsCallable(getFunctions(app), "useCredit");
    const { data } = await fn({ reason });
    return data as { ok: boolean; remaining: number };
  }

  return { spend };
}

