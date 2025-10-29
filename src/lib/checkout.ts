export type CheckoutMode = "payment" | "subscription";

export async function startCheckout(priceId: string, mode: CheckoutMode = "payment") {
  const payload = JSON.stringify({ priceId, mode });
  let res: Response | undefined;

  try {
    const { authedFetch } = await import("@/lib/api");
    res = await authedFetch("/createCheckout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
  } catch {
    // Fallback when authedFetch is unavailable (e.g., early bootstrap).
  }

  if (!res) {
    res = await fetch("/createCheckout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: payload,
    });
  }

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`checkout_failed:${res.status}:${t}`);
  }
  const { url } = (await res.json()) as { url?: string };
  if (!url) throw new Error("checkout_no_url");
  window.location.assign(url);
}
