import { call } from "@/lib/callable";

export type SyncEntitlementsResponse = {
  ok: true;
  didWrite: boolean;
  entitlements: Record<string, unknown> | null;
};

export async function syncEntitlements(): Promise<SyncEntitlementsResponse | null> {
  try {
    const res = await call<unknown, SyncEntitlementsResponse>("syncEntitlements", {});
    return (res?.data as any) ?? null;
  } catch {
    return null;
  }
}

