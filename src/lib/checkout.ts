export type CheckoutMode = "payment" | "subscription";

// Prefer authedFetch to include Firebase ID token and App Check headers.
// Fallback to fetch if authedFetch is unavailable for any reason.
export async function startCheckout(priceId: string, mode: CheckoutMode = "payment") {
  // Dynamically import to avoid circular deps during early bootstrap.
  let response: Response | null = null;
  try {
    const { authedFetch } = await import("@/lib/api");
    response = await authedFetch("/createCheckout", {
      method: "POST",
      body: JSON.stringify({ priceId, mode }),
    });
  } catch {
    response = await fetch("/createCheckout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ priceId, mode }),
    });
  }

  if (!response.ok) {
    const t = await response.text().catch(() => "");
    throw new Error(`checkout_failed:${response.status}:${t}`);
  }
  const { url } = (await response.json().catch(() => ({}))) as { url?: string };
  if (!url) throw new Error("checkout_no_url");
  window.location.assign(url);
}
