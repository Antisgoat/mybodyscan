import { auth } from "./firebase";

export type PlanKey = "one" | "extra" | "pro_monthly" | "elite_annual";

const PRICE_IDS: Record<PlanKey, string> = {
  one: "price_1RuOpKQQU5vuhlNjipfFBsR0",
  extra: "price_1S4Y9JQQU5vuhlNjB7cBfmaW",
  pro_monthly: "price_1S4XsVQQU5vuhlNjzdQzeySA",
  elite_annual: "price_1S4Y6YQQU5vuhlNjeJFmshxX",
};

async function postJSON(path: string, body: any) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const user = auth.currentUser;
  if (user) {
    try {
      const token = await user.getIdToken();
      headers.Authorization = `Bearer ${token}`;
    } catch {
      // ignore token errors; endpoint will reject if required
    }
  }
  const r = await fetch(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    credentials: "include",
  });
  const text = await r.text();
  const json = (() => { try { return JSON.parse(text); } catch { return {}; } })();
  if (!r.ok) {
    const code = typeof json?.code === "string" ? json.code : typeof json?.error === "string" ? json.error : `http_${r.status}`;
    const message = import.meta.env.DEV ? `Checkout failed (${code})` : "Checkout failed. Please try again.";
    const err: any = new Error(message);
    err.code = code;
    err.status = r.status;
    err.details = json;
    throw err;
  }
  return json;
}

export async function startCheckoutByPrice(priceId: string) {
  const { url } = await postJSON("/createCheckout", { priceId });
  if (!url) throw new Error("Checkout URL missing");
  location.assign(url);
}

export async function startCheckoutByPlan(plan: PlanKey) {
  const priceId = PRICE_IDS[plan];
  await startCheckoutByPrice(priceId);
}

export async function openCustomerPortal() {
  const { url } = await postJSON("/createCustomerPortal", {});
  if (!url) throw new Error("Portal URL missing");
  location.assign(url);
}
