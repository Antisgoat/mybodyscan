import { apiFetchJson } from "./apiFetch";
import { isNative } from "@/lib/platform";

type ErrorPayload = { error: string; code?: string };

const STRIPE_PUBLISHABLE_KEY = (
  import.meta.env.VITE_STRIPE_PK ||
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ||
  ""
).trim();

let loggedStripeWarning = false;

function ensureStripePublishableKey(): string {
  if (STRIPE_PUBLISHABLE_KEY) {
    return STRIPE_PUBLISHABLE_KEY;
  }

  if (import.meta.env.DEV && !loggedStripeWarning) {
    loggedStripeWarning = true;
    console.warn(
      "[payments] Stripe publishable key missing. Set VITE_STRIPE_PK for checkout."
    );
  }

  throw {
    error: "stripe_config_missing",
    code: "stripe_config_missing",
  } satisfies ErrorPayload;
}

function assertPaymentsAllowed(): void {
  if (__IS_NATIVE__ || isNative()) {
    throw {
      error: "payments_disabled",
      code: "payments_disabled",
    } satisfies ErrorPayload;
  }
}

async function loadStripeClient() {
  if (__IS_NATIVE__ || isNative()) {
    return null;
  }
  const { loadStripe } = await import("@stripe/stripe-js");
  return loadStripe(STRIPE_PUBLISHABLE_KEY);
}

const checkoutFunctionUrl = (
  import.meta.env.VITE_CHECKOUT_FUNCTION_URL ?? ""
).trim();
const portalFunctionUrl = (
  import.meta.env.VITE_CUSTOMER_PORTAL_FUNCTION_URL ?? ""
).trim();

const PAYMENT_FUNCTION_URLS = {
  createCheckout:
    checkoutFunctionUrl || "https://createcheckout-534gpapj7q-uc.a.run.app",
  createCustomerPortal:
    portalFunctionUrl || "https://createcustomerportal-534gpapj7q-uc.a.run.app",
} as const;

const HOSTING_ENDPOINTS = {
  createCheckout: "/api/createCheckout",
  createCustomerPortal: "/api/createCustomerPortal",
} as const;

const USE_HOSTING_SHIM = import.meta.env.VITE_USE_HOSTING_SHIM === "true";

type PaymentsEndpoint = keyof typeof PAYMENT_FUNCTION_URLS;

export type PaymentsEndpointKey = PaymentsEndpoint;

export function getPaymentFunctionUrl(endpoint: PaymentsEndpointKey): string {
  return PAYMENT_FUNCTION_URLS[endpoint];
}

export function getPaymentHostingPath(endpoint: PaymentsEndpointKey): string {
  return HOSTING_ENDPOINTS[endpoint];
}

export function isHostingShimEnabled(): boolean {
  return USE_HOSTING_SHIM;
}

export type PlanKey =
  | "one"
  | "single"
  | "extra"
  | "pack3"
  | "pack5"
  | "pro_monthly"
  | "monthly"
  | "elite_annual"
  | "annual";

const envPrices = import.meta.env as Record<string, string | undefined>;

const getPriceEnv = (key: string): string => {
  const value = envPrices[key];
  return typeof value === "string" ? value.trim() : "";
};

export const PRICE_IDS = {
  ONE_TIME_STARTER: getPriceEnv("VITE_PRICE_STARTER"),
  EXTRA_ONE_TIME: getPriceEnv("VITE_PRICE_EXTRA"),
  PRO_MONTHLY: getPriceEnv("VITE_PRICE_MONTHLY"),
  ELITE_ANNUAL: getPriceEnv("VITE_PRICE_YEARLY"),
  PACK3: getPriceEnv("VITE_PRICE_PACK3"),
  PACK5: getPriceEnv("VITE_PRICE_PACK5"),
  MONTHLY_ALT: getPriceEnv("VITE_PRICE_MONTHLY_ALT"),
  ANNUAL_ALT: getPriceEnv("VITE_PRICE_ANNUAL_ALT"),
} as const;

export const STRIPE_PRICE_IDS = PRICE_IDS;

const PLAN_PRICE_MAP: Record<PlanKey, string> = {
  one: PRICE_IDS.ONE_TIME_STARTER,
  single: PRICE_IDS.ONE_TIME_STARTER,
  extra: PRICE_IDS.EXTRA_ONE_TIME,
  pack3: PRICE_IDS.PACK3,
  pack5: PRICE_IDS.PACK5,
  pro_monthly: PRICE_IDS.PRO_MONTHLY,
  monthly: PRICE_IDS.MONTHLY_ALT || PRICE_IDS.PRO_MONTHLY,
  elite_annual: PRICE_IDS.ELITE_ANNUAL,
  annual: PRICE_IDS.ANNUAL_ALT || PRICE_IDS.ELITE_ANNUAL,
};

const CHECKOUT_ERROR_COPY: Record<string, string> = {
  stripe_config_missing: "Billing is temporarily unavailable.",
  payments_disabled: "Billing is temporarily unavailable.",
  no_secret: "Billing is temporarily unavailable.",
  stripe_unavailable: "Billing is having issues; please try again.",
  stripe_customer_error:
    "We couldn't sync your billing details. Contact support if it persists.",
  missing_email: "Add an email to your account before purchasing.",
  invalid_price: "Invalid plan, contact support.",
  auth_required: "Sign in to purchase a plan.",
  origin_not_allowed: "Open checkout from the MyBodyScan app or site.",
  network_error:
    "We couldn't reach billing right now. Check your connection and try again.",
};

