import { log } from "./logger.ts";
import { isDemoActive } from "./demoFlag.tsx";
import { toast } from "@app/hooks/use-toast.ts";
import { track } from "./analytics.ts";
import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "@app/lib/firebase.ts";
import { authedFetch } from "@app/lib/api.ts";

export type CheckoutPlanKey = "single" | "monthly" | "yearly" | "extra";

export async function startCheckout(plan: CheckoutPlanKey) {
  if (isDemoActive()) {
    track("demo_block", { action: "checkout" });
    try {
      toast({
        title: "Sign up to use this feature",
        description: "Create a free account to continue.",
      });
    } catch {
      // ignore toast failures in non-UI contexts
    }
    window.location.assign("/auth");
    return;
  }
  const user = auth.currentUser;
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
  if (isDemoActive()) {
    track("demo_block", { action: "scan" });
    try {
      toast({
        title: "Sign up to use this feature",
        description: "Create a free account to start scanning.",
      });
    } catch {
      // ignore toast failures in non-UI contexts
    }
    window.location.assign("/auth");
    throw new Error("demo-blocked");
  }
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const token = await user.getIdTokenResult();
  if (token.claims.unlimitedCredits === true || token.claims.tester === true) {
    return Number.POSITIVE_INFINITY;
  }
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
