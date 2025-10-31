import { auth } from "./firebase";
import { openExternal } from "./links";

type ErrorPayload = { error: string; code?: string };

const STRIPE_PUBLISHABLE_KEY =
  (import.meta.env.VITE_STRIPE_PK || import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "").trim();

let loggedStripeWarning = false;

function ensureStripePublishableKey(): string {
  if (STRIPE_PUBLISHABLE_KEY) {
    return STRIPE_PUBLISHABLE_KEY;
  }

  if (import.meta.env.DEV && !loggedStripeWarning) {
    loggedStripeWarning = true;
    console.warn("[payments] Stripe publishable key missing. Set VITE_STRIPE_PK for checkout.");
  }

  throw { error: "stripe_config_missing", code: "stripe_config_missing" } satisfies ErrorPayload;
}

const checkoutFunctionUrl = (import.meta.env.VITE_CHECKOUT_FUNCTION_URL ?? "").trim();
const portalFunctionUrl = (import.meta.env.VITE_CUSTOMER_PORTAL_FUNCTION_URL ?? "").trim();

const PAYMENT_FUNCTION_URLS = {
  createCheckout: checkoutFunctionUrl || "https://createcheckout-534gpapj7q-uc.a.run.app",
  createCustomerPortal: portalFunctionUrl || "https://createcustomerportal-534gpapj7q-uc.a.run.app",
} as const;

