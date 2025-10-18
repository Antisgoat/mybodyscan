import { Capacitor } from "@capacitor/core";
import { useMemo } from "react";
import { auth, db } from "@app/lib/firebase.ts";
import { setDoc } from "@app/lib/dbWrite.ts";
import { doc, serverTimestamp } from "firebase/firestore";
import type { DailySummary, HealthAdapter } from "@app/integrations/health/HealthAdapter.ts";
import { WebFallbackAdapter } from "@app/integrations/health/WebFallbackAdapter.ts";
import { IOSHealthKitAdapter } from "@app/integrations/health/IOSHealthKitAdapter.ts";
import { AndroidHealthConnectAdapter } from "@app/integrations/health/AndroidHealthConnectAdapter.ts";

export function useHealthDaily() {
  const platform = Capacitor.getPlatform();

  const adapter: HealthAdapter = useMemo(() => {
    if (platform === "ios") return new IOSHealthKitAdapter();
    if (platform === "android") return new AndroidHealthConnectAdapter();
    return new WebFallbackAdapter();
  }, [platform]);

  async function connect() {
    return adapter.requestPermissions();
  }

  async function syncDay(date: string): Promise<DailySummary> {
    const summary = await adapter.getDailySummary(date);
    const uid = auth.currentUser?.uid;
    if (uid) {
      const ref = doc(db, "users", uid, "healthDaily", date);
      await setDoc(
        ref,
        { ...summary, syncedAt: serverTimestamp() },
        { merge: true }
      );
    }
    return summary;
  }

  return { platform, connect, syncDay };
}

