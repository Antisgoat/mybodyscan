import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { disableDemoEverywhere } from "@/lib/demoState";
import { bootstrapSystem } from "@/lib/system";
import { getIdToken, useAuthUser } from "@/auth/mbs-auth";
import { upsertUserRootProfile } from "@/lib/auth/userProfileUpsert";
import { initPurchases } from "@/lib/billing/iapProvider";
import { syncEntitlements } from "@/lib/entitlements/syncEntitlements";
import { collection, getDocs, limit, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { syncNativePushRegistration } from "@/lib/pushNotifications";

export function useAuthBootstrap() {
  const { user } = useAuthUser();
  const ranForUid = useRef<string | null>(null);
  const smokeCheckedUid = useRef<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!user) {
      ranForUid.current = null;
      return;
    }
    disableDemoEverywhere();
    if (ranForUid.current === user.uid) {
      return;
    }
    ranForUid.current = user.uid;

    void (async () => {
      // These are independent, best-effort bootstrap operations. A store,
      // push, or diagnostics outage must not be presented as an auth failure.
      void upsertUserRootProfile(user).catch((error) => {
        console.warn("profile_sync_failed", error);
      });
      void initPurchases({ uid: user.uid }).catch((error) => {
        console.warn("purchase_bootstrap_failed", error);
      });
      void syncNativePushRegistration(user.uid).catch((error) => {
        console.warn("push_registration_refresh_failed", error);
      });
      void bootstrapSystem().catch((error) => {
        console.warn("system_bootstrap_failed", error);
      });

      const sleep = (ms: number) =>
        new Promise<void>((resolve) => setTimeout(resolve, ms));
      for (let attempt = 0; attempt <= 2; attempt += 1) {
        try {
          const res = await syncEntitlements();
          if (res?.ok) break;
        } catch (error) {
          console.warn("entitlement_sync_failed", error);
        }
        if (attempt < 2) await sleep(250 * (attempt + 1));
      }

      if (smokeCheckedUid.current !== user.uid) {
        smokeCheckedUid.current = user.uid;
        try {
          const scansRef = collection(db, "users", user.uid, "scans");
          const snap = await getDocs(query(scansRef, limit(1)));
          if (snap.empty) {
            toast({
              title: "No scans yet",
              description:
                "You’re all set. Start a scan to see your first result.",
            });
          }
        } catch (error) {
          console.warn("firestore_smoke_failed", error);
        }
      }

      try {
        await getIdToken({ forceRefresh: true });
      } catch (error) {
        // Firebase independently emits signed-out state for an invalid session.
        // Keep a cached session usable through an ordinary offline refresh.
        console.warn("token_refresh_deferred", error);
      }
    })();
  }, [user, toast]);
}
