import { log } from "./logger";
import { isDemoGuest } from "./demoFlag";
import { toast } from "@/hooks/use-toast";
import { track } from "./analytics";
import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

export async function startCheckout(
    priceId: string,
    mode: "payment" | "subscription"
  ) {
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
    const createSession = httpsCallable(functions, "createCheckoutSession");
    const { data } = await createSession({
      priceId,
      mode,
      successUrl: window.location.origin + "/checkout/success",
      cancelUrl: window.location.origin + "/checkout/canceled",
    });
    const payload = data as { url?: string | null };
    if (!payload?.url) {
      throw new Error("Checkout failed");
    }
    window.location.assign(payload.url);
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