const HOSTING_ENDPOINTS = {
  createCheckout: "/createCheckout",
  createCustomerPortal: "/createCustomerPortal",
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

export const PRICE_IDS = {
  ONE_TIME_STARTER: "price_1RuOpKQQU5vuhlNjipfFBsR0",
  EXTRA_ONE_TIME: "price_1S4Y9JQQU5vuhlNjB7cBfmaW",
  PRO_MONTHLY: "price_1S4XsVQQU5vuhlNjzdQzeySA",
  ELITE_ANNUAL: "price_1S4Y6YQQU5vuhlNjeJFmshxX",
  PACK3: "price_1RuOr2QQU5vuhlNjcqTckCHL",
  PACK5: "price_1RuOrkQQU5vuhlNj15ebWfNP",
  MONTHLY_ALT: "price_1RuOtOQQU5vuhlNjmXnQSsYq",
  ANNUAL_ALT: "price_1RuOw0QQU5vuhlNjA5NZ66qq",
} as const;

export const STRIPE_PRICE_IDS = PRICE_IDS;

const PLAN_PRICE_MAP: Record<PlanKey, string> = {
  one: PRICE_IDS.ONE_TIME_STARTER,
  single: PRICE_IDS.ONE_TIME_STARTER,
  extra: PRICE_IDS.EXTRA_ONE_TIME,
  pack3: PRICE_IDS.PACK3,
  pack5: PRICE_IDS.PACK5,
  pro_monthly: PRICE_IDS.PRO_MONTHLY,
  monthly: PRICE_IDS.MONTHLY_ALT,
  elite_annual: PRICE_IDS.ELITE_ANNUAL,
  annual: PRICE_IDS.ANNUAL_ALT,
};

type ErrorPayload = { error: string; code?: string };

const CHECKOUT_ERROR_COPY: Record<string, string> = {
  stripe_config_missing: "Billing is currently offline. Please try again soon.",
  no_secret: "Billing is currently offline. Please try again soon.",
  stripe_customer_error: "We couldn't sync your billing details. Contact support if it persists.",
  missing_email: "Add an email to your account before purchasing.",
  invalid_price: "That plan isn't available right now. Refresh and try again.",
  auth_required: "Sign in to purchase a plan.",
  origin_not_allowed: "Open checkout from the MyBodyScan app or site.",
  network_error: "We couldn't reach billing right now. Check your connection and try again.",
};

const PORTAL_ERROR_COPY: Record<string, string> = {
  no_customer: "Complete a purchase first to access the billing portal.",
  stripe_config_missing: "Billing is currently offline. Try again shortly.",
  no_secret: "Billing is currently offline. Try again shortly.",
  stripe_customer_error: "We couldn't open the portal. Contact support if the issue continues.",
  auth_required: "Sign in to manage billing.",
  network_error: "We couldn't reach billing right now. Check your connection and try again.",
};

export function describeCheckoutError(code?: string): string {
  if (!code) return "We couldn't open checkout. Please try again.";
  return CHECKOUT_ERROR_COPY[code] ?? "We couldn't open checkout. Please try again.";
}

export function describePortalError(code?: string): string {
  if (!code) return "We couldn't open the billing portal. Please try again.";
  return PORTAL_ERROR_COPY[code] ?? "We couldn't open the billing portal. Please try again.";
}

async function postPayments(endpoint: PaymentsEndpoint, body: unknown): Promise<any> {
  if (endpoint === "createCheckout") {
    ensureStripePublishableKey();
  }

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

  const attempts: Array<{ url: string; kind: "function" | "hosting" }> = [
    { url: PAYMENT_FUNCTION_URLS[endpoint], kind: "function" },
  ];

  if (USE_HOSTING_SHIM) {
    attempts.push({ url: HOSTING_ENDPOINTS[endpoint], kind: "hosting" });
  }

  let lastNetworkError: unknown = null;

  for (const attempt of attempts) {
    let response: Response;
    try {
      response = await fetch(attempt.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        credentials: "include",
      });
    } catch (error) {
      lastNetworkError = error;
      if (attempt.kind === "function" && USE_HOSTING_SHIM) {
        if (import.meta.env.DEV) {
          console.warn(`[payments] ${endpoint} primary endpoint unavailable, trying hosting shim`, error);
        }
        continue;
      }
      if (import.meta.env.DEV) {
        console.error(`[payments] ${endpoint} request failed`, error);
      }
      throw { error: "network_error", code: "network_error" } satisfies ErrorPayload;
    }

    let data: any = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      if (data && typeof data === "object") {
        const payload = data as Partial<ErrorPayload>;
        if (import.meta.env.DEV) {
          console.error(`[payments] ${endpoint} ${attempt.kind} error`, {
            url: attempt.url,
            status: response.status,
            code: payload.code ?? null,
            error: payload.error ?? null,
          });
        }
        throw { error: payload.error ?? "unknown_error", code: payload.code } satisfies ErrorPayload;
      }
      if (import.meta.env.DEV) {
        console.error(`[payments] ${endpoint} ${attempt.kind} error`, {
          url: attempt.url,
          status: response.status,
        });
      }
      throw { error: "unknown_error" } satisfies ErrorPayload;
    }

    return data;
  }

  if (import.meta.env.DEV) {
    console.error(`[payments] ${endpoint} exhausted endpoints`, lastNetworkError);
  }
  throw { error: "network_error", code: "network_error" } satisfies ErrorPayload;
}

type CheckoutOptions = {
  navigate?: boolean;
};

type CheckoutInput = string | PlanKey | { priceId?: string | null; plan?: string | null };

function resolveCheckoutPriceId(input: CheckoutInput): string | null {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const mapped = PLAN_PRICE_MAP[trimmed as PlanKey];
    return mapped ?? trimmed;
  }

  if (typeof input === "object" && input !== null) {
    const direct = typeof input.priceId === "string" ? input.priceId.trim() : "";
    if (direct) return direct;
    const planRaw = typeof input.plan === "string" ? input.plan.trim() : "";
    const plan = planRaw ? planRaw.toLowerCase() : "";
    if (plan && PLAN_PRICE_MAP[plan as PlanKey]) {
      return PLAN_PRICE_MAP[plan as PlanKey];
    }
  }

  return null;
}

export async function startCheckout(input: CheckoutInput, options?: CheckoutOptions) {
  ensureStripePublishableKey();

  const priceId = resolveCheckoutPriceId(input);
  if (!priceId) {
    throw { error: "invalid_price", code: "invalid_price" } satisfies ErrorPayload;
  }
  const result = await postPayments("createCheckout", { priceId });
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
  const result = await postPayments("createCustomerPortal", {});
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
