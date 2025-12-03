import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";
import { ensureAppCheck } from "@/lib/appCheck";
import { functions } from "@/lib/firebase";

export type CheckoutMode = "payment" | "subscription";

type CheckoutCallableResponse = { sessionId?: string | null; url?: string | null };

const createCheckoutCallable = httpsCallable<
  { priceId: string; mode: CheckoutMode; promoCode?: string },
  CheckoutCallableResponse
>(functions, "createCheckout");

function normalizeCheckoutError(error: unknown): Error {
  if (error instanceof FirebaseError) {
    const code = error.code ?? "";
    let message = "We couldn't open checkout. Please try again.";
    if (code.includes("invalid-argument")) {
      message = "Invalid plan selected. Contact support if this persists.";
    } else if (code.includes("failed-precondition")) {
      message = "Billing is currently offline.";
    } else if (code.includes("unauthenticated")) {
      message = "Sign in to purchase a plan.";
    } else if (code.includes("permission-denied")) {
      message = "Your account cannot start checkout right now.";
    } else if (code.includes("unavailable")) {
      message = "Billing is temporarily unavailable. Please try again later.";
    }
    const err = new Error(message);
    (err as Error & { code?: string }).code = code || error.name;
    return err;
  }
  if (error instanceof Error) return error;
  return new Error("We couldn't open checkout. Please try again.");
}

export async function startCheckout(
  priceId: string,
  mode: CheckoutMode = "subscription",
  promoCode?: string,
): Promise<{ sessionId: string | null; url: string | null }> {
  if (!priceId?.trim()) {
    throw new Error("Plan unavailable");
  }
  await ensureAppCheck();
  try {
    const response = await createCheckoutCallable({ priceId, mode, promoCode });
    const data = (response?.data ?? response) as CheckoutCallableResponse;
    const sessionId = typeof data?.sessionId === "string" && data.sessionId ? data.sessionId : null;
    const url = typeof data?.url === "string" && data.url ? data.url : null;
    return { sessionId, url };
  } catch (error) {
    throw normalizeCheckoutError(error);
  }
}
