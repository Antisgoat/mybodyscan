import { functions } from "@/lib/firebase";
import { httpsCallable } from "firebase/functions";

export function useSpendCredit() {
  async function spend(reason?: string) {
    const fn = httpsCallable(functions, "useCredit");
    const { data } = await fn({ reason });
    return data as { ok: boolean; remaining: number };
  }

  return { spend };
}

