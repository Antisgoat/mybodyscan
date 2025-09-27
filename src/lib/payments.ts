import { log } from "./logger";
import { isDemoGuest } from "./demoFlag";
import { toast } from "@/hooks/use-toast";
import { track } from "./analytics";
import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { authedFetch } from "@/lib/api";

export type CheckoutPlanKey = "single" | "monthly" | "yearly" | "extra";

export async function startCheckout(plan: CheckoutPlanKey) {
    if (isDemoGuest()) {
      track("demo_block", { action: "checkout" });
      try {
        toast({
          title: "Sign up to use this feature",
          description: "Create a free account to continue.",
        });
      } catch {}
      window.location.assign("/auth");
      return;
    }
    const { getAuth } = await import("firebase/auth");
    const user = getAuth().currentUser;
    if (!user) throw new Error("Not signed in");
    const response = await authedFetch(`/createCheckout`, {
      method: "POST",
      body: JSON.stringify({ plan }),
    });
    const payload = (await response
      .json()
      .catch(() => ({}))) as Record<string, unknown>;

    const errorCode = typeof (payload as any)?.error === "string" ? ((payload as any).error as string) : undefined;

    if (!response.ok) {
      if (errorCode === "config") {
        toast({
          title: "Checkout not configured",
          description: "Checkout not configured. Please contact support.",
          variant: "destructive",
        });
        return;
      }
      if (errorCode === "internal") {
        toast({
          title: "Checkout error",
          description: "Checkout error. Please try again.",
          variant: "destructive",
        });
        return;
      }
      throw new Error(errorCode || "Checkout failed");
    }

    if (errorCode) {
      if (errorCode === "config") {
        toast({
          title: "Checkout not configured",
          description: "Checkout not configured. Please contact support.",
          variant: "destructive",
        });
        return;
      }
      if (errorCode === "internal") {
        toast({
          title: "Checkout error",
          description: "Checkout error. Please try again.",
          variant: "destructive",
        });
        return;
      }
    }

    const url = typeof (payload as any)?.url === "string" ? ((payload as any).url as string) : null;
    if (!url) {
      throw new Error("Checkout failed");
    }
    window.location.assign(url);
}

export async function consumeOneCredit(): Promise<number> {
    if (isDemoGuest()) {
      track("demo_block", { action: "scan" });
      try {
        toast({ 
          title: "Sign up to use this feature",
          description: "Create a free account to start scanning.",
        });
      } catch {}
      window.location.assign("/auth");
      throw new Error("demo-blocked");
    }
    const { getAuth } = await import("firebase/auth");
    const user = getAuth().currentUser;
    if (!user) throw new Error("Not signed in");
  try {
    const fn = httpsCallable(functions, "useCredit");
    const result = await fn({ reason: "scan" });
    const payload = result.data as { ok?: boolean; remaining?: number };
    if (!payload?.ok) {
      log("warn", "useCredit:no_credits");
      throw new Error("No credits available");
    }
    log("info", "useCredit:success", { remaining: payload.remaining });
    return payload.remaining ?? 0;
  } catch (err: any) {
    if (err instanceof FirebaseError && err.code === "functions/failed-precondition") {
      log("warn", "useCredit:no_credits");
      throw new Error("No credits available");
    }
    log("warn", "useCredit:error", { message: err?.message });
    throw err;
  }
}
