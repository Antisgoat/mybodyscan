import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { disableDemoEverywhere } from "@/lib/demoState";
import { bootstrapSystem } from "@/lib/system";
import { useAuthUser } from "@/lib/auth";
import { upsertUserRootProfile } from "@/lib/auth/userProfileUpsert";

export function useAuthBootstrap() {
  const { user } = useAuthUser();
  const ranForUid = useRef<string | null>(null);
  const failureCountRef = useRef(0);
  const lastToastAtRef = useRef<number>(0);
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
      try {
        // Do not block navigation on profile writes; best-effort only.
        void upsertUserRootProfile(user).catch(() => {
          toast({
            title: "Signed in, but profile sync failed",
            description:
              "You’re still signed in. If this persists, check your connection or try again.",
          });
        });
        await bootstrapSystem();
        await user.getIdToken(true);
        failureCountRef.current = 0;
      } catch (e) {
        console.warn("bootstrap failed", e);
        failureCountRef.current += 1;
        const now = Date.now();
        if (
          failureCountRef.current > 1 &&
          now - lastToastAtRef.current > 10_000
        ) {
          toast({
            title: "Refreshing access failed",
            description:
              "We could not refresh your permissions. Try signing out and back in.",
            variant: "destructive",
          });
          lastToastAtRef.current = now;
        }
      }
    })();
  }, [user, toast]);
}
