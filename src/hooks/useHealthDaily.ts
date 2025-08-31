import { Capacitor } from "@capacitor/core";
import { useMemo } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import type { DailySummary, HealthAdapter } from "@/integrations/health/HealthAdapter";
import { WebMockAdapter } from "@/integrations/health/WebMockAdapter";
import { IOSHealthKitAdapter } from "@/integrations/health/IOSHealthKitAdapter";
import { AndroidHealthConnectAdapter } from "@/integrations/health/AndroidHealthConnectAdapter";

export function useHealthDaily() {
  const platform = Capacitor.getPlatform();

  const adapter: HealthAdapter = useMemo(() => {
    if (platform === "ios") return new IOSHealthKitAdapter();
    if (platform === "android") return new AndroidHealthConnectAdapter();
    return new WebMockAdapter();
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

