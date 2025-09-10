import { log } from "./logger";
import { isDemoGuest } from "./demoFlag";
import { toast } from "@/hooks/use-toast";
import { track } from "./analytics";

export async function startCheckout(
    priceId: string,
    mode: "payment" | "subscription"
  ) {
    if (isDemoGuest()) {
      track("demo_block", { action: "checkout" });
      try {
        toast({ title: "Create a free account to purchase a plan." });
      } catch {}
      window.location.assign("/auth");
      return;
    }
    const { getAuth } = await import("firebase/auth");
    const user = getAuth().currentUser;
    if (!user) throw new Error("Not signed in");
    const token = await user.getIdToken();
    const res = await fetch(
    `${import.meta.env.VITE_FUNCTIONS_URL}/createCheckoutSession`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        priceId,
        mode,
        successUrl: window.location.origin + "/checkout/success",
        cancelUrl: window.location.origin + "/checkout/canceled",
      }),
    }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Checkout failed");
  window.location.assign(json.url as string);
}

export async function consumeOneCredit(): Promise<number> {
    if (isDemoGuest()) {
      track("demo_block", { action: "scan" });
      try {
        toast({ title: "Create a free account to start scanning." });
      } catch {}
      window.location.assign("/auth");
      throw new Error("demo-blocked");
    }
    const { getAuth } = await import("firebase/auth");
    const user = getAuth().currentUser;
    if (!user) throw new Error("Not signed in");
    const token = await user.getIdToken();
  try {
    const res = await fetch(`${import.meta.env.VITE_FUNCTIONS_URL}/useCredit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 402) {
      log("warn", "useCredit:no_credits");
      throw new Error("No credits available");
    }
    const json = await res.json();
    log("info", "useCredit:success", { remaining: json.remaining });
    return json.remaining as number;
  } catch (err: any) {
    log("warn", "useCredit:error", { message: err?.message });
    throw err;
  }
}
