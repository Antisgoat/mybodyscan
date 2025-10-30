import { auth } from "./firebase";

export type PlanKey = "one" | "extra" | "pro_monthly" | "elite_annual";

export const STRIPE_PRICE_IDS = {
  ONE_TIME_STARTER: "price_1RuOpKQQU5vuhlNjipfFBsR0",
  EXTRA_ONE_TIME: "price_1S4Y9JQQU5vuhlNjB7cBfmaW",
  PRO_MONTHLY: "price_1S4XsVQQU5vuhlNjzdQzeySA",
  ELITE_ANNUAL: "price_1S4Y6YQQU5vuhlNjeJFmshxX",
} as const;

export const LEGACY_PLAN_PRICE_MAP: Record<PlanKey, string> = {
  one: STRIPE_PRICE_IDS.ONE_TIME_STARTER,
  extra: STRIPE_PRICE_IDS.EXTRA_ONE_TIME,
  pro_monthly: STRIPE_PRICE_IDS.PRO_MONTHLY,
  elite_annual: STRIPE_PRICE_IDS.ELITE_ANNUAL,
};

type ErrorPayload = { error: string; code?: string };

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

export async function startCheckout(priceId: string) {
  const trimmed = typeof priceId === "string" ? priceId.trim() : "";
  const result = await postWithAuth("/createCheckout", { priceId: trimmed });
  const url = typeof result?.url === "string" ? result.url : "";
  if (!url) {
    throw { error: "invalid_response" } satisfies ErrorPayload;
  }
  location.assign(url);
}

export async function openCustomerPortal() {
  const result = await postWithAuth("/createCustomerPortal", {});
  const url = typeof result?.url === "string" ? result.url : "";
  if (!url) {
    throw { error: "invalid_response" } satisfies ErrorPayload;
  }
  location.assign(url);
}
