import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";
import { apiFetchJson } from "@/lib/apiFetch";
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

function normalizeCheckoutResponse(data: CheckoutCallableResponse | null | undefined) {
  const sessionId = typeof data?.sessionId === "string" && data.sessionId ? data.sessionId : null;
  const url = typeof data?.url === "string" && data.url ? data.url : null;
  return { sessionId, url, debugId: data?.debugId ?? null };
}

function shouldUseHttpFallback(error: unknown): boolean {
  if (!(error instanceof FirebaseError)) return false;
  const code = error.code ?? "";
  return (
    code.includes("failed-precondition") ||
    code.includes("permission-denied") ||
    code.includes("unavailable") ||
    code.includes("internal")
  );
}

async function callHttpCheckout(priceId: string, mode: CheckoutMode, promoCode?: string) {
  const payload = await apiFetchJson<CheckoutCallableResponse>("/createCheckout", {
    method: "POST",
    body: JSON.stringify({ priceId, mode, promoCode }),
  });
  return normalizeCheckoutResponse(payload);
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
    return normalizeCheckoutResponse(data);
  } catch (error) {
    const normalizedError = normalizeCheckoutError(error);
    if (shouldUseHttpFallback(error)) {
      try {
        console.warn("[checkout] callable_failed_falling_back", {
          code: (error as FirebaseError)?.code,
          message: (error as FirebaseError)?.message,
        });
        return await callHttpCheckout(priceId, mode, promoCode);
      } catch (fallbackError) {
        throw normalizeCheckoutError(fallbackError);
      }
    }
    throw normalizedError;
  }
}
