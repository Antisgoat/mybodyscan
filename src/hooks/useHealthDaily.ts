import { Capacitor } from "@capacitor/core";
import { useMemo } from "react";
import { auth as firebaseAuth, db } from "@/lib/firebase";
import { setDoc } from "@/lib/dbWrite";
import { doc, serverTimestamp } from "firebase/firestore";
import type { DailySummary, HealthAdapter } from "@/integrations/health/HealthAdapter";
import { WebFallbackAdapter } from "@/integrations/health/WebFallbackAdapter";
import { IOSHealthKitAdapter } from "@/integrations/health/IOSHealthKitAdapter";
import { AndroidHealthConnectAdapter } from "@/integrations/health/AndroidHealthConnectAdapter";

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
    const uid = firebaseAuth.currentUser?.uid;
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

