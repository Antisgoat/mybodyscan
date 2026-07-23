import { useCredits } from "./useCredits";
import { useEntitlements } from "@/lib/entitlements/store";
import { hasPro } from "@/lib/entitlements/pro";

interface Entitlement {
  subscribed: boolean;
  plan: string | null;
  credits: number;
}

export function useEntitlement() {
  const { credits, loading: creditsLoading } = useCredits();
  const { entitlements, loading: entitlementsLoading } = useEntitlements();
  const subscribed = hasPro(entitlements);
  const entitlement: Entitlement = {
    subscribed,
    plan: subscribed ? "pro" : null,
    credits,
  };

  return {
    ...entitlement,
    loading: creditsLoading || entitlementsLoading,
    hasAccess: (feature: "scan" | "coach" | "nutrition") => {
      if (feature === "scan") {
        return entitlement.credits > 0;
      }
      return entitlement.subscribed;
    },
  };
}
