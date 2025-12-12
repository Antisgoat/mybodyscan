import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";
import { ensureAppCheck } from "@/lib/appCheck";
import { functions } from "@/lib/firebase";

export type CheckoutMode = "payment" | "subscription";

type CheckoutCallableResponse = { sessionId?: string | null; url?: string | null; debugId?: string | null };

const createCheckoutCallable = httpsCallable<
  { priceId: string; mode: CheckoutMode; promoCode?: string },
  CheckoutCallableResponse
>(functions, "createCheckout");

function extractDebugId(error: FirebaseError): string | undefined {
  const serverResponse = error.customData?.serverResponse;
  const details = (serverResponse as any)?.details;
  if (details && typeof details === "object") {
    return details.debugId || details?.details?.debugId;
  }
  return undefined;
}

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
    (err as Error & { code?: string; debugId?: string }).code = code || error.name;
    (err as Error & { code?: string; debugId?: string }).debugId = extractDebugId(error);
    return err;
  }
  if (error instanceof Error) return error;
  return new Error("We couldn't open checkout. Please try again.");
}

// Small pure helper used by tests and non-callable fallback clients.
export function buildCheckoutHeaders(idToken?: string | null, appCheckToken?: string | null): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const id = typeof idToken === "string" && idToken.trim().length ? idToken.trim() : "";
  const app = typeof appCheckToken === "string" && appCheckToken.trim().length ? appCheckToken.trim() : "";
  if (id) headers.Authorization = `Bearer ${id}`;
  if (app) headers["X-Firebase-AppCheck"] = app;
  return headers;
}

export async function startCheckout(
  priceId: string,
  mode: CheckoutMode = "subscription",
  promoCode?: string,
): Promise<{ sessionId: string | null; url: string | null; debugId?: string | null }> {
  if (!priceId?.trim()) {
    throw new Error("Plan unavailable");
  }
  await ensureAppCheck();
  try {
    const response = await createCheckoutCallable({ priceId, mode, promoCode });
    const data = (response?.data ?? response) as CheckoutCallableResponse;
    const sessionId = typeof data?.sessionId === "string" && data.sessionId ? data.sessionId : null;
    const url = typeof data?.url === "string" && data.url ? data.url : null;
    return { sessionId, url, debugId: data?.debugId ?? null };
  } catch (error) {
    throw normalizeCheckoutError(error);
  }
}