const PORTAL_ERROR_COPY: Record<string, string> = {
  no_customer: "Complete a purchase first to access the billing portal.",
  stripe_config_missing: "Billing is currently offline. Try again shortly.",
  payments_disabled: "Billing is currently offline. Try again shortly.",
  no_secret: "Billing is currently offline. Try again shortly.",
  stripe_unavailable: "Billing is having issues; please try again.",
  stripe_customer_error:
    "We couldn't open the portal. Contact support if the issue continues.",
  auth_required: "Sign in to manage billing.",
  network_error:
    "We couldn't reach billing right now. Check your connection and try again.",
};

export function describeCheckoutError(code?: string): string {
  if (!code) return "We couldn't open checkout. Please try again.";
  return (
    CHECKOUT_ERROR_COPY[code] ?? "We couldn't open checkout. Please try again."
  );
}

export function describePortalError(code?: string): string {
  if (!code) return "We couldn't open the billing portal. Please try again.";
  return (
    PORTAL_ERROR_COPY[code] ??
    "We couldn't open the billing portal. Please try again."
  );
}

type CheckoutOptions = {
  navigate?: boolean;
};

type CheckoutInput =
  | string
  | PlanKey
  | { priceId?: string | null; plan?: string | null };

function resolveCheckoutRequest(
  input: CheckoutInput
): { priceId: string; plan: string | null } | null {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const planKey = trimmed.toLowerCase() as PlanKey;
    if (PLAN_PRICE_MAP[planKey]) {
      return { priceId: PLAN_PRICE_MAP[planKey], plan: planKey };
    }
    return { priceId: trimmed, plan: null };
  }

  if (typeof input === "object" && input !== null) {
    const direct =
      typeof input.priceId === "string" ? input.priceId.trim() : "";
    const planRaw = typeof input.plan === "string" ? input.plan.trim() : "";
    const planKey = planRaw ? planRaw.toLowerCase() : "";
    if (direct) {
      return { priceId: direct, plan: planKey || null };
    }
    if (planKey && PLAN_PRICE_MAP[planKey as PlanKey]) {
      return { priceId: PLAN_PRICE_MAP[planKey as PlanKey], plan: planKey };
    }
  }

  return null;
}

function normalizeError(error: unknown, fallback: string): never {
  if (error && typeof error === "object") {
    const payload = error as Partial<ErrorPayload> & { message?: string };
    const code =
      typeof payload.code === "string"
        ? payload.code
        : typeof payload.error === "string"
          ? payload.error
          : payload.message;
    const err =
      typeof payload.error === "string"
        ? payload.error
        : payload.message || fallback;
    throw {
      error: err ?? fallback,
      code: code ?? err ?? fallback,
    } satisfies ErrorPayload;
  }
  const message = typeof error === "string" ? error : fallback;
  throw { error: message, code: message } satisfies ErrorPayload;
}

export async function startCheckout(
  input: CheckoutInput,
  options?: CheckoutOptions
) {
  assertPaymentsAllowed();
  const request = resolveCheckoutRequest(input);
  if (!request) {
    throw {
      error: "invalid_price",
      code: "invalid_price",
    } satisfies ErrorPayload;
  }

  let result: { sessionId?: string; url?: string };
  try {
    result = await apiFetchJson("/billing/create-checkout-session", {
      method: "POST",
      body: JSON.stringify({ priceId: request.priceId, plan: request.plan }),
    });
  } catch (error) {
    normalizeError(error, "network_error");
  }

  const sessionId =
    typeof result?.sessionId === "string" ? result.sessionId : "";
  const url = typeof result?.url === "string" ? result.url : "";

  if (options?.navigate === false) {
    return { sessionId: sessionId || null, url: url || null } as const;
  }

  ensureStripePublishableKey();
  const stripe = await loadStripeClient();
  if (!stripe) {
    throw {
      error: "stripe_not_loaded",
      code: "stripe_not_loaded",
    } satisfies ErrorPayload;
  }

  if (!sessionId) {
    if (url) {
      window.location.assign(url);
      return { sessionId: null, url } as const;
    }
    throw {
      error: "invalid_response",
      code: "invalid_response",
    } satisfies ErrorPayload;
  }

  const { error } = await stripe.redirectToCheckout({ sessionId });
  if (error) {
    const message = error.message || "stripe_redirect_failed";
    const code = error.code || "stripe_redirect_failed";
    throw { error: message, code } satisfies ErrorPayload;
  }
  return { sessionId, url: url || null } as const;
}

export async function openCustomerPortal(options?: CheckoutOptions) {
  assertPaymentsAllowed();
  let result: { url?: string };
  try {
    result = await apiFetchJson("/billing/portal", { method: "POST" });
  } catch (error) {
    normalizeError(error, "network_error");
  }

  const url = typeof result?.url === "string" ? result.url : "";
  if (!url) {
    throw {
      error: "invalid_response",
      code: "invalid_response",
    } satisfies ErrorPayload;
  }

  if (options?.navigate === false) {
    return { url } as const;
  }

  window.location.assign(url);
  return { url } as const;
}
