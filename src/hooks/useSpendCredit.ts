import { call } from "@/lib/callable";

export function useSpendCredit() {
  async function spend(reason?: string) {
    const { data } = await call<{ reason?: string }, { ok: boolean; remaining: number }>("useCredit", { reason });
    return data as { ok: boolean; remaining: number };
  }

  return { spend };
}

