import { auth } from "./firebase";
import { openExternal } from "./links";

export type PlanKey = "one" | "extra" | "pro_monthly" | "elite_annual";

export const PRICE_IDS = {
  ONE_TIME_STARTER: "price_1RuOpKQQU5vuhlNjipfFBsR0",
  EXTRA_ONE_TIME: "price_1S4Y9JQQU5vuhlNjB7cBfmaW",
  PRO_MONTHLY: "price_1S4XsVQQU5vuhlNjzdQzeySA",
  ELITE_ANNUAL: "price_1S4Y6YQQU5vuhlNjeJFmshxX",
} as const;

export const STRIPE_PRICE_IDS = PRICE_IDS;

export const LEGACY_PLAN_PRICE_MAP: Record<PlanKey, string> = {
  one: PRICE_IDS.ONE_TIME_STARTER,
  extra: PRICE_IDS.EXTRA_ONE_TIME,
  pro_monthly: PRICE_IDS.PRO_MONTHLY,
  elite_annual: PRICE_IDS.ELITE_ANNUAL,
};

type ErrorPayload = { error: string; code?: string };

const CHECKOUT_ERROR_COPY: Record<string, string> = {
  stripe_config_missing: "Billing is currently offline. Please try again soon.",
  stripe_customer_error: "We couldn't sync your billing details. Contact support if it persists.",
  missing_email: "Add an email to your account before purchasing.",
  invalid_price: "That plan isn't available right now. Refresh and try again.",
  auth_required: "Sign in to purchase a plan.",
  origin_not_allowed: "Open checkout from the MyBodyScan app or site.",
};

const PORTAL_ERROR_COPY: Record<string, string> = {
  no_customer: "Complete a purchase first to access the billing portal.",
  stripe_config_missing: "Billing is currently offline. Try again shortly.",
  stripe_customer_error: "We couldn't open the portal. Contact support if the issue continues.",
  auth_required: "Sign in to manage billing.",
};

export function describeCheckoutError(code?: string): string {
  if (!code) return "We couldn't open checkout. Please try again.";
  return CHECKOUT_ERROR_COPY[code] ?? "We couldn't open checkout. Please try again.";
}

export function describePortalError(code?: string): string {
  if (!code) return "We couldn't open the billing portal. Please try again.";
  return PORTAL_ERROR_COPY[code] ?? "We couldn't open the billing portal. Please try again.";
}

async function postWithAuth(path: string, body: unknown): Promise<any> {
  const user = auth.currentUser;
  if (!user) {
    throw { error: "auth_required", code: "auth_required" } satisfies ErrorPayload;
  }

  let token: string;
  try {
    token = await user.getIdToken();
  } catch {
    throw { error: "auth_required", code: "auth_required" } satisfies ErrorPayload;
  }

  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    credentials: "include",
  });

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    if (data && typeof data === "object") {
      const payload = data as Partial<ErrorPayload>;
      throw { error: payload.error ?? "unknown_error", code: payload.code };
    }
    throw { error: "unknown_error" } satisfies ErrorPayload;
  }

  return data;
}

type CheckoutOptions = {
  navigate?: boolean;
};

export async function startCheckout(priceId: string, options?: CheckoutOptions) {
  const trimmed = typeof priceId === "string" ? priceId.trim() : "";
  const result = await postWithAuth("/createCheckout", { priceId: trimmed });
  const url = typeof result?.url === "string" ? result.url : "";
  if (!url) {
    throw { error: "invalid_response" } satisfies ErrorPayload;
  }
  if (options?.navigate === false) {
    return { url } as const;
  }
  openExternal(url);
  return { url } as const;
}

export async function openCustomerPortal(options?: CheckoutOptions) {
  const result = await postWithAuth("/createCustomerPortal", {});
  const url = typeof result?.url === "string" ? result.url : "";
  if (!url) {
    throw { error: "invalid_response" } satisfies ErrorPayload;
  }
  if (options?.navigate === false) {
    return { url } as const;
  }
  openExternal(url);
  return { url } as const;
}
